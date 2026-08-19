import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadGenerator() {
  const context = { window: { DB: { normal_enhancements: [], special_enhancements: [] } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function createState(syncedManual) {
  return {
    charName: "同期強化検証", plName: "", color: "#c8a84b", hp: 100, san: 45, speed: "1d5", bullets: "×", resS: "普通", resP: "普通", resB: "普通", initiative: 0,
    personaSrc: { name: "検証人格" }, syncedManual, supports: [], enhancements: [
      { id: "normal", name: "通常人格専用", category: "persona", effect: "HPを10上昇" },
      { id: "sync", name: "同期化人格専用", category: "sync", effect: "SANを5上昇" },
      { id: "special", name: "特殊強化共通", category: "special", effect: "HPを5上昇" }
    ], defaultStatuses: null, uniqueBuffs: [], customStatuses: [], egoSlots: {}, pas: { name: "", cond: "", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "", outputExclude: {}, ui: {}, inventory: [], skills: [], roster: { personas: [], egos: [] }, shareOptions: {}
  };
}

test("同期化編集時は未同期専用強化を有効一覧・メモ・パレット・HP補正から除外する", () => {
  const generator = loadGenerator();
  const state = createState(true);
  assert.deepEqual(generator.getActiveEnhancements(state).map((entry) => entry.name), ["同期化人格専用", "特殊強化共通"]);
  assert.doesNotMatch(generator.buildPalette(state), /通常人格専用|HPを10上昇/);
  assert.doesNotMatch(generator.buildMemo(state), /通常人格専用|HPを10上昇/);
  assert.match(generator.buildPalette(state), /同期化人格専用/);
  assert.match(generator.buildPalette(state), /特殊強化共通/);
  const json = generator.buildCcfoliaJSON(state);
  assert.equal(json.data.status.find((entry) => entry.label === "HP")?.value, 105);
  assert.equal(json.data.status.find((entry) => entry.label === "SAN")?.value, 50);
});

test("未同期編集時は未同期専用強化を従来どおり有効にする", () => {
  const generator = loadGenerator();
  const state = createState(false);
  assert.equal(generator.getActiveEnhancements(state).length, 3);
  assert.match(generator.buildPalette(state), /通常人格専用/);
  assert.equal(generator.buildCcfoliaJSON(state).data.status.find((entry) => entry.label === "HP")?.value, 115);
});
