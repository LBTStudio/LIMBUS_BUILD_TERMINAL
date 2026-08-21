import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const parserSource = readFileSync(new URL("../js/persona-draft-import.js", import.meta.url), "utf8");

function loadParserApi() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  return context.window;
}

function firestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value || {}).map(([key, entry]) => [key, firestoreValue(entry)])) } };
}

const symbolHeavyGarasumadoDocument = {
  fields: Object.fromEntries(Object.entries({
    isPublic: true,
    name: "記号「A/B」-【検証】の人格　RANK：000　同期MAX",
    status: {
      hp: 150,
      san: 55,
      speed: "{速度}d{D値}+2",
      bullet: 10,
      slash: "普通",
      pierce: "抵抗",
      blunt: "弱点"
    },
    passives: [{
      name: "「常時」/A-B【P】",
      condition: "『対象/味方』-条件：{罪悪}",
      alwaysEffect: "【常時】\n{変数名}/10 を参照する。",
      effect: "効果：『/』・[角括弧]・- を含む。"
    }],
    tactics: [{
      code: "0－2",
      name: "二連斬-【爆】/「再演」",
      attr: "貫通反撃",
      sin: "嫉妬",
      effect: "1d{変数名}/10：命中時、『A/B』を得る。\n【注記】- と「引用」を保持する。"
    }],
    uniques: [{
      name: "指令/「A-B」【固有】",
      type: "中立バフ",
      maxCount: 9,
      effect: "{変数名}：『/』と[ ]、-を含む。\n次行も保持する。"
    }]
  }).map(([key, value]) => [key, firestoreValue(value)]))
};

test("硝子窓URL移行は草案由来の記号・変数ダイス式・改行を別項目へ誤認せず保持する", () => {
  const api = loadParserApi();
  const result = api.LBT_parseGarasumadoPersonaDocument(
    symbolHeavyGarasumadoDocument,
    "https://lbt-garasumado.vercel.app/persona/view/AbCdEfGhIjKlMnOpQrSt"
  );

  assert.equal(result.ok, true);
  assert.equal(result.persona.name, "記号「A/B」-【検証】");
  assert.equal(result.persona.speed, "{速度}d{D値}+2");
  assert.equal(result.persona.passive_name, "「常時」/A-B【P】");
  assert.equal(result.persona.passive_cond, "『対象/味方』-条件:{罪悪}");
  assert.match(result.persona.passive_always, /\{変数名\}\/10/);
  assert.match(result.persona.passive_effect, /『\/』・\[角括弧\]・-を含む/);
  assert.equal(result.persona.skills.length, 1);
  assert.equal(result.persona.skills[0].rank, "スキル0-2");
  assert.equal(result.persona.skills[0].name, "二連斬-【爆】/「再演」");
  assert.equal(result.persona.skills[0].type, "貫通反撃");
  assert.equal(result.persona.skills[0].sin, "嫉妬");
  assert.equal(result.persona.skills[0].dice[0].roll, "1d{変数名}/10");
  assert.match(result.persona.skills[0].dice[0].effect, /『A\/B』/);
  assert.match(result.persona.skills[0].effect, /【注記】- と「引用」を保持する/);
  assert.equal(result.persona.unique_buffs.length, 1);
  assert.equal(result.persona.unique_buffs[0].name, "指令/「A-B」【固有】");
  assert.match(result.persona.unique_buffs[0].desc, /\{変数名\}：『\/』と\[ \]、-を含む。\n次行も保持する。/);
  assert.equal(result.syncRank, "000");
  assert.equal(result.suggestSyncMax, true);
});

test("硝子窓URL移行は全角コロンと異体ハイフンを構造記号として安全に正規化する", () => {
  const api = loadParserApi();
  const result = api.LBT_parseGarasumadoPersonaDocument(
    symbolHeavyGarasumadoDocument,
    "https://lbt-garasumado.vercel.app/persona/view/AbCdEfGhIjKlMnOpQrSt"
  );

  assert.equal(result.persona.skills[0].rank, "スキル0-2");
  assert.equal(result.persona.skills[0].name.includes("－"), false);
  assert.equal(result.persona.skills[0].name.includes("-"), true);
});
