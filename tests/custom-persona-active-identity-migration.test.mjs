import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const start = source.indexOf("function normalizeCustomPersonaRosterIdentity(personas) {");
const end = source.indexOf("\nfunction normalizeStateShape(raw)", start);
assert.ok(start >= 0 && end > start, "custom Persona migration helpers exist");
const helperSource = source.slice(start, end);

function migrate(state) {
  const context = { String, Set, Array, Math };
  context.makeOwnedUid = (prefix) => prefix + "-migration-test";
  vm.createContext(context);
  vm.runInContext(helperSource + "\nglobalThis.__normalizeRoster = normalizeCustomPersonaRosterIdentity; globalThis.__resolve = resolveActiveCustomPersonaIdentity;", context);
  const normalized = { ...state, roster: { ...state.roster, personas: context.__normalizeRoster(state.roster.personas) } };
  const identity = context.__resolve(normalized);
  normalized.personaNo = identity.personaNo;
  normalized.roster.personas = normalized.roster.personas.map((entry) => ({
    ...entry,
    equipped: identity.activeUid ? entry.mode === "custom" && String(entry.no) === identity.activeUid : false
  }));
  return normalized;
}

test("legacy active custom Persona follows its source name to the migrated UID", () => {
  const state = {
    personaMode: "custom", personaNo: 999,
    personaSrc: { no: 999, name: "自作人格B", __custom: true },
    roster: { personas: [
      { uid: "custom-a", no: 999, mode: "custom", equipped: false, src: { no: 999, name: "自作人格A" } },
      { uid: "custom-b", no: 999, mode: "custom", equipped: true, src: { no: 999, name: "自作人格B" } }
    ] }
  };
  const next = migrate(state);
  assert.equal(next.personaNo, "custom-b");
  assert.equal(next.roster.personas.find((entry) => entry.uid === "custom-b").equipped, true);
  assert.equal(next.roster.personas.find((entry) => entry.uid === "custom-a").equipped, false);
});

test("ambiguous legacy placeholder becomes a fresh draft identity instead of overwriting an owned Persona", () => {
  const state = {
    personaMode: "custom", personaNo: 999,
    personaSrc: { no: 999, name: "編集中の未登録人格", __custom: true },
    roster: { personas: [
      { uid: "custom-a", no: 999, mode: "custom", equipped: false, src: { no: 999, name: "自作人格A" } },
      { uid: "custom-b", no: 999, mode: "custom", equipped: false, src: { no: 999, name: "自作人格B" } }
    ] }
  };
  const next = migrate(state);
  assert.equal(next.personaNo, "custom-migration-test");
  assert.ok(next.roster.personas.every((entry) => entry.equipped === false));
});

test("current custom UID remains stable and unrelated owned Personas are unequipped", () => {
  const state = {
    personaMode: "custom", personaNo: "custom-b",
    personaSrc: { no: 999, name: "自作人格B", __custom: true },
    roster: { personas: [
      { uid: "custom-a", no: "custom-a", mode: "custom", equipped: true, src: { name: "自作人格A" } },
      { uid: "custom-b", no: "custom-b", mode: "custom", equipped: false, src: { name: "自作人格B" } },
      { uid: "normal-1", no: 1, mode: "n", equipped: true, src: { name: "通常人格" } }
    ] }
  };
  const next = migrate(state);
  assert.equal(next.personaNo, "custom-b");
  assert.equal(next.roster.personas.find((entry) => entry.uid === "custom-b").equipped, true);
  assert.ok(next.roster.personas.filter((entry) => entry.uid !== "custom-b").every((entry) => entry.equipped === false));
});
