import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const drawUiSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

function load() {
  const context = {
    window: {
      DB: {
        normal_personas: [{ no: 1, name: "試験人格" }],
        tokui_personas: [],
        egos: [],
        support_passives: [],
        death_passives: [],
        spirits: [],
        normal_enhancements: [],
        special_enhancements: []
      }
    },
    console,
    URL,
    TextEncoder,
    TextDecoder,
    React: {
      useReducer: () => {},
      useRef: () => ({ current: null }),
      useState: () => [null, () => {}],
      useEffect: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return context;
}

const context = load();
const w = context.window;
const reducer = w.appReducer;

function stateWithOnePersonaTicket() {
  return {
    ...JSON.parse(JSON.stringify(w.INIT_STATE)),
    results: [{
      id: "result-1",
      name: "テスト周回",
      date: "2026-10-23",
      income: { lp: 0, shards: 0, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } },
      exchange: { lp: 0, shards: 0 },
      note: ""
    }],
    entries: [],
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    draws: [],
    gachaLog: []
  };
}

const batch = {
  batchHash: "sealed-batch-for-undo-test",
  records: [{
    kind: "persona",
    item: { kind: "persona", no: 1, mode: "n", name: "試験人格" },
    cost: { lp: 0, shards: 0 },
    duplicate: false
  }]
};

test("Undoで抽選を越えたとき、抽選証明だけ再生し所持・支払いは戻す", () => {
  const before = stateWithOnePersonaTicket();
  const committed = reducer(before, {
    type: "APPLY_DRAW_BATCH",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });
  assert.equal(w.LBT_computeTicketBalance(committed.results, committed.entries).persona, 0,
    "確定時に抽選とチケット消費を同じ取引で処理する");
  assert.equal(committed.roster.personas.length, 1, "確定時は抽選品が所持に反映される");
  assert.equal(committed.draws.length, 0, "経済効果と証明記録を分離する");

  const drawLogEntry = { id: "draw-proof-1", at: "2026-10-23T00:00:00.000Z", hits: ["試験人格"] };
  const proof = reducer(committed, { type: "ADD_DRAW_RECORD", __sealed: true, batch, entry: drawLogEntry });
  assert.equal(proof.draws.length, 1, "確定時に証明記録をsealed actionとして追加する");
  assert.equal(proof.gachaLog.length, 1, "証明が確定したときだけ決定ログも一緒に保存する");

  const seal = context.replaySealedAction({ type: "ADD_DRAW_RECORD", __sealed: true, batch, entry: drawLogEntry });
  assert.equal(seal.type, "ADD_DRAW_RECORD", "Undoの再生時は証明記録専用アクションだけを再生する");
  assert.equal(seal.proofOnly, true, "Undoの再生は取引承認を要求せず、証明だけを保持する");
  assert.equal(context.replaySealedAction({ type: "ADD_DRAW_BATCH", __sealed: true, batch }).type,
    "ADD_DRAW_RECORD", "旧形式のsealed batchも再生時は副作用を再適用しない");

  let rewound = reducer(before, seal);

  assert.equal(rewound.roster.personas.length, 0, "Undo後に抽選品が復活しない");
  assert.equal(rewound.entries.length, 0, "Undo後に通帳の支出明細を復活させない");
  assert.equal(w.LBT_computeTicketBalance(rewound.results, rewound.entries).persona, 1,
    "Undo後はチケット消費が戻り、抽選品だけを無料で保持する状態にしない");
  assert.equal(rewound.draws.length, 1, "改ざん検証用の封緘証明は残す");
  assert.equal(rewound.gachaLog.length, 1, "抽選した事実の記録は残す");
});

test("証明記録専用アクションは所持・通帳・残高を変更しない", () => {
  const before = stateWithOnePersonaTicket();
  const after = reducer(before, { type: "ADD_DRAW_RECORD", batch, proofOnly: true });
  assert.equal(after.roster.personas.length, 0);
  assert.equal(after.entries.length, 0);
  assert.equal(w.LBT_computeTicketBalance(after.results, after.entries).persona, 1);
  assert.equal(after.draws.length, 1);
  assert.equal(reducer(after, { type: "ADD_DRAW_RECORD", batch, proofOnly: true }).draws.length, 1,
    "同じbatchHashの証明を二重登録しない");
});


test("LP購入のUndoは通帳支出を戻し、証明だけを保持する", () => {
  const before = stateWithOnePersonaTicket();
  before.results[0].income.lp = 100;
  const paidBatch = {
    batchHash: "sealed-batch-for-lp-undo-test",
    records: [{
      kind: "persona",
      item: { kind: "persona", no: 1, mode: "n", name: "試験人格" },
      cost: { lp: 20, shards: 0 },
      duplicate: false
    }]
  };
  const committed = reducer(before, { type: "APPLY_DRAW_BATCH", batch: paidBatch });
  assert.equal(w.LBT_computeLedgerBalance(committed.results, committed.entries).lp, 80,
    "確定時はLP支出が計上される");
  assert.equal(committed.roster.personas.length, 1);

  const rewound = reducer(before, context.replaySealedAction({
    type: "ADD_DRAW_RECORD", __sealed: true, batch: paidBatch
  }));
  assert.equal(w.LBT_computeLedgerBalance(rewound.results, rewound.entries).lp, 100,
    "UndoでLP支出は戻る");
  assert.equal(rewound.roster.personas.length, 0, "Undoで所持品は戻る");
  assert.equal(rewound.draws.length, 1, "抽選証明は保持する");
});


test("確定前にチケット残高が不足した場合、抽選品も費用も反映しない", () => {
  const before = stateWithOnePersonaTicket();
  before.results[0].income.tickets.persona = 0;
  const after = reducer(before, {
    type: "APPLY_DRAW_BATCH",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });
  assert.equal(after.roster.personas.length, 0, "不足時は所持品を追加しない");
  assert.equal(after.entries.length, 0, "不足時は通帳も変更しない");
  assert.equal(after.draws.length, 0, "不足時は証明をまだ書かない");
  assert.equal(w.LBT_computeTicketBalance(after.results, after.entries).persona, 0);
});


test("抽選取引の直前検証はチケット不足と重複バッチを拒否する", () => {
  const before = stateWithOnePersonaTicket();
  before.results[0].income.tickets.persona = 0;
  const transaction = {
    type: "APPLY_DRAW_BATCH",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  };
  const validation = w.LBT_validateDrawBatchApplication(before, transaction);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "insufficient-tickets");
  const rejected = reducer(before, transaction);
  assert.equal(rejected.roster.personas.length, 0);
  assert.equal(rejected.entries.length, 0);
  assert.equal(rejected.draws.length, 0);
  assert.equal(rejected.gachaLog.length, 0);

  const alreadyDrawn = { ...stateWithOnePersonaTicket(), draws: [batch] };
  const duplicate = w.LBT_validateDrawBatchApplication(alreadyDrawn, {
    type: "APPLY_DRAW_BATCH",
    batch
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "duplicate-batch");

  const missingProof = w.LBT_validateDrawBatchApplication(before, {
    type: "APPLY_DRAW_BATCH",
    batch: { records: [] }
  });
  assert.equal(missingProof.ok, false);
  assert.equal(missingProof.reason, "missing-proof-key");
});

test("非同期確定後に残高が変わった場合、証明を追記する前に確定を中止する", () => {
  const componentStart = drawUiSource.indexOf("const GachaTicketsPanel");
  const commitStart = drawUiSource.indexOf("const commitDrawAsync", componentStart);
  const commitEnd = drawUiSource.indexOf("const stopNote", commitStart);
  assert.ok(componentStart >= 0 && commitStart > componentStart && commitEnd > commitStart);
  const component = drawUiSource.slice(componentStart, commitEnd);
  assert.match(component, /const stateRef = React\.useRef\(state\)/);
  assert.match(component, /stateRef\.current = state/);
  assert.match(component, /LBT_validateDrawBatchApplication\?\.\(currentState, transaction\)/);

  const preflight = component.indexOf("if (!validation?.ok)");
  const abort = component.indexOf("return;", preflight);
  const economicCommit = component.indexOf("dispatch(transaction)", preflight);
  const proofCommit = component.indexOf('dispatch({ type: "ADD_DRAW_RECORD", __sealed: true, batch, entry: drawLogEntry })', preflight);
  const fallbackLogCommit = component.indexOf('dispatch({ type: "ADD_GACHA_LOG", __sealed: true, entry: drawLogEntry })', preflight);
  assert.ok(preflight >= 0 && abort > preflight && economicCommit > abort,
    "失敗時は経済処理をdispatchする前に中止する");
  assert.ok(proofCommit > economicCommit && fallbackLogCommit > proofCommit,
    "証明と決定ログは承認された取引へ結び付け、旧検証器のfallbackログとは分離する");
  assert.match(component, /cost: paidCost/, "LP／欠片残高もreducerの同じ取引で再検証する");
});

test("残高検証で拒否された取引には証明も決定ログも結び付けない", () => {
  const before = stateWithOnePersonaTicket();
  before.results[0].income.lp = 5;
  const expensiveBatch = {
    batchHash: "insufficient-lp-batch",
    records: [{
      kind: "persona",
      item: { kind: "persona", no: 1, mode: "n", name: "試験人格" },
      cost: { lp: 20, shards: 0 },
      duplicate: false
    }]
  };
  const action = {
    type: "APPLY_DRAW_BATCH",
    batch: expensiveBatch,
    cost: { lp: 20, shards: 0 }
  };
  const validation = w.LBT_validateDrawBatchApplication(before, action);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "insufficient-currency");
  const rejected = reducer(before, action);
  const proofAttempt = reducer(rejected, {
    type: "ADD_DRAW_RECORD",
    batch: expensiveBatch,
    entry: { id: "rejected-draw", hits: ["試験人格"] }
  });
  assert.equal(proofAttempt.roster.personas.length, 0);
  assert.equal(proofAttempt.entries.length, 0);
  assert.equal(proofAttempt.draws.length, 0);
  assert.equal(proofAttempt.gachaLog.length, 0);
});
