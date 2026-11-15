import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DB_SOURCE = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const PROVENANCE_SOURCE = readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8");
const STATE_SOURCE = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function runtime() {
  const DB = JSON.parse(JSON.stringify(DB_SOURCE));
  const window = { DB };
  const context = {
    window,
    console,
    URL,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    React: {
      useReducer: () => {},
      useRef: () => ({ current: null }),
      useState: () => [null, () => {}],
      useEffect: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(PROVENANCE_SOURCE, context, { filename: "js/ledger-provenance.js" });
  vm.runInContext(STATE_SOURCE, context, { filename: "js/state.js" });
  return { reducer: window.appReducer, window, context, DB };
}

function baseState(overrides = {}) {
  return {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    inventory: [],
    enhancements: [],
    entries: [],
    results: [{
      id: "result-live",
      name: "有効なリザルト",
      date: "2026-11-15",
      income: {
        lp: 5000,
        shards: 5000,
        tickets: { persona: 0, ego: 0, choice: 0, pack: {} }
      }
    }],
    ui: {},
    ...overrides
  };
}

test("人格指定購入は呼び出し元のcostを信用せず、DB通常人格とルール価格を使う", () => {
  const { reducer, DB } = runtime();
  const first = DB.normal_personas[0];
  const second = DB.normal_personas.find((persona) => String(persona.no) !== String(first.no));
  assert.ok(first && second);

  const before = baseState();
  const unknown = reducer(before, {
    type: "ADD_ROSTER", mode: "n", no: 999999,
    purchase: true, cost: { lp: 0, shards: 0 }, skipInitialTicketConsumption: true
  });
  assert.strictEqual(unknown, before, "DBにない人格番号は0LP指定でも購入できない");

  const special = DB.tokui_personas[0];
  const specialPurchase = reducer(before, {
    type: "ADD_ROSTER", mode: "t", no: special.no,
    purchase: true, cost: { lp: 0, shards: 0 }, skipInitialTicketConsumption: true
  });
  assert.strictEqual(specialPurchase, before, "特異人格は通常人格の指定購入ルートを通らない");

  const once = reducer(before, {
    type: "ADD_ROSTER", mode: "n", no: first.no,
    purchase: true, cost: { lp: 0, shards: 0 }, skipInitialTicketConsumption: true
  });
  assert.equal(once.entries[0].cost.lp, 20, "初回価格は呼び出し元の0LPで上書きされない");

  const twice = reducer(once, {
    type: "ADD_ROSTER", mode: "n", no: second.no,
    purchase: true, cost: { lp: 1, shards: 0 }, skipInitialTicketConsumption: true
  });
  assert.equal(twice.entries[1].cost.lp, 200, "2件目も公式の所持状態別価格を使う");
});

test("未知・未設定価格のサポートと精神は有料取得として所持に入らない", () => {
  const { reducer, DB } = runtime();
  const before = baseState();
  const supportRows = DB.support_passives;
  const spiritRows = DB.spirits;
  try {
    DB.support_passives = [...supportRows, { name: "価格なしテストサポート", lp: "" }];
    DB.spirits = [...spiritRows, { name: "価格不正テスト精神", price: "価格確認中" }];

    assert.strictEqual(reducer(before, {
      type: "ADD_ROSTER_SUPPORT", spp: { name: "未登録サポート" }, purchase: true
    }), before);
    assert.strictEqual(reducer(before, {
      type: "ADD_ROSTER_SPIRIT", spirit: { name: "未登録精神" }, purchase: true
    }), before);
    assert.strictEqual(reducer(before, {
      type: "ADD_ROSTER_SUPPORT", spp: { name: "価格なしテストサポート" }, purchase: true
    }), before);
    assert.strictEqual(reducer(before, {
      type: "ADD_ROSTER_SPIRIT", spirit: { name: "価格不正テスト精神" }, purchase: true
    }), before);
  } finally {
    DB.support_passives = supportRows;
    DB.spirits = spiritRows;
  }

  const freeSpirit = DB.spirits.find((spirit) => Number(spirit.price) === 0);
  assert.ok(freeSpirit, "無料の初期精神がDBに存在する");
  assert.strictEqual(reducer(before, {
    type: "ADD_ROSTER_SPIRIT", spirit: { name: freeSpirit.name }, purchase: true
  }), before, "無料枠は有料取得 action では登録できない");
  const granted = reducer(before, {
    type: "ADD_ROSTER_SPIRIT", spirit: { name: freeSpirit.name }, purchase: false
  });
  assert.equal(granted.roster.spirits.length, 1);
  assert.equal(granted.entries.length, 0, "無料配布は支出明細を作らない");
});

test("価格未登録の強化は拒否し、group未設定の正規特殊強化は正価で購入できる", () => {
  const { reducer, DB } = runtime();
  const before = baseState();
  assert.strictEqual(reducer(before, {
    type: "ADD_ENHANCEMENT", group: "不明", name: "登録されていない強化"
  }), before);

  const special = DB.special_enhancements.find((entry) =>
    entry && !entry.group && Number(entry.shards) > 0);
  assert.ok(special, "group未設定の正規特殊強化を検証できる");
  const bought = reducer(before, {
    type: "ADD_ENHANCEMENT",
    group: "",
    name: special.name,
    effect: special.effect || ""
  });
  assert.equal(bought.enhancements.length, 1);
  assert.equal(bought.enhancements[0].shards, Number(special.shards));
  assert.equal(bought.entries.length, 1);
  assert.equal(bought.entries[0].cost.shards, Number(special.shards));

  const wrongGroup = reducer(before, {
    type: "ADD_ENHANCEMENT",
    group: "存在しないグループ",
    name: DB.normal_enhancements[0].name
  });
  assert.strictEqual(wrongGroup, before);
});

test("E.G.Oランダム抽出は個別価格ではなく100欠片、指定購入はDB価格", () => {
  const { reducer, DB } = runtime();
  const ego = DB.egos[0];
  assert.ok(ego);
  const poor = baseState({
    results: [{
      id: "result-live", name: "不足", date: "2026-11-15",
      income: { lp: 0, shards: 99, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } }
    }]
  });
  assert.strictEqual(reducer(poor, {
    type: "ADD_ROSTER_EGO", rank: ego.rank, no: ego.no,
    purchase: true, acquisition: "gachaPaid"
  }), poor, "99欠片ではランダム抽出できない");

  const funded = baseState({
    results: [{
      id: "result-live", name: "100欠片", date: "2026-11-15",
      income: { lp: 0, shards: 100, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } }
    }]
  });
  const random = reducer(funded, {
    type: "ADD_ROSTER_EGO", rank: ego.rank, no: ego.no,
    purchase: true, acquisition: "gachaPaid"
  });
  assert.equal(random.roster.egos.length, 1);
  assert.equal(random.entries[0].cost.shards, 100);

  const specificCost = Number(String(ego.shards).replace(/[^0-9]/g, ""));
  const specified = reducer(baseState(), {
    type: "ADD_ROSTER_EGO", rank: ego.rank, no: ego.no, purchase: true
  });
  assert.equal(specified.entries[0].cost.shards, specificCost,
    "指定購入は従来どおりDB個別価格");
});

test("一括所持追加を同じミリ秒に連続実行してもUIDと台帳参照が衝突しない", () => {
  const { reducer, context, DB } = runtime();
  vm.runInContext("Date.now = () => 1700000000000; Math.random = () => 0.5;", context);
  const personaA = DB.normal_personas.find((entry) => String(entry.no) === "1");
  const personaB = DB.normal_personas.find((entry) => String(entry.no) === "2");
  const egoA = DB.egos[0];
  const egoB = DB.egos.find((entry) => entry.rank !== egoA.rank || String(entry.no) !== String(egoA.no));
  assert.ok(personaA && personaB && egoA && egoB);

  let state = baseState();
  state = reducer(state, {
    type: "ADD_ROSTER_MANY",
    resultId: "result-live",
    adds: [{ type: "persona", mode: "n", no: personaA.no, cost: { lp: 20, shards: 0 } }]
  });
  state = reducer(state, {
    type: "ADD_ROSTER_MANY",
    resultId: "result-live",
    adds: [{ type: "persona", mode: "n", no: personaB.no, cost: { lp: 20, shards: 0 } }]
  });
  state = reducer(state, {
    type: "ADD_ROSTER_MANY",
    resultId: "result-live",
    adds: [{ type: "ego", rank: egoA.rank, no: egoA.no }]
  });
  state = reducer(state, {
    type: "ADD_ROSTER_MANY",
    resultId: "result-live",
    adds: [{ type: "ego", rank: egoB.rank, no: egoB.no }]
  });

  const personaUids = state.roster.personas.map((entry) => entry.uid);
  const egoUids = state.roster.egos.map((entry) => entry.uid);
  assert.equal(new Set(personaUids).size, 2);
  assert.equal(new Set(egoUids).size, 2);
  for (const entry of state.entries.filter((item) => item.ref?.kind === "rosterPersona")) {
    assert.ok(personaUids.includes(entry.ref.uid));
  }
  for (const entry of state.entries.filter((item) => item.ref?.kind === "rosterEgo")) {
    assert.ok(egoUids.includes(entry.ref.uid));
  }
  state = reducer(state, { type: "REMOVE_ROSTER", uid: personaUids[0] });
  state = reducer(state, { type: "REMOVE_ROSTER_EGO", uid: egoUids[0], deleteCustomConfirmed: true });
  assert.equal(state.roster.personas.length, 1);
  assert.equal(state.roster.egos.length, 1);
  assert.equal(state.entries.filter((item) => item.ref?.kind === "rosterPersona").length, 1);
  assert.equal(state.entries.filter((item) => item.ref?.kind === "rosterEgo").length, 1);
});

test("削除済みリザルトIDは明細・所持の追加、編集、移動で未分類へ戻る", () => {
  const { reducer, DB } = runtime();
  const before = baseState();
  let state = reducer(before, {
    type: "ADD_ENTRY", kind: "item", name: "手動明細",
    cost: { lp: 1 }, resultId: "deleted-result"
  });
  assert.equal(state.entries[0].resultId, null);

  state = reducer(state, {
    type: "PATCH_ENTRY", id: state.entries[0].id,
    patch: { resultId: "deleted-result" }
  });
  assert.equal(state.entries[0].resultId, null);

  state = reducer(state, {
    type: "SET_ENTRY_RESULT", id: state.entries[0].id,
    resultId: "deleted-result"
  });
  assert.equal(state.entries[0].resultId, null);

  const support = DB.support_passives.find((entry) => Number(entry.lp) > 0);
  const boughtSupport = reducer(before, {
    type: "ADD_ROSTER_SUPPORT", spp: support, purchase: true, resultId: "deleted-result"
  });
  assert.equal(boughtSupport.roster.supports[0].resultId, null);
  assert.equal(boughtSupport.entries[0].resultId, null);
  let moved = reducer(boughtSupport, {
    type: "PATCH_ENTRY", id: boughtSupport.entries[0].id,
    patch: { resultId: "result-live" }
  });
  assert.equal(moved.roster.supports[0].resultId, "result-live");
  moved = reducer(moved, {
    type: "PATCH_ENTRY", id: moved.entries[0].id,
    patch: { resultId: "deleted-result" }
  });
  assert.equal(moved.roster.supports[0].resultId, null);
  assert.equal(moved.entries[0].resultId, null);

  const spirit = DB.spirits.find((entry) => Number(entry.price) > 0);
  const boughtSpirit = reducer(before, {
    type: "ADD_ROSTER_SPIRIT", spirit, purchase: true, resultId: "deleted-result"
  });
  assert.equal(boughtSpirit.roster.spirits[0].resultId, null);
  assert.equal(boughtSpirit.entries[0].resultId, null);
  const movedSpirit = reducer(boughtSpirit, {
    type: "SET_ROSTER_SPIRIT_RESULT", uid: boughtSpirit.roster.spirits[0].uid,
    resultId: "deleted-result"
  });
  assert.equal(movedSpirit.roster.spirits[0].resultId, null);
  assert.equal(movedSpirit.entries[0].resultId, null);
});

test("Undo復元時に元リザルトが消えていれば所持・購入明細とも未分類にする", () => {
  const { reducer, DB } = runtime();
  const support = DB.support_passives.find((entry) => Number(entry.lp) > 0);
  const bought = reducer(baseState(), {
    type: "ADD_ROSTER_SUPPORT", spp: support, purchase: true, resultId: "result-live"
  });
  const owned = bought.roster.supports[0];
  const expense = bought.entries[0];
  const withoutSourceResult = {
    ...bought,
    results: [],
    roster: { ...bought.roster, supports: [] },
    entries: []
  };
  const restored = reducer(withoutSourceResult, {
    type: "RESTORE_ROSTER_BATCH",
    kind: "supports",
    items: [owned],
    entries: [expense]
  });
  assert.equal(restored.roster.supports[0].resultId, null);
  assert.equal(restored.entries[0].resultId, null);
});
