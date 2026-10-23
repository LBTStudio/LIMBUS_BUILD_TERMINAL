import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const FIXED_NOW = 1_700_000_000_000;

function loadReducer() {
  class FixedDate extends Date {
    static now() { return FIXED_NOW; }
  }
  const context = {
    window: {
      DB: {
        normal_personas: [],
        tokui_personas: [],
        egos: [],
        items: [],
        support_passives: [],
        death_passives: [],
        spirits: [],
        default_statuses: []
      }
    },
    console,
    Date: FixedDate
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { reducer: context.window.appReducer, init: context.window.INIT_STATE };
}

function emptyState(init) {
  return {
    ...init,
    results: [],
    entries: [],
    skills: [],
    uniqueBuffs: [],
    extraPassives: [],
    historyRecent: [],
    roster: {
      ...init.roster,
      personas: [],
      egos: [],
      supports: [],
      spirits: []
    }
  };
}

test("same-millisecond persona additions get different UIDs; removing one preserves the other", () => {
  const { reducer, init } = loadReducer();
  let state = emptyState(init);
  state = reducer(state, { type: "ADD_ROSTER", mode: "n", no: 1, purchase: false });
  state = reducer(state, { type: "ADD_ROSTER", mode: "n", no: 2, purchase: false });

  assert.equal(state.roster.personas.length, 2);
  const [first, second] = state.roster.personas;
  assert.notEqual(first.uid, second.uid);

  state = reducer(state, { type: "REMOVE_ROSTER", uid: first.uid });
  assert.equal(state.roster.personas.length, 1);
  assert.equal(String(state.roster.personas[0].no), "2");
});

test("same-millisecond E.G.O additions get different UIDs; removing one preserves the other", () => {
  const { reducer, init } = loadReducer();
  let state = emptyState(init);
  state = reducer(state, { type: "ADD_ROSTER_EGO", rank: "TETH", no: 1, purchase: false });
  state = reducer(state, { type: "ADD_ROSTER_EGO", rank: "TETH", no: 2, purchase: false });

  assert.equal(state.roster.egos.length, 2);
  const [first, second] = state.roster.egos;
  assert.notEqual(first.uid, second.uid);

  state = reducer(state, { type: "REMOVE_ROSTER_EGO", uid: first.uid });
  assert.equal(state.roster.egos.length, 1);
  assert.equal(String(state.roster.egos[0].no), "2");
});

test("adding and deriving a skill in the same millisecond keeps edit and delete scoped to one skill", () => {
  const { reducer, init } = loadReducer();
  let state = emptyState(init);
  state = reducer(state, { type: "ADD_SKILL" });
  const originalId = state.skills[0].id;
  state = reducer(state, { type: "DERIVE_SKILL", id: originalId });

  assert.equal(state.skills.length, 2);
  assert.notEqual(state.skills[0].id, state.skills[1].id);

  state = reducer(state, { type: "PATCH_SKILL", id: originalId, patch: { name: "元スキルだけ" } });
  assert.equal(state.skills.filter((skill) => skill.name === "元スキルだけ").length, 1);
  state = reducer(state, { type: "REMOVE_SKILL", id: originalId });
  assert.equal(state.skills.length, 1);
});

test("two original personas saved in the same millisecond do not overwrite each other", () => {
  const { reducer, init } = loadReducer();
  let state = emptyState(init);
  state = reducer(state, { type: "EQUIP_CUSTOM_PERSONA", name: "オリジナル人格A" });
  state = reducer(state, { type: "SAVE_CUSTOM_PERSONA" });
  state = reducer(state, { type: "EQUIP_CUSTOM_PERSONA", name: "オリジナル人格B" });
  state = reducer(state, { type: "SAVE_CUSTOM_PERSONA" });

  assert.equal(state.roster.personas.length, 2);
  assert.notEqual(state.roster.personas[0].uid, state.roster.personas[1].uid);
  assert.deepEqual(
    state.roster.personas.map((entry) => entry.src.name).sort(),
    ["オリジナル人格A", "オリジナル人格B"]
  );
});
