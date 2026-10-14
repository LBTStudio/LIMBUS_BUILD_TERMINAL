import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 同期/解析のフラグを立てるだけでは帳の欠片が減らない。
   直近リザルトへ明細として落ちることを reducer レベルで固定する。 */

const provSource = readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8");
const DB = {
  normal_personas: [{ no: 1, name: "黒雲会組員" }],
  tokui_personas: [{ no: 13, name: "ジア家家主候補" }],
  egos: [{ no: 1, rank: "HE", name: "欲望の終着点", shards: "50欠片" }]
};
const window = { DB, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(provSource, context, { filename: "ledger-provenance.js" });
vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context, { filename: "state.js" });

const reducer = context.window.appReducer;
const base = {
  roster: { personas: [{ uid: "pr-1", no: 1, mode: "n", syncRank: null, syncMax: false }], egos: [{ uid: "er-1", no: 1, rank: "HE", analyzed: false, analyzeMax: false }], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "100", shards: "200" } }],
  entries: [],
  inventory: []
};

const shardsOf = (s) => context.window.LBT_computeLedgerBalance(s.results, s.entries).shards;

test("同期化は直近リザルトに明細を立て、欠片が引く", () => {
  const before = shardsOf(base);
  const next = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: "0" });
  assert.equal(next.entries.length, 1, "明細が1件できる");
  assert.equal(next.entries[0].kind, "personaSync");
  assert.equal(next.entries[0].resultId, "res-1", "直近リザルトに帰属する");
  assert.equal(next.entries[0].cost.shards, 50);
  assert.equal(shardsOf(next), Number(before) - 50, "欠片が50減る");
  assert.equal(next.roster.personas[0].syncRank, "0", "フラグも立つ");
});

test("同期MAXは同期化より多くならない（supplement P23 同じ個数）", () => {
  const next = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncMax: true });
  assert.equal(next.entries[0].kind, "personaSyncMax");
  assert.equal(next.entries[0].cost.shards, 50);
});

test("解除は明細を立てない", () => {
  const synced = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: "0" });
  const off = reducer(synced, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: null, syncMax: false });
  assert.equal(off.entries.length, 1, "解除では増えない");
});

test("解析は危険度ランクの欠片を引く", () => {
  const before = shardsOf(base);
  const next = reducer(base, { type: "APPLY_EGO_ANALYZE", uid: "er-1" });
  assert.equal(next.entries[0].kind, "egoAnalyze");
  assert.equal(next.entries[0].cost.shards, 60, "HE は60欠片");
  assert.equal(shardsOf(next), Number(before) - 60);
  assert.equal(next.roster.egos[0].analyzed, true);
});

test("解析MAXは解析と同額", () => {
  const next = reducer(base, { type: "APPLY_EGO_ANALYZE", uid: "er-1", analyzeMax: true });
  assert.equal(next.entries[0].kind, "egoAnalyzeMax");
  assert.equal(next.entries[0].cost.shards, 60);
});

test("既存アカウントのフラグ付き項目を遡って記録できる", () => {
  const legacy = {
    ...base,
    roster: {
      ...base.roster,
      personas: [{ uid: "pr-1", no: 1, mode: "n", syncRank: "00", syncMax: false }],
      egos: [{ uid: "er-1", no: 1, rank: "HE", analyzed: true, analyzeMax: false }]
    }
  };
  const next = reducer(legacy, { type: "BACKFILL_SYNC_ENTRIES" });
  assert.equal(next.entries.length, 2, "同期と解析の両方が積まれる");
  assert.ok(next.entries.every((e) => e.resultId === "res-1"), "直近リザルトに帰属");
  const total = next.entries.reduce((s, e) => s + e.cost.shards, 0);
  assert.equal(total, 110, "同期50 + 解析60");
});

test("バックフィルは二重に積まない", () => {
  const legacy = {
    ...base,
    roster: {
      ...base.roster,
      personas: [{ uid: "pr-1", no: 1, mode: "n", syncRank: "0", syncMax: false }],
      egos: [{ uid: "er-1", no: 1, rank: "HE", analyzed: true, analyzeMax: false }]
    }
  };
  const once = reducer(legacy, { type: "BACKFILL_SYNC_ENTRIES" });
  const twice = reducer(once, { type: "BACKFILL_SYNC_ENTRIES" });
  assert.equal(twice.entries.length, once.entries.length, "2回走らせても増えない");
});

test("解析済みE.G.Oのビルド保存では二重に引かない", () => {
  const analyzed = reducer(base, { type: "APPLY_EGO_ANALYZE", uid: "er-1" });
  const withSlot = { ...analyzed, egoSlots: { HE: { no: 1, build: {} } } };
  const resaved = reducer(withSlot, { type: "SAVE_EGO_BUILD", rank: "HE" });
  assert.equal(resaved.entries.length, analyzed.entries.length, "保存し直しても明細は増えない");
});