import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const start = source.indexOf("function buildEquippedDetailPersona(state) {");
const end = source.indexOf("const SyncMaxControl", start);
assert.ok(start >= 0 && end > start, "PersonaCodex exposes isolated persona view helpers");

function loadViews() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    source.slice(start, end)
      + "\nglobalThis.__buildEquipped = buildEquippedDetailPersona;"
      + "\nglobalThis.__buildRoster = buildRosterDetailPersona;"
      + "\nglobalThis.__resolveEntry = resolvePersonaCodexEntry;",
    context
  );
  return context;
}

test("distinct custom roster entries keep distinct UID keys when source no is the shared placeholder", () => {
  const views = loadViews();
  const entries = [
    { uid: "custom-a", no: "custom-a", mode: "custom", src: { no: 999, name: "自作A" } },
    { uid: "custom-b", no: "custom-b", mode: "custom", src: { no: 999, name: "自作B" } }
  ];
  const keys = entries.map((entry) => views.__buildRoster(entry, entry.src).no);
  assert.deepEqual(Array.from(keys), ["custom-a", "custom-b"]);
});

test("saved custom persona builds retain the roster UID instead of personaSrc.no", () => {
  const views = loadViews();
  const entry = {
    uid: "custom-saved",
    no: "custom-saved",
    mode: "custom",
    src: { no: 999, name: "自作人格" },
    build: { savedAt: 2, personaSrc: { no: 999, name: "保存済み人格" }, skills: [] }
  };
  const view = views.__buildRoster(entry, entry.src);
  assert.equal(view.name, "保存済み人格");
  assert.equal(view.no, "custom-saved");
});

test("equipped custom persona detail uses personaNo as its selectable roster key", () => {
  const views = loadViews();
  const state = {
    personaMode: "custom",
    personaNo: "custom-equipped",
    personaSrc: { no: 999, name: "装備中の自作人格" },
    hp: "100", san: "45", speed: "1d5", bullets: "×",
    resS: "普通", resP: "普通", resB: "普通",
    pas: {}, skills: [], uniqueBuffs: [], extraPassives: []
  };
  const entry = { uid: "custom-equipped", no: "custom-equipped", mode: "custom" };
  assert.equal(views.__buildEquipped(state).no, "custom-equipped");
  assert.equal(views.__resolveEntry(entry, entry.src, state).no, "custom-equipped");
});


test("legacy custom roster entries with shared no=999 retain unique owned keys", () => {
  const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const start = stateSource.indexOf("function normalizeCustomPersonaRosterIdentity(personas) {");
  const end = stateSource.indexOf("\nfunction normalizeStateShape(raw)", start);
  assert.ok(start >= 0 && end > start, "state migration exposes isolated custom identity normalizer");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    stateSource.slice(start, end) + "\nglobalThis.__normalize = normalizeCustomPersonaRosterIdentity;",
    context
  );
  const normalized = context.__normalize([
    { uid: "custom-a", no: 999, mode: "custom", src: { no: 999, name: "自作A" } },
    { uid: "custom-b", no: 999, mode: "custom", src: { no: 999, name: "自作B" } }
  ]);
  assert.deepEqual(Array.from(normalized, (entry) => entry.no), ["custom-a", "custom-b"]);
  assert.deepEqual(Array.from(normalized, (entry) => entry.uid), ["custom-a", "custom-b"]);
});

test("legacy custom roster entries without unique UIDs receive distinct stable keys", () => {
  const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const start = stateSource.indexOf("function normalizeCustomPersonaRosterIdentity(personas) {");
  const end = stateSource.indexOf("\nfunction normalizeStateShape(raw)", start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    stateSource.slice(start, end) + "\nglobalThis.__normalize = normalizeCustomPersonaRosterIdentity;",
    context
  );
  const normalized = context.__normalize([
    { no: 999, mode: "custom", src: { no: 999, name: "自作A" } },
    { no: 999, mode: "custom", src: { no: 999, name: "自作B" } }
  ]);
  assert.equal(new Set(Array.from(normalized, (entry) => entry.no)).size, 2);
  assert.ok(normalized.every((entry) => entry.uid === entry.no));
});


test("legacy UID generation never steals a later Persona's valid stable UID", () => {
  const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const start = stateSource.indexOf("function normalizeCustomPersonaRosterIdentity(personas) {");
  const end = stateSource.indexOf("\\nfunction normalizeStateShape(raw)", start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    stateSource.slice(start, end) + "\\nglobalThis.__normalize = normalizeCustomPersonaRosterIdentity;",
    context
  );
  const normalized = context.__normalize([
    { no: 999, mode: "custom", src: { name: "旧形式・UIDなし" } },
    { uid: "custom-legacy-1", no: 999, mode: "custom", src: { name: "既存の安定UID" } }
  ]);
  assert.equal(normalized[1].uid, "custom-legacy-1");
  assert.equal(normalized[1].no, "custom-legacy-1");
  assert.notEqual(normalized[0].uid, normalized[1].uid);
  assert.equal(new Set(Array.from(normalized, (entry) => entry.uid)).size, 2);
});
