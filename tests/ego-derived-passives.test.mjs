import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");
const otherSections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

function loadStateReducer() {
  const context = { window: { DB: { normal_personas: [], tokui_personas: [], egos: [], default_statuses: [] } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(stateSource, context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

function loadGenerator() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(generatorSource, context);
  return context.window.LBT_gen;
}

function baseState(overrides = {}) {
  return {
    charName: "テスト",
    plName: "PL",
    personaMode: "n",
    personaNo: 1,
    personaSrc: { name: "テスト人格", keywords: [] },
    roster: { personas: [{ uid: "p1", mode: "n", no: 1, equipped: true }], egos: [] },
    hp: "100", san: "45", speed: "1d5", bullets: "×",
    resS: "普通", resP: "普通", resB: "普通",
    skills: [],
    egoSlots: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null },
    supports: [], uniqueBuffs: [], customStatuses: [], enhancements: [],
    pas: { name: "", cond: "", always: "", effect: "", quick: "" },
    pas2Enabled: false,
    pas2: { name: "", cond: "", always: "", effect: "" },
    extraPassives: [],
    deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "",
    formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "",
    ...overrides
  };
}

test("追加パッシブは上限なしで追加・編集・削除できる", () => {
  const { reducer, initState } = loadStateReducer();
  let state = reducer(initState, { type: "HYDRATE", state: baseState() });
  assert.deepEqual(state.extraPassives, []);
  state = reducer(state, { type: "ADD_EXTRA_PASSIVE" });
  state = reducer(state, { type: "ADD_EXTRA_PASSIVE" });
  state = reducer(state, { type: "ADD_EXTRA_PASSIVE" });
  assert.equal(state.extraPassives.length, 3);
  state = reducer(state, { type: "PATCH_EXTRA_PASSIVE", index: 1, patch: { name: "三つ目", always: "常時効果" } });
  assert.equal(state.extraPassives[1].name, "三つ目");
  assert.equal(state.extraPassives[1].always, "常時効果");
  state = reducer(state, { type: "REMOVE_EXTRA_PASSIVE", index: 0 });
  assert.equal(state.extraPassives.length, 2);
  assert.equal(state.extraPassives[0].name, "三つ目");
});

test("旧セーブのパッシブ2は追加パッシブ1件へ移行し、重複しない", () => {
  const { reducer, initState } = loadStateReducer();
  const legacy = baseState({
    pas: { name: "根", cond: "", always: "", effect: "", quick: "" },
    pas2Enabled: true,
    pas2: { name: "旧二つ目", cond: "条件", always: "", effect: "効果" }
  });
  const state = reducer(initState, { type: "HYDRATE", state: legacy });
  assert.equal(state.pas2Enabled, false);
  assert.equal(state.extraPassives.length, 1);
  assert.equal(state.extraPassives[0].name, "旧二つ目");
  const again = reducer(state, { type: "HYDRATE", state });
  assert.equal(again.extraPassives.length, 1);
});

test("E.G.Oの覚醒・侵蝕は派生スキルを任意数保持できる", () => {
  const { reducer, initState } = loadStateReducer();
  const slot = {
    rank: "TETH", no: 15, name: "テストE.G.O",
    kakusei: { name: "覚醒", effect: "本体", dice: [] },
    shinshoku: { effect: "侵蝕本体", dice: [] },
    slotVariants: {
      kakusei: {
        active: "skill", selectedByUser: true,
        branches: {
          skill: {
            name: "覚醒", effect: "本体", dice: [],
            derived: [{ name: "派生A", effect: "a" }, { name: "派生B", effect: "b" }]
          },
          assimilation: { skills: [] },
          influence: {}
        }
      }
    }
  };
  const state = reducer(initState, { type: "HYDRATE", state: baseState({ egoSlots: { ZAYIN: null, TETH: slot, HE: null, WAW: null, ALEPH: null } }) });
  const normalized = state.egoSlots.TETH.kakusei;
  assert.equal(normalized.derived.length, 2);
  assert.equal(normalized.derived[0].name, "派生A");
  assert.equal(normalized.derived[1].kind, "スキル");
});

test("生成側は派生スキルと追加パッシブをすべて出力する", () => {
  const generator = loadGenerator();
  const state = baseState({
    pas: { name: "根パッシブ", cond: "", always: "A", effect: "B", quick: "" },
    extraPassives: [
      { id: "x1", name: "追加1", cond: "", always: "", effect: "E1", quick: "" },
      { id: "x2", name: "追加2", cond: "C2", always: "", effect: "E2", quick: "" }
    ],
    egoSlots: {
      ZAYIN: null,
      TETH: {
        rank: "TETH", no: 15, name: "テストE.G.O", resources: "憤怒x1", san_cost: 10, shards: 50,
        kakusei: { effect: "覚醒本体", dice: [], derived: [{ name: "覚醒派生", effect: "覚醒派生効果", dice: [] }] },
        shinshoku: { effect: "侵蝕本体", dice: [], derived: [{ name: "侵蝕派生", effect: "侵蝕派生効果", dice: [] }] }
      },
      HE: null, WAW: null, ALEPH: null
    }
  });
  const palette = generator.buildPalette(state);
  assert.match(palette, /人格パッシブ【追加1】/);
  assert.match(palette, /人格パッシブ【追加2】/);
  assert.match(palette, /【覚醒2\|TETH】覚醒派生/);
  assert.match(palette, /【侵蝕2\|TETH】侵蝕派生/);
  const memo = generator.buildMemo(state);
  assert.match(memo, /追加2/);
});

test("E.G.O解析の編集面には派生スキルの追加UIがある", () => {
  assert.match(otherSections, /DERIVED SKILLS \/ 派生スキル/);
  assert.match(otherSections, /派生を追加/);
  assert.match(otherSections, /branches\[variant\]\.derived/);
  assert.match(otherSections, /ego-derived-item/);
  assert.match(refinements, /\.ego-derived-item \{/);
  // 編集モデルの往復（ensureSkillShape）で派生配列を落とさない。
  assert.match(otherSections, /derived: Array\.isArray\(skill\.derived\) \? skill\.derived : \[\]/);
});
