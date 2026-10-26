import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DB = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function load() {
  const ctx = { window: {}, console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../js/result-text-import.js", import.meta.url), "utf8"), ctx, { filename: "result-text-import.js" });
  return ctx.window.LBT_textImport;
}

function loadResolver() {
  const ctx = { window: {}, console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../js/roster-resolver.js", import.meta.url), "utf8"), ctx, { filename: "roster-resolver.js" });
  return ctx.module.exports;
}

const T = load();
const R = loadResolver();
const index = R.buildNameIndex(DB, {});
const resolve = (name) => R.resolveCandidates(index, name)[0] || null;

test("桁区切りの1,500LPを500LPへ誤分割しない", () => {
  const parsed = T.parseText([
    "▼LP購入",
    "日時：2026/08/10",
    "消費：1,500LP",
    "現在所持LP：2,000→500",
    "現在所持欠片：20"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual(
    [...parsed.records[0].spends].map((spend) => ({ lp: spend.cost.lp, shards: spend.cost.shards })),
    [{ lp: 1500, shards: 0 }]
  );
  assert.equal(parsed.skipped.length, 0);
});

test("ASCIIカンマで区切った複数の消費額は別々に加算する", () => {
  const parsed = T.parseText([
    "▼複数購入",
    "日時：2026/08/10",
    "消費：100LP,200LP",
    "現在所持LP：1,000→700",
    "現在所持欠片：20"
  ].join("\n"));

  assert.equal(parsed.records[0].spends.length, 1);
  assert.equal(parsed.records[0].spends[0].cost.lp, 300);
  assert.equal(parsed.records[0].spends[0].cost.shards, 0);
});

test("▼/▽なしの日時付き複数記録も、別々のリザルトとして解析する", () => {
  const parsed = T.parseText([
    "E.G.O指定購入",
    "日時：2026/08/10",
    "消費：LP450",
    "現在所持LP：100",
    "現在所持欠片：500→50",
    "",
    "採光シナリオ",
    "日時：2026/08/11",
    "報酬：",
    "LP：20",
    "欠片：10",
    "現在所持LP：100→120",
    "現在所持欠片：50→60"
  ].join("\n"));

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].title, "E.G.O指定購入");
  assert.equal(parsed.records[0].spends[0].cost.lp, 450);
  assert.equal(parsed.records[1].title, "採光シナリオ");
  assert.equal(parsed.records[1].income.lp, 20);
  assert.equal(parsed.records[1].income.shards, 10);
});

test("複合報酬行のLP・欠片・抽出チケットをそれぞれ正しく解析する", () => {
  const parsed = T.parseText([
    "▼複合報酬テスト",
    "日時\t2026/08/12",
    "報酬\tLP:150/自我の欠片:70/人格抽出チケットx1"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  const record = parsed.records[0];
  assert.equal(record.income.lp, 150);
  assert.equal(record.income.shards, 70);
  assert.equal(record.tickets.length, 1);
  assert.equal(record.tickets[0].kind, "persona");
  assert.equal(record.tickets[0].count, 1);
  assert.equal(parsed.skipped.length, 0);
});

test("E.G.O指定購入の「指定」欄も取得品とし、9件すべて所持登録する", () => {
  const egos = DB.egos.filter((ego) => Number(ego.shards) === 50).slice(0, 9);
  const memo = [
    "▼E.G.O指定購入",
    "日時\t2026/08/10",
    "消費欄\tLP450",
    "指定\t",
    ...egos.map((ego) => ego.name + " 50欠片"),
    "現在所持LP\t100",
    "現在所持欠片\t500→50"
  ].join("\n");

  const parsed = T.parseText(memo);
  assert.equal(parsed.records.length, 1);
  const record = parsed.records[0];
  assert.equal(record.specifiedItems.length, 9);
  assert.equal(record.spends.length, 9);
  assert.equal(record.spends.reduce((sum, spend) => sum + spend.cost.shards, 0), 450);
  assert.equal(record.spends.reduce((sum, spend) => sum + spend.cost.lp, 0), 0);
  assert.ok(parsed.skipped.some((entry) => /消費欄の通貨・合計と獲得品の個別価格が一致しません/.test(entry.reason)));

  const planned = T.plan(parsed, { resolve });
  const egoAdds = planned.actions.filter((action) => action.type === "ADD_ROSTER_EGO");
  assert.equal(egoAdds.length, 9, "指定欄のE.G.Oも所持へ追加");
  const entries = planned.actions.filter((action) => action.type === "ADD_ENTRY");
  assert.equal(entries.length, 9);
  assert.equal(entries.reduce((sum, action) => sum + action.cost.shards, 0), 450);
  assert.equal(entries.reduce((sum, action) => sum + action.cost.lp, 0), 0);
});

test("全角日付・タブ区切り・見出し記号なしの帳簿も専用パーサへ送る", () => {
  const parsed = T.parseText([
    "購入記録",
    "日時\t２０２６/０８/１０",
    "報酬\t",
    "LP\t２０",
    "欠片\t１０"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].title, "購入記録");
  assert.equal(parsed.records[0].date, "2026-08-10");
  assert.equal(parsed.records[0].income.lp, 20);
  assert.equal(parsed.records[0].income.shards, 10);
});

test("実在DBのE.G.O購入明細は獲得名9件・ランク/番号・欠片価格を保ち、LP450との通貨不一致を警告する", () => {
  const egos = DB.egos.filter((ego) => Number(ego.shards) === 50).slice(0, 9);
  assert.equal(egos.length, 9, "50欠片の実在E.G.Oを9件用意できる");
  const memo = [
    "▼E.G.O指定購入",
    "日時\t2026/08/10",
    "消費欄\tLP450",
    "獲得\t",
    ...egos.map((ego) => ego.name + " 50欠片"),
    "現在所持LP：100",
    "現在所持欠片：500→50"
  ].join("\n");

  const parsed = T.parseText(memo);
  assert.equal(parsed.records.length, 1);
  const record = parsed.records[0];
  assert.equal(record.acquisitions.length, 9);
  assert.equal(record.spends.length, 9);
  assert.deepEqual([...record.acquisitions].map((item) => item.name).sort(), egos.map((ego) => ego.name.replace(/：/g, ":")).sort());
  assert.equal(record.spends.reduce((sum, spend) => sum + spend.cost.shards, 0), 450);
  assert.equal(record.spends.reduce((sum, spend) => sum + spend.cost.lp, 0), 0);
  assert.ok(parsed.skipped.some((entry) => /消費欄の通貨・合計と獲得品の個別価格が一致しません/.test(entry.reason)));

  const planned = T.plan(parsed, { resolve });
  const egoAdds = planned.actions.filter((action) => action.type === "ADD_ROSTER_EGO");
  assert.equal(egoAdds.length, 9, "購入E.G.Oが全件、DBのランク/番号で所持追加される");
  assert.deepEqual(
    [...egoAdds].map((action) => String(action.rank) + ":" + String(action.no)).sort(),
    egos.map((ego) => String(ego.rank) + ":" + String(ego.no)).sort()
  );
  const entries = planned.actions.filter((action) => action.type === "ADD_ENTRY");
  assert.equal(entries.length, 9, "E.G.Oごとの支出明細を作る");
  assert.equal(entries.reduce((sum, action) => sum + action.cost.shards, 0), 450);
  assert.equal(entries.reduce((sum, action) => sum + action.cost.lp, 0), 0);
});
