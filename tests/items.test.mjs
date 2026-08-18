import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemRecords = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));

test("アイテムDBはPDFの回復8種・強化27種のみを登録し、特殊資源を含めない", () => {
  assert.equal(itemRecords.length, 35);
  assert.equal(itemRecords.filter((item) => item.category === "回復").length, 8);
  assert.equal(itemRecords.filter((item) => item.category === "強化").length, 27);
  assert.equal(itemRecords.some((item) => ["自我の欠片", "硝子の破片"].includes(item.name)), false);
  assert.equal(new Set(itemRecords.map((item) => item.name)).size, 35);
});

function loadGenerator() {
  const context = { window: { DB: { items: itemRecords } }, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function loadStateReducer() {
  const context = { window: { DB: { items: itemRecords } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

function createOutputState(inventory, customItems = []) {
  return {
    charName: "検証PC", plName: "", personaMode: null, personaNo: null, personaSrc: null,
    roster: { personas: [], egos: [] }, inventory, customItems,
    hp: "100", san: "45", speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通",
    skills: [], egoSlots: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null }, supports: [], uniqueBuffs: [], customStatuses: [], enhancements: [],
    pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: ""
  };
}

test("アイテムを導入すると数量を合算し、導入単位の表示設定を保持する", () => {
  const { reducer, initState } = loadStateReducer();
  const first = reducer(initState, { type: "ADD_ITEM", itemId: "heal-hp-bullet" });
  const second = reducer(first, { type: "ADD_ITEM", itemId: "heal-hp-bullet" });
  const patched = reducer(second, { type: "PATCH_ITEM", uid: second.inventory[0].uid, patch: { memo: false, palette: true } });

  assert.equal(patched.inventory.length, 1);
  assert.equal(patched.inventory[0].quantity, 2);
  assert.equal(patched.inventory[0].memo, false);
  assert.equal(patched.inventory[0].palette, true);
});

test("公式アイテムの最大所持数は直接入力・追加・保存再読込で超えない", () => {
  const { reducer, initState } = loadStateReducer();
  const itemId = "enh-garden-sensory-blocker";
  const first = reducer(initState, { type: "ADD_ITEM", itemId });
  const second = reducer(first, { type: "ADD_ITEM", itemId });
  const capped = reducer(second, { type: "PATCH_ITEM", uid: second.inventory[0].uid, patch: { quantity: 99 } });
  const hydrated = reducer(initState, { type: "HYDRATE", state: { inventory: [{ uid: "legacy-cap", itemId, quantity: 9 }], roster: { personas: [], egos: [] } } });

  assert.equal(itemRecords.find((item) => item.id === itemId)?.maxOwned, 3);
  assert.equal(capped.inventory[0].quantity, 3);
  assert.equal(hydrated.inventory[0].quantity, 3);
});

test("所持数を直接指定でき、削除するとMEMOとPALETTEの所持品出力から消える", () => {
  const { reducer, initState } = loadStateReducer();
  const added = reducer(initState, { type: "ADD_ITEM", itemId: "heal-hp-bullet" });
  const updated = reducer(added, { type: "PATCH_ITEM", uid: added.inventory[0].uid, patch: { quantity: "7" } });
  const generator = loadGenerator();

  assert.equal(updated.inventory[0].quantity, 7);
  assert.match(generator.buildMemo(createOutputState(updated.inventory)), /HP弾 ×7/);
  assert.match(generator.buildPalette(createOutputState(updated.inventory)), /【所持品】HP弾 ×7/);

  const removed = reducer(updated, { type: "REMOVE_ITEM", uid: updated.inventory[0].uid });
  assert.equal(removed.inventory.length, 0);
  assert.doesNotMatch(generator.buildMemo(createOutputState(removed.inventory)), /HP弾/);
  assert.doesNotMatch(generator.buildPalette(createOutputState(removed.inventory)), /HP弾/);
});

test("旧保存データの再読込では所持アイテムを空配列で補完する", () => {
  const { reducer, initState } = loadStateReducer();
  const next = reducer(initState, { type: "HYDRATE", state: { roster: { personas: [], egos: [] } } });
  assert.equal(Array.isArray(next.inventory), true);
  assert.equal(next.inventory.length, 0);
});

test("MEMOとチャットパレットは導入済みアイテムだけを個別の表示設定に従って反映する", () => {
  const generator = loadGenerator();
  const memoOnly = createOutputState([{ uid: "a", itemId: "heal-hp-bullet", quantity: 2, memo: true, palette: false }]);
  const memo = generator.buildMemo(memoOnly);
  const palette = generator.buildPalette(memoOnly);
  assert.match(memo, /■ 所持品/);
  assert.match(memo, /HP弾 ×2/);
  assert.doesNotMatch(palette, /【所持品】HP弾/);

  const both = createOutputState([{ uid: "b", itemId: "enh-whetstone", quantity: 1, memo: true, palette: true }]);
  assert.match(generator.buildPalette(both), /【所持品】砥石 ×1/);
  assert.match(generator.buildPalette(both), /出血付与量\+1/);
});

test("所持品はMEMO・PALETTEの標準出力で末尾カテゴリになる", () => {
  const generator = loadGenerator();
  const state = createOutputState([{ uid: "owned-last", itemId: "heal-hp-bullet", quantity: 2, memo: true, palette: true }]);
  state.egoSlots.ZAYIN = { name: "検証E.G.O", resources: "憤怒×1", san_cost: "10" };

  const memo = generator.buildMemo(state);
  const palette = generator.buildPalette(state);
  assert.ok(memo.lastIndexOf("■ 所持品") > memo.lastIndexOf("■ 装備E.G.O"));
  assert.ok(palette.lastIndexOf("### ■ 所持品") > palette.lastIndexOf("### ■ 代入式"));
});

test("オリジナルアイテムは公式DBを変えずに保存・出力・削除できる", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-test-tonic";
  const created = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "試製トニック", category: "その他", tags: ["検証"], effect: "HPを3回復", palette: "1d3 試製トニック：HP回復" } });
  const owned = reducer(created, { type: "ADD_ITEM", itemId: id });
  const generator = loadGenerator();
  const outputState = createOutputState(owned.inventory, owned.customItems);

  assert.equal(itemRecords.length, 35);
  assert.equal(owned.customItems.length, 1);
  assert.match(generator.buildMemo(outputState), /試製トニック ×1/);
  assert.match(generator.buildPalette(outputState), /試製トニック ×1/);

  const removed = reducer(owned, { type: "REMOVE_CUSTOM_ITEM", id });
  assert.equal(removed.customItems.length, 0);
  assert.equal(removed.inventory.length, 0);
});

test("オリジナルアイテムは名称の入力途中で空文字になっても削除されない", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-temporary-name";
  const created = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "仮名称" } });
  const cleared = reducer(created, { type: "PATCH_CUSTOM_ITEM", id, patch: { name: "" } });
  const renamed = reducer(cleared, { type: "PATCH_CUSTOM_ITEM", id, patch: { name: "完成名称" } });

  assert.equal(cleared.customItems.length, 1);
  assert.equal(renamed.customItems[0].name, "完成名称");
});

test("オリジナルアイテムにも任意の最大所持数を設定でき、縮小時は既存所持数を補正する", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-cap-item";
  const created = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "上限検証アイテム", maxOwned: 3 } });
  const owned = [1, 2, 3, 4].reduce((state) => reducer(state, { type: "ADD_ITEM", itemId: id }), created);
  const reduced = reducer(owned, { type: "PATCH_CUSTOM_ITEM", id, patch: { maxOwned: 1 } });

  assert.equal(owned.inventory[0].quantity, 3);
  assert.equal(reduced.customItems[0].maxOwned, 1);
  assert.equal(reduced.inventory[0].quantity, 1);
});
