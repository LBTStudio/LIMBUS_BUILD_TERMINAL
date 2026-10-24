import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const saveStart = source.indexOf('case "SAVE_CUSTOM_PERSONA": {');
const saveEnd = source.indexOf('case "SAVE_PERSONA_BUILD": {', saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "custom Persona save reducer is present");
const caseCode = source.slice(saveStart, saveEnd);
const cloneStart = source.indexOf("function cloneJSON(obj) {");
const cloneEnd = source.indexOf("\n}", cloneStart) + 2;
const snapshotStart = source.indexOf("function createPersonaBuildSnapshot(state) {");
const snapshotEnd = source.indexOf("\n}", snapshotStart) + 2;
assert.ok(cloneStart >= 0 && cloneEnd > cloneStart, "JSON clone helper is present");
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, "Persona build snapshot helper is present");

function loadReducer() {
  const context = { Date, JSON, String, Number, Math };
  vm.createContext(context);
  vm.runInContext(`
    ${source.slice(cloneStart, cloneEnd)}
    function captureEquipmentRefs(state) { return { captured: true, egoSlots: cloneJSON(state.egoSlots || {}) }; }
    function makeOwnedUid(prefix) { return prefix + "-test-uid"; }
    ${source.slice(snapshotStart, snapshotEnd)}
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

function fixture(existing = true) {
  const oldBuild = { savedAt: 1, personaSrc: { name: "古い保存内容" }, skills: [{ name: "古いスキル" }] };
  return {
    personaMode: "custom",
    personaNo: "custom-alpha",
    personaSrc: {
      no: 999, name: "試験人格", __custom: true, hp: 120, san: 50,
      skills: [{ rank: "スキル0", name: "基礎", dice: [] }], unique_buffs: []
    },
    hp: "123", san: "51", speed: "1d5+1", bullets: "4",
    resS: "普通", resP: "抵抗", resB: "弱点",
    pas: { name: "主パッシブ", cond: "憤怒×2", always: "常時", effect: "主効果" },
    extraPassives: [{ id: "p2", name: "副パッシブ", cond: "傲慢×1", always: "開始時", effect: "副効果", quick: "短縮" }],
    skills: [{
      rank: "スキル4-2", derived_from: "スキル4", derived_index: 2, derived_condition: "前提スキル使用",
      type: "貫通", sin: "憂鬱", name: "派生スキル", quick: "短縮", dice: [{
        roll: "2d10", d: "10", dval: "10", plus: true, dPlus: true, dCnt: true, effect: "的中時効果"
      }]
    }],
    uniqueBuffs: [{ id: "ub1", name: "固有", type: "バフ", initial: 1, max: 9, desc: "効果", noST: true }],
    egoSlots: { ZAYIN: { rank: "ZAYIN", no: 7 }, TETH: null, HE: null, WAW: null, ALEPH: null },
    supports: [{ id: "sp1", name: "サポート", effect: "支援" }],
    deathSupport: { id: "sp-death", name: "死亡後", effect: "死亡時" },
    spirit: "精神", spiritMorale: "士気", spiritConfuse: "混乱", spiritAlways: "精神効果",
    enhancements: [{ id: "enh1", name: "強化" }],
    formulas: [{ id: "f1", name: "代入式" }],
    customStatuses: [{ id: "st1", label: "状態" }],
    defaultStatuses: [{ label: "既定状態" }],
    selfStatusCandidates: [{ label: "候補" }],
    roster: { personas: existing ? [{
      uid: "custom-alpha", no: "custom-alpha", mode: "custom", equipped: true,
      src: { name: "旧定義" }, build: oldBuild, notes: "保持"
    }] : [], egos: [], supports: [], spirits: [] }
  };
}

test("saving a custom Persona preserves derived-skill metadata and all die fields", () => {
  const reduce = loadReducer();
  const next = reduce(fixture(), { type: "SAVE_CUSTOM_PERSONA" });
  const saved = next.roster.personas[0].src.skills[0];
  assert.equal(saved.derived_from, "スキル4");
  assert.equal(saved.derived_index, 2);
  assert.equal(saved.derived_condition, "前提スキル使用");
  assert.equal(saved.dice[0].d, "10");
  assert.equal(saved.dice[0].dval, "10");
  assert.equal(saved.dice[0].plus, true);
  assert.equal(saved.dice[0].dPlus, true);
  assert.equal(saved.dice[0].dCnt, true);
  assert.equal(saved.dice[0].effect, "的中時効果");
});

test("saving a custom Persona replaces stale build with the current full build", () => {
  const reduce = loadReducer();
  const next = reduce(fixture(), { type: "SAVE_CUSTOM_PERSONA" });
  const entry = next.roster.personas[0];
  assert.equal(entry.build.personaSrc.name, "試験人格");
  assert.equal(entry.build.hp, "123");
  assert.equal(entry.build.extraPassives[0].name, "副パッシブ");
  assert.equal(entry.build.egoSlots.ZAYIN.no, 7);
  assert.equal(entry.build.supports[0].name, "サポート");
  assert.equal(entry.build.deathSupport.name, "死亡後");
  assert.equal(entry.build.spirit, "精神");
  assert.equal(entry.build.enhancements[0].name, "強化");
  assert.equal(entry.build.formulas[0].name, "代入式");
  assert.equal(entry.build.customStatuses[0].label, "状態");
  assert.equal(entry.src.extra_passives[0].name, "副パッシブ");
  assert.equal(entry.notes, "保持");
});

test("first custom Persona save creates a full build snapshot", () => {
  const reduce = loadReducer();
  const next = reduce(fixture(false), { type: "SAVE_CUSTOM_PERSONA" });
  assert.equal(next.roster.personas.length, 1);
  assert.equal(next.roster.personas[0].uid, "custom-alpha");
  assert.ok(next.roster.personas[0].build);
  assert.equal(next.roster.personas[0].build.egoSlots.ZAYIN.no, 7);
});
