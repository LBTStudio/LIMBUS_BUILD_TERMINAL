import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const start = source.indexOf("function validateImportData(data) {");
const end = source.indexOf("\nfunction importStateFromFile(", start);
assert.ok(start >= 0 && end > start, "the production import validator is available");
const validatorSource = source.slice(start, end);

function validate(data) {
  const context = { window: {}, IMPORT_GROUPS: [] };
  vm.createContext(context);
  vm.runInContext(validatorSource + "\nglobalThis.__validate = validateImportData;", context);
  return context.__validate(data);
}
const base = (personas) => ({ _lbtRosterOnly: true, schemaVersion: 2, roster: { personas, egos: [], supports: [], spirits: [] } });

test("legacy custom Persona records may share source no=999 when their owned UIDs differ", () => {
  assert.equal(validate(base([
    { uid: "custom-one", no: 999, mode: "custom", src: { no: 999, name: "自作人格A" }, build: null },
    { uid: "custom-two", no: 999, mode: "custom", src: { no: 999, name: "自作人格B" }, build: null }
  ])), null);
});
test("duplicate normal Persona identities are still rejected on roster import", () => {
  assert.match(validate(base([
    { uid: "owned-one", no: 1, mode: "n", src: { no: 1, name: "通常人格" }, build: null },
    { uid: "owned-two", no: 1, mode: "n", src: { no: 1, name: "通常人格" }, build: null }
  ])), /重複人格 n:1/);
});
test("custom Persona identity is validated by UID, not by the shared source placeholder", () => {
  assert.equal(validate(base([
    { uid: "custom-one", no: "custom-one", mode: "custom", src: { no: 999, name: "自作人格A" }, build: null },
    { uid: "custom-two", no: "custom-two", mode: "custom", src: { no: 999, name: "自作人格B" }, build: null }
  ])), null);
});

test("duplicate legacy custom Persona UIDs are allowed through to the migration repair", () => {
  const data = base([
    { uid: "legacy-duplicate", no: 999, mode: "custom", src: { no: 999, name: "自作人格A" }, build: null },
    { uid: "legacy-duplicate", no: 999, mode: "custom", src: { no: 999, name: "自作人格B" }, build: null }
  ]);
  assert.equal(validate(data), null);
});

test("duplicate non-custom roster UIDs remain rejected", () => {
  const data = base([
    { uid: "same-id", no: 1, mode: "n", src: { no: 1, name: "通常人格A" }, build: null },
    { uid: "same-id", no: 2, mode: "n", src: { no: 2, name: "通常人格B" }, build: null }
  ]);
  assert.match(validate(data), /重複uid same-id/);
});
