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

function createState(effect) {
  return {
    charName: "捨てる人格", plName: "", color: "#c8a84b", hp: 100, san: 45, speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通", initiative: 0,
    personaSrc: null, supports: [], enhancements: [], defaultStatuses: null, uniqueBuffs: [], customStatuses: [], egoSlots: {}, pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "", outputExclude: {}, ui: {}, inventory: [],
    skills: [{ rank: "スキル1", name: "選別", type: "打撃", effect, dice: [{ roll: "2d6", effect: "" }] }]
  };
}

test("能動的にスキルを捨てる人格は捨てた枚数を戦術選択とJSONステータスへ追加する", () => {
  const generator = loadGenerator();
  const state = createState("使用時：ランダムなスキルを1つ捨てる");
  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);
  const discarded = json.data.status.find((entry) => entry.label === "捨てた枚数");

  assert.match(palette, /2b\(4-\{捨てた枚数\}\) 【戦術】選択/);
  assert.equal(discarded?.label, "捨てた枚数");
  assert.equal(discarded?.value, 0);
  assert.equal(discarded?.max, 4);
});

test("受動的な捨てられた表現だけでは捨てた枚数を追加しない", () => {
  const generator = loadGenerator();
  const state = createState("このスキルが捨てられたなら、マッチ威力+1");
  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);

  assert.match(palette, /2b4 【戦術】選択/);
  assert.equal(json.data.status.some((entry) => entry.label === "捨てた枚数"), false);
});
