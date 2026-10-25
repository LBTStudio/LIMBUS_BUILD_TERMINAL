import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemRecords = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const specialItemRecords = JSON.parse(readFileSync(new URL("../data/special-items.json", import.meta.url), "utf8"));

test("アイテムDBはPDFの回復8種・強化27種のみを登録し、特殊資源を含めない", () => {
  assert.equal(itemRecords.length, 35);
  assert.equal(itemRecords.filter((item) => item.category === "回復").length, 8);
  assert.equal(itemRecords.filter((item) => item.category === "強化").length, 27);
  assert.equal(itemRecords.some((item) => ["自我の欠片", "硝子の破片"].includes(item.name)), false);
  assert.equal(new Set(itemRecords.map((item) => item.name)).size, 35);
});

test("硝子の破片は通常アイテムDBと分離して所持数だけを管理し、MEMO・PALETTEへ反映する", () => {
  assert.equal(itemRecords.length, 35, "公式ショップの35件は維持する");
  assert.equal(specialItemRecords.length, 2);
  const shard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  assert.equal(shard.id, "resource-glass-shard");
  assert.equal(shard.name, "硝子の破片");
  assert.equal(shard.specialResource, true);
  assert.equal(itemRecords.some((item) => item.id === shard.id), false, "通常の購入カタログには入れない");

  const { reducer, initState } = loadStateReducer();
  const first = reducer(initState, { type: "ADD_ITEM", itemId: shard.id });
  assert.equal(first.inventory.length, 1);
  assert.equal(first.inventory[0].quantity, 1);
  assert.equal(first.entries.length, 0, "特殊資源の追加で購入明細を作らない");
  const second = reducer(first, { type: "ADD_ITEM", itemId: shard.id });
  assert.equal(second.inventory[0].quantity, 2);
  assert.equal(second.entries.length, 0, "数量追加でも購入明細を作らない");

  const generator = loadGenerator();
  const output = createOutputState(second.inventory);
  assert.match(generator.buildMemo(output), /硝子の破片 ×2/);
  assert.match(generator.buildPalette(output), /【所持品】硝子の破片 ×2/);
});

test("自我の欠片は所持インベントリではなく購入と同時に通帳へ反映する", () => {
  const shard = specialItemRecords.find((item) => item.id === "resource-ego-shard");
  assert.ok(shard);
  assert.equal(shard.ledgerResource, "shards");
  assert.equal(shard.price, "2LP");
  const { reducer, initState } = loadStateReducer();
  const withResult = reducer(initState, {
    type: "ADD_RESULT",
    name: "特殊資源の購入テスト",
    income: { lp: 100, shards: 0 }
  });
  const target = withResult.results.find((result) => result.name === "特殊資源の購入テスト");
  assert.ok(target, "購入先となるリザルトが存在する");
  const beforeBalance = contextForLedgerBalance(reducer, withResult);
  const purchased = reducer(withResult, { type: "ADD_ITEM", itemId: shard.id, resultId: target.id });
  const updated = purchased.results.find((result) => result.id === target.id);
  assert.equal(updated.income.shards, target.income.shards + 1);
  assert.equal(purchased.inventory.some((entry) => entry.itemId === shard.id), false, "通帳連動資源を所持数に二重保存しない");
  const expense = purchased.entries.find((entry) => entry.name === "自我の欠片" && entry.resultId === target.id);
  assert.ok(expense, "購入明細を記録する");
  assert.equal(expense.cost.lp, 2);
  assert.equal(windowBalance(purchased).lp, beforeBalance.lp - 2, "LP残高は2だけ減る");
  assert.equal(windowBalance(purchased).shards, beforeBalance.shards + 1, "欠片残高は1だけ増える");
});

test("自我の欠片はLP不足時に購入も残高加算もしない", () => {
  const shard = specialItemRecords.find((item) => item.id === "resource-ego-shard");
  const { reducer, initState } = loadStateReducer();
  const poor = {
    ...initState,
    results: (initState.results || []).map((result) => ({ ...result, income: { ...(result.income || {}), lp: 1, shards: 0 } })),
    entries: []
  };
  const blocked = reducer(poor, { type: "ADD_ITEM", itemId: shard.id });
  assert.equal(blocked, poor, "LPが2未満なら状態を変えない");
});

function loadGenerator() {
  const context = { window: { DB: { items: itemRecords, specialItems: specialItemRecords } }, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function loadStateReducer() {
  const context = { window: { DB: { items: itemRecords, specialItems: specialItemRecords } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE, balance: context.window.LBT_computeLedgerBalance };
}
function contextForLedgerBalance(reducer, state) {
  return loadStateReducer().balance(state.results, state.entries);
}
function windowBalance(state) {
  return loadStateReducer().balance(state.results, state.entries);
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

/* 購入明細は表示名と価格が所持の行と同じ経路から決まる。オリジナルアイテム
   は公式 DB に存在しないので、state.customItems から拾わないと名前が
   "custom-…" のままで価格も 0 になり、帳の残高が動かない。 */
test("オリジナルアイテムを買うと名前と価格が明細に載る", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-priced-tonic";
  const created = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "試製トニック", price: "30LP" } });
  const purchased = reducer(created, { type: "ADD_ITEM", itemId: id });

  assert.equal(purchased.entries.length, 1, "購入は明細になる");
  assert.equal(purchased.entries[0].name, "試製トニック", "明細はカスタム名を使う");
  assert.equal(purchased.entries[0].cost.lp, 30, "価格は custom.price から引く");
  assert.equal(purchased.entries[0].cost.shards, 0);
  assert.equal(purchased.inventory[0].itemId, id);
});

test("オリジナルアイテムの価格は保存・読込後も明細の価格として続く", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-reload-price";
  let s = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "値段つき", price: "10LP 20欠片" } });
  s = reducer(s, { type: "ADD_ITEM", itemId: id });
  const entry = s.entries[s.entries.length - 1];

  assert.equal(entry.cost.lp, 10);
  assert.equal(entry.cost.shards, 20);
});

/* 価格文字列の唯一の解釈経路。日本語入力では全角数字・全角ＬＰが混ざる
   （"１５ＬＰ"、"２０欠片"）。半角しか読めないと価格が常に 0 になり、
   帳の残高が動かない。 */
test("価格表記は全角数字・全角単位でも読める", () => {
  const context = { window: { DB: { items: itemRecords } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  const parse = context.window.LBT_parsePriceText;

  /* vm 境界を跨ぐオブジェクトは realm が違うので、フィールドで比較する。 */
  const eq = (raw, lp, shards) => {
    const got = parse(raw);
    assert.equal(got.lp, lp, raw + " の lp");
    assert.equal(got.shards, shards, raw + " の shards");
  };
  eq("１５ＬＰ", 15, 0);
  eq("ＬＰ15", 15, 0);
  eq("１５ＬＰ３０欠片", 15, 30);
  eq("２欠片", 0, 2);
  eq("３０", 30, 0);
});

test("既存アイテムの数量加算は残高ゲートに止められず、二重購入明細を作らない", () => {
  const { reducer, initState } = loadStateReducer();
  const id = "custom-owned-stack-price";
  const created = reducer(initState, { type: "ADD_CUSTOM_ITEM", item: { id, name: "数量加算試験", price: "30LP", maxOwned: 5 } });
  const tracked = {
    ...created,
    results: [{ id: "result-1", name: "初期作成", income: { lp: 30, shards: 0, tickets: {} }, exchange: { lp: 0, shards: 0 } }],
    entries: []
  };
  const first = reducer(tracked, { type: "ADD_ITEM", itemId: id });
  assert.equal(first.inventory[0].quantity, 1);
  assert.equal(first.entries.length, 1, "初回導入だけは価格を課帳する");
  assert.equal(first.entries[0].cost.lp, 30);

  const second = reducer(first, { type: "ADD_ITEM", itemId: id });
  assert.equal(second.inventory[0].quantity, 2, "残高0でも既存スタックの数量加算は成功する");
  assert.equal(second.entries.length, 1, "数量加算で二重の支出明細を作らない");
});
