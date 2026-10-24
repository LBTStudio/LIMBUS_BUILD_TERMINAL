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
const customEquipCase = extractCase('case "EQUIP_CUSTOM_PERSONA": {', 'case "IMPORT_PERSONA_DRAFT":');
const draftImportCase = extractCase('case "IMPORT_PERSONA_DRAFT": {', 'case "SAVE_CUSTOM_PERSONA": {');

function loadReducer(cases) {
  const context = {
    Date, JSON, String, Number, Math, Array, Set, Object,
    window: { DB: { normal_personas: [], tokui_personas: [] } }
  };
  vm.createContext(context);
  vm.runInContext(`
    let uidCounter = 0;
    function makeOwnedUid(prefix) { return prefix + "-test-" + (++uidCounter); }
    function cloneJSON(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function normalizeStatusCollections(state) { return state; }
    function getFactoryDefaultStatuses() { return [{ label: "工場既定", max: 20 }]; }
    function createPersonaBuildSnapshot(state) {
      return { savedAt: 123, personaSrc: cloneJSON(state.personaSrc), egoSlots: cloneJSON(state.egoSlots || {}), inventoryCount: (state.inventory || []).length };
    }
    function inferPersonaKeywords(persona) { return persona.keywords || []; }
    function migrateLegacyDerivedSkills(skills) { return skills; }
    function normalizeStatusLabel(value) { return String(value || ""); }
    function mergeDefaultSelfStatusEntries(base, entries) { return [...(base || []), ...(entries || [])]; }
    function collectSelfManagedStatusEntries() { return []; }
    function detectSelfStatusCandidates() { return []; }
    function captureEquipmentRefs(state) {
      return {
        supportUids: (state.roster?.supports || []).filter((entry) => entry.equipped).map((entry) => entry.uid),
        spiritUid: (state.roster?.spirits || []).find((entry) => entry.equipped)?.uid || null
      };
    }
    function chargeSyncOperation(state) { return state; }
    function reduce(state, action) {
      switch (action.type) {
        ${cases}
        default: return state;
      }
    }
    globalThis.__reduce = reduce;
  `, context);
  return context.__reduce;
}

const blankSlots = () => ({ ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null });
function previousState() {
  return {
    personaMode: "n", personaNo: 1, personaSrc: { no: 1, name: "以前の人格" },
    hp: "90", san: "40", speed: "1d5", inventory: [{ uid: "item-owned-1", itemId: "item-1", quantity: 2 }],
    egoSlots: { ZAYIN: { no: 1, name: "以前のE.G.O" }, TETH: null, HE: null, WAW: null, ALEPH: null }, egoManual: true,
    spirit: "以前の精神", spiritMorale: "士気", spiritConfuse: "混乱", spiritAlways: "精神効果",
    supports: [{ id: "sup-active", name: "以前のサポート" }], deathSupport: { id: "death-1", name: "死亡後" },
    enhancements: [{ id: "enh-1", effect: "以前の強化" }],
    formulas: [{ id: "formula-1", name: "以前の式" }],
    customStatuses: [{ id: "status-1", label: "以前の固有状態" }],
    defaultStatuses: [{ label: "以前の人格専用状態" }],
    selfStatusCandidates: [{ label: "以前の候補" }],
    extraPassives: [{ id: "passive-1", name: "以前の追加パッシブ" }],
    pas2Enabled: true, pas2: { name: "旧パッシブ" },
    pas: { name: "以前のパッシブ", cond: "", always: "", effect: "", quick: "" },
    skills: [{ id: "skill-1", name: "以前のスキル", dice: [] }],
    uniqueBuffs: [],
    roster: {
      personas: [{ uid: "normal-1", no: 1, mode: "n", equipped: true }],
      egos: [],
      supports: [{ uid: "support-1", name: "支援", equipped: true }],
      spirits: [{ uid: "spirit-1", name: "精神", equipped: true }]
    },
    charName: "PC"
  };
}

test("creating a custom Persona preserves shared inventory and saves the previous equipped build", () => {
  const reduce = loadReducer(customEquipCase);
  const next = reduce(previousState(), { type: "EQUIP_CUSTOM_PERSONA", name: "新しい自作人格" });
  assert.deepEqual(Array.from(next.inventory, (item) => item.uid), ["item-owned-1"]);
  assert.equal(next.roster.personas[0].build.savedAt, 123);
  assert.equal(next.personaMode, "custom");
  assert.equal(next.personaSrc.__custom, true);
  assert.deepEqual(JSON.parse(JSON.stringify(next.egoSlots)), blankSlots());
  assert.equal(next.egoManual, false);
  assert.deepEqual(Array.from(next.supports), []);
  assert.equal(next.deathSupport, null);
  assert.equal(next.spirit, "");
  assert.deepEqual(Array.from(next.enhancements), []);
  assert.deepEqual(Array.from(next.formulas), []);
  assert.deepEqual(Array.from(next.customStatuses), []);
  assert.deepEqual(Array.from(next.extraPassives), []);
  assert.ok(next.roster.supports.every((entry) => entry.equipped === false));
  assert.ok(next.roster.spirits.every((entry) => entry.equipped === false));
});

test("importing a new custom Persona draft preserves inventory and isolates prior loadout", () => {
  const reduce = loadReducer(draftImportCase);
  const state = previousState();
  const next = reduce(state, {
    type: "IMPORT_PERSONA_DRAFT",
    persona: {
      no: 999, name: "取り込み自作人格", hp: 120, san: 50, speed: "1d5", bullets: "×",
      res_slash: "普通", res_pierce: "普通", res_blunt: "普通",
      passive_name: "草案パッシブ", passive_cond: "", passive_always: "", passive_effect: "",
      skills: [], unique_buffs: [], extra_passives: [], keywords: [], __custom: true
    },
    provided: { name: true, hp: true, san: true, speed: true, bullets: true, resistances: true, passives: true, skills: true, uniques: true },
    affiliation: null,
    syncRank: null,
    syncMax: false
  });
  assert.deepEqual(Array.from(next.inventory, (item) => item.uid), ["item-owned-1"]);
  assert.equal(next.personaMode, "custom");
  assert.equal(next.personaSrc.name, "取り込み自作人格");
  assert.deepEqual(JSON.parse(JSON.stringify(next.egoSlots)), blankSlots());
  assert.deepEqual(Array.from(next.supports), []);
  assert.equal(next.deathSupport, null);
  assert.equal(next.spirit, "");
  assert.deepEqual(Array.from(next.enhancements), []);
  assert.deepEqual(Array.from(next.formulas), []);
  assert.deepEqual(Array.from(next.customStatuses), []);
  assert.equal(next.defaultStatuses.some((entry) => entry.label === "以前の人格専用状態"), false);
  assert.ok(next.roster.supports.every((entry) => entry.equipped === false));
  assert.ok(next.roster.spirits.every((entry) => entry.equipped === false));
  const owned = next.roster.personas.find((entry) => entry.mode === "custom");
  assert.deepEqual(JSON.parse(JSON.stringify(owned.build.egoSlots)), blankSlots());
  assert.equal(owned.build.egoManual, false);
  assert.deepEqual(Array.from(owned.build.supports), []);
  assert.deepEqual(JSON.parse(JSON.stringify(owned.build.equipmentRefs)), { supportUids: [], spiritUid: null });
});
