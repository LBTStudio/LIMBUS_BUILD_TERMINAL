import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemRecords = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const specialItemRecords = JSON.parse(readFileSync(new URL("../data/special-items.json", import.meta.url), "utf8"));
const coreItemCorpus = readFileSync(new URL("../data/provenance/core.txt", import.meta.url), "utf8");
const itemCatalogHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const itemCodexSource = readFileSync(new URL("../js/ItemCodex.js", import.meta.url), "utf8");
const itemShopSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");


test("アイテムDBはPDFの回復8種・強化27種のみを登録し、特殊資源を含めない", () => {
  assert.equal(itemRecords.length, 35);
  assert.equal(itemRecords.filter((item) => item.category === "回復").length, 8);
  assert.equal(itemRecords.filter((item) => item.category === "強化").length, 27);
  assert.equal(itemRecords.some((item) => ["自我の欠片", "硝子の破片"].includes(item.name)), false);
  assert.equal(new Set(itemRecords.map((item) => item.name)).size, 35);
});

test("硝子の破片は通常アイテムDBと分離し、ルールブックどおり20LPで購入できる", () => {
  assert.equal(itemRecords.length, 35, "公式ショップの35件は維持する");
  assert.equal(specialItemRecords.length, 2);
  const shard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  assert.equal(shard.id, "resource-glass-shard");
  assert.equal(shard.name, "硝子の破片");
  assert.equal(shard.specialResource, true);
  assert.equal(shard.price, "20LP");
  assert.match(shard.effect, /CTを1減少/);
  assert.equal(itemRecords.some((item) => item.id === shard.id), false, "通常の購入カタログには入れない");

  const { reducer, initState } = loadStateReducer();
  /* 所持欄への移送経路は購入と区別し、価格を二重計上しない。 */
  const first = reducer(initState, { type: "ADD_ITEM_INVENTORY", itemId: shard.id });
  assert.equal(first.inventory.length, 1);
  assert.equal(first.inventory[0].quantity, 1);
  assert.equal(first.entries.length, 0, "所持欄への取り込みでは購入明細を作らない");
  const second = reducer(first, { type: "ADD_ITEM_INVENTORY", itemId: shard.id });
  assert.equal(second.inventory[0].quantity, 2);
  assert.equal(second.entries.length, 0, "取り込み数量でも購入明細を作らない");

  const generator = loadGenerator();
  const output = createOutputState(second.inventory);
  assert.match(generator.buildMemo(output), /硝子の破片 ×2/);
  assert.match(generator.buildPalette(output), /【所持品】硝子の破片 ×2/);
});

test("硝子の破片は購入ごとに20LPを支払い、所持数と通帳の支出を更新する", () => {
  const shard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  assert.ok(shard);
  assert.equal(shard.price, "20LP");
  const { reducer, initState, balance } = loadStateReducer();
  const withResult = reducer(initState, {
    type: "ADD_RESULT",
    name: "硝子の破片購入テスト",
    income: { lp: 50, shards: 0 }
  });
  const target = withResult.results.find((result) => result.name === "硝子の破片購入テスト");
  const before = balance(withResult.results, withResult.entries);
  const first = reducer(withResult, { type: "ADD_ITEM", itemId: shard.id, resultId: target.id });
  assert.equal(first.inventory.find((entry) => entry.itemId === shard.id)?.quantity, 1);
  assert.equal(balance(first.results, first.entries).lp, before.lp - 20);
  const firstExpense = first.entries.find((entry) => entry.name === "硝子の破片");
  assert.ok(firstExpense);
  assert.equal(firstExpense.cost.lp, 20);
  assert.equal(firstExpense.resultId, target.id);

  const second = reducer(first, { type: "ADD_ITEM", itemId: shard.id, resultId: target.id });
  assert.equal(second.inventory.find((entry) => entry.itemId === shard.id)?.quantity, 2);
  assert.equal(second.entries.filter((entry) => entry.name === "硝子の破片").length, 2, "再購入も別明細として記録");
  assert.equal(balance(second.results, second.entries).lp, before.lp - 40);
});

test("硝子の破片の数量入力と最新リザルトへの消費記録を回帰検証する", () => {
  assert.ok(
    itemCodexSource.includes(String.raw`/^\d+$/.test(consumeQuantityDraft)`),
    "消費数の入力検証は通常の整数入力を受け付ける"
  );

  const shard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  const { reducer, initState, balance, normalize } = loadStateReducer();
  let state = reducer(initState, {
    type: "ADD_RESULT",
    name: "硝子の破片の購入元",
    date: "2026-10-20",
    income: { lp: 50, shards: 0 }
  });
  const purchaseResultId = state.results.find((result) => result.name === "硝子の破片の購入元").id;
  state = reducer(state, {
    type: "ADD_RESULT",
    name: "硝子の破片の消費先",
    date: "2026-10-26",
    income: { lp: 0, shards: 0 }
  });
  const latestResultId = state.results.find((result) => result.name === "硝子の破片の消費先").id;
  state = reducer(state, { type: "ADD_ITEM", itemId: shard.id, resultId: purchaseResultId });
  const purchaseEntry = state.entries.find((entry) => entry.name === "硝子の破片" && entry.resultId === purchaseResultId);
  assert.ok(purchaseEntry, "購入時の支出明細を記録する");
  const beforeConsumeBalance = balance(state.results, state.entries);

  state = reducer(state, {
    type: "CONSUME_ITEM",
    itemId: shard.id,
    quantity: 1,
    reason: "consumption",
    operationId: "glass-shard-consume-regression"
  });
  assert.equal(state.inventory.some((entry) => entry.itemId === shard.id), false, "消費した破片を所持品から減らす");
  const latestResult = state.results.find((result) => result.id === latestResultId);
  assert.equal(latestResult.consumedItems.length, 1, "最新リザルトに消費オブジェクトを残す");
  assert.deepEqual(
    {
      itemId: latestResult.consumedItems[0].itemId,
      itemName: latestResult.consumedItems[0].itemName,
      quantity: latestResult.consumedItems[0].quantity,
      reason: latestResult.consumedItems[0].reason
    },
    { itemId: shard.id, itemName: shard.name, quantity: 1, reason: "consumption" }
  );
  assert.equal(state.entries.some((entry) => entry.id === purchaseEntry.id), true, "消費しても購入履歴を保持する");
  assert.deepEqual(balance(state.results, state.entries), beforeConsumeBalance, "消費ではLP・欠片の残高を変えない");

  const reloaded = normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(
    reloaded.results.find((result) => result.id === latestResultId).consumedItems[0].itemId,
    shard.id,
    "保存状態を正規化しても消費記録を保持する"
  );
});

test("硝子の破片は20LP未満の残高では購入できない", () => {
  const shard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  const { reducer, initState } = loadStateReducer();
  const poor = {
    ...initState,
    results: [{ id: "poor-glass-result", name: "残高不足", date: "2026-01-01", income: { lp: 19, shards: 0 } }],
    entries: []
  };
  const blocked = reducer(poor, { type: "ADD_ITEM", itemId: shard.id });
  assert.equal(blocked, poor, "LPが20未満なら所持数も通帳も変えない");
});

test("自我の欠片は所持インベントリではなく購入と同時に通帳へ反映する", () => {
  const shard = specialItemRecords.find((item) => item.id === "resource-ego-shard");
  assert.ok(shard);
  assert.equal(shard.ledgerResource, "shards");
  assert.equal(shard.price, "2LP");
  const { reducer, initState, balance } = loadStateReducer();
  const withResult = reducer(initState, {
    type: "ADD_RESULT",
    name: "特殊資源の購入テスト",
    income: { lp: 100, shards: 0 }
  });
  const target = withResult.results.find((result) => result.name === "特殊資源の購入テスト");
  assert.ok(target, "購入先となるリザルトが存在する");
  const beforeBalance = balance(withResult.results, withResult.entries);
  const purchased = reducer(withResult, { type: "ADD_ITEM", itemId: shard.id, resultId: target.id });
  const updated = purchased.results.find((result) => result.id === target.id);
  assert.equal(updated.income.shards, target.income.shards + 1);
  assert.equal(purchased.inventory.some((entry) => entry.itemId === shard.id), false, "通帳連動資源を所持数に二重保存しない");
  const expense = purchased.entries.find((entry) => entry.name === "自我の欠片" && entry.resultId === target.id);
  assert.ok(expense, "購入明細を記録する");
  assert.equal(expense.cost.lp, 2);
  assert.equal(balance(purchased.results, purchased.entries).lp, beforeBalance.lp - 2, "LP残高は2だけ減る");
  assert.equal(balance(purchased.results, purchased.entries).shards, beforeBalance.shards + 1, "欠片残高は1だけ増える");
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
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE, balance: context.window.LBT_computeLedgerBalance, normalize: context.window.LBT_normalizeStateShape };
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


test("ショップ購入は消耗品を毎回課金して在庫に加え、消費後も再購入できる", () => {
 const { reducer, initState, balance } = loadStateReducer();
 const itemId = "heal-hp-bullet";
 let state = reducer(initState, { type: "ADD_RESULT", name: "ショップ消耗品テスト", income: { lp: 100, shards: 0 } });
 const resultId = state.results[state.results.length - 1].id;
 state = reducer(state, { type: "ADD_ITEM", itemId, purchase: true });
 state = reducer(state, { type: "ADD_ITEM", itemId, purchase: true });
 assert.equal(state.inventory.find((entry) => entry.itemId === itemId)?.quantity, 2);
 let purchases = state.entries.filter((entry) => entry.kind === "item" && entry.name === "HP弾");
 assert.equal(purchases.length, 2);
 assert.deepEqual(Array.from(purchases, (entry) => entry.cost.lp), [20, 20]);
 assert.equal(balance(state.results, state.entries).lp, 60);
 state = reducer(state, { type: "CONSUME_ITEM", itemId, quantity: 2, reason: "consumption", operationId: "shop-consume-two", resultId });
 assert.equal(state.inventory.some((entry) => entry.itemId === itemId), false);
 assert.equal(state.entries.filter((entry) => entry.kind === "item" && entry.name === "HP弾").length, 2);
 assert.equal(balance(state.results, state.entries).lp, 60);
 state = reducer(state, { type: "ADD_ITEM", itemId, purchase: true });
 assert.equal(state.inventory.find((entry) => entry.itemId === itemId)?.quantity, 1);
 purchases = state.entries.filter((entry) => entry.kind === "item" && entry.name === "HP弾");
 assert.equal(purchases.length, 3);
 assert.equal(balance(state.results, state.entries).lp, 40);
 const cappedItemId = "enh-garden-sensory-blocker";
 let capped = reducer(initState, { type: "ADD_RESULT", name: "所持上限テスト", income: { lp: 100, shards: 0 } });
 for (let i = 0; i < 3; i += 1) capped = reducer(capped, { type: "ADD_ITEM", itemId: cappedItemId, purchase: true });
 assert.equal(capped.inventory.find((entry) => entry.itemId === cappedItemId)?.quantity, 3);
 assert.equal(reducer(capped, { type: "ADD_ITEM", itemId: cappedItemId, purchase: true }), capped);
 const poor = { ...initState, results: [{ id: "poor-shop-result", name: "残高不足", income: { lp: 19, shards: 0 } }], entries: [] };
 assert.equal(reducer(poor, { type: "ADD_ITEM", itemId, purchase: true }), poor);
});

test("アイテム消費は一般理由で所持数とリザルトへ記録し、購入明細は残す", () => {
  const { reducer, initState, balance, normalize } = loadStateReducer();
  let state = reducer(initState, {
    type: "ADD_RESULT",
    name: "消費テスト",
    income: { lp: 100, shards: 0 }
  });
  const resultId = state.results[state.results.length - 1].id;
  state = reducer(state, { type: "ADD_ITEM", itemId: "heal-hp-bullet" });
  state = reducer(state, { type: "ADD_ITEM_INVENTORY", itemId: "heal-hp-bullet", quantity: 2 });
  const item = itemRecords.find((row) => row.id === "heal-hp-bullet");
  const entryCount = state.entries.length;
  const beforeBalance = balance(state.results, state.entries);

  const first = reducer(state, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: 2,
    reason: "consumption", operationId: "phenomenon-use-1"
  });
  assert.equal(first.inventory.find((entry) => entry.itemId === "heal-hp-bullet").quantity, 1);
  const firstResult = first.results.find((result) => result.id === resultId);
  assert.equal(firstResult.consumedItems.length, 1);
  assert.equal(firstResult.consumedItems[0].itemId, "heal-hp-bullet");
  assert.equal(firstResult.consumedItems[0].itemName, item.name);
  assert.equal(firstResult.consumedItems[0].quantity, 2);
  assert.equal(firstResult.consumedItems[0].reason, "consumption");
  assert.equal(first.entries.length, entryCount, "消費では購入明細を削除・追加しない");
  assert.equal(balance(first.results, first.entries).lp, beforeBalance.lp, "消費でLP残高は変わらない");

  const duplicate = reducer(first, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: 2,
    reason: "consumption", operationId: "phenomenon-use-1"
  });
  assert.equal(duplicate, first, "同じ操作IDの再送では二重消費しない");

  const last = reducer(first, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: 1,
    reason: "consumption", operationId: "phenomenon-use-2"
  });
  assert.equal(last.inventory.some((entry) => entry.itemId === "heal-hp-bullet"), false, "全数消費で所持行だけを取り除く");
  assert.equal(last.entries.length, entryCount, "全数消費後も購入履歴は保持する");
  assert.equal(balance(last.results, last.entries).lp, beforeBalance.lp);
  assert.equal(last.results.find((result) => result.id === resultId).consumedItems.length, 2);

  const reloaded = normalize(JSON.parse(JSON.stringify(last)));
  const reloadedResult = reloaded.results.find((result) => result.id === resultId);
  assert.equal(reloadedResult.consumedItems.length, 2, "保存状態の正規化後も消費履歴を保持する");
  assert.equal(reloadedResult.consumedItems[0].itemName, item.name);
});

test("保存済みの汎用アイテム消費を『現象処理』から『消費』へ補正する", () => {
  const { reducer, initState, normalize } = loadStateReducer();
  let state = reducer(initState, {
    type: "ADD_RESULT",
    name: "旧履歴の移行テスト",
    income: { lp: 100, shards: 0 }
  });
  const resultId = state.results[state.results.length - 1].id;
  state = {
    ...state,
    results: state.results.map((result) => result.id !== resultId ? result : ({
      ...result,
      consumedItems: [
        { id: "legacy-explicit", itemId: "heal-hp-bullet", itemName: "HP弾", quantity: 1, reason: "phenomenon_processing" },
        { id: "legacy-empty", itemId: "resource-glass-shard", itemName: "硝子の破片", quantity: 1 }
      ]
    }))
  };
  const migrated = normalize(JSON.parse(JSON.stringify(state)));
  const consumed = migrated.results.find((result) => result.id === resultId).consumedItems;
  assert.deepEqual(consumed.map((item) => item.reason), ["consumption", "consumption"]);
});

test("アイテム消費は未所持・数量不正・所持数超過・リザルト無しでは状態を変えない", () => {
  const { reducer, initState } = loadStateReducer();
  const owned = reducer(initState, { type: "ADD_ITEM_INVENTORY", itemId: "heal-hp-bullet", quantity: 1 });
  assert.equal(reducer(owned, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: 2, operationId: "too-many"
  }), owned);
  assert.equal(reducer(owned, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: "1.5", operationId: "invalid"
  }), owned);
  assert.equal(reducer(owned, {
    type: "CONSUME_ITEM", itemId: "missing-item", quantity: 1, operationId: "not-owned"
  }), owned);
  const noResults = { ...owned, results: [] };
  assert.equal(reducer(noResults, {
    type: "CONSUME_ITEM", itemId: "heal-hp-bullet", quantity: 1, operationId: "no-result"
  }), noResults);
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


test("通常アイテム35種は原典PDFの317〜320頁に載る全アイテムと一致する", () => {
  const expectedNames = [
    "包帯", "小さなHPアンプル", "劣化HP弾", "HPアンプル", "HP弾",
    "たぷたぷの燃料タンク", "鎮静剤", "ルージュアイ事務所の香水",
    "ヒートグローブ", "砥石", "ボルトット工房の外付けガントレット",
    "生命体切断システム装置", "轟くマラカス", "メイジ工房のお手製ハンマー",
    "エネルギー増幅装置", "酸素ボンベ", "ヴィリーブ工房の煙草",
    "エネルギー増電器具", "黒い雲の刺青", "カモメ運送会社の外付け強化義手",
    "エスカ事務所の強化刺青", "バラのスパナ工房の外付け強化義足",
    "湯の花運送の防護湯煙", "ガーデンの感覚遮断薬", "月光石",
    "出血防止手袋", "メメメメメ工房の筋トレ雑誌", "ツヴァイヘンダー",
    "物理干渉保護フィールド", "白蓮清掃派遣会社の制服", "N社の経典",
    "LCCB職員の棍棒と盾", "セブン協会の情報資料", "旧G社の薄汚れた軍服", "黒丸"
  ];
  assert.deepEqual(itemRecords.map((item) => item.name), expectedNames, "35件を原典順で完全一致させる");
  assert.equal(new Set(itemRecords.map((item) => item.id)).size, 35, "ID重複がない");
  assert.ok(itemRecords.every((item) => item.price && item.effect && item.palette), "全件に価格・効果・パレット文がある");
  const compactSource = coreItemCorpus.replace(/\s+/g, "");
  for (const name of expectedNames) {
    assert.ok(compactSource.includes(name.replace(/\s+/g, "")), "原典の抽出テキストに名称がある: " + name);
  }
  assert.equal(specialItemRecords.length, 2, "特殊資源は通常35件とは別の2件");
  assert.deepEqual(specialItemRecords.map((item) => item.name), ["自我の欠片", "硝子の破片"]);
});

test("酸素ボンベとヴィリーブ工房の煙草は正式名を維持して別表記からも検索できる", () => {
  const oxygen = itemRecords.find((item) => item.id === "enh-oxygen-cylinder");
  const tobacco = itemRecords.find((item) => item.id === "enh-villebe-cigarette");
  assert.equal(oxygen.name, "酸素ボンベ");
  assert.equal(oxygen.category, "強化");
  assert.equal(oxygen.price, "10LP");
  assert.equal(tobacco.name, "ヴィリーブ工房の煙草");
  assert.equal(tobacco.category, "強化");
  assert.equal(tobacco.price, "10LP");
  assert.ok(tobacco.searchAliases.includes("ヴィりーぶたばこ"));
  assert.ok(tobacco.searchAliases.includes("たばこ"));
  assert.ok(tobacco.searchAliases.includes("煙草"));
  assert.ok(oxygen.searchAliases.includes("酸素") && oxygen.searchAliases.includes("ボンベ"));
  assert.match(itemCodexSource, /item\.searchAliases \|\| \[\]/, "アイテム一覧検索で別名を参照");
  assert.match(itemShopSource, /item\.searchAliases \|\| \[\]/, "ショップ検索でも別名を参照");
});

function makeItemLoader({ mode = "fetch", items = itemRecords, specials = specialItemRecords } = {}) {
  const loaderStart = itemCatalogHtml.indexOf("function validateItemCatalog(items, specialItems) {");
  const loaderEnd = itemCatalogHtml.indexOf("\n\nfunction lbtBoot()", loaderStart);
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, "HTMLに必須カタログ検証とDBローダーがある");
  const source = itemCatalogHtml.slice(loaderStart, loaderEnd);
  const warnings = [];
  const consoleStub = { warn: (...args) => warnings.push(args) };
  const windowStub = { console: consoleStub, fetch: mode === "fetch" ? function fetchMarker() {} : null };
  const valueFor = (url) => {
    if (url.startsWith("data/db.json")) return { normal_personas: [], tokui_personas: [], egos: [] };
    if (url.startsWith("data/items.json")) return items;
    if (url.startsWith("data/gacha-theme-packs.json")) return { packs: [] };
    if (url.startsWith("data/special-items.json")) return specials;
    throw new Error("Unexpected URL: " + url);
  };
  const fetchStub = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(valueFor(url)) });
  class XHRStub {
    open(_method, url) { this.url = url; }
    send() {
      Promise.resolve().then(() => {
        this.status = 200;
        this.responseText = JSON.stringify(valueFor(this.url));
        this.onload?.();
      });
    }
  }
  const context = { window: windowStub, fetch: fetchStub, XMLHttpRequest: XHRStub, console: consoleStub };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "index.html#item-catalog-loader" });
  return { load: () => context.loadDB(), window: windowStub, warnings };
}

test("Fetch経路とXHR代替経路の両方でアイテム一覧全件を読み込む", async () => {
  for (const mode of ["fetch", "xhr"]) {
    const loader = makeItemLoader({ mode });
    await loader.load();
    assert.equal(loader.window.DB.items.length, 35, mode + "で通常アイテム35件");
    assert.ok(loader.window.DB.items.some((item) => item.id === "enh-oxygen-cylinder"), mode + "で酸素ボンベがある");
    assert.ok(loader.window.DB.items.some((item) => item.id === "enh-villebe-cigarette"), mode + "でヴィリーブ工房の煙草がある");
    assert.equal(loader.window.DB.specialItems.length, 2, mode + "で特殊資源2件");
  }
});

test("必須アイテムが欠けたJSONは不完全な一覧のまま起動せず欠落名をエラーにする", async () => {
  const incomplete = itemRecords.filter((item) => item.id !== "enh-oxygen-cylinder");
  const loader = makeItemLoader({ mode: "fetch", items: incomplete });
  await assert.rejects(loader.load(), /酸素ボンベ/);
  assert.equal(loader.window.DB, undefined, "検証前の不完全なDBを公開しない");
});


test("Buildの実使用は所持数減算とリザルト記帳を同時に行い、卓から外す操作で所持を削除しない", () => {
  const start = itemShopSource.indexOf("const BuildItemsPanel");
  const end = itemShopSource.indexOf("/* ショップ。所持の唯一の取得口。", start);
  const build = itemShopSource.slice(start, end);
  assert.ok(start >= 0 && end > start, "BuildItemsPanel の範囲が見つかる");
  assert.match(build, /type: "CONSUME_ITEM"/);
  assert.match(build, /quantity: 1/);
  assert.match(build, /resultId: currentResultId/);
  assert.match(build, /type: "PATCH_ITEM", uid, patch: patchBody/);
  assert.match(build, /所持数を修正/);
  assert.match(build, /MEMOに表示/);
  assert.match(build, /PALETTEへ反映/);
  assert.doesNotMatch(build, /type: "REMOVE_ITEM"/, "卓への出力解除を所持品削除へ接続しない");
  assert.match(build, /ADD_ITEM", itemId: item\.id/);
  assert.doesNotMatch(build, /ADD_ITEM_INVENTORY/, "価格付き特殊資源を無料移送経路へ迂回させない");
});

test("ItemCodexの所持数減少ボタンも1個使用としてリザルトへ記帳する", () => {
  assert.match(itemCodexSource, /const consumeOne = \(\) =>/);
  assert.match(itemCodexSource, /onClick: consumeOne/);
  assert.match(itemCodexSource, /resultId: currentResultId/);
  assert.match(itemCodexSource, /所持数を直接修正/);
  assert.match(itemCodexSource, /window\.confirm/);
  assert.doesNotMatch(itemCodexSource, /onClick: \(\) => patchEntry\(\{ quantity: Math\.max\(1, \(Number\(selectedEntry\.quantity\) \|\| 1\) - 1\) \}\)/);
});

test("ItemCodexは消費記録先を操作前に表示する", () => {
  assert.match(itemCodexSource, /className: "item-consume-target"/);
  assert.match(itemCodexSource, /消費記録先:/);
  assert.match(itemCodexSource, /購入に必要な残高が不足しています/);
});
