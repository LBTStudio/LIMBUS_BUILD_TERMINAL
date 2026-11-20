import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const DB = JSON.parse(read("../data/db.json"));
DB.items = JSON.parse(read("../data/items.json")); // 本番 index.html と同じく window.DB.items に設定される
DB.specialItems = JSON.parse(read("../data/special-items.json"));

function vmCtx(extraWindow) {
  const ctx = { window: { DB, ...(extraWindow || {}) }, console, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

/* 本番のLedgerルールをそのまま使う（人格購入200LP / 同期50欠片）。 */
const ruleCtx = vmCtx();
vm.runInContext(read("../js/ledger-provenance.js"), ruleCtx);
const acquireCost = ruleCtx.window.LBT_acquireCost;
const provenance = ruleCtx.window.LBT_provenance;

/* 本番の名前解決を作る。 */
const rosterCtx = vmCtx();
vm.runInContext(read("../js/roster-resolver.js"), rosterCtx);
const R = rosterCtx.module.exports;
const nameIndex = R.buildNameIndex(DB, {});
const baseResolve = (name) => R.resolveCandidates(nameIndex, name)?.[0] || null;

/* 新モジュール → 本体の順に読み込む。ブラウザと同じ window 共有。 */
const ctx = vmCtx({
  LBT_buildNameIndex: R.buildNameIndex,
  LBT_resolveCandidates: (name) => baseResolve(name),
  LBT_acquireCost: acquireCost,
  LBT_provenance: provenance
});
vm.runInContext(read("../js/discord-log-import.js"), ctx);
vm.runInContext(read("../js/result-text-import.js"), ctx);
const T = ctx.window.LBT_textImport;
const D = ctx.window.LBT_discordImport;
const FIXTURE = read("../tests/fixtures/result-log-full.txt");

test("Discord形式を検出し、｜区切り形式は本体側に残す", () => {
  assert.equal(D.isDiscordText(FIXTURE), true);
  assert.equal(D.isDiscordText("【A】\n報酬｜LP:150\n購入｜壊し砕く打撃(150LP)"), false);
});

test("本番 parseText が Discord 形式を専用モジュールへ委譲する", () => {
  const out = T.parseText(FIXTURE);
  assert.equal(out.discord, true, "Discordモジュールの結果が返る");
  assert.equal(out.records.length, 225);
  assert.equal(out.skipped.length, 0);
});

test("plan が要確認0件・DB/ルール価格で明細を補完する", () => {
  const parsed = T.parseText(FIXTURE);
  const plan = T.plan(parsed, { resolve: baseResolve });
  assert.equal(plan.skipped.length, 0, "要確認（未分類）が残らない");
  assert.ok(plan.actions.filter((a) => a.note && /DB価格/.test(a.note)).length > 0, "原文に金額が無い明細を価格で補完");
  assert.ok(plan.actions.some((a) => a.type === "ADD_RESULT"));
  assert.ok(plan.actions.some((a) => a.type === "ADD_ENTRY"));
});

test("現在LP：の後続欠片残高を収入に数えない", () => {
  const out = T.parseText([
    "【A】",
    "LP111：現在123",
    "選択式抽出チケットor人格優先着用権",
    "現在LP：3656",
    "欠片：1362"
  ].join("\n"));
  const r = out.records[0];
  assert.equal(r.income.lp, 111);
  assert.equal(r.income.shards, 0);
});

test("｜区切り形式は従来どおり本体が解析する（回帰）", () => {
  const out = T.parseText([
    "【シナリオA】(作：作者名)",
    "報酬｜LP:150/自我の欠片:70",
    "購入｜壊し砕く打撃(150LP)"
  ].join("\n"));
  assert.equal(out.discord, undefined);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].income.lp, 150);
  assert.equal(out.records[0].spends.length, 1);
});

test("黒獣筆頭3件の所属は原文通り全候補を保持する", () => {
  const all = [...(DB.normal_personas || []), ...(DB.tokui_personas || [])];
  for (const [name, aff] of [
    ["黒獣-卯 筆頭", "黒獣 黒獣-卯 H社"],
    ["黒獣-酉 筆頭", "黒獣 黒獣-酉 H社"],
    ["黒獣-午 筆頭", "黒獣 黒獣-午 H社"]
  ]) {
    const p = all.find((x) => x.name === name);
    assert.ok(p, `${name} がDBに存在`);
    assert.equal(p.affiliation, aff, `${name} の所属が全候補`);
  }
});
