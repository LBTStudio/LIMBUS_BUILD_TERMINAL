import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stateSource = read("../js/state.js");
const otherSections = read("../js/OtherSections.js");
const items = JSON.parse(read("../data/items.json"));
const specialItems = JSON.parse(read("../data/special-items.json"));
const db = {
  items,
  specialItems,
  normal_personas: [{ no: 1, name: "通常人格A" }, { no: 2, name: "通常人格B" }],
  tokui_personas: [{ no: 7, name: "特異人格A" }]
};

function createReducer() {
  let uid = 0;
  const window = { DB: db };
  const context = {
    window, console, Date, Math,
    crypto: { randomUUID: () => "qa-" + (++uid) }
  };
  vm.createContext(context);
  vm.runInContext(stateSource + "\nwindow.__testReducer = appReducer;", context);
  return { reducer: window.__testReducer, window };
}
function baseState() {
  return {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [], entries: [], inventory: [], customItems: [],
    draws: [], appliedDrawBatchIds: [], tickets: []
  };
}
function stock(state, itemId) {
  return state.inventory.find((entry) => entry.itemId === itemId)?.quantity || 0;
}

test("手入力リザルトは硝子の破片と通常アイテムを履歴に記録し、所持在庫へ加算する", () => {
  const { reducer } = createReducer();
  const glass = specialItems.find((item) => item.id === "resource-glass-shard");
  const normalItem = items.find((item) => /外付け強化義手/.test(item.name));
  assert.ok(glass, "硝子の破片のDB項目が存在する");
  assert.ok(normalItem, "外付け義体に相当する通常DBアイテムが存在する");

  const next = reducer(baseState(), {
    type: "ADD_RESULT",
    name: "QA報酬テスト",
    income: { lp: 30, shards: 2 },
    rewardItems: [
      { itemId: glass.id, itemName: glass.name, quantity: 2 },
      { itemId: normalItem.id, itemName: normalItem.name, quantity: 1 }
    ]
  });
  assert.deepEqual(
    next.results[0].rewardItems.map((item) => [item.itemId, item.quantity]),
    [[glass.id, 2], [normalItem.id, 1]]
  );
  assert.equal(stock(next, glass.id), 2);
  assert.equal(stock(next, normalItem.id), 1);
  assert.equal(next.results[0].income.shards, 2, "自我の欠片の残高欄とは混同しない");
});

test("通帳連動の自我の欠片は報酬アイテム在庫へ二重登録しない", () => {
  const { reducer } = createReducer();
  const shard = specialItems.find((item) => item.ledgerResource === "shards");
  const next = reducer(baseState(), {
    type: "ADD_RESULT", name: "QA通帳連動確認",
    income: { lp: 0, shards: 5 },
    rewardItems: [{ itemId: shard.id, itemName: shard.name, quantity: 5 }]
  });
  assert.equal(next.results[0].rewardItems.length, 0);
  assert.equal(stock(next, shard.id), 0);
  assert.equal(next.results[0].income.shards, 5);
});

test("報酬アイテムを同じ内容で再保存しても在庫が重複加算されず、増分だけ加算する", () => {
  const { reducer } = createReducer();
  const glass = specialItems.find((item) => item.id === "resource-glass-shard");
  let state = reducer(baseState(), {
    type: "ADD_RESULT", name: "QA再保存",
    rewardItems: [{ itemId: glass.id, quantity: 2 }]
  });
  const resultId = state.results[0].id;
  const unchanged = () => reducer(state, {
    type: "UPDATE_RESULT", id: resultId,
    rewardItems: [{ itemId: glass.id, quantity: 2 }]
  });
  state = unchanged();
  state = unchanged();
  assert.equal(stock(state, glass.id), 2, "同じ値を再保存しても二重加算しない");

  state = reducer(state, {
    type: "UPDATE_RESULT", id: resultId,
    rewardItems: [{ itemId: glass.id, quantity: 3 }]
  });
  assert.equal(stock(state, glass.id), 3, "増えた1個だけ加算");
  state = reducer(state, {
    type: "UPDATE_RESULT", id: resultId,
    rewardItems: [{ itemId: glass.id, quantity: 1 }]
  });
  assert.equal(stock(state, glass.id), 3, "過去報酬の訂正で消費済み在庫を自動減算しない");
  assert.equal(state.results[0].rewardItems[0].quantity, 1, "履歴上の数量は訂正される");
});

test("カタログに無い報酬品もカスタムアイテムとして登録して所持できる", () => {
  const { reducer } = createReducer();
  let state = reducer(baseState(), {
    type: "ADD_CUSTOM_ITEM",
    item: { id: "custom-reward-prosthesis", name: "外付け義体", category: "報酬品", maxOwned: 99 }
  });
  state = reducer(state, {
    type: "ADD_RESULT",
    name: "QAカスタム報酬",
    rewardItems: [{ itemId: "custom-reward-prosthesis", itemName: "外付け義体", quantity: 2 }]
  });
  assert.equal(stock(state, "custom-reward-prosthesis"), 2);
  assert.equal(state.results[0].rewardItems[0].itemName, "外付け義体");
});

test("旧リザルトへ取得人格を追加すると履歴を保存し、所持登録は購入扱いにせず行える", () => {
  const { reducer } = createReducer();
  const persona = db.normal_personas[1];
  const original = {
    ...baseState(),
    results: [{ id: "res-old", name: "過去シナリオ", income: { lp: 0, shards: 0 }, personaAcquisitions: [] }]
  };
  const updated = reducer(original, {
    type: "UPDATE_RESULT", id: "res-old",
    personaAcquisitions: [{ mode: "n", no: String(persona.no), name: persona.name, source: "manual" }]
  });
  const owned = reducer(updated, {
    type: "ADD_ROSTER", mode: "n", no: persona.no,
    purchase: false, skipInitialTicketConsumption: true, via: ["過去シナリオ"]
  });
  assert.equal(owned.results[0].personaAcquisitions[0].no, String(persona.no));
  assert.ok(owned.roster.personas.some((entry) => entry.mode === "n" && String(entry.no) === String(persona.no)));
  assert.equal(owned.entries.length, 0, "過去分を記録しても購入支出は新規計上しない");
});

test("初期人格の保存は同じリザルトに明示されたチケット使用を二重消費しない", () => {
  const { reducer } = createReducer();
  const resultId = "res-initial";
  const recordedUse = {
    id: "qa-ticket-use",
    kind: "ticket",
    name: "人格抽出チケット を使用",
    cost: { lp: 0, shards: 0 },
    tickets: { persona: 1, ego: 0, choice: 0, pack: {} },
    resultId
  };
  const initial = {
    ...baseState(),
    results: [{
      id: resultId,
      name: "初期作成",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }],
    entries: [recordedUse]
  };
  const owned = reducer(initial, {
    type: "ADD_ROSTER",
    mode: "n",
    no: 1,
    purchase: false,
    skipInitialTicketConsumption: true,
    resultId
  });
  const ticketIncome = owned.results.reduce((sum, result) => sum + (Number(result.income?.tickets?.persona) || 0), 0);
  const ticketUse = owned.entries.reduce((sum, entry) => sum + (Number(entry.tickets?.persona) || 0), 0);
  assert.equal(ticketIncome - ticketUse, 1, "履歴にある使用1枚だけを引き、追加取得分1枚を残す");
  assert.equal(owned.entries.length, 1, "所持追加側で2枚目の消費明細を作らない");

  const selectedWithoutRecordedUse = reducer({
    ...initial,
    entries: []
  }, {
    type: "ADD_ROSTER",
    mode: "n",
    no: 2,
    purchase: false,
    resultId
  });
  const remaining = selectedWithoutRecordedUse.results.reduce((sum, result) => sum + (Number(result.income?.tickets?.persona) || 0), 0)
    - selectedWithoutRecordedUse.entries.reduce((sum, entry) => sum + (Number(entry.tickets?.persona) || 0), 0);
  assert.equal(remaining, 1, "既存の使用記録が無い通常の初回取得では初期分だけ1枚消費する");
});

test("初期作成で選択した人格は取得証跡と所持ライブラリへ反映する配線を持つ", () => {
  const start = otherSections.indexOf("const saveResultEditor");
  const end = otherSections.indexOf("const results =", start);
  const saveBlock = otherSections.slice(start, end);
  assert.match(saveBlock, /personaAcquisitions:\s*nextAcquisitions/);
  assert.match(saveBlock, /type:\s*"ADD_ROSTER"/);
  assert.match(saveBlock, /hasRecordedPersonaTicketSpend/);
  assert.match(saveBlock, /skipInitialTicketConsumption:\s*!isRecordedInitialPersona \|\| hasRecordedPersonaTicketSpend/);
  assert.match(saveBlock, /const isInitial = result\.id === "res-initial"/);
  assert.match(otherSections, /isEditing && h\("details", \{ className: "ledger-history-editor-disclosure"/);
  assert.match(otherSections, /className: "ledger-history-editor stack-2"/);
  assert.match(otherSections, /最初の人格は上の欄から記録できます/);
});

test("全リザルトの編集画面に複数人格と報酬アイテムの入力欄がある", () => {
  assert.match(otherSections, /aria-label: "このリザルトで取得した人格"/);
  assert.match(otherSections, /aria-label: "編集する報酬アイテムのカタログ選択"/);
  assert.match(otherSections, /rewardItemCatalog\.map/);
  assert.ok(otherSections.includes(String.raw`replace(/[\s\u3000・･]/g, "")`), "報酬品名の照合は空白・中黒を正規化する");
  assert.match(otherSections, /rewardItems:\s*Array\.isArray\(result\.rewardItems\)/);
  assert.match(otherSections, /personaAcquisitions:\s*Array\.isArray\(result\.personaAcquisitions\)/);
});


test("settings and ledger readability improvements are in the active B-type style layer", () => {
  const css = read("../assets/b-type-ui-parity.css");
  assert.match(css, /@layer v73-ledger-usability/);
  assert.match(css, /\.settings-section-note\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.ledger-note,[\s\S]*?font-size:\s*13px/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.ledger-persona-audit-disclosure/);
  assert.match(css, /\.ledger-history-editor-disclosure/);
});
