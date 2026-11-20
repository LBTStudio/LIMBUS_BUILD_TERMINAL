import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function loadState() {
  const context = {
    window: { DB: { normal_personas: [], tokui_personas: [], egos: [] } },
    console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
    React: { createElement() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  context.window.DB = { normal_personas: [], tokui_personas: [], egos: [] };
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, init: context.window.INIT_STATE };
}

function stateWithEquippedCustomEgo(init) {
  return {
    ...init,
    egoSlots: {
      ...init.egoSlots,
      TETH: { rank: "TETH", no: 17, name: "装備中の創作E.G.O", effects: [] }
    },
    roster: {
      ...init.roster,
      egos: [{
        uid: "er-17", rank: "TETH", no: "17", analyzed: false, analyzeMax: false,
        notes: "", build: { __custom: true, name: "装備中の創作E.G.O" }
      }]
    }
  };
}

test("装備中の創作E.G.OはNoの数値/文字列が異なっても単体削除から保護される", () => {
  const { reducer, init } = loadState();
  const original = stateWithEquippedCustomEgo(init);
  const next = reducer(original, { type: "REMOVE_ROSTER_EGO", uid: "er-17", deleteCustomConfirmed: true });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].uid, "er-17");
});

test("装備中の創作E.G.OはNoの数値/文字列が異なっても一括削除から保護される", () => {
  const { reducer, init } = loadState();
  const original = stateWithEquippedCustomEgo(init);
  const next = reducer(original, { type: "REMOVE_ROSTER_EGO_BATCH", uids: ["er-17"], deleteCustomConfirmed: true });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].uid, "er-17");
});
