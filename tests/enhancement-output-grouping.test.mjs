import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

function loadGenerator() {
  const context = { window: { DB: { items: [] } }, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function createState(outputExclude = {}) {
  return {
    charName: "強化検証", plName: "", color: "#c8a84b", hp: 100, san: 45, speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通", initiative: 0,
    personaSrc: null, roster: { personas: [], egos: [] }, supports: [], enhancements: [
      { id: "enh-1", name: "肉体強化X-1", effect: "HPを10増加" },
      { id: "enh-2", name: "精神強化X-1", effect: "SANを5増加" }
    ],
    defaultStatuses: null, uniqueBuffs: [], customStatuses: [], skills: [], egoSlots: {}, pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "", outputExclude, ui: {}, inventory: []
  };
}

test("特殊強化はチャットパレット上で一つのカテゴリにまとまり、一括でJSON出力から除外できる", () => {
  const generator = loadGenerator();
  const state = createState();
  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(createState({ palette: { "特殊強化": true } }));

  assert.equal((palette.match(/### ■ 特殊強化/g) || []).length, 1);
  assert.match(palette, /・【肉体強化X-1】/);
  assert.match(palette, /・【精神強化X-1】/);
  assert.doesNotMatch(palette, /\n【肉体強化X-1】/);
  assert.doesNotMatch(json.data.commands, /肉体強化X-1|精神強化X-1/);
});
