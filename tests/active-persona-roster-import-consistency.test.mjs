import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const start = source.indexOf("function findActiveRosterPersona(state) {");
const end = source.indexOf("\nfunction normalizeStateShape(raw)", start);
assert.ok(start >= 0 && end > start, "active Persona roster resolver exists");
const resolverSource = source.slice(start, end);

function resolve(state) {
  const context = { String, Array };
  vm.createContext(context);
  vm.runInContext(resolverSource + "\nglobalThis.__resolve = findActiveRosterPersona;", context);
  return context.__resolve(state);
}

test("active Persona identity wins over a stale equipped flag on another roster row", () => {
  const active = { mode: "custom", no: "custom-active", uid: "custom-active", equipped: false, build: { savedAt: 2 } };
  const stale = { mode: "custom", no: "custom-stale", uid: "custom-stale", equipped: true, build: { savedAt: 9 } };
  assert.equal(resolve({ personaMode: "custom", personaNo: "custom-active", roster: { personas: [stale, active] } }), active);
});

test("an unrelated equipped row is not selected when the active identity is absent from an imported roster", () => {
  const foreign = { mode: "custom", no: "foreign", uid: "foreign", equipped: true, build: { savedAt: 9 } };
  assert.equal(resolve({ personaMode: "n", personaNo: 42, roster: { personas: [foreign] } }), null);
});

test("legacy state without an active identity still falls back to the equipped roster row", () => {
  const equipped = { mode: "n", no: 3, equipped: true };
  assert.equal(resolve({ personaMode: null, personaNo: null, roster: { personas: [{ mode: "n", no: 1 }, equipped] } }), equipped);
});
