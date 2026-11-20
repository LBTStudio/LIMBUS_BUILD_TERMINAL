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

function loadReducer(caseCode, extra = "") {
  const context = { Date, JSON, String, Number, Math, window: { DB: { normal_personas: [], tokui_personas: [] } } };
  vm.createContext(context);
  vm.runInContext(`
    let ownedId = 0;
    function makeOwnedUid(prefix) { return prefix + "-test-" + (++ownedId); }
    function cloneJSON(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function normalizeExtraPassive(value, index = 0) { return { id: value.id || "pas-extra-" + index, ...value }; }
    function normalizeStatusLabel(value) { return String(value || ""); }
    function migrateLegacyDerivedSkills(skills) { return skills; }
    function createPersonaBuildSnapshot(state) { return { savedAt: 123, personaSrc: cloneJSON(state.personaSrc), skills: cloneJSON(state.skills || []) }; }
    function captureEquipmentRefs(state) { return {}; }
    function mergeDefaultSelfStatusEntries() { return []; }
    function collectSelfManagedStatusEntries() { return []; }
    function detectSelfStatusCandidates() { return []; }
    function getFactoryDefaultStatuses() { return []; }
    function normalizeStatusCollections(state) { return state; }
    ${extra}
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

test("SAVE_PERSONA_BUILD assigns custom UID and no from the same active identity", () => {
  const reduce = loadReducer(extractCase('case "SAVE_PERSONA_BUILD": {', 'case "CLEAR_PERSONA_BUILD": {'));
  const state = {
    personaMode: "custom", personaNo: "custom-alpha",
    personaSrc: { no: 999, name: "自作人格", __custom: true },
    skills: [{ name: "編集スキル" }],
    roster: { personas: [] }
  };
  const next = reduce(state, { type: "SAVE_PERSONA_BUILD" });
  const entry = next.roster.personas[0];
  assert.equal(entry.uid, "custom-alpha");
  assert.equal(entry.no, "custom-alpha");
  assert.equal(entry.src.name, "自作人格");
  assert.equal(entry.build.personaSrc.name, "自作人格");
});

test("SAVE_PERSONA_BUILD repairs an existing custom row with a mismatched UID", () => {
  const reduce = loadReducer(extractCase('case "SAVE_PERSONA_BUILD": {', 'case "CLEAR_PERSONA_BUILD": {'));
  const state = {
    personaMode: "custom", personaNo: "custom-alpha",
    personaSrc: { no: 999, name: "自作人格", __custom: true },
    skills: [],
    roster: { personas: [{ uid: "pr-old", no: "custom-alpha", mode: "custom", src: { name: "旧定義" }, notes: "保持" }] }
  };
  const next = reduce(state, { type: "SAVE_PERSONA_BUILD" });
  assert.equal(next.roster.personas[0].uid, "custom-alpha");
  assert.equal(next.roster.personas[0].no, "custom-alpha");
  assert.equal(next.roster.personas[0].notes, "保持");
});

test("equipping a custom source restores its extra passives and preserves a zero unique-buff maximum", () => {
  const reduce = loadReducer(extractCase('case "EQUIP_PERSONA": {', 'case "UNEQUIP_PERSONA":'), `
    function normalizeStatusLabel(value) { return String(value || ""); }
  `);
  const state = {
    personaMode: null, personaNo: null, personaSrc: null, syncedManual: false,
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    historyRecent: [], inventory: [], defaultStatuses: [], customStatuses: []
  };
  const source = {
    no: 999, name: "自作人格", __custom: true, keywords: [],
    skills: [], unique_buffs: [{ name: "上限ゼロ", max: 0 }],
    extra_passives: [{ id: "p2", name: "副パッシブ", cond: "条件", always: "常時", effect: "効果" }]
  };
  const next = reduce(state, { type: "EQUIP_PERSONA", mode: "custom", no: "custom-alpha", src: source });
  assert.equal(next.extraPassives[0].name, "副パッシブ");
  assert.equal(next.uniqueBuffs[0].max, 0);
});

test("custom Persona save preserves a zero unique-buff maximum", () => {
  const reduce = loadReducer(extractCase('case "SAVE_CUSTOM_PERSONA": {', 'case "SAVE_PERSONA_BUILD": {'));
  const state = {
    personaMode: "custom", personaNo: "custom-alpha",
    personaSrc: { no: 999, name: "自作人格", __custom: true, skills: [], unique_buffs: [] },
    hp: "100", san: "45", speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通",
    pas: {}, skills: [], extraPassives: [], uniqueBuffs: [{ name: "上限ゼロ", max: 0 }],
    roster: { personas: [] }
  };
  const next = reduce(state, { type: "SAVE_CUSTOM_PERSONA" });
  assert.equal(next.roster.personas[0].src.unique_buffs[0].max, 0);
});
