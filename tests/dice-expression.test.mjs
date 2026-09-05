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


test("固有バフ由来の自動代入式は四則演算だけで出力し、閾値比較・floorを生成しない", () => {
  const generator = loadGenerator();
  const state = createState();
  state.uniqueBuffs = [{
    name: "指令の加護",
    max: 9,
    desc: "数値/3だけダメージ量増加。数値が9ならマッチ威力+1"
  }];

  const formulas = generator.resolveFormulas(state);
  const dm = formulas.find((formula) => formula.name === "DM");
  const mt = formulas.find((formula) => formula.name === "MT");

  assert.match(dm.expr, /\(\{指令の加護\}\/3\)/);
  assert.doesNotMatch(dm.expr, /floor|>=|<=|>|</);
  // 閾値条件は比較演算子ではなく、切り捨て除算の商（0か1）で表現する。
  assert.match(mt.expr, /\(\{指令の加護\}\/9\)/);
  assert.doesNotMatch(mt.expr, /floor|>=|<=|>|</);
});


test("上限が閾値の2倍以上ある固有バフは、商が過大になるため閾値条件を式へ変換しない", () => {
  const generator = loadGenerator();
  const state = createState();
  state.uniqueBuffs = [{ name: "呼吸加護", max: 20, desc: "数値が3以上ならマッチ威力+1" }];

  const mt = generator.resolveFormulas(state).find((formula) => formula.name === "MT");
  assert.doesNotMatch(mt.expr, /呼吸加護/);
});


test("被ダメージ量のスケーリングは守備判定のDTへ注入せず、カルマ等をDTから除く", () => {
  const generator = loadGenerator();
  const state = createState();
  state.uniqueBuffs = [{ name: "カルマ", max: 20, desc: "数値/2だけ被ダメージ量増加（最大10）" }];

  const formulas = generator.resolveFormulas(state);
  const dt = formulas.find((formula) => formula.name === "DT");

  assert.doesNotMatch(dt.expr, /カルマ/);
  assert.equal(formulas.some((formula) => /カルマ/.test(formula.expr)), false);
});


test("代入式のfloor・切り捨て関数はCCFOLIA・BCDICE互換の括弧付き四則演算へ正規化する", () => {
  const generator = loadGenerator();
  const state = createState();
  state.builtinFormulasOverride = { DT: "{共鳴}+floor({忍耐}/2)+floor(({守備威力}+1)/3)" };
  state.formulas = [{ id: "f1", name: "SP", expr: "切り捨て({パワー}/4)" }];

  const formulas = generator.resolveFormulas(state);
  const dt = formulas.find((formula) => formula.name === "DT");
  const sp = formulas.find((formula) => formula.name === "SP");

  assert.equal(dt.expr, "{共鳴}+({忍耐}/2)+(({守備威力}+1)/3)");
  assert.equal(sp.expr, "({パワー}/4)");
  assert.doesNotMatch(generator.buildPalette(state), /floor|切り捨て/);
});


test("代入式が参照するラベルは、補正未取得でもparamsへ0で補完して未定義参照を残さない", () => {
  const generator = loadGenerator();
  const state = createState();

  const json = generator.buildCcfoliaJSON(state);
  const statusLabels = json.data.status.map((entry) => entry.label);
  const paramLabels = json.data.params.map((entry) => entry.label);
  const known = new Set([...statusLabels, ...paramLabels]);

  assert.equal(paramLabels.includes("守備威力"), true);
  assert.equal(json.data.params.find((entry) => entry.label === "守備威力").value, "0");
  generator.resolveFormulas(state).forEach((formula) => {
    (formula.expr.match(/\{[^{}]+\}/g) || []).forEach((token) => {
      const label = token.slice(1, -1);
      assert.equal(known.has(label), true, `${formula.name}の参照ラベル ${label} が未定義`);
    });
  });
});


test("自動代入式のPALETTE・CCFOLIA JSON出力にも非対応演算子を残さない", () => {
  const generator = loadGenerator();
  const state = createState();
  state.uniqueBuffs = [{
    name: "人差し指の加護",
    max: 10,
    desc: "数値/10だけダメージ量増加。数値が10ならダメージ量増加+1"
  }];

  const palette = generator.buildPalette(state);
  const json = generator.buildCcfoliaJSON(state);
  const encoded = JSON.stringify(json);

  assert.ok(palette.includes("//DM=") && palette.includes("{人差し指の加護}/10"));
  assert.doesNotMatch(palette, /floor|>=|<=|>/);
  assert.doesNotMatch(encoded, /floor|>=|<=|>/);
});
