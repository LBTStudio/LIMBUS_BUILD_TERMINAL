import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   取り込みは 1 手で終わらせる（APPLY_IMPORT_BATCH）。

   守るべき性質:
     - ADD_RESULT の直後の ADD_ENTRY はそのリザルトに歸属する
     - 購入履歴の金額が resultId 付きで入る（未分類のままにならない）
     - UNDO 1 回で全部戻る（state は 1 回の遷移）
     - 壊れた子 action があっても全体が落ちない
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadState() {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: {
      DB: {
        support_passives: db.support_passives,
        death_passives: db.death_passives,
        spirits: db.spirits,
        normal_enhancements: db.normal_enhancements,
        special_enhancements: db.special_enhancements
      }
    },
    console, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

const w = loadState();
const reducer = w.appReducer;
/* UNDO は React 側の履歴で、dispatch 1 回＝履歴 1 個。
   だから「1 回の reducer 呼び出しで全部入る」ことを以て確認する。 */
function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [],
    entries: [],
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

test("ADD_RESULT の直後の ADD_ENTRY はそのリザルトに歸属する", () => {
  const before = baseState();
  const after = reducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "第1回", income: { lp: 100, shards: 10 } },
      { type: "ADD_ENTRY", kind: "support", name: "ルサンチマン", cost: { lp: 7, shards: 0 } },
      { type: "ADD_RESULT", name: "第2回", income: { lp: 50, shards: 5 } },
      { type: "ADD_ENTRY", kind: "spirit", name: "憎悪", cost: { lp: 0, shards: 100 } }
    ]
  });
  assert.equal(after.results.length, 2, "リザルトが 2 件");
  assert.equal(after.entries.length, 2, "明細が 2 件");
  assert.equal(after.entries[0].resultId, after.results[0].id, "1件目は第1回に屬属");
  assert.equal(after.entries[1].resultId, after.results[1].id, "2件目は第2回に歸属");
});

test("明示した resultId は上書きしない", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "A", income: { lp: 10, shards: 0 } },
      { type: "ADD_RESULT", name: "B", income: { lp: 10, shards: 0 } },
      { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 }, resultId: "指定したID" }
    ]
  });
  assert.equal(after.entries[0].resultId, "指定したID");
});

test("UNDO 1 回で全部戻る（1 回の reducer 呼び出しで全部入る）", () => {
  const before = baseState();
  const actions = [
    { type: "ADD_ROSTER", no: "00101", mode: "n" },
    { type: "ADD_RESULT", name: "X", income: { lp: 5, shards: 5 } },
    { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 } }
  ];
  const after = reducer(before, { type: "APPLY_IMPORT_BATCH", actions });
  assert.ok(after.roster.personas.length > before.roster.personas.length, "人格が増えている");
  assert.ok(after.results.length > before.results.length, "リザルトが増えている");
  assert.ok(after.entries.length > before.entries.length, "明細が増えている");
  assert.equal(after.entries[after.entries.length - 1].resultId, after.results[after.results.length - 1].id,
    "明細はリザルトに屬属");
  /* React 側の履歴は dispatch 1 回につき 1 個。batch は dispatch 1 回なので
     UNDO 1 回で before に戻る。 */
});

test("壊れた子 action があっても全体が落ちない", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "A", income: { lp: 10, shards: 0 } },
      null,
      { type: "NOTHING_KNOWN" },
      { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 } }
    ]
  });
  assert.equal(after.results.length, 1);
  assert.equal(after.entries.length, 1);
  assert.equal(after.entries[0].resultId, after.results[0].id);
});

test("空の batch は何もしない", () => {
  const before = baseState();
  const after = reducer(before, { type: "APPLY_IMPORT_BATCH", actions: [] });
  assert.equal(after, before, "同じ state");
});