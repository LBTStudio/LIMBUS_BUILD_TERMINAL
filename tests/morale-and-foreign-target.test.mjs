import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

/* 士気低下ライン（SAN最大値の25% / 基本ルールPDF 39頁）と、
   対象へ付与する目印（DBの noST 宣言）の扱いを、DB全体に対して固定する。 */

function loadRuntime() {
  const context = {
    window: {}, console, setTimeout, clearTimeout, Blob, URL,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["../js/state.js", "../js/generator.js"]) {
    vm.runInContext(readFileSync(new URL(file, import.meta.url), "utf8"), context);
  }
  return context.window;
}

const runtime = loadRuntime();
const generator = runtime.LBT_gen;
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const allPersonas = [...(db.normal_personas || []), ...(db.tokui_personas || [])];

function stateFor(persona, overrides = {}) {
  return {
    charName: "検証", plName: "", color: "#c8a84b",
    hp: String(persona.hp ?? 100), san: String(persona.san ?? 50),
    speed: persona.speed || "1d5", bullets: persona.bullets || "×",
    resS: persona.res_slash || "普通", resP: persona.res_pierce || "普通", resB: persona.res_blunt || "普通",
    initiative: 0, personaSrc: persona,
    supports: [], enhancements: [], defaultStatuses: null,
    uniqueBuffs: (persona.unique_buffs || []).map((buff, index) => ({
      id: `ub-${index}`, name: buff.name, type: buff.type || "バフ",
      initial: buff.initial ?? 0, max: buff.max ?? 20, desc: buff.desc || "",
      place: buff.place || "status", noST: buff.noST === true
    })),
    customStatuses: [], egoSlots: {},
    pas: { name: persona.passive_name || "", cond: persona.passive_cond || "", always: persona.passive_always || "", effect: persona.passive_effect || "" },
    pas2Enabled: false, pas2: { name: "", cond: "", always: "", effect: "" },
    deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "",
    formulas: [], builtinFormulasOverride: {}, autoFml: true,
    moraleLine: "", extraCmd: "", outputExclude: {}, ui: {}, inventory: [],
    skills: (persona.skills || []).map((skill, index) => ({ id: `sk-${index}`, ...skill })),
    ...overrides
  };
}

test("士気低下ラインはSAN最大値の25%として自動計算し、固定値を既定にしない", () => {
  const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  // 初期状態が固定数値を持つと、SANの異なる人格でも入力済みとして扱われ自動計算が働かない。
  assert.match(stateSource, /moraleLine: "",/);
  // 旧既定値 "12" を保存データから自動計算へ戻す移行が入っている。
  assert.match(stateSource, /const LEGACY_DEFAULT_MORALE_LINE = "12";/);
  assert.match(stateSource, /migrateLegacyMoraleLine\(next\);/);

  const persona = allPersonas.find((entry) => Number(entry.san) === 55);
  assert.ok(persona, "SAN 55 の人格がDBに存在する");
  const json = generator.buildCcfoliaJSON(stateFor(persona));
  const morale = json.data.params.find((entry) => entry.label === "士気低下ライン");
  assert.equal(morale.value, "13", "SAN 55 なら floor(55*0.25)=13");
});

test("士気低下ラインは手動入力があればその値を優先する", () => {
  const persona = allPersonas[0];
  const json = generator.buildCcfoliaJSON(stateFor(persona, { moraleLine: "7" }));
  const morale = json.data.params.find((entry) => entry.label === "士気低下ライン");
  assert.equal(morale.value, "7");
});

test("士気低下ラインはラベル・チャットパレット・MEMOへ同じ値で出力する", () => {
  const mismatches = [];
  for (const persona of allPersonas) {
    const state = stateFor(persona);
    const expected = String(Math.floor((Number.parseInt(persona.san, 10) || 0) * 0.25));
    const json = generator.buildCcfoliaJSON(state);
    const param = json.data.params.find((entry) => entry.label === "士気低下ライン");
    if (!param || param.value !== expected) mismatches.push(`${persona.name}: params=${param?.value}`);
    if (!generator.buildPalette(state).includes(`士気低下ライン：${expected}`)) mismatches.push(`${persona.name}: パレット`);
    if (!generator.buildMemo(state).includes(`士気低下ライン：${expected}`)) mismatches.push(`${persona.name}: MEMO`);
  }
  assert.deepEqual(mismatches, [], `士気低下ラインの出力が揃っていない: ${mismatches.slice(0, 5).join(" / ")}`);
});

test("対象へ付与する目印は自分のST・ラベル・増減コマンドへ出力しない", () => {
  const leaks = [];
  for (const persona of allPersonas) {
    const declared = (persona.unique_buffs || []).filter((buff) => buff.noST === true);
    if (!declared.length) continue;
    const state = stateFor(persona);
    const json = generator.buildCcfoliaJSON(state);
    const palette = generator.buildPalette(state);
    for (const buff of declared) {
      const label = String(buff.name || "").trim();
      if (!label) continue;
      if (json.data.status.some((entry) => entry.label === label)) leaks.push(`${persona.name}/${label}:status`);
      if (json.data.params.some((entry) => entry.label === label)) leaks.push(`${persona.name}/${label}:params`);
      if (palette.includes(`:${label}+1`)) leaks.push(`${persona.name}/${label}:増減コマンド`);
    }
  }
  assert.deepEqual(leaks, [], `対象付与専用の値が自分の管理値として出力された: ${leaks.slice(0, 5).join(" / ")}`);
});

test("対象へ付与する目印も説明としては残し、付与先が対象であることを明示する", () => {
  // 「指令対象」は敵1名に付与される目印。自分の初期値は持たないが、参照のため説明は残す。
  const persona = allPersonas.find((entry) => (entry.unique_buffs || []).some((buff) => buff.name === "指令対象"));
  assert.ok(persona, "指令対象を持つ人格がDBに存在する");
  const state = stateFor(persona);
  const palette = generator.buildPalette(state);
  const memo = generator.buildMemo(state);
  assert.match(palette, /【指令対象】（中立バフ） 対象に付与/);
  assert.match(memo, /指令対象（中立バフ、対象に付与/);
  // 自分が保持する値は従来どおり初期値と増減コマンドを持つ。
  assert.match(palette, /【指令の加護】（バフ） 初期0/);
  assert.ok(palette.includes(":指令の加護+1"));
});

test("自分が保持する固有値はSTと増減コマンドの両方へ出力し続ける", () => {
  const missing = [];
  for (const persona of allPersonas) {
    const state = stateFor(persona);
    const json = generator.buildCcfoliaJSON(state);
    const palette = generator.buildPalette(state);
    for (const buff of persona.unique_buffs || []) {
      if (buff.noST === true) continue;
      const label = String(buff.name || "").trim();
      if (!label) continue;
      if (json.data.status.some((entry) => entry.label === label) && !palette.includes(`:${label}+1`)) {
        missing.push(`${persona.name}/${label}`);
      }
    }
  }
  assert.deepEqual(missing, [], `STにあるのに増減コマンドがない: ${missing.slice(0, 5).join(" / ")}`);
});

test("DBの noST 宣言は装備・下書き取り込み・自作保存のすべてで保持する", () => {
  const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  // 宣言が失われると、対象付与専用の値が自分のSTへ復活してしまう。
  const propagations = stateSource.match(/noST: (?:b|buff)\.noST === true/g) || [];
  assert.ok(propagations.length >= 4, `noST の伝播が4経路に足りない: ${propagations.length}`);
});
