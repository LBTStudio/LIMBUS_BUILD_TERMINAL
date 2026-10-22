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
  schemaVersion: 1,
  ruleset: "core-ticket",
  kind: "persona",
  count: 1,
  commit: "sealed-commit-for-undo-test",
  batchHash: "sealed-batch-for-undo-test",
  records: [{
    index: 0,
    kind: "persona",
    method: "ticket",
    item: { kind: "persona", no: 1, mode: "n", name: "試験人格" },
    cost: { lp: 0, shards: 0 },
    duplicate: false,
    grantedShards: 0
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

test("抽選取引はチケット種別・支払方式・枚数とバッチの内容を一致させる", () => {
  const base = stateWithOnePersonaTicket();
  assert.equal(w.LBT_validateDrawBatchApplication(base, {
    type: "APPLY_DRAW_BATCH", batch
  }).reason, "ticket-spend-required", "チケット取引から支払い指定を省略できない");

  assert.equal(w.LBT_validateDrawBatchApplication(base, {
    type: "APPLY_DRAW_BATCH", batch, ticketSpend: { kind: "ego", count: 1 }
  }).reason, "ticket-kind-mismatch", "E.G.Oチケットで人格バッチを確定できない");

  assert.equal(w.LBT_validateDrawBatchApplication(base, {
    type: "APPLY_DRAW_BATCH", batch, ticketSpend: { kind: "persona", count: 2 }
  }).reason, "ticket-count-mismatch", "記録件数より少ない消費枚数を指定できない");

  const choiceState = stateWithOnePersonaTicket();
  choiceState.results[0].income.tickets.choice = 1;
  assert.equal(w.LBT_validateDrawBatchApplication(choiceState, {
    type: "APPLY_DRAW_BATCH", batch, ticketSpend: { kind: "choice", count: 1 }
  }).ok, true, "選択抽出チケットは人格ルートで利用できる");
});

test("抽選確定までの間に所持状態が変わったら、費用・チケット・証明の一部適用を拒否する", () => {
  const alreadyOwned = stateWithOnePersonaTicket();
  alreadyOwned.roster.personas.push({ uid: "owned-between-preview-and-commit", mode: "n", no: 1 });
  const stalePersona = w.LBT_validateDrawBatchApplication(alreadyOwned, {
    type: "APPLY_DRAW_BATCH",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });
  assert.equal(stalePersona.ok, false);
  assert.equal(stalePersona.reason, "draw-target-already-owned");

  const unchanged = reducer(alreadyOwned, {
    type: "APPLY_DRAW_BATCH",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });
  assert.equal(unchanged, alreadyOwned, "reducer は取引を丸ごと拒否する");
  assert.equal(w.LBT_computeTicketBalance(unchanged.results, unchanged.entries).persona, 1,
    "拒否された抽選でチケットを消費しない");
  assert.equal(unchanged.entries.length, 0);
  assert.equal(unchanged.draws.length, 0);

  const stalePackState = stateWithOnePersonaTicket();
  stalePackState.roster.personas.push({
    uid: "owned-pack-item", mode: "n", no: 999, name: "旧G社兵士"
  });
  const packBatch = {
    batchHash: "stale-theme-pack",
    ruleset: "core",
    kind: "themePack",
    count: 1,
    records: [{
      kind: "themePack", method: "draw", pack: "属せない＆愛することのできない",
      item: { kind: "themePack", name: "旧G社兵士", no: 1 },
      cost: { lp: 125, shards: 0 }, duplicate: false, grantedShards: 0
    }]
  };
  const stalePack = w.LBT_validateDrawBatchApplication(stalePackState, {
    type: "APPLY_DRAW_BATCH", batch: packBatch, cost: { lp: 125, shards: 0 }
  });
  assert.equal(stalePack.ok, false);
  assert.equal(stalePack.reason, "stale-duplicate-state",
    "抽選時は未所持でも確定前に所持済みになった項目を通常報酬として処理しない");
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
  // action.cost が省略されても、バッチレコードの正規コストから不足を検出する。
  const action = { type: "APPLY_DRAW_BATCH", batch: expensiveBatch };
  const validation = w.LBT_validateDrawBatchApplication(before, action);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "insufficient-currency");
  const forgedCost = w.LBT_validateDrawBatchApplication(before, {
    ...action, cost: { lp: 0, shards: 0 }
  });
  assert.equal(forgedCost.ok, false);
  assert.equal(forgedCost.reason, "cost-mismatch");
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


test("抽選リストはハッシュ鎖の確認と署名／ビーコンの完全検証を区別する", () => {
  const start = drawUiSource.indexOf("const checked = React.useMemo(() => batches.map((batch)");
  assert.ok(start >= 0);
  const component = drawUiSource.slice(start, start + 6000);
  assert.match(component, /件・\$\{checked\.length - broken\}件のハッシュ鎖が正常/);
  assert.match(component, /ハッシュ鎖OK/);
  assert.match(component, /署名・外部ビーコンは未検証/);
  assert.doesNotMatch(component, /この一覧は支出の証明です/);
});

test("抽選UIは選択抽出チケットを明示的に選べる", () => {
  const start = drawUiSource.indexOf("const GachaTicketsPanel");
  assert.ok(start >= 0);
  const component = drawUiSource.slice(start, start + 24000);
  assert.match(component, /const \[ticketPreference, setTicketPreference\] = React\.useState\("specific"\)/);
  assert.match(component, /ticketBalanceAll\.choice/);
  assert.match(component, /ticketKind, times, seed/);
  assert.match(component, /使用する抽出チケット/);
  assert.match(component, /setTicketPreference\("choice"\)/);
});

test("抽選証明キーが無い取引は所持・費用・証明を適用しない", () => {
  const before = stateWithOnePersonaTicket();
  const invalidBatch = { records: batch.records };
  const action = { type: "APPLY_DRAW_BATCH", batch: invalidBatch, cost: { lp: 0, shards: 0 } };
  const validation = w.LBT_validateDrawBatchApplication(before, action);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "missing-proof-key");
  const rejected = reducer(before, action);
  assert.equal(rejected.roster.personas.length, 0);
  assert.equal(rejected.entries.length, 0);
  assert.equal(rejected.draws.length, 0);
  assert.equal(reducer(rejected, {
    type: "ADD_DRAW_RECORD",
    batch: invalidBatch,
    proofOnly: true,
    entry: { id: "missing-proof-key-log" }
  }).draws.length, 0, "proofOnlyでも検証キーのないレコードを残さない");
});

