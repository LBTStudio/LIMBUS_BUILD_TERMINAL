import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const start = source.indexOf('case "SAVE_CUSTOM_PERSONA": {');
const end = source.indexOf('case "SAVE_PERSONA_BUILD": {', start);
assert.ok(start >= 0 && end > start);
const saveCase = source.slice(start, end);

function reducer() {
  const context = { Date, JSON, String, Number, Math, Array, Set, Object };
  vm.createContext(context);
  vm.runInContext(`
    let uidCounter = 0;
    function makeOwnedUid(prefix) { return prefix + "-test-" + (++uidCounter); }
    function cloneJSON(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function createPersonaBuildSnapshot(state) { return { savedAt: 123, personaSrc: cloneJSON(state.personaSrc), hp: state.hp, san: state.san }; }
    function reduce(state, action) {
      switch (action.type) {
        ${saveCase}
        default: return state;
      }
    }
    globalThis.__reduce = reduce;
  `, context);
  return context.__reduce;
}

function baseState(overrides = {}) {
  return {
    personaMode: "custom", personaNo: "custom-1",
    personaSrc: { __custom: true, name: "Test", hp: 87, san: 42, skills: [], unique_buffs: [], extra_passives: [], keywords: [] },
    hp: "87", san: "42", speed: "1d5", bullets: "×",
    resS: "普通", resP: "普通", resB: "普通",
    pas: { name: "", cond: "", always: "", effect: "" }, skills: [], uniqueBuffs: [], extraPassives: [],
    keywords: [], roster: { personas: [] },
    ...overrides
  };
}

test("valid integer HP/SAN values are saved as numbers", () => {
  const next = reducer()(baseState({ hp: "123", san: "0" }), { type: "SAVE_CUSTOM_PERSONA" });
  assert.equal(next.personaSrc.hp, 123);
  assert.equal(next.personaSrc.san, 0);
  assert.equal(Number.isNaN(next.personaSrc.hp), false);
  assert.equal(Number.isNaN(next.personaSrc.san), false);
});

test("malformed or partial HP/SAN values preserve the previous valid stat instead of saving NaN/truncated values", () => {
  const reduce = reducer();
  for (const value of ["abc", "12abc", "45.5", "9007199254740992", ""]) {
    const next = reduce(baseState({ hp: value, san: value }), { type: "SAVE_CUSTOM_PERSONA" });
    assert.equal(next.personaSrc.hp, 87, `HP fallback for ${JSON.stringify(value)}`);
    assert.equal(next.personaSrc.san, 42, `SAN fallback for ${JSON.stringify(value)}`);
    assert.equal(Number.isNaN(next.personaSrc.hp), false);
    assert.equal(Number.isNaN(next.personaSrc.san), false);
  }
});

test("a valid saved stat remains intact when only the other stat is invalid", () => {
  const next = reducer()(baseState({ hp: "110", san: "n/a" }), { type: "SAVE_CUSTOM_PERSONA" });
  assert.equal(next.personaSrc.hp, 110);
  assert.equal(next.personaSrc.san, 42);
});
