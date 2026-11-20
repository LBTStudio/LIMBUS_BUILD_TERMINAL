import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const start = source.indexOf("function migrateLegacyCustomPersonaReferenceKeys(");
const end = source.indexOf("\n/* Reconcile the active custom Persona", start);
assert.ok(start >= 0 && end > start);
const context = { String, Set, Array };
vm.createContext(context);
vm.runInContext(
  source.slice(start, end) + "\nglobalThis.__migrate = migrateLegacyCustomPersonaReferenceKeys;",
  context
);

test("legacy custom:999 favorites expand to all migrated legacy custom Persona UIDs", () => {
  const rawRows = [
    { mode: "custom", no: 999, uid: "custom-a" },
    { mode: "custom", no: "999", uid: "custom-b" },
    { mode: "custom", no: "custom-c", uid: "custom-c" }
  ];
  const normalizedRows = [
    { mode: "custom", no: "custom-a", uid: "custom-a" },
    { mode: "custom", no: "custom-b", uid: "custom-b" },
    { mode: "custom", no: "custom-c", uid: "custom-c" }
  ];
  const result = context.__migrate(rawRows, normalizedRows,
    ["n:1", "custom:999", "custom:custom-a"], ["custom:999"], "custom-b");
  assert.deepEqual(Array.from(result.favorites), ["n:1", "custom:custom-a", "custom:custom-b"]);
  assert.deepEqual(Array.from(result.historyRecent), ["custom:custom-b"]);
});

test("legacy custom history without an active match maps to the first legacy row, and unrelated keys survive", () => {
  const rawRows = [
    { mode: "custom", no: 999, uid: "custom-a" },
    { mode: "custom", no: 999, uid: "custom-b" }
  ];
  const normalizedRows = [
    { mode: "custom", no: "custom-a", uid: "custom-a" },
    { mode: "custom", no: "custom-b", uid: "custom-b" }
  ];
  const result = context.__migrate(rawRows, normalizedRows,
    ["custom:999", "t:4"], ["n:3", "custom:999", "custom:999"], null);
  assert.deepEqual(Array.from(result.favorites), ["custom:custom-a", "custom:custom-b", "t:4"]);
  assert.deepEqual(Array.from(result.historyRecent), ["n:3", "custom:custom-a"]);
});

test("reference migration leaves already-current keys untouched when no legacy placeholder exists", () => {
  const favorites = ["custom:custom-a"];
  const history = ["custom:custom-a"];
  const result = context.__migrate(
    [{ mode: "custom", no: "custom-a", uid: "custom-a" }],
    [{ mode: "custom", no: "custom-a", uid: "custom-a" }],
    favorites, history, "custom-a"
  );
  assert.equal(result.favorites, favorites);
  assert.equal(result.historyRecent, history);
});
