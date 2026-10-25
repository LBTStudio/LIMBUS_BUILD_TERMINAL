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

test("チケット付与は正の整数を受け入れ、不正値や負数では変更しない", () => {
  const { reducer, state, ticketBalance } = withTickets();
  for (const count of [1.5, "1.5", "2abc", Number.MAX_SAFE_INTEGER + 1, -1, "-2"]) {
    const invalid = reducer(state, { type: "GRANT_TICKET", kind: "persona", count });
    assert.equal(invalid, state, `GRANT_TICKET は不正値 ${String(count)} で状態を変えない`);
  }
  const granted = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: 2 });
  assert.equal(ticketBalance(granted.results, granted.entries).persona, 6);
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
  assert.equal(ticketBalance(zeroDefaults.results, zeroDefaults.entries).persona, 3);
});
