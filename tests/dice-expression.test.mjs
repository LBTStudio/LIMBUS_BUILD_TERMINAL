import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

function loadGenerator() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function createState() {
  return {
    charName: "式検証", plName: "", color: "#c8a84b", hp: 100, san: 45, speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通", initiative: 0,
    personaSrc: null, supports: [], enhancements: [], defaultStatuses: null, uniqueBuffs: [], customStatuses: [], egoSlots: {}, pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "", outputExclude: {}, ui: {}, inventory: [],
    skills: []
  };
}

test("d値・d数は中括弧付きCCFOLIA式を二重化せず、そのまま補正へ出力する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{ rank: "スキル1", name: "式スキル", type: "打撃", effect: "", dPlus: true, dCnt: true, dPlusLabel: "{強化値}/10", dCntLabel: "{追加数}/10", dVarPlace: "status", dice: [{ roll: "2d6", effect: "" }] }];

  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);
  const statusLabels = json.data.status.map((entry) => entry.label);

  assert.match(palette, /\(2\+\{追加数\}\/10\)d\(6-\{強化値\}\/10-\(\{麻痺\}\*4\+5\)\/9\)/);
  assert.equal(palette.includes("{{強化値}/10}"), false);
  assert.equal(palette.includes("{{追加数}/10}"), false);
  assert.equal(statusLabels.includes("{強化値}/10"), false);
  assert.equal(statusLabels.includes("{追加数}/10"), false);
});

test("中括弧付きの単純変数は二重化せず、JSONでは中身の変数名として登録する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{ rank: "スキル1", name: "変数スキル", type: "打撃", effect: "", dPlus: true, dPlusLabel: "{補正値}", dVarPlace: "status", dice: [{ roll: "1d4", effect: "" }] }];

  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);
  const statusLabels = json.data.status.map((entry) => entry.label);

  assert.match(palette, /1d\(4\+\{補正値\}-\(\{麻痺\}\*4\+5\)\/9\)/);
  assert.equal(palette.includes("{{補正値}}"), false);
  assert.equal(statusLabels.includes("補正値"), true);
  assert.equal(statusLabels.includes("{補正値}"), false);
});

test("変数名決定欄の従来どおりの単純な変数名は自動で中括弧化され、JSONへ登録する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{ rank: "スキル1", name: "従来変数スキル", type: "打撃", effect: "", dPlus: true, dCnt: true, dPlusLabel: "補正値", dCntLabel: "追加数", dVarPlace: "status", dice: [{ roll: "2d6", effect: "" }] }];

  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);
  const statusLabels = json.data.status.map((entry) => entry.label);

  assert.match(palette, /\(2\+\{追加数\}\)d\(6\+\{補正値\}-\(\{麻痺\}\*4\+5\)\/9\)/);
  assert.equal(statusLabels.includes("補正値"), true);
  assert.equal(statusLabels.includes("追加数"), true);
});
