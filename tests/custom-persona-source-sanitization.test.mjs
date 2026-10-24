import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const validatorStart = appSource.indexOf("function validateImportData(data) {");
const validatorEnd = appSource.indexOf("\nfunction importStateFromFile(", validatorStart);
const sanitizerStart = stateSource.indexOf("function sanitizeStateCollections(raw) {");
const sanitizerEnd = stateSource.indexOf("\n/* Legacy custom Personas", sanitizerStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
assert.ok(sanitizerStart >= 0 && sanitizerEnd > sanitizerStart);
const validatorSource = appSource.slice(validatorStart, validatorEnd);
const sanitizerSource = stateSource.slice(sanitizerStart, sanitizerEnd);

function validate(data) {
  const context = { window: {}, IMPORT_GROUPS: [] };
  vm.createContext(context);
  vm.runInContext(validatorSource + "\nglobalThis.__validate = validateImportData;", context);
  return context.__validate(data);
}
function sanitize(raw) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(sanitizerSource + "\nglobalThis.__sanitize = sanitizeStateCollections;", context);
  return context.__sanitize(raw);
}

test("roster import rejects a malformed Persona source before it can reach equip handlers", () => {
  const error = validate({
    _lbtRosterOnly: true,
    roster: { personas: [{ uid: "custom-bad", no: "custom-bad", mode: "custom", src: "not-an-object" }], egos: [], supports: [], spirits: [] }
  });
  assert.match(error, /roster\.personas\[0\]\.src はオブジェクトではありません/);
});

test("local state sanitization falls back to a valid build source for a malformed custom source", () => {
  const next = sanitize({
    roster: { personas: [{
      uid: "custom-a", no: "custom-a", mode: "custom", src: "broken",
      build: { personaSrc: { no: 999, name: "復元できるソース", skills: [], unique_buffs: [], keywords: [] } }
    }] }
  });
  assert.equal(next.roster.personas[0].src.name, "復元できるソース");
  assert.equal(next.roster.personas[0].src.__custom, true);
  assert.equal(next.roster.personas[0].build.personaSrc.name, "復元できるソース");
});

test("local state sanitization creates a safe editable placeholder when both custom sources are malformed", () => {
  const next = sanitize({
    roster: { personas: [{
      uid: "custom-a", no: "custom-a", mode: "custom", displayName: "名前だけ残る",
      src: "broken", build: { personaSrc: ["also-broken"], skills: "bad" }
    }] }
  });
  const src = next.roster.personas[0].src;
  assert.equal(src.__custom, true);
  assert.equal(src.name, "名前だけ残る");
  assert.ok(Array.isArray(src.skills));
  assert.ok(Array.isArray(src.unique_buffs));
  assert.ok(Array.isArray(next.roster.personas[0].build.skills));
});

test("roster import rejects malformed custom Persona secondary passives instead of silently dropping them", () => {
  const error = validate({
    _lbtRosterOnly: true,
    roster: { personas: [{
      uid: "custom-passive-bad", no: "custom-passive-bad", mode: "custom",
      src: { no: 999, name: "副パッシブ破損", skills: [], unique_buffs: [], extra_passives: "broken" }
    }], egos: [], supports: [], spirits: [] }
  });
  assert.match(error, /extra_passives は配列ではありません/);
});

test("local state sanitization preserves valid secondary passives and removes malformed entries only", () => {
  const next = sanitize({
    roster: { personas: [{
      uid: "custom-passive-safe", no: "custom-passive-safe", mode: "custom",
      src: {
        no: 999, name: "副パッシブ復旧",
        extra_passives: [
          { id: "p1", name: "有効パッシブ", effect: "保持する" },
          null,
          "broken"
        ]
      }
    }] }
  });
  assert.deepEqual(Array.from(next.roster.personas[0].src.extra_passives, (p) => p.name), ["有効パッシブ"]);
});
