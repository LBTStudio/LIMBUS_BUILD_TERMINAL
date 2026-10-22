import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

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

  const proof = reducer(committed, { type: "ADD_DRAW_RECORD", __sealed: true, batch });
  assert.equal(proof.draws.length, 1, "確定時に証明記録をsealed actionとして追加する");

  const seal = context.replaySealedAction({ type: "ADD_DRAW_RECORD", __sealed: true, batch });
  assert.equal(seal.type, "ADD_DRAW_RECORD", "Undoの再生時は証明記録専用アクションだけを再生する");
  assert.equal(context.replaySealedAction({ type: "ADD_DRAW_BATCH", __sealed: true, batch }).type,
    "ADD_DRAW_RECORD", "旧形式のsealed batchも再生時は副作用を再適用しない");

  let rewound = reducer(before, seal);
  rewound = reducer(rewound, {
    type: "ADD_GACHA_LOG",
    entry: { id: "draw-proof-1", at: "2026-10-23T00:00:00.000Z", hits: ["試験人格"] }
  });

  assert.equal(rewound.roster.personas.length, 0, "Undo後に抽選品が復活しない");
  assert.equal(rewound.entries.length, 0, "Undo後に通帳の支出明細を復活させない");
  assert.equal(w.LBT_computeTicketBalance(rewound.results, rewound.entries).persona, 1,
    "Undo後はチケット消費が戻り、抽選品だけを無料で保持する状態にしない");
  assert.equal(rewound.draws.length, 1, "改ざん検証用の封緘証明は残す");
  assert.equal(rewound.gachaLog.length, 1, "抽選した事実の記録は残す");
});

test("証明記録専用アクションは所持・通帳・残高を変更しない", () => {
  const before = stateWithOnePersonaTicket();
  const after = reducer(before, { type: "ADD_DRAW_RECORD", batch });
  assert.equal(after.roster.personas.length, 0);
  assert.equal(after.entries.length, 0);
  assert.equal(w.LBT_computeTicketBalance(after.results, after.entries).persona, 1);
  assert.equal(after.draws.length, 1);
  assert.equal(reducer(after, { type: "ADD_DRAW_RECORD", batch }).draws.length, 1,
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
