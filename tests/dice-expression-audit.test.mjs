import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* CCFOLIA・BCDICEは代入式とダイス式を四則演算・括弧・変数参照だけで解釈する。
   floor()のような関数呼び出し、>=のような比較演算子、素の変数名に混ざる記号は
   いずれもダイスボットで解決できず、セッション中に式が壊れる。
   個別の人格を狙った回帰テストでは同種の混入を検出できないため、
   DB全人格の生成結果を横断的に検査して同類のバグを恒久的に防ぐ。 */

function loadGenerator() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/generator.js", import.meta.url), "utf8"), context);
  return context;
}

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

// 代入式に許されるのは {変数}・整数・+ - * /・括弧・空白だけ。
function arithmeticError(expr) {
  const stripped = String(expr).replace(/\{[^{}]+\}/g, "1");
  const illegal = stripped.replace(/[0-9+\-*/() ]/g, "");
  if (illegal) return `非対応の文字「${illegal}」`;
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return "括弧の対応が不正";
  }
  if (depth !== 0) return "括弧の対応が不正";
  try {
    new Function(`"use strict";return (${stripped});`)();
  } catch (error) {
    return `式として評価できない: ${error.message}`;
  }
  return null;
}

// ダイス式は 2d6 / 18-1d14 / (2+{変数})d(6-{変数}) / 2b4 などの形を取る。
function diceError(roll) {
  const stripped = String(roll).replace(/\{[^{}]+\}/g, "1");
  const illegal = stripped.replace(/[0-9+\-*/()db ]/gi, "");
  if (illegal) return `非対応の文字「${illegal}」`;
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return "括弧の対応が不正";
  }
  return depth === 0 ? null : "括弧の対応が不正";
}

function createState(persona, egoSlots = {}) {
  return {
    charName: persona.name, plName: "", color: "#c8a84b",
    hp: persona.hp, san: persona.san, speed: persona.speed || "1d5", bullets: persona.bullets || "×",
    resS: persona.res_slash || "普通", resP: persona.res_pierce || "普通", resB: persona.res_blunt || "普通",
    initiative: 0, personaSrc: persona, supports: [], enhancements: [], defaultStatuses: null,
    uniqueBuffs: (persona.unique_buffs || []).map((buff, index) => ({
      id: `ub-${index}`, name: buff.name, type: buff.type,
      initial: buff.initial ?? 0, max: buff.max ?? 0, desc: buff.desc || "", place: buff.place || "status"
    })),
    customStatuses: [], egoSlots,
    pas: { name: persona.passive_name || "", cond: persona.passive_cond || "", always: persona.passive_always || "", effect: persona.passive_effect || "" },
    pas2Enabled: false, pas2: { name: "", cond: "", always: "", effect: "" }, deathSupport: null,
    spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "",
    formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "", extraCmd: "",
    outputExclude: {}, ui: {}, inventory: [],
    skills: (persona.skills || []).map((skill) => ({ ...skill }))
  };
}

const allPersonas = [
  ...(db.normal_personas || []).map((persona) => ["通常", persona]),
  ...(db.tokui_personas || []).map((persona) => ["特異点", persona])
];

const egoSlots = {};
["ZAYIN", "TETH", "HE", "WAW", "ALEPH"].forEach((rank) => {
  const found = (db.egos || []).find((ego) => String(ego.rank || "").toUpperCase() === rank);
  if (found) egoSlots[rank] = found;
});

const VARIANTS = [["E.G.O未装備", {}], ["E.G.O装備", egoSlots]];

test("DB全人格の代入式は四則演算だけで構成され、floor等の非対応関数・比較演算子を含まない", () => {
  const { window } = loadGenerator();
  const generator = window.LBT_gen;
  window.DB = db;
  const problems = [];

  allPersonas.forEach(([mode, persona]) => {
    VARIANTS.forEach(([variant, slots]) => {
      const state = createState(persona, slots);
      generator.resolveFormulas(state).forEach((formula) => {
        const error = arithmeticError(formula.expr);
        if (error) problems.push(`${mode}/${persona.name}/${variant} ${formula.name}=${formula.expr} → ${error}`);
      });
    });
  });

  assert.deepEqual(problems, []);
});

test("DB全人格のPALETTE代入式・ダイス式に生の変数名や非対応関数が混入しない", () => {
  const { window } = loadGenerator();
  const generator = window.LBT_gen;
  window.DB = db;
  const problems = [];

  allPersonas.forEach(([mode, persona]) => {
    VARIANTS.forEach(([variant, slots]) => {
      const state = createState(persona, slots);
      const label = `${mode}/${persona.name}/${variant}`;
      generator.buildPalette(state).split("\n").forEach((line) => {
        if (line.startsWith("//")) {
          const error = arithmeticError(line.slice(line.indexOf("=") + 1));
          if (error) problems.push(`${label} ${line} → ${error}`);
          return;
        }
        // ダイス実行行は「<ダイス式>+{MT} ラベル」の形。式部分だけを検査する。
        const executed = line.match(/^([0-9(][^\s]*?)\+\{(?:MT|DM|DT|QB)\}/u);
        if (executed) {
          const error = diceError(executed[1]);
          if (error) problems.push(`${label} ${executed[1]} → ${error}`);
        }
        if (/floor\s*\(|ceil\s*\(|切り捨て\s*\(|NaN|undefined/.test(line)) {
          problems.push(`${label} 非対応トークン: ${line.slice(0, 80)}`);
        }
      });
    });
  });

  assert.deepEqual(problems, []);
});

test("DB全人格のCCFOLIA JSONは、代入式が参照する変数をstatusかparamsで必ず解決できる", () => {
  const { window } = loadGenerator();
  const generator = window.LBT_gen;
  window.DB = db;
  const problems = [];

  allPersonas.forEach(([mode, persona]) => {
    const state = createState(persona);
    const formulas = generator.resolveFormulas(state);
    const json = generator.buildCcfoliaJSON(state);
    const known = new Set([
      ...json.data.status.map((entry) => entry.label),
      ...json.data.params.map((entry) => entry.label),
      ...formulas.map((formula) => formula.name)
    ]);
    formulas.forEach((formula) => {
      (formula.expr.match(/\{[^{}]+\}/g) || []).forEach((token) => {
        const label = token.slice(1, -1);
        if (!known.has(label)) problems.push(`${mode}/${persona.name} ${formula.name} が未定義の ${token} を参照`);
      });
    });
    if (/floor\s*\(|NaN|undefined/.test(JSON.stringify(json))) {
      problems.push(`${mode}/${persona.name} JSONに非対応トークンが混入`);
    }
  });

  assert.deepEqual(problems, []);
});

test("DBの本文データにCCFOLIA・BCDICE非対応の関数表記が混入していない", () => {
  const problems = [];
  const scan = (node, path) => {
    if (Array.isArray(node)) return node.forEach((item, index) => scan(item, `${path}[${index}]`));
    if (node && typeof node === "object") return Object.entries(node).forEach(([key, value]) => scan(value, `${path}.${key}`));
    if (typeof node !== "string") return;
    // 判定成功値の 2d6>=6 のようなダイスボット記法は正当なため、関数表記だけを対象にする。
    if (/(?:floor|ceil|round|trunc)\s*\(|Math\.|切り捨て\s*\(|切り上げ\s*\(/i.test(node)) {
      problems.push(`${path}: ${node.slice(0, 80)}`);
    }
  };
  scan(db, "db");
  assert.deepEqual(problems, []);
});

test("派生スキルの自動d値・d数変数はハイフンを含んでも式と誤解釈されず、変数として登録される", () => {
  const { window } = loadGenerator();
  const generator = window.LBT_gen;
  window.DB = db;
  const state = createState({
    name: "派生検証", hp: 100, san: 45, speed: "1d5",
    passive_name: "", passive_cond: "", passive_always: "", passive_effect: "",
    unique_buffs: [],
    skills: [{
      rank: "スキル4-2", name: "派生スキル", type: "打撃", sin: "憂鬱",
      effect: "使用時：対象の沈潜3ごとにスキルd値-1。スキルd数+1",
      dice: [{ roll: "20-1d15", effect: "" }]
    }]
  });

  const palette = generator.buildPalette(state);
  const statusLabels = generator.buildCcfoliaJSON(state).data.status.map((entry) => entry.label);

  // 生値「S4-2d値」を式へ埋め込むと減算と誤解釈されるため、必ず中括弧付きで出力する。
  assert.match(palette, /\{S4-2d値\}/);
  assert.match(palette, /\{S4-2d数\}/);
  assert.doesNotMatch(palette, /[^{]S4-2d値/);
  assert.equal(statusLabels.includes("S4-2d値"), true);
  assert.equal(statusLabels.includes("S4-2d数"), true);
});
