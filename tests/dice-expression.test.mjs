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

test("d値・d数の中括弧付き式は除数を固定せず、入力した数値のまま出力する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{ rank: "スキル1", name: "任意除数スキル", type: "打撃", effect: "", dPlus: true, dCnt: true, dPlusLabel: "{威力補正}/3", dCntLabel: "{追加数}/20", dVarPlace: "status", dice: [{ roll: "4d8", effect: "" }] }];

  const palette = generator.buildPalette(state);

  assert.match(palette, /\(4\+\{追加数\}\/20\)d\(8-\{威力補正\}\/3-\(\{麻痺\}\*4\+5\)\/9\)/);
  assert.equal(palette.includes("/10"), false);
});

test("d値のCCFOLIA式は加算・減算を明示選択できる", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{ rank: "スキル1", name: "加減算スキル", type: "打撃", effect: "", dPlus: true, dPlusLabel: "{補正値}/3", dPlusOp: "plus", dVarPlace: "status", dice: [{ roll: "2d6", effect: "" }] }];

  const added = generator.buildPalette(state);
  state.skills[0].dPlusOp = "minus";
  const subtracted = generator.buildPalette(state);

  assert.match(added, /2d\(6\+\{補正値\}\/3-\(\{麻痺\}\*4\+5\)\/9\)/);
  assert.match(subtracted, /2d\(6-\{補正値\}\/3-\(\{麻痺\}\*4\+5\)\/9\)/);
});

test("戦術スキル効果の複数段落は実改行で分断せず、CCFOLIAの\\n挿入として一つのコマンドに保持する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.skills = [{
    rank: "スキル1", name: "改行検証", type: "打撃",
    effect: "使用時：パワーを1得る\nマッチ勝利時：保護を1得る",
    dice: [{ roll: "1d6", effect: "" }]
  }];

  const palette = generator.buildPalette(state);
  assert.match(palette, /効果：▶︎使用時：パワーを1得る\\n▶︎マッチ勝利時：保護を1得る/);
  assert.doesNotMatch(palette, /効果：▶︎使用時：パワーを1得る\n▶︎マッチ勝利時：保護を1得る/);
});
