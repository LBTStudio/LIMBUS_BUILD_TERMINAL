import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const saveStart = source.indexOf("function saveUnsavedCustomPersonaBeforeSwitch(state, dispatch) {");
const unequipStart = source.indexOf("function requestPersonaUnequip(state, dispatch, afterUnequip) {", saveStart);
const unequipEnd = source.indexOf("\n/* 現在装備中の人格の所持レコード", unequipStart);
assert.ok(saveStart >= 0 && unequipStart > saveStart && unequipEnd > unequipStart);

function loadHelpers(confirmed = true, changes = ["skills"]) {
  const context = {
    String, Array, Set,
    window: { confirm: () => confirmed },
    getPersonaDetachChanges: () => changes,
    toast: () => {}
  };
  vm.createContext(context);
  vm.runInContext(
    source.slice(saveStart, unequipStart) + "\n" + source.slice(unequipStart, unequipEnd)
      + "\nglobalThis.__saveBeforeSwitch = saveUnsavedCustomPersonaBeforeSwitch; globalThis.__unequip = requestPersonaUnequip;",
    context
  );
  return context;
}

test("switching away from an unsaved custom draft asks to save it before changing Persona", () => {
  const context = loadHelpers(true);
  const actions = [];
  const ok = context.__saveBeforeSwitch({
    personaMode: "custom", personaNo: "custom-draft", personaSrc: { __custom: true },
    roster: { personas: [] }
  }, (action) => actions.push(action.type));
  assert.equal(ok, true);
  assert.deepEqual(actions, ["SAVE_CUSTOM_PERSONA"]);
});

test("canceling the unsaved custom draft prompt prevents switching", () => {
  const context = loadHelpers(false);
  const actions = [];
  const ok = context.__saveBeforeSwitch({
    personaMode: "custom", personaNo: "custom-draft", personaSrc: { __custom: true },
    roster: { personas: [] }
  }, (action) => actions.push(action.type));
  assert.equal(ok, false);
  assert.deepEqual(actions, []);
});

test("already-owned custom Personas do not trigger a redundant save prompt", () => {
  const context = loadHelpers(false);
  const actions = [];
  const ok = context.__saveBeforeSwitch({
    personaMode: "custom", personaNo: "custom-owned", personaSrc: { __custom: true },
    roster: { personas: [{ mode: "custom", uid: "custom-owned", no: "custom-owned" }] }
  }, (action) => actions.push(action.type));
  assert.equal(ok, true);
  assert.deepEqual(actions, []);
});

test("unequipping edited custom Persona saves its complete source; ordinary Personas save their build", () => {
  const custom = loadHelpers(true);
  const customActions = [];
  custom.__unequip({
    personaMode: "custom", personaNo: "custom-draft", personaSrc: { __custom: true }
  }, (action) => customActions.push(action.type));
  assert.deepEqual(customActions, ["SAVE_CUSTOM_PERSONA", "UNEQUIP_PERSONA"]);

  const normal = loadHelpers(true);
  const normalActions = [];
  normal.__unequip({
    personaMode: "n", personaNo: 1, personaSrc: { no: 1 }
  }, (action) => normalActions.push(action.type));
  assert.deepEqual(normalActions, ["SAVE_PERSONA_BUILD", "UNEQUIP_PERSONA"]);
});


test("Persona switch, new Persona, and draft-import entry points all guard unsaved custom drafts", () => {
  const equipStart = source.indexOf("const equipPersona = (p) =>");
  const customStart = source.indexOf("const equipCustom = () =>");
  const draftStart = source.indexOf("const applyDraft = () =>");
  assert.ok(equipStart >= 0 && customStart > equipStart && draftStart > customStart);
  const equipBody = source.slice(equipStart, customStart);
  const customBody = source.slice(customStart, draftStart);
  const draftBody = source.slice(draftStart, source.indexOf("const hasActiveFilters", draftStart));
  assert.ok(equipBody.indexOf("saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)") < equipBody.indexOf('dispatch({ type: "EQUIP_PERSONA"'));
  assert.ok(customBody.indexOf("saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)") < customBody.indexOf('dispatch({ type: "EQUIP_CUSTOM_PERSONA"'));
  assert.ok(draftBody.indexOf("saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)") < draftBody.indexOf('type: "IMPORT_PERSONA_DRAFT"'));
});
