import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

test("synchronization/manual edit mode exposes an editable persona-name input", () => {
  assert.match(personaSource, /editable\s*\?\s*\/\* @__PURE__ \*\/ React\.createElement\("input",\s*\{[\s\S]*?className: "es-id-name es-id-name-input"[\s\S]*?value: p\.name \|\| ""[\s\S]*?onChange: \(e\) => patchMeta\(\{ src: \{ name: e\.target\.value \} \}\)/);
  assert.match(personaSource, /: \/\* @__PURE__ \*\/ React\.createElement\("div", \{ className: "es-id-name", title: displayPersonaName \}, displayPersonaName\)/);
});

test("PATCH_PERSONA_META persists the renamed persona source and roster display name", () => {
  const start = stateSource.indexOf('case "PATCH_PERSONA_META": {');
  const end = stateSource.indexOf('case "TOGGLE_FAV": {', start);
  assert.ok(start >= 0 && end > start, "PATCH_PERSONA_META reducer case should exist");
  const reducerCase = stateSource.slice(start, end);
  const context = { Date, String, Object };
  vm.createContext(context);
  vm.runInContext(`
    function reduce(state, action) {
      switch (action.type) {
        ${reducerCase}
        default: return state;
      }
    }
    globalThis.__reduce = reduce;
  `, context);

  const state = {
    personaMode: "n",
    personaNo: 12,
    personaSrc: { name: "元の人格名", hp: 100 },
    roster: { personas: [
      { mode: "n", no: 12, displayName: "元の人格名" },
      { mode: "n", no: 13, displayName: "別人格" }
    ] }
  };
  const next = context.__reduce(state, { type: "PATCH_PERSONA_META", patch: { src: { name: "変更後の人格名" } } });

  assert.equal(next.personaSrc.name, "変更後の人格名");
  assert.equal(next.roster.personas[0].displayName, "変更後の人格名");
  assert.equal(next.roster.personas[1].displayName, "別人格");
  assert.equal(state.personaSrc.name, "元の人格名", "the reducer should not mutate the previous state");

  const cleared = context.__reduce(next, { type: "PATCH_PERSONA_META", patch: { src: { name: "" } } });
  assert.equal(cleared.personaSrc.name, "");
  assert.equal(cleared.roster.personas[0].displayName, "", "clearing the name must not resurrect the previous roster label");
});
