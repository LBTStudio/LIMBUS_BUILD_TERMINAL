import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const personaCodex = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const otherSections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

function loadGenerator() {
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context.window.LBT_gen;
}

function loadStateReducer() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

function createState({ syncMax = true, showSyncRank = true, showSyncRankInOutput = false, name = "剣契殺手 サンの人格" } = {}) {
  return {
    charName: "サン",
    plName: "PL",
    personaMode: "n",
    personaNo: 1,
    personaSrc: { name, keywords: [] },
    roster: { personas: [{ uid: "persona-1", mode: "n", no: 1, syncRank: "00", syncMax }], egos: [] },
    shareOptions: { showSyncRank, showSyncRankInOutput },
    hp: "100",
    san: "45",
    speed: "1d5",
    bullets: "×",
    resS: "普通",
    resP: "普通",
    resB: "普通",
    skills: [],
    egoSlots: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null },
    supports: [],
    uniqueBuffs: [],
    customStatuses: [],
    enhancements: [],
    pas: { name: "", cond: "", always: "", effect: "" },
    pas2Enabled: false,
    pas2: { name: "", cond: "", effect: "" },
    deathSupport: null,
    spirit: "",
    spiritAlways: "",
    spiritMorale: "",
    spiritConfuse: "",
    formulas: [],
    builtinFormulasOverride: {},
    autoFml: true,
    moraleLine: "12",
    extraCmd: "",
  };
}

test("同期MAXは人格名の[MAX]表記と共有HTMLの同期情報へ反映される", () => {
  const generator = loadGenerator();
  const state = createState();
  const memo = generator.buildMemo(state);
  const html = generator.buildShareSheetHTML(state);

  assert.match(memo, /人格：剣契殺手 サンの人格 \[MAX\]/);
  assert.match(html, /剣契殺手 サンの人格 \[MAX\]/);
  assert.match(html, /同期00/);
  assert.match(html, /同期MAX/);
});

test("共有HTMLは人格・HP・SAN・同期MAXを先頭サマリーへ集約し、サポートの常時・通常効果を一体表示する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.supports = [{
    name: "連携援護", lp: 50, cond: "常時",
    always: "戦闘開始時、味方全体に保護1を付与",
    effect: "味方が攻撃的中時、対象へ振動1を付与"
  }];
  const html = generator.buildShareSheetHTML(state);

  assert.match(html, /share-at-a-glance/);
  assert.match(html, /HP 100/);
  assert.match(html, /SAN 45/);
  assert.match(html, /eff eff-joined/);
  assert.match(html, /常時:<\/b> 戦闘開始時、味方全体に保護1を付与/);
  assert.match(html, /効果:<\/b> 味方が攻撃的中時、対象へ振動1を付与/);
});

test("共有HTMLの同期ランク表示を無効化しても同期MAX表記は保持される", () => {
  const generator = loadGenerator();
  const html = generator.buildShareSheetHTML(createState({ showSyncRank: false }));

  assert.doesNotMatch(html, />同期00</);
  assert.match(html, /剣契殺手 サンの人格 \[MAX\]/);
  assert.match(html, /同期MAX/);
});

test("不正な同期ランクは共有HTML・MEMO・PALETTEへ表示しない", () => {
  const generator = loadGenerator();
  const state = createState({ showSyncRankInOutput: true });
  state.roster.personas[0].syncRank = "IV";

  assert.doesNotMatch(generator.buildShareSheetHTML(state), /同期IV/);
  assert.doesNotMatch(generator.buildMemo(state), /同期ランク：IV/);
  assert.doesNotMatch(generator.buildPalette(state), /同期ランク：IV/);
});

test("同期ランクのMEMO・PALETTE出力は設定時のみ反映され、MAX表記を保持する", () => {
  const generator = loadGenerator();
  const hidden = createState();
  const shown = createState({ showSyncRankInOutput: true });

  assert.doesNotMatch(generator.buildMemo(hidden), /同期ランク：00/);
  assert.doesNotMatch(generator.buildPalette(hidden), /同期ランク：00/);
  assert.match(generator.buildMemo(shown), /人格：剣契殺手 サンの人格 \[MAX\]/);
  assert.match(generator.buildMemo(shown), /同期ランク：00/);
  assert.match(generator.buildPalette(shown), /### ■ 人格情報/);
  assert.match(generator.buildPalette(shown), /人格：剣契殺手 サンの人格 \[MAX\]/);
  assert.match(generator.buildPalette(shown), /同期ランク：00/);
});

test("名称に既存の[MAX]表記がある場合も二重に付与しない", () => {
  const generator = loadGenerator();
  const memo = generator.buildMemo(createState({ name: "剣契殺手 サンの人格 [MAX]" }));

  assert.equal((memo.match(/\[MAX\]/g) || []).length, 1);
});

test("旧保存データを再読込しても同期MAXはfalseで補完される", () => {
  const { reducer, initState } = loadStateReducer();
  const next = reducer(initState, {
    type: "HYDRATE",
    state: { roster: { personas: [{ uid: "legacy", mode: "n", no: 1, syncRank: "00" }], egos: [] } },
  });

  assert.equal(next.roster.personas[0].syncRank, "00");
  assert.equal(next.roster.personas[0].syncMax, false);
  assert.equal(next.shareOptions.showSyncRank, true);
  assert.equal(next.shareOptions.showSyncRankInOutput, false);
});

test("同期MAX設定は人格装備の同期ランク直後に置かれ、人格編集と所持一覧で金色の共通チェック規約を使う", () => {
  const rankEnd = personaCodex.indexOf('syncRank || "\\u2014"))), syncMaxControl');
  const resistanceStart = personaCodex.indexOf('React.createElement("section", { className: "es-resistance"');
  assert.ok(rankEnd >= 0 && resistanceStart > rankEnd, "同期MAX設定は同期ランクと耐性の間に置く");
  assert.match(personaCodex, /className: `es-sync-max-control\$\{entry\.syncMax \? " is-on" : ""\}`/);
  assert.match(personaCodex, /同期ランクとは別・名称と共有に \[MAX\] を反映/);
  assert.match(otherSections, /className: `sync-max-detail-toggle\$\{item\.entry\.syncMax \? " is-on" : ""\}\$\{canModifySyncMax \? "" : " is-readonly"\}`/);
  assert.match(refinements, /\.es-sync-max-toggle input,[\s\S]*?accent-color: var\(--gold\)/);
  assert.match(refinements, /\.sync-max-detail-toggle input \{ width: 18px; height: 18px;/);
});

test("同期MAXの変更は同期化手動編集または未保存カスタム人格に限定し、閲覧状態では無効化する", () => {
  assert.match(personaCodex, /const editable = Boolean\(state\.syncedManual \|\| isCustom && !isSavedCustom\);/);
  assert.match(personaCodex, /disabled: !editable, onChange: \(event\) => editable && dispatch\(\{ type: "PATCH_ROSTER"/);
  assert.match(personaCodex, /className: `es-sync-max-toggle\$\{editable \? "" : " is-readonly"\}`/);
  assert.match(otherSections, /const canModifySyncMax = item\.type === "personas" && item\.equipped && canEditPersonaState\(state\);/);
  assert.match(otherSections, /disabled: !canModifySyncMax, onChange: \(event\) => canModifySyncMax && dispatch\(\{ type: "PATCH_ROSTER"/);
  assert.match(refinements, /\.es-sync-max-toggle\.is-readonly,[\s\S]*?cursor: default/);
});
