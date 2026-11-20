import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/* -----------------------------------------------------------------------
   硝子窓の一括取り込みは保留中（利用者からの実物サンプル待ち）。

   ここで検証するのは「一括の入口が未接続であること」と、
   所持モデル側に一括で受け取る器（ADD_ROSTER_PERSONAS_BULK）が
   用意されていること。サンプル人手後に変換の検証を追加する。
   ----------------------------------------------------------------------- */
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const bulkSource = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");

function loadState() {
  const context = {
    window: { DB: { support_passives: [], death_passives: [], spirits: [], normal_enhancements: [], special_enhancements: [] } },
    console,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return context.window;
}

const w = loadState();
const reducer = w.appReducer;
const balance = w.LBT_computeLedgerBalance;

function baseState(personas = []) {
  return {
    supports: [], deathSupport: null, spirit: "", inventory: [], customItems: [], enhancements: [],
    roster: { personas, egos: [], supports: [], spirits: [] },
    results: [], entries: [],
    ui: {}, historyRecent: [], favorites: []
  };
}

test("一括取り込みは人格を所持へ足す（未分類）", () => {
  const s = reducer(baseState(), {
    type: "ADD_ROSTER_PERSONAS_BULK",
    personas: [{ no: "00101", mode: "n" }, { no: "00201", mode: "n" }]
  });
  assert.equal(s.roster.personas.length, 2);
  assert.equal(s.roster.personas[0].resultId, null, "未分類で入る");
  assert.equal(s.roster.personas[0].equipped, false);
  assert.equal(s.entries.length, 0, "人格=_price無し_。明細を立てない");
});

test("既存の No は上書きしない（重複は捨てる）", () => {
  let s = baseState([{ uid: "pr-1", no: "00101", mode: "n", equipped: false }]);
  s = reducer(s, { type: "ADD_ROSTER_PERSONAS_BULK", personas: [{ no: "00101", mode: "n" }, { no: "00301", mode: "n" }] });
  assert.equal(s.roster.personas.length, 2, "既存の1件 + 新規1件");
  assert.equal(s.roster.personas[0].uid, "pr-1", "既存のものはそのまま（uid が変わらない）");
});

test("同じ一括取り込みを2回行っても増えない（冪等）", () => {
  const list = [{ no: "00101", mode: "n" }, { no: "00201", mode: "n" }];
  let s = reducer(baseState(), { type: "ADD_ROSTER_PERSONAS_BULK", personas: list });
  s = reducer(s, { type: "ADD_ROSTER_PERSONAS_BULK", personas: list });
  assert.equal(s.roster.personas.length, 2, "2回入れても増えない");
});

test("空の入力は何もしない", () => {
  const s = reducer(baseState(), { type: "ADD_ROSTER_PERSONAS_BULK", personas: [] });
  assert.equal(s.roster.personas.length, 0);
});

test("硝子窓の取り込みは単一ドキュメント読み出しだけを使う", () => {
  /* 実測: Firestore はコレクション一覧を 403 で拒否する。「所持をまるごと取る」経路は
     共有 URL の documents/{id} を読むことだけ。存在しない pageSize 一覧を
     再度書き戻さないよう、ここで見張る。 */
  assert.ok(bulkSource.includes("LBT_fetchGarasumadoDocument"), "単一ドキュメントの読み出しがある");
  assert.ok(bulkSource.includes("LBT_buildGarasumadoManifest"), "取り込み候補を組み立てる入口がある");
  assert.ok(!bulkSource.includes("pageSize"), "存在しない一覧取得 API を叩かない");
  assert.ok(!bulkSource.includes("fetchGarasumadoRoster"), "使われない一覧取得の入口は残さない");
});

test("人格の一括取り込みは明細を立てない（残高を狂わせない）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "第12回", income: { lp: 1000, shards: 0 } });
  s = reducer(s, { type: "ADD_ROSTER_PERSONAS_BULK", personas: [{ no: "00101", mode: "n" }] });
  assert.equal(s.entries.length, 0, "人格には価格が無いので明細は0");
  assert.equal(balance(s.results, s.entries).lp, 1000, "残高が変わらない");
});