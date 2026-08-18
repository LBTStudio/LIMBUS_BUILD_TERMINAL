import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
    charName: "検証PC", plName: "", color: "#c8a84b", hp: 100, san: 45, speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通", initiative: 0,
    personaSrc: null, supports: [{ id: "s1", name: "壊し砕く打撃", cond: "", effect: "" }], enhancements: [{ id: "e1", name: "燃え上がる闘志", effect: "" }, { id: "e2", name: "進むべき守備", effect: "" }],
    defaultStatuses: null, uniqueBuffs: [], customStatuses: [], skills: [], egoSlots: {}, pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "", outputExclude: {}, ui: {}, inventory: []
  };
}

test("サポート・強化由来の補正はJSONのラベルだけへ出力され、数値ステータスには混入しない", () => {
  const generator = loadGenerator();
  const state = createState();
  const json = generator.buildCcfoliaJSON(state);
  const statusLabels = json.data.status.map((entry) => entry.label);
  const paramLabels = json.data.params.map((entry) => entry.label);

  ["打撃補正", "闘志", "守備威力"].forEach((label) => {
    assert.equal(statusLabels.includes(label), false, `${label} must not be a status`);
    assert.equal(paramLabels.includes(label), true, `${label} must be a param`);
  });
  const mt = generator.resolveFormulas(state).find((formula) => formula.name === "MT");
  assert.match(mt.expr, /\{打撃補正\}/);
  assert.match(mt.expr, /\{闘志\}/);
});
