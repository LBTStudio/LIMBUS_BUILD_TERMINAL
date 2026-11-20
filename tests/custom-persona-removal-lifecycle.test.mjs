import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function extractCase(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `reducer case exists: ${startText}`);
  return source.slice(start, end);
}

function loadReducer(caseCode) {
  const context = { Date, JSON, String, Number, Math, window: { DB: { normal_personas: [], tokui_personas: [] } } };
  vm.createContext(context);
  vm.runInContext(`
    function cloneJSON(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function dropLedgerEntriesForRefs(state) { return state; }
    function dropLedgerEntriesForRef(state) { return state; }
    function reduce(state, action) {
      switch (action.type) {
        ${caseCode}
        default: return state;
      }
    }
    globalThis.__reduce = reduce;
  `, context);
  return context.__reduce;
}

function fixture() {
  return {
    personaMode: "custom",
    personaNo: "custom-alpha",
    personaSrc: { no: "custom-alpha", name: "装備中の自作人格", __custom: true },
    syncedManual: true,
    hp: "123",
    skills: [{ name: "編集内容は保持" }],
    roster: { personas: [
      { uid: "custom-alpha", no: "custom-alpha", mode: "custom", equipped: true, src: { name: "自作人格" } },
      { uid: "normal-1", no: 1, mode: "n", equipped: false, src: { name: "通常人格" } }
    ], egos: [], supports: [], spirits: [] },
    results: [], entries: [], favorites: ["custom:custom-alpha"], historyRecent: ["custom:custom-alpha"]
  };
}

test("single deletion of equipped custom Persona clears active identity without discarding the working draft", () => {
  const reduce = loadReducer(extractCase('case "REMOVE_ROSTER": {', 'case "PATCH_ROSTER": {'));
  const next = reduce(fixture(), { type: "REMOVE_ROSTER", uid: "custom-alpha" });
  assert.equal(next.personaMode, null);
  assert.equal(next.personaNo, null);
  assert.equal(next.personaSrc, null);
  assert.equal(next.syncedManual, false);
  assert.equal(next.skills[0].name, "編集内容は保持");
  assert.equal(next.roster.personas.some((entry) => entry.uid === "custom-alpha"), false);
  assert.ok(next.roster.personas.every((entry) => entry.equipped === false));
});

test("batch deletion of equipped custom Persona clears active identity and flags", () => {
  const reduce = loadReducer(extractCase('case "REMOVE_ROSTER_BATCH": {', 'case "REMOVE_ROSTER_EGO_BATCH": {'));
  const next = reduce(fixture(), { type: "REMOVE_ROSTER_BATCH", uids: ["custom-alpha"] });
  assert.equal(next.personaMode, null);
  assert.equal(next.personaNo, null);
  assert.equal(next.personaSrc, null);
  assert.equal(next.syncedManual, false);
  assert.equal(next.skills[0].name, "編集内容は保持");
  assert.equal(next.roster.personas.some((entry) => entry.uid === "custom-alpha"), false);
  assert.ok(next.roster.personas.every((entry) => entry.equipped === false));
});

test("batch deletion of an unrelated Persona leaves the currently equipped Persona intact", () => {
  const reduce = loadReducer(extractCase('case "REMOVE_ROSTER_BATCH": {', 'case "REMOVE_ROSTER_EGO_BATCH": {'));
  const next = reduce(fixture(), { type: "REMOVE_ROSTER_BATCH", uids: ["normal-1"] });
  assert.equal(next.personaMode, "custom");
  assert.equal(next.personaNo, "custom-alpha");
  assert.equal(next.personaSrc.name, "装備中の自作人格");
  assert.equal(next.roster.personas.length, 1);
  assert.equal(next.roster.personas[0].equipped, true);
});
