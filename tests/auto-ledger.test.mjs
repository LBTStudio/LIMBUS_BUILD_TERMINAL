import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   購入・入手の自動記録（Phase 3）の回帰テスト。

   守るべき性質:
     - DB が価格を持つものは、購入しただけで明細が1件できる
     - 明細の帰属は「未分類」から始まり、利用者に選ばせない
     - 所持・強化を外したら、その支出も戻る（残高を狂わせない）
     - 価格を持たないもの（人格・E.G.O）は勝手に入らない
     -  موجودしない窓（node）で計算が壊れない
--------------------------------------------------------------------------- */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

const DB = {
  items: [
    { id: "heal-bandage", name: "包帯", price: "15LP" },
    { id: "syringe", name: "注射器", price: "30LP" },
    { id: "free-item", name: "無料品", price: "" }
  ],
  support_passives: [{ name: "ルサンチマン", lp: 7, cond: "c", effect: "e" }],
  death_passives: [{ name: "覚悟", shards: 50, cond: "c", effect: "e" }],
  spirits: [{ name: "泉水", price: 100, morale_effect: "M", confuse_effect: "C", always_effect: "A" }],
  normal_enhancements: [{ name: "肉体強化0-1", group: "肉体強化0", shards: 5, category: "persona" }],
  special_enhancements: [{ name: "特殊強化A", shards: 30 }]
};

function loadContext() {
  const context = {
    window: { DB },
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

const context = loadContext();
const reducer = context.window.appReducer;
const balance = context.window.LBT_computeLedgerBalance;

function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    inventory: [],
    customItems: [],
    enhancements: [],
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [],
    entries: [],
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

test("アイテムの導入で LP 支出の明細が1件できる（未分類から）", () => {
  const s = reducer(baseState(), { type: "ADD_ITEM", itemId: "heal-bandage" });
  assert.equal(s.entries.length, 1, "明細が1件できる");
  assert.equal(s.entries[0].kind, "item");
  assert.equal(s.entries[0].name, "包帯", "表示名はDBの名称");
  assert.equal(s.entries[0].cost.lp, 15, "価格はDBから引く");
  assert.equal(s.entries[0].resultId, null, "帰属は未分類（利用者に選ばせない）");
  assert.equal(balance(s.results, s.entries).lp, -15, "残り inmediatamente反映");
});

test("所持数を増やしても明細は増えない（購入1回=明細1件）", () => {
  let s = reducer(baseState(), { type: "ADD_ITEM", itemId: "heal-bandage" });
  s = reducer(s, { type: "ADD_ITEM", itemId: "heal-bandage" });
  assert.equal(s.entries.length, 1, "同じのを2回入れても明細は1件");
  assert.equal(s.inventory[0].quantity, 2, "所持数は増える");
});

test("サポパを所持すると LP、明細が未分類で残る", () => {
  const s = reducer(baseState(), { type: "ADD_ROSTER_SUPPORT", spp: { name: "ルサンチマン" } });
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].kind, "support");
  assert.equal(s.entries[0].cost.lp, 7);
  assert.equal(s.entries[0].resultId, null);
});

test("死亡後サポパは欠片の明細になる", () => {
  const s = reducer(baseState(), { type: "ADD_ROSTER_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.entries[0].kind, "deathSupport");
  assert.equal(s.entries[0].cost.shards, 50);
  assert.equal(s.entries[0].cost.lp, 0);
});

test("精神は欠片で記録される", () => {
  const s = reducer(baseState(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: "泉水" } });
  assert.equal(s.entries[0].kind, "spirit");
  assert.equal(s.entries[0].cost.shards, 100);
});

test("強化の購入は欠片の明細になる", () => {
  const s = reducer(baseState(), { type: "ADD_ENHANCEMENT", group: "肉体強化0", name: "肉体強化0-1", category: "persona" });
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].kind, "enhancement");
  assert.equal(s.entries[0].cost.shards, 5, "価格はDBの shards");
  assert.equal(balance(s.results, s.entries).shards, -5);
});

test("強化を外すと支出も戻る（残高を狂わせない）", () => {
  let s = reducer(baseState(), { type: "ADD_ENHANCEMENT", group: "肉体強化0", name: "肉体強化0-1" });
  const id = s.enhancements[0].id;
  assert.equal(balance(s.results, s.entries).shards, -5);
  s = reducer(s, { type: "REMOVE_ENHANCEMENT", id });
  assert.equal(s.entries.length, 0, "明細も戻る");
  assert.equal(balance(s.results, s.entries).shards, 0, "残高は0へ戻る");
});

test("所持から外したサポパは支出も戻る", () => {
  let s = reducer(baseState(), { type: "ADD_ROSTER_SUPPORT", spp: { name: "ルサンチマン" } });
  const uid = s.roster.supports[0].uid;
  assert.equal(balance(s.results, s.entries).lp, -7);
  s = reducer(s, { type: "REMOVE_ROSTER_SUPPORT", uid });
  assert.equal(s.entries.length, 0);
  assert.equal(balance(s.results, s.entries).lp, 0);
});

test("所持から外した精神は支出も戻る", () => {
  let s = reducer(baseState(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: "泉水" } });
  const uid = s.roster.spirits[0].uid;
  assert.equal(balance(s.results, s.entries).shards, -100);
  s = reducer(s, { type: "REMOVE_ROSTER_SPIRIT", uid });
  assert.equal(s.entries.length, 0);
});

test("装備し直しても明細は増えない（購入であって装備ではない）", () => {
  let s = reducer(baseState(), { type: "ADD_ROSTER_SUPPORT", spp: { name: "ルサンチマン" } });
  const uid = s.roster.supports[0].uid;
  s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid, equipped: false });
  s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid });
  assert.equal(s.entries.length, 1, "装備の付け外しは支出を増やさない");
  assert.equal(s.supports.length, 1, "装備は戻っている");
});

test("購入は最後に記録したリザルトへ帰属する（リザルトが無ければ未分類で待つ）", () => {
  let s = reducer(baseState(), { type: "ADD_ITEM", itemId: "syringe" });
  assert.equal(s.entries[0].resultId, null, "リザルトが無いので未分類（待機）");
  assert.equal(balance(s.results, s.entries).lp, -30, "でも収支には反映される");

  /* リザルト帰属の既定は「直近」。選ぶ操作は求めない。 */
  s = reducer(s, { type: "ADD_RESULT", name: "第12回", income: { lp: 1000, shards: 200 } });
  const resultId = s.results[s.results.length - 1].id;
  s = reducer(s, { type: "ADD_ITEM", itemId: "heal-bandage" });
  assert.equal(s.entries[s.entries.length - 1].resultId, resultId, "購入は直近リザルトへ入る");

  /* 後から帰属を振り直す（ドラッグ&ドロップ相当）。 */
  const entryId = s.entries[s.entries.length - 1].id;
  s = reducer(s, { type: "SET_ENTRY_RESULT", id: entryId, resultId: null });
  assert.equal(s.entries[s.entries.length - 1].resultId, null, "未分類へ戻せる");
  s = reducer(s, { type: "SET_ENTRY_RESULT", id: entryId, resultId });
  assert.equal(s.entries[s.entries.length - 1].resultId, resultId, "後から帰属できる");
  assert.equal(balance(s.results, s.entries).lp, 955, "残高は変わらない");
});

test("価格を持たないアイテムは明細の費用が0になる（勝手に入らない）", () => {
  const s = reducer(baseState(), { type: "ADD_ITEM", itemId: "free-item" });
  assert.equal(s.entries.length, 1, "明細自体は立つ");
  assert.equal(s.entries[0].cost.lp, 0, "費用は0（推測の数は足さない）");
});
