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

test("同期済みの人格を同期MAXにすると追加で50欠片を請求する", () => {
  /* 同期MAXは同期ランクとは別の操作。同期済みでもMAX化には50欠片かかる
     （supplement P23「同期化を行った時と同じ個数」）。 */
  const synced = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: "0" });
  const maxed = reducer(synced, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncMax: true });
  assert.equal(maxed.entries.length, 2, "同期50 + MAX50");
  assert.equal(maxed.entries[1].kind, "personaSyncMax");
  assert.equal(maxed.entries[1].cost.shards, 50);
  assert.equal(maxed.entries[1].resultId, "res-1", "直近リザルトに帰属する");
  const off = reducer(maxed, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: null, syncMax: false });
  assert.equal(off.roster.personas[0].syncMax, false, "フラグは解除される");
  assert.equal(off.roster.personas[0].syncRank, null);
  assert.equal(off.entries.length, 2, "既に払った明細は残る（返金はしない）");
});

test("同期ランク解除（null）も費用は掛からない", () => {
  const synced = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: "000" });
  const off = reducer(synced, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncRank: null });
  assert.equal(off.roster.personas[0].syncRank, null);
  assert.equal(off.entries.length, 1);
});

test("トグルを往復しても一章も増えない（50個だけ）", () => {
  let s = reducer(base, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncMax: true });
  assert.equal(s.entries.length, 1);
  s = reducer(s, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncMax: false });
  assert.equal(s.entries.length, 1, "解除で増えない");
  s = reducer(s, { type: "APPLY_PERSONA_SYNC", uid: "pr-1", syncMax: true });
  assert.equal(s.entries.length, 2, "再び立てると新たに50（合計100）");
  const total = s.entries.reduce((n, e) => n + e.cost.shards, 0);
  assert.equal(total, 100);
});
test("草案を同期MAXとして作成すると、直近リザルトへ50欠片の明細を立てる", () => {
  const draft = {
    __custom: true,
    name: "検証人格",
    hp: 100, san: 45, speed: "1d5", bullets: "×",
    res_slash: "普通", res_pierce: "普通", res_blunt: "普通",
    passive_name: "", passive_cond: "", passive_always: "", passive_effect: "",
    skills: [], unique_buffs: [], keywords: []
  };
  const next = reducer(base, { type: "IMPORT_PERSONA_DRAFT", persona: draft, syncRank: null, syncMax: true });
  const entry = next.entries.find((e) => e.kind === "personaSyncMax");
  assert.ok(entry, "同期MAXの明細ができる");
  assert.equal(entry.cost.shards, 50);
  assert.equal(entry.resultId, "res-1", "直近リザルトに帰属する");
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

test("解析済みE.G.Oを解析MAXにすると追加でランク料金を請求する", () => {
  const analyzed = reducer(base, { type: "APPLY_EGO_ANALYZE", uid: "er-1" });
  const maxed = reducer(analyzed, { type: "APPLY_EGO_ANALYZE", uid: "er-1", analyzeMax: true });
  assert.equal(maxed.entries.length, 2, "解析60 + MAX60");
  assert.equal(maxed.entries[1].kind, "egoAnalyzeMax");
  assert.equal(maxed.entries[1].cost.shards, 60);
  assert.equal(maxed.roster.egos[0].analyzeMax, true);
});

test("解析MAXを解除しても返金せず、再設定で新たに請求する", () => {
  const analyzed = reducer(base, { type: "APPLY_EGO_ANALYZE", uid: "er-1" });
  const maxed = reducer(analyzed, { type: "APPLY_EGO_ANALYZE", uid: "er-1", analyzeMax: true });
  const off = reducer(maxed, { type: "APPLY_EGO_ANALYZE", uid: "er-1", analyzeMax: false });
  assert.equal(off.roster.egos[0].analyzeMax, false);
  assert.equal(off.entries.length, 2, "解除で増えない");
  const again = reducer(off, { type: "APPLY_EGO_ANALYZE", uid: "er-1", analyzeMax: true });
  assert.equal(again.entries.length, 3, "再設定で新たに請求");
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

test("解析費用を払えないビルド保存は、編集内容を残して解析フラグを立てない", () => {
  const poor = {
    ...base,
    results: [{ id: "res-1", name: "第一夜", income: { lp: 0, shards: 0 } }],
    egoSlots: { HE: { no: 1, rank: "HE", name: "欲望の終着点", build: {} } }
  };
  const next = reducer(poor, { type: "SAVE_EGO_BUILD", rank: "HE" });
  const entry = next.roster.egos.find((e) => e.rank === "HE" && e.no === 1);
  assert.ok(entry?.build, "編集内容は保存される");
  assert.equal(entry.analyzed, false, "支払えない解析は確定しない");
  assert.equal(next.entries.length, 0, "明細も立てない");
});

/* 未所持E.G.Oの装備を所持確定にしてはいけない（specified purchase を飛ばさせるため）。
   所持への登録は ADD_ROSTER_EGO だけが行う。 */

const unowned = () => ({ ...base, roster: { ...base.roster, egos: [] }, egoSlots: {} });

test("装備しても未所持E.G.Oは所持リストへ入らない", () => {
  const next = reducer(unowned(), { type: "SET_EGO_SLOT", rank: "HE", value: { no: 1, rank: "HE", name: "欲望の終着点" } });
  assert.equal(next.roster.egos.length, 0, "装備は所持を確定させない");
  assert.equal(next.egoSlots.HE?.no, 1, "スロットには入る");
});

test("試着装備も所持リストへ入れない", () => {
  const next = reducer(unowned(), { type: "SET_EGO_SLOT", rank: "HE", value: { no: 1, rank: "HE" }, preview: true });
  assert.equal(next.roster.egos.length, 0, "試着は所持に触れない");
});

test("指定購入だけが欠片を請求して所持へ入れる", () => {
  const before = unowned();
  const next = reducer(before, { type: "ADD_ROSTER_EGO", rank: "HE", no: 1, purchase: true });
  assert.equal(next.roster.egos.length, 1, "購入は所持へ入る");
  assert.ok(next.entries.some((e) => e.cost.shards > 0), "購入は欠片を請求する");
});

test("購入せず所持に追加は欠片を請求しない", () => {
  const before = unowned();
  const next = reducer(before, { type: "ADD_ROSTER_EGO", rank: "HE", no: 1 });
  assert.equal(next.roster.egos.length, 1, "所持へ入る");
  assert.equal(next.entries.length, 0, "無料追加なので請求なし");
});

test("装備操作だけでは欠片を請求しない", () => {
  const before = unowned();
  const next = reducer(before, { type: "SET_EGO_SLOT", rank: "HE", value: { no: 1, rank: "HE" } });
  assert.equal(next.entries.length, 0, "装備で帳が動かない");
});