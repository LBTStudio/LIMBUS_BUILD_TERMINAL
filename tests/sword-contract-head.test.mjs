import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const db = JSON.parse(readFileSync(new URL("data/db.json", root), "utf8"));
const stateSource = readFileSync(new URL("js/state.js", root), "utf8");

function loadGenerator() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("js/generator.js", root), "utf8"), context);
  return context.window.LBT_gen;
}

function loadStateNormalizer() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return context.window.LBT_normalizeStateShape;
}

function createState() {
  return {
    charName: "剣契頭目", plName: "", color: "#c8a84b", hp: 159, san: 55, speed: "2d3+1", bullets: "×", resS: "抵抗", resP: "普通", resB: "弱点", initiative: 0,
    personaSrc: null, supports: [], enhancements: [], defaultStatuses: null, uniqueBuffs: [], customStatuses: [], skills: [], egoSlots: {},
    pas: { name: "本国剣術", cond: "傲慢x3 共鳴", always: "", effect: "" }, pas2Enabled: false, pas2: { name: "", cond: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "", formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "13", extraCmd: "", outputExclude: {}, ui: {}, inventory: []
  };
}

test("剣契頭目は常時効果・通常効果・斬撃補正ラベルを別の所有元として保持する", () => {
  const head = db.tokui_personas.find((entry) => entry?.name === "剣契頭目" && entry?.no === 16);

  assert.ok(head, "剣契頭目(no:16)が存在する");
  assert.equal(head.passive_always, "斬撃スキル威力+2", "斬撃補正は常時効果として扱う");
  assert.equal(head.passive_effect, "スキル効果で呼吸を得る時、呼吸の保有数が最も少ない味方1名に呼吸2を付与、剣契所属なら代わりに4付与。戦闘に参加した剣契が6名以上なら代わりに全ての味方が呼吸4を得る。戦闘開始時、剣契所属の全ての味方に本国剣術1を付与");
  assert.equal(Object.hasOwn(head, "effect"), false, "旧effectの重複本文を残さない");
  assert.equal(head.passive_effect.includes("斬撃スキル威力+2"), false, "斬撃補正を通常効果本文へ重複させない");

  const slashModifier = head.unique_buffs.find((buff) => buff?.name === "斬撃補正");
  assert.deepEqual(slashModifier, { name: "斬撃補正", type: "その他", initial: 2, max: 2, desc: "斬撃スキル威力+2", place: "params" });
});

test("通常人格として保存済みの剣契頭目は原典どおりの常時効果・通常効果へ移行する", () => {
  const normalizeState = loadStateNormalizer();
  const state = createState();
  state.personaNo = 16;
  state.personaSrc = {
    no: 16, name: "剣契頭目", skills: [],
    passive_always: "",
    passive_effect: "スキル効果で呼吸を得る時、呼吸の保有数が最も少ない味方1名に呼吸2を付与、剣契所属なら代わりに4付与。戦闘に参加した剣契が6名以上なら代わりに全ての味方が呼吸4を得る。戦闘開始時、剣契所属の全ての味方に本国剣術1を付与"
  };
  state.pas = {
    name: "本国剣術", cond: "傲慢x3 共鳴",
    always: state.personaSrc.passive_always, effect: state.personaSrc.passive_effect, quick: ""
  };

  const normalized = normalizeState(state);
  const expected = "スキル効果で呼吸を得る時、呼吸の保有数が最も少ない味方1名に呼吸2を付与、剣契所属なら代わりに4付与。戦闘に参加した剣契が6名以上なら代わりに全ての味方が呼吸4を得る。戦闘開始時、剣契所属の全ての味方に本国剣術1を付与";
  assert.equal(normalized.personaSrc.passive_always, "斬撃スキル威力+2");
  assert.equal(normalized.personaSrc.passive_effect, expected);
  assert.equal(normalized.pas.always, "斬撃スキル威力+2");
  assert.equal(normalized.pas.effect, expected);
});

test("斬撃補正は値付きparamsとして出力し、数値ステータスには混入しない", () => {
  const generator = loadGenerator();
  const state = createState();
  state.uniqueBuffs = [{ id: "ub-slash", name: "斬撃補正", type: "その他", initial: 2, max: 2, desc: "斬撃スキル威力+2", place: "params" }];

  const json = generator.buildCcfoliaJSON(state);
  assert.equal(json.data.status.some((entry) => entry.label === "斬撃補正"), false);
  const slashParam = json.data.params.find((entry) => entry.label === "斬撃補正");
  assert.ok(slashParam, "斬撃補正がparamsへ出力される");
  assert.equal(slashParam.value, "2");
});

test("次のRに得る斬撃威力系は初期ステータス検出の対象外にする", () => {
  assert.match(stateSource, /次のRに斬撃威力増加1を得る/);
  assert.match(stateSource, /\(\?:次のR\|次ラウンド\)/);
});
