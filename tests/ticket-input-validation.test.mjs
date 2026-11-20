import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadReducer() {
  const context = { window: { DB: { items: [], specialItems: [], normal_personas: [], tokui_personas: [], egos: [] } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE, ticketBalance: context.window.LBT_computeTicketBalance };
}

function withTickets() {
  const { reducer, initState, ticketBalance } = loadReducer();
  const state = reducer(initState, {
    type: "ADD_RESULT",
    name: "チケット入力検証",
    income: { lp: 0, shards: 0, tickets: { persona: 4, ego: 2, choice: 1, pack: { "検証パック": 3 } } }
  });
  return { reducer, state, ticketBalance };
}

test("チケット設定は整数のみ受け入れ、不正値は状態を変えない", () => {
  const { reducer, state, ticketBalance } = withTickets();
  assert.equal(ticketBalance(state.results, state.entries).persona, 4);
  for (const count of [1.5, "1.5", "2abc", Number.MAX_SAFE_INTEGER + 1, -1]) {
    const invalid = reducer(state, { type: "SET_TICKET_COUNT", kind: "persona", count });
    assert.equal(invalid, state, `SET_TICKET_COUNT は不正値 ${String(count)} で状態を変えない`);
  }
  const set = reducer(state, { type: "SET_TICKET_COUNT", kind: "persona", count: "2" });
  assert.equal(ticketBalance(set.results, set.entries).persona, 2);
});

test("チケット枚数の増減は整数差分を受け入れ、小数などの不正値は拒否する", () => {
  const { reducer, state, ticketBalance } = withTickets();
  for (const count of [1.5, "1.5", "2abc", Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = reducer(state, { type: "GRANT_TICKET", kind: "persona", count });
    assert.equal(invalid, state, `GRANT_TICKET は不正値 ${String(count)} で状態を変えない`);
  }
  const granted = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: 2 });
  assert.equal(ticketBalance(granted.results, granted.entries).persona, 6);
  const reduced = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: -2 });
  assert.equal(ticketBalance(reduced.results, reduced.entries).persona, 2, "負の整数差分で所持数を減らせる");
});

test("GRANT_TICKETの負数調整は複数リザルト合計から減らし、受領履歴を保持する", () => {
  const { reducer, initState, ticketBalance } = loadReducer();
  const state = {
    ...initState,
    results: [
      {
        id: "res-old",
        name: "過去の受領",
        date: "2026-11-01",
        createdAt: 100,
        income: { lp: 0, shards: 0, tickets: { persona: 3 } }
      },
      {
        id: "res-latest",
        name: "最新の受領",
        date: "2026-11-02",
        createdAt: 200,
        income: { lp: 0, shards: 0, tickets: { persona: 0 } }
      }
    ],
    entries: []
  };
  const reduced = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: -2 });
  assert.equal(ticketBalance(reduced.results, reduced.entries).persona, 1,
    "古いリザルトにある3枚から2枚減らし、全体を1枚にする");
  assert.equal(reduced.results[0].income.tickets.persona, 3,
    "受領元の記録は改変しない");
  assert.equal(reduced.results[1].income.tickets.persona, 0,
    "最新リザルトに無いチケットをそこから減算しない");
  assert.equal(reduced.entries.length, 1, "調整消費明細を残す");
  assert.equal(reduced.entries[0].tickets.persona, 2);
  assert.equal(reduced.entries[0].ref.kind, "ticketBalanceAdjustment");
  assert.equal(reduced.entries[0].resultId, "res-latest",
    "調整明細は既定の表示上最新リザルトへ帰属する");

  const overAdjusted = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: -9 });
  assert.equal(ticketBalance(overAdjusted.results, overAdjusted.entries).persona, 0,
    "所持枚数を超える負数は残数をマイナスにしない");
  assert.equal(overAdjusted.entries[0].tickets.persona, 3,
    "実際に存在する3枚だけを調整明細へ記録する");
});

test("チケット消費は整数のみ受け入れ、負数表記と省略時1枚を維持する", () => {
  const { reducer, state, ticketBalance } = withTickets();
  for (const count of [1.5, "1.5", "2abc", Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = reducer(state, { type: "SPEND_TICKET", kind: "persona", count });
    assert.equal(invalid, state, `SPEND_TICKET は不正値 ${String(count)} で状態を変えない`);
  }
  const spentTwo = reducer(state, { type: "SPEND_TICKET", kind: "persona", count: "-2" });
  assert.equal(ticketBalance(spentTwo.results, spentTwo.entries).persona, 2);
  const spentOne = reducer(state, { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(ticketBalance(spentOne.results, spentOne.entries).persona, 3);
  const zeroDefaults = reducer(state, { type: "SPEND_TICKET", kind: "persona", count: 0 });
  assert.strictEqual(zeroDefaults, state, "明示的な0枚は既定の1枚消費へ変換しない");
  assert.equal(ticketBalance(zeroDefaults.results, zeroDefaults.entries).persona, 4);
});
