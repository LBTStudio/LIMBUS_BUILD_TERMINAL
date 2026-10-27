import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function load() {
  const context = { window: {}, console, module: { exports: {} }, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  vm.createContext(context);
  for (const file of ["js/garasumado-memo-parse.js", "js/garasumado-roster-import.js", "js/ledger-import-reconcile.js"]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { memo: context.window.LBT_garaMemo, importer: context.window.LBT_garasumado, ledger: context.window.LBT_ledgerReconcile };
}
const { memo, importer, ledger } = load();
const sum = (rows, key) => rows.reduce((n, row) => n + (Number(row[key]) || 0), 0);
const emptyOwned = { personas: [], egos: [], supportPassives: [], spirits: [] };

test("P0: malformed comma in free-form expense is held, never posted as LP120", () => {
  const r = memo.parseMemo("終了後、LP1,20を消費して人格抽出「対象」");
  assert.equal(r.income.lp, 0);
  assert.equal(sum(r.spends, "lp"), 0);
  assert.ok(r.reasons.some((x) => /桁区切り|表記/.test(x.reason)));
  assert.ok(r.financialCoverage.some((x) => x.status === "reviewed-by-parser-reason"));
});

test("P0: arithmetic multiplication overflow suppresses base and result amounts", () => {
  const r = memo.parseMemo("報酬：欠片9,007,199,254,740,991×2=18,014,398,509,481,982欠片");
  assert.equal(r.income.shards, 0);
  assert.equal(sum(r.spends, "shards"), 0);
  assert.ok(r.sourceAudits.some((x) => x.code === "source-arithmetic-mismatch"));
});

test("P0: remaining balance after a spend is not a reward or an extra flow", () => {
  const r = memo.parseMemo("150LP消費→残り300LP");
  assert.equal(sum(r.spends, "lp"), 150);
  assert.equal(r.income.lp, 0);
  assert.equal(r.wins.filter((x) => /残り300/.test(x.name)).length, 0);
  assert.ok(r.financialCoverage.some((x) => x.status === "matched"));
  assert.equal(sum(memo.parseMemo("・支出\n150LP消費→残り300LP").spends, "lp"), 150);
});

test("P0: effect description is not a real transaction", () => {
  const r = memo.parseMemo("▶効果：使用時、欠片10を消費する。");
  assert.equal(sum(r.spends, "shards"), 0);
  assert.equal(r.income.shards, 0);
  assert.ok(r.reasons.some((x) => /効果説明文/.test(x.reason)));
});

test("P0: upper-limit pack price stays pending, not a reward or spend", () => {
  const r = memo.parseMemo("報酬：上限200LPのテーマパック×1");
  assert.equal(r.income.lp, 0);
  assert.equal(r.tickets.persona + r.tickets.ego + r.tickets.choice, 0);
  assert.equal(r.spends.length, 0);
  assert.ok(r.reasons.some((x) => /上限付き/.test(x.reason)));
});

test("P0: unapproved name-only reward candidate creates no financial ADD_ENTRY", () => {
  const m = importer.buildManifest({ name: "候補", owned: emptyOwned, scenarioHistory: [{ name: "候補だけ", memo: "報酬\nルサンチマン" }] }, null);
  assert.equal(m.scenarios[0].spends.length, 0);
  const actions = importer.toDispatchActions(m, [], {}).actions;
  assert.equal(actions.filter((x) => x.type === "ADD_ENTRY").length, 0);
  assert.equal(actions.filter((x) => x.type === "ADD_RESULT").length, 1);
});

test("P1: parsing switches from spend section back to reward income", () => {
  const r = memo.parseMemo("・支払い\n人生一発購入 7LP\n・報酬\nLP：30\n欠片：12");
  assert.equal(r.income.lp, 30);
  assert.equal(r.income.shards, 12);
  assert.equal(sum(r.spends, "lp"), 7);
  assert.deepEqual(Array.from(r.financialCoverage, (x) => x.status), ["matched", "matched", "matched"]);
});

test("P1: unsigned currency conversion is held; signed reverse conversion maps both currencies", () => {
  const unclear = memo.parseMemo("LPを欠片に変換：22LP 11欠片");
  assert.equal(unclear.income.lp, 0);
  assert.equal(unclear.income.shards, 0);
  assert.equal(unclear.spends.length, 0);
  assert.ok(unclear.reasons.some((x) => /正負の符号/.test(x.reason)));
  const reverse = memo.parseMemo("欠片をLPに変換：+22LP -11欠片");
  assert.equal(reverse.income.lp, 22);
  assert.equal(reverse.income.shards, 0);
  assert.equal(reverse.spends[0].shards, 11);
});

test("P1: unresolved expense warning survives manifest, draft, and balance reconciliation", () => {
  const doc = { currency: { lp: "60" }, owned: emptyOwned, scenarioHistory: [
    { name: "残高基準", memo: "現在100LP" }, { name: "未解析支出", date: "2026-10-27", memo: "消費40LP" }
  ] };
  const m = importer.buildManifest(doc, null);
  const scenario = m.scenarios.find((x) => x.name === "未解析支出");
  assert.ok(scenario.reasons.some((x) => /未計上/.test(x.reason)));
  assert.ok(scenario.financialCoverage.some((x) => x.status === "reviewed-by-parser-reason"));
  assert.equal(sum(scenario.spends, "lp"), 0);
  assert.ok(importer.buildResultDraft(m, {}).blocks.some((x) => x.name === "未解析支出" && x.reasons.length));
  const check = importer.reconcileBalance(m, doc);
  assert.equal(check.checked, true);
  assert.equal(check.ok, false);
  assert.equal(check.computedLp, 100);
  assert.equal(check.shownLp, 60);
  assert.equal(importer.toDispatchActions(m, [], {}).actions.filter((x) => x.type === "ADD_ENTRY" && x.cost?.lp === 40).length, 0);
});

test("P1: ambiguous ticket classification does not change ticket balances, while known LP cost remains", () => {
  const r = memo.parseMemo("消費：人格orE.G.O抽出チケット×1、LP100");
  assert.equal(r.spends[0].lp, 100);
  assert.equal(r.tickets.persona + r.tickets.ego + r.tickets.choice, 0);
  assert.equal(r.ticketSpends[0].kind, "unknown");
  assert.ok(r.reasons.some((x) => /チケットの種別が曖昧/.test(x.reason)));
  const m = importer.buildManifest({ name: "券種", owned: emptyOwned, scenarioHistory: [{ name: "曖昧券", memo: "消費：人格orE.G.O抽出チケット×1、LP100" }] }, null);
  const result = importer.toDispatchActions(m, [], {});
  assert.ok(result.actions.some((x) => x.type === "ADD_ENTRY" && x.cost?.lp === 100));
  assert.ok(result.skipped.some((x) => /チケットの種別が曖昧/.test(x.reason)));
});

test("P1: ledger import normalizes fullwidth digits and punctuation", () => {
  const rows = ledger.reconcileResults([
    { title: "基準", income: { lp: 0 }, current: { lp: "０" } },
    { title: "全角金額", income: { lp: "１，２００" }, current: { lp: "１，２５０" } }
  ]);
  assert.equal(rows[1].income.lp, 1200);
  assert.equal(rows[1].current.lp, 1250);
  assert.equal(rows[1].impliedSpend.lp, -50);
  assert.ok(rows[1].flags.some((x) => x.code === "negative-spend" && x.gap === 50));
});

test("P1: cross-scenario cumulative overflow holds reconciliation", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const result = importer.reconcileBalance({ scenarios: [
    { name: "基準", memo: "現在LP0", income: { lp: 0, shards: 0 }, spends: [] },
    { name: "大1", memo: "報酬：LP0", income: { lp: max, shards: 0 }, spends: [] },
    { name: "大2", memo: "報酬：LP0", income: { lp: max, shards: 0 }, spends: [] }
  ] }, { currency: { lp: "0" } });
  assert.equal(result.checked, true);
  assert.equal(result.ok, false);
  assert.equal(result.computedLp, null);
  assert.match(result.message, /安全整数の範囲/);
});

test("P1: changed memo for same scenario and date is retained and flagged for review", () => {
  const merged = importer.mergeGarasumadoDocuments([
    { id: "sourceOld123", updateTime: "2026-10-26T00:00:00Z", doc: { name: "キャラ", plName: "同一PL", scenarioHistory: [{ name: "同名", date: "2026-10-26", memo: "LP50" }] } },
    { id: "sourceNew123", updateTime: "2026-10-27T00:00:00Z", doc: { name: "キャラ", plName: "同一PL", scenarioHistory: [{ name: "同名", date: "2026-10-26", memo: "LP70" }] } }
  ]);
  assert.equal(merged.scenarioHistory.length, 2);
  assert.ok(merged.scenarioHistory.every((x) => x.__lbtShareHistoryConflict));
  const m = importer.buildManifest(merged, null);
  assert.ok(m.scenarios.every((x) => x.reasons.some((reason) => /別スナップショット/.test(reason.reason))));
});

test("P2: source URL can supply a stable key; no URL/id means no fabricated key", () => {
  const merged = importer.mergeGarasumadoDocuments([{ url: "https://lbt-garasumado.vercel.app/view/3JIdhCPatk2URoQZ2btx", updateTime: "2026-10-28T00:00:00Z", doc: {
    name: "URL由来", plName: "PL", scenarioHistory: [{ name: "記録", date: "2026-10-28", memo: "LP50" }]
  } }]);
  const m = importer.buildManifest(merged, null);
  assert.match(m.scenarios[0].importSourceKey, /gara1:3JIdhCPatk2URoQZ2btx/);
  const noOrigin = importer.buildManifest({ name: "出典なし", owned: emptyOwned, scenarioHistory: [{ name: "記録", date: "2026-10-28", memo: "LP50" }] }, null);
  assert.ok(!noOrigin.scenarios[0].importSourceKey);
  assert.ok(noOrigin.scenarios[0].reasons.some((x) => /安定キーがありません/.test(x.reason)));
});

test("P2: fixed memo reimport reuses key and recalculates the amount", () => {
  const make = (amount) => importer.buildManifest({ name: "再取込", owned: emptyOwned, scenarioHistory: [{
    __lbtShareSourceId: "stableShareSource123", name: "対象シナリオ", date: "2026-10-28", memo: "報酬：LP" + amount
  }] }, null);
  const before = make(50), after = make(70);
  assert.equal(before.scenarios[0].importSourceKey, after.scenarios[0].importSourceKey);
  const first = importer.toDispatchActions(before, [], {}).actions.filter((x) => x.type === "ADD_RESULT");
  const fixed = importer.toDispatchActions(after, [], {}).actions.filter((x) => x.type === "ADD_RESULT");
  assert.equal(first.length, 1);
  assert.equal(fixed.length, 1);
  assert.equal(first[0].income.lp, 50);
  assert.equal(fixed[0].income.lp, 70);
  assert.equal(fixed[0].importSourceKey, first[0].importSourceKey);
});

test("P2: 欠け片 is treated as shard currency for rewards and spends", () => {
  assert.equal(memo.parseMemo("報酬：40欠け片").income.shards, 40);
  const spend = memo.parseMemo("・支出\n黒獣卯購入 10欠け片");
  assert.equal(sum(spend.spends, "shards"), 10);
  assert.equal(sum(spend.spends, "lp"), 0);
});

test("P2: real sample stays stable after fullwidth amount/LP and line-ending mutations", () => {
  const samples = JSON.parse(read("tests/fixtures/garasumado-samples.json"));
  const source = samples.mMIbGr32lGZix60RDmoN.doc.scenarioHistory.find((x) => x.name === "鏡屈折鉄道1号線『Orientation』");
  assert.ok(source);
  const mutatedMemo = source.memo.replace(/LP/g, "ＬＰ").replace(/欠片/g, "欠け片")
    .replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xFEE0))
    .replace(/,/g, "，").replace(/\n/g, "\r\n");
  const original = memo.parseMemo(source.memo), mutated = memo.parseMemo(mutatedMemo);
  assert.equal(mutated.income.lp, original.income.lp);
  assert.equal(mutated.income.shards, original.income.shards);
  assert.equal(sum(mutated.spends, "lp"), sum(original.spends, "lp"));
  assert.equal(sum(mutated.spends, "shards"), sum(original.spends, "shards"));
  assert.deepEqual(Array.from(mutated.financialCoverage, (x) => x.status), Array.from(original.financialCoverage, (x) => x.status));
});

test("fixed sample inventory remains explicit and complete", () => {
  const samples = JSON.parse(read("tests/fixtures/garasumado-samples.json"));
  const docs = Object.values(samples);
  const histories = docs.reduce((n, x) => n + (x.doc?.scenarioHistory || x.scenarioHistory || []).length, 0);
  const memos = docs.reduce((n, x) => n + (x.doc?.scenarioHistory || x.scenarioHistory || []).filter((row) => String(row?.memo || "").trim()).length, 0);
  assert.equal(docs.length, 50);
  assert.equal(histories, 642);
  assert.equal(memos, 620);
  assert.equal([...read("tests/fixtures/garasumado-memo-corpus.txt").matchAll(/^【(.+)】$/gm)].length, 71);
  assert.ok(read("tests/fixtures/result-log-corpus.txt").split(/\r?\n/).length >= 600);
});
