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
  tokui_personas: [{ no: 7, name: "特異人格A" }],
  egos: [
    { rank: "TETH", no: 1, name: "報酬E.G.O A" },
    { rank: "HE", no: 2, name: "報酬E.G.O B" }
  ]
};

function createReducer() {
  let uid = 0;
  const window = { DB: db };
  const context = {
    window, console, Date, Math,
    crypto: { randomUUID: () => "qa-" + (++uid) }
  };
  vm.createContext(context);
  vm.runInContext(stateSource + "\nwindow.__testReducer = appReducer; window.__testApplyDrawBatchEffects = applyDrawBatchEffects;", context);
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
    Array.from(next.results[0].rewardItems, (item) => [item.itemId, item.quantity]),
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

  const selectedWithExistingTicketUse = reducer(initial, {
    type: "ADD_ROSTER",
    mode: "n",
    no: 3,
    purchase: false,
    resultId
  });
  const remainingAfterSelected = selectedWithExistingTicketUse.results.reduce((sum, result) => sum + (Number(result.income?.tickets?.persona) || 0), 0)
    - selectedWithExistingTicketUse.entries.reduce((sum, entry) => sum + (Number(entry.tickets?.persona) || 0), 0);
  assert.equal(remainingAfterSelected, 0, "同じリザルトに別用途のチケット使用があっても、指定購入の初回人格は初期チケットを別途消費する");
  assert.equal(selectedWithExistingTicketUse.entries.length, 2, "既存のチケット使用に加え、初期チケットの消費明細を1件だけ追加する");
});


test("PATCH_RESULTで既存報酬を増やした場合も増分だけ在庫へ反映する", () => {
  const { reducer } = createReducer();
  const glass = specialItems.find((item) => item.id === "resource-glass-shard");
  let state = reducer(baseState(), { type: "ADD_RESULT", name: "QAパッチ報酬", rewardItems: [{ itemId: glass.id, quantity: 1 }] });
  const id = state.results[0].id;
  state = reducer(state, { type: "PATCH_RESULT", id, patch: { rewardItems: [{ itemId: glass.id, quantity: 3 }] } });
  assert.equal(stock(state, glass.id), 3, "PATCH_RESULTも差分2個だけを加算する");
  state = reducer(state, { type: "PATCH_RESULT", id, patch: { rewardItems: [{ itemId: glass.id, quantity: 3 }] } });
  assert.equal(stock(state, glass.id), 3, "PATCH_RESULTの再送でも重複しない");
});

test("初期作成で選択した人格は取得証跡と所持ライブラリへ反映する配線を持つ", () => {
  const start = otherSections.indexOf("const saveResultEditor");
  const end = otherSections.indexOf("const results =", start);
  const saveBlock = otherSections.slice(start, end);
  assert.match(saveBlock, /personaAcquisitions:\s*nextAcquisitions/);
  assert.match(saveBlock, /type:\s*"ADD_ROSTER"/);
  assert.match(saveBlock, /hasRecordedPersonaTicketSpend/);
  assert.match(saveBlock, /recordedPersonaTicketSpendCoversInitial\s*=\s*nextInitialPersona\.method !== "selected" && hasRecordedPersonaTicketSpend/);
  assert.match(saveBlock, /skipInitialTicketConsumption:\s*!isRecordedInitialPersona \|\| recordedPersonaTicketSpendCoversInitial/);
  assert.match(saveBlock, /type:\s*"CONSUME_INITIAL_PERSONA_TICKET"/);
  assert.match(saveBlock, /const initialResult = window\.LBT_findInitialResult\?\.\(state\.results\)/);
  assert.match(saveBlock, /const isInitial = !!initialResult && String\(initialResult\.id \|\| ""\) === String\(result\.id \|\| ""\)/);
  assert.match(otherSections, /isEditing && h\("details", \{ className: "ledger-history-editor-disclosure"/);
  assert.match(otherSections, /className: "ledger-history-editor stack-2"/);
  assert.match(otherSections, /最初の人格は上の欄から記録できます/);
});

test("初期人格の入手方法が未確定なら古いmode/noが残っていてもチケット消費を配線しない", () => {
  const start = otherSections.indexOf("const saveResultEditor");
  const end = otherSections.indexOf("const results =", start);
  const saveBlock = otherSections.slice(start, end);
  assert.match(saveBlock, /nextInitialPersona\.method !== "unknown"\s*&&\s*nextInitialPersona\.mode/);
  assert.match(saveBlock, /const isRecordedInitialPersona = isInitial && nextInitialPersona\.method !== "unknown"/);
  assert.match(saveBlock, /const initialResult = window\.LBT_findInitialResult\?\.\(state\.results\)/);
  assert.match(saveBlock, /const isInitial = !!initialResult && String\(initialResult\.id \|\| ""\) === String\(result\.id \|\| ""\)/);
  assert.match(saveBlock, /if \(isInitial && nextInitialPersona\.method !== "unknown"/);
});

test("新規・過去リザルトと初期人格はDB検索から追加し、長大なプルダウンを生成しない", () => {
  assert.ok(otherSections.includes('"aria-label": "報酬人格をDBから検索"'));
  assert.ok(otherSections.includes('"aria-label": "このリザルトで取得した人格をDBから検索"'));
  assert.ok(otherSections.includes('"aria-label": "最初に得た人格をDBから検索"'));
  assert.match(otherSections, /normal_personas[\s\S]*?tokui_personas/);
  assert.match(otherSections, /getPersonaSearchMatches/);
  assert.match(otherSections, /slice\(0, 8\)/);
  assert.match(otherSections, /newResultPersonaMatches = getPersonaSearchMatches\([\s\S]*?state\.roster\?\.personas \|\| \[\]/);
  assert.match(otherSections, /const alreadyOwned = \(state\.roster\?\.personas \|\| \[\]\)\.some/);
  assert.match(otherSections, /const ticketPersonaMatches = getPersonaSearchMatches\(ticketPersonaQuery, ticketDraft\?\.personaAcquisitions \|\| \[\]\)/);
  assert.match(otherSections, /className: "ledger-persona-search-results"/);
  assert.doesNotMatch(otherSections, /ticketPersonaPick/);
  assert.match(otherSections, /rewardItemCatalog\.map/);
  assert.ok(otherSections.includes(String.raw`replace(/[\s\u3000・･]/g, "")`), "報酬品名の照合は空白・中黒を正規化する");
  assert.match(otherSections, /rewardItems:\s*Array\.isArray\(result\.rewardItems\)/);
  assert.match(otherSections, /personaAcquisitions:\s*Array\.isArray\(result\.personaAcquisitions\)/);
});

test("新規リザルトの報酬人格は取得証跡へ保存し、未所持分だけ無償で所持へ加える", () => {
  const start = otherSections.indexOf("const addResult =");
  const end = otherSections.indexOf("/* 硝子窓の読み込み結果", start);
  const block = otherSections.slice(start, end);
  assert.match(block, /^\s*personaAcquisitions\s*$/m, "ADD_RESULT receives the canonical acquisition array via object shorthand");
  assert.match(block, /type:\s*"ADD_ROSTER"/);
  assert.match(block, /purchase:\s*false/);
  assert.match(block, /skipInitialTicketConsumption:\s*true/);
  assert.match(block, /existingPersonaKeys\.has\(key\)/);
  assert.match(block, /source: "reward"/);
});
test("新規リザルトの報酬人格は取得履歴へ正規化して保存できる", () => {
  const { reducer } = createReducer();
  const persona = db.normal_personas[0];
  const next = reducer(baseState(), {
    type: "ADD_RESULT",
    name: "QA人格報酬",
    personaAcquisitions: [{ mode: "n", no: String(persona.no), name: persona.name, source: "reward" }]
  });
  assert.equal(next.results[0].personaAcquisitions.length, 1);
  assert.deepEqual(
    [next.results[0].personaAcquisitions[0].mode, next.results[0].personaAcquisitions[0].no, next.results[0].personaAcquisitions[0].source],
    ["n", String(persona.no), "reward"]
  );
});


test("settings and ledger readability improvements are in the active B-type style layer", () => {
  const css = read("../assets/b-type-ui-parity.css");
  const readabilityStart = css.lastIndexOf("Ledger and Settings usability pass: unlayered rules");
  assert.ok(readabilityStart >= 0, "readability rules must be unlayered so legacy compact styles cannot outrank them");
  assert.doesNotMatch(css, /@layer v73-ledger-usability/);
  const readabilityCss = css.slice(readabilityStart);
  assert.match(readabilityCss, /\.settings-section-note\s*\{[^}]*font-size:\s*14px/);
  assert.match(readabilityCss, /\.ledger-note,[\s\S]*?font-size:\s*14px/);
  assert.match(readabilityCss, /\.ledger-input,[\s\S]*?min-height:\s*44px/);
  assert.doesNotMatch(readabilityCss, /min-height:\s*38px/, "mobile fields must not shrink below 44px");
  assert.match(readabilityCss, /@media\s*\(max-width:\s*640px\)/);
  assert.match(readabilityCss, /\.ledger-persona-audit-disclosure/);
  assert.match(readabilityCss, /\.ledger-history-editor-disclosure/);
});


test("既に人格を所持していても初期リザルトの確定は初期チケットを一度だけ消費する", () => {
  const { reducer, window } = createReducer();
  const initial = {
    ...baseState(),
    roster: { personas: [{ uid: "already-owned", mode: "n", no: 1, equipped: true }], egos: [], supports: [], spirits: [] },
    results: [{
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } },
      initialPersona: { method: "selected", mode: "n", no: "2", name: "通常人格B" }
    }],
    entries: [{
      id: "existing-ticket-use",
      kind: "ticket",
      name: "人格抽出チケット を使用",
      cost: { lp: 0, shards: 0 },
      tickets: { persona: 1, ego: 0, choice: 0, pack: {} },
      resultId: "res-initial"
    }]
  };
  const first = reducer(initial, { type: "CONSUME_INITIAL_PERSONA_TICKET", resultId: "res-initial" });
  const balance = window.LBT_computeTicketBalance(first.results, first.entries);
  assert.equal(balance.persona, 0, "既存の使用1枚に初期分1枚を加えて残数0にする");
  assert.equal(first.entries.filter((entry) => entry.ref?.kind === "initialPersonaTicket").length, 1);
  const repeated = reducer(first, { type: "CONSUME_INITIAL_PERSONA_TICKET", resultId: "res-initial" });
  assert.equal(repeated.entries.length, first.entries.length, "同じ初期記録の保存を繰り返しても二重消費しない");
});


test("リザルトの報酬E.G.Oはrank/noで正規化され、追加・更新・部分更新で保持する", () => {
  const { reducer } = createReducer();
  let state = reducer(baseState(), {
    type: "ADD_RESULT",
    name: "E.G.O報酬",
    egoAcquisitions: [
      { rank: "teth", no: 1, name: "旧名", source: "reward" },
      { rank: "TETH", no: 1, name: "重複", source: "manual" },
      { rank: "INVALID", no: 2, name: "不正" },
      { rank: "HE", no: "bad no", name: "不正No" }
    ]
  });
  const id = state.results[0].id;
  assert.deepEqual(
    Array.from(state.results[0].egoAcquisitions, (entry) => [entry.rank, entry.no, entry.name]),
    [["TETH", "1", "旧名"]],
    "ランクを正規化し、重複と不正なランク・Noを除外する"
  );

  state = reducer(state, {
    type: "UPDATE_RESULT", id,
    egoAcquisitions: [{ rank: "HE", no: 2, name: "報酬E.G.O B", source: "manual" }]
  });
  assert.deepEqual(
    Array.from(state.results[0].egoAcquisitions, (entry) => [entry.rank, entry.no]),
    [["HE", "2"]]
  );

  state = reducer(state, {
    type: "PATCH_RESULT", id,
    patch: { egoAcquisitions: [{ rank: "TETH", no: 1, name: "報酬E.G.O A" }] }
  });
  assert.deepEqual(
    Array.from(state.results[0].egoAcquisitions, (entry) => [entry.rank, entry.no]),
    [["TETH", "1"]]
  );
});

test("リザルト編集の報酬E.G.O所持追加は購入明細を作らず、重複所持を増やさない", () => {
  const { reducer } = createReducer();
  let state = reducer(baseState(), {
    type: "ADD_RESULT", name: "シナリオ報酬",
    egoAcquisitions: [{ rank: "TETH", no: 1, name: "報酬E.G.O A", source: "reward" }]
  });
  state = reducer(state, {
    type: "ADD_ROSTER_EGO", rank: "TETH", no: 1,
    purchase: false, via: ["シナリオ報酬"]
  });
  assert.equal(state.roster.egos.length, 1);
  assert.equal(state.roster.egos[0].rank, "TETH");
  assert.equal(state.roster.egos[0].via[0], "シナリオ報酬");
  assert.equal(state.entries.length, 0, "報酬での所持追加は購入支出を作らない");

  const unchanged = reducer(state, {
    type: "ADD_ROSTER_EGO", rank: "TETH", no: 1,
    purchase: false, via: ["シナリオ報酬"]
  });
  assert.equal(unchanged.roster.egos.length, 1, "同じE.G.Oは二重登録しない");
  assert.equal(unchanged.entries.length, 0);
});

test("ガチャ抽出バッチのE.G.Oは所持と抽出費用明細へ自動反映される", () => {
  const { window } = createReducer();
  const batch = {
    commit: "qa-ego-draw-commit",
    batchHash: "qa-ego-draw-hash",
    records: [{
      kind: "ego",
      item: { kind: "ego", rank: "TETH", no: 1, name: "報酬E.G.O A" },
      cost: { lp: 0, shards: 50 },
      duplicate: false,
      grantedShards: 0
    }]
  };
  const next = window.__testApplyDrawBatchEffects(baseState(), batch, "res-gacha", {});
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].rank, "TETH");
  assert.equal(String(next.roster.egos[0].no), "1");
  assert.equal(next.entries.length, 1, "抽出費用の明細が1件だけ自動作成される");
  assert.equal(next.entries[0].kind, "ego");
  assert.equal(next.entries[0].cost.shards, 50);
  assert.equal(next.entries[0].resultId, "res-gacha");
});

test("報酬E.G.Oの検索・保存・表示は新規と既存リザルトの両方に配線され、報酬欄は既定で折りたたむ", () => {
  assert.match(otherSections, /egoAcquisitions:\s*nextEgoAcquisitions/);
  assert.match(otherSections, /type:\s*"ADD_ROSTER_EGO"[\s\S]{0,240}purchase:\s*false/);
  assert.match(otherSections, /newResultEgoMatches/);
  assert.match(otherSections, /ticketEgoMatches/);
  assert.match(otherSections, /報酬E\.G\.O/);
  assert.match(otherSections, /ledger-result-reward-disclosure/);
  assert.match(otherSections, /result\.egoAcquisitions/);
});
