import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   初期所持（初期枠）アイテムの回帰テスト。

   守るべき性質:
     - 初期枠として定義したアイテムは「最初から所持している」ものとして取り込める
     - 取り込みは支払っていないので明細（支出）を起こさない
     - 所持エントリは初期枠由来か購入かを判別できる（origin）
     - 通常の ADD_ITEM は従来どおり「所持追加＝支出計上」を壊さない
     - 旧保存データ（origin 無し）は購入として扱われる
--------------------------------------------------------------------------- */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

const dbStub = () => ({
  items: [
    { id: "heal-bandage", name: "包帯", category: "回復", price: "15LP" },
    { id: "heal-hp-ampoule", name: "HPアムプル", category: "回復", price: "20LP" },
    { id: "enh-whetstone", name: "砥石", category: "強化素材", price: "10LP" }
  ],
  support_passives: [],
  death_passives: [],
  spirits: [],
  normal_enhancements: [],
  special_enhancements: []
});

function loadContext() {
  const windowStub = { DB: dbStub() };
  const context = {
    window: windowStub,
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
  vm.runInContext(source, context);
  return context;
}

function reducerOf() {
  const context = loadContext();
  const reducer = context.window.appReducer;
  assert.ok(typeof reducer === "function", "appReducer が読み出せる");
  return { reducer, context };
}

function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    spiritMorale: "",
    spiritConfuse: "",
    spiritAlways: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    ui: {},
    historyRecent: [],
    favorites: [],
    inventory: [],
    initialItems: [],
    entries: [],
    results: []
  };
}

test("初期枠の定義を item id の集合として置ける", () => {
  const { reducer } = reducerOf();
  const s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage", "  ", "heal-bandage", "enh-whetstone"] });
  /* vm リリアル由来の配列はテスト側の Array とプロトタイプが違うので正規化して比べる。 */
  assert.deepEqual(Array.from(s.initialItems), ["heal-bandage", "enh-whetstone"], "空と重複は除いて保持");
});

test("初期枠を取り込むと所持に入り、明細を起こさない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage", "enh-whetstone"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  assert.equal(s.inventory.length, 2, "所持として入る");
  assert.equal(s.inventory[0].origin, "initial", "初期枠由来と判別できる");
  assert.equal(s.entries.length, 0, "支払っていないので支出明細を作らない");
});

test("取り込みは冪等。既に所持しているものは触らない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  assert.equal(s.inventory.length, 1, "1件のまま");
  assert.equal(s.inventory[0].origin, "initial");
});

test("初期枠のものにあとから数量を足しても、明細は増えない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  s = reducer(s, { type: "ADD_ITEM", itemId: "heal-bandage" });
  assert.equal(s.inventory.length, 1, "同じ itemId は重複所持しない");
  assert.equal(s.inventory[0].quantity, 2, "数量が増える");
  assert.equal(s.inventory[0].origin, "initial", "由来は初期枠のまま（最初に受け取った側）");
  /* 個数の増加は既存どおり明細にしない（導入した時だけ明細を作る規則）。 */
  assert.equal(s.entries.length, 0);
});

test("通常の ADD_ITEM は「所持追加＝支出計上」を続ける（回帰）", () => {
  const { reducer } = reducerOf();
  const s = reducer(baseState(), { type: "ADD_ITEM", itemId: "heal-hp-ampoule" });
  assert.equal(s.inventory.length, 1);
  assert.equal(s.inventory[0].origin, "acquired", "購入は初期枠ではない");
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].kind, "item");
  assert.equal(s.entries[0].cost.lp, 20);
});

test("所持を消すと明細も消える（残高を狂わせない）", () => {
  const { reducer } = reducerOf();
  const s1 = reducer(baseState(), { type: "ADD_ITEM", itemId: "heal-hp-ampoule" });
  const uid = s1.inventory[0].uid;
  const s2 = reducer(s1, { type: "REMOVE_ITEM", uid });
  assert.equal(s2.inventory.length, 0);
  assert.equal(s2.entries.length, 0);
});

test("旧保存データ（origin 無し）は購入として補完され、初期枠定義は保つ", () => {
  const context = loadContext();
  const normalize = context.window.LBT_normalizeStateShape;
  assert.ok(typeof normalize === "function", "normalizeStateShape が読み出せる");
  const legacy = {
    ...baseState(),
    inventory: [{ uid: "it-1", itemId: "heal-bandage", quantity: 2, memo: true, palette: true }],
    initialItems: undefined
  };
  const next = normalize(legacy);
  assert.equal(next.inventory[0].origin, "acquired", "由来が無い旧データは購入扱い");
  assert.deepEqual(Array.from(next.initialItems), [], "初期枠定義は空で補完される");
});

test("origin は保存・読み込み後も保持される", () => {
  const context = loadContext();
  const normalize = context.window.LBT_normalizeStateShape;
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  const reloaded = normalize(structuredClone(s));
  assert.equal(reloaded.inventory[0].origin, "initial");
});

test("初期枠由来の所持を消しても、明細は残らない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  s = reducer(s, { type: "REMOVE_ITEM", uid: s.inventory[0].uid });
  assert.equal(s.inventory.length, 0);
  assert.equal(s.entries.length, 0, "支払っていないので消すものも無い");
});

test("初期枠定義は人格切替で所持がリセットされても残る", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_INITIAL_ITEMS", ids: ["heal-bandage"] });
  s = reducer(s, { type: "APPLY_INITIAL_ITEMS" });
  /* 人格切替は所持（inventory）を初期化するが、初期枠の定義は作り直す手間を
     省くため残す。取り込みは再度 APPLY_INITIAL_ITEMS で行う。 */
  const reset = { ...s, inventory: [] };
  assert.deepEqual(Array.from(s.initialItems), ["heal-bandage"]);
  const again = reducer(reset, { type: "APPLY_INITIAL_ITEMS" });
  assert.equal(again.inventory.length, 1, "定義があれば取り込みをやり直せる");
  assert.equal(again.inventory[0].origin, "initial");
});
