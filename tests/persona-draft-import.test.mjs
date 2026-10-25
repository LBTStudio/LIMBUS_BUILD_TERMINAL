import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const parserSource = readFileSync(new URL("../js/persona-draft-import.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

/* 注意：このファイルの全フィクスチャは同期データである。
 * 実在の硝子窓ドキュメントや草案テキストの写しではなく、
 * 実DBと同じ規則で手書きしたテスト用の値である。
 * したがって、ここに書かれたスキル番号(code)や構造を
 * 公式・原典の番号体系の根拠として引用してはならない。 */

const labeledDraft = `同期MAX草案（作成中）
人格名：「草案テスト人格」
RANK：000
HP：160 SAN：55 速度：1d5+2 弾丸：10
斬撃：普通 貫通：抵抗 打撃：弱点
パッシブ名：白紙の演算
発動条件：憤怒×3保有
常時効果：舞台開始時、予知眼30を得る。
R開始時、予知眼を1減少する。
効果：マッチ開始時、スキル威力+2
パッシブ名：第二の演算
発動条件：心を保有
効果：ダイスd値+1
【戦術スキル１】
スキル名：切断
斬撃：傲慢
使用時：呼吸2を得る
2d9+1：的中時、火傷2を付与
20-1d15：破壊不能ダイス。的中時、振動爆発
【戦術スキル３−２】
スキル名：派生切断
防御：憤怒
6d2：防御成功時、保護1を得る
固有-同期MAX
[予知眼] 中立バフ 最大値:30
効果：数値が0になると過熱状態へ変換する`;

const compactDraft = `「簡略草案人格」
【ステータス】
HP：184 SAN：62 速度：2d2+1 弾丸：22
【パッシブ】
限定型砲剣
発動条件：嫉妬x2保有
常時発動：弾丸を維持する
効果：受けるダメージ-3
0-1：心得 マッチ可能斬撃反撃：嫉妬
2d10
2d10：的中時、出血1を付与
4-4：オーバードライブ 斬撃：嫉妬 広域：3枠
6d6：銃撃。的中時、弾丸を5消費
固有
[オーバーヒート状態] 最大15 中立バフ
効果：R終了時に1減少`;

const fencedGoogleDraft = "```「人差し指伝令：【紙片】 マスカの人格」ランク:000\n【ステータス】\nHP:150 SAN:55 速度:2d3+1\n斬撃:抵抗 貫通:普通 打撃:弱点\n```\n【パッシブ1】\n歪んでしまった伝令/愉悦\n発動条件：傲慢x3 憂鬱x2 保有\n常時発動：R開始時、指令対象を付与\n効果：唯一スキルを1つ捨てる\n【パッシブ2】\n指令に背く者への応援と嘲笑を。\n発動条件：味方に人差し指所属が3人以上\n効果：味方のカルマ獲得量を1増加\n```【戦術】\n0-1：さぁ興じようか 回避：憂鬱\n2d10：回避成功時、ダルタニャンへ通知しない\n1：目を逸らすな 斬撃：傲慢\n2d10：的中時、沈潜3を付与\n4-2：君と云う名の即興劇 斬撃：傲慢\n24-3d7：破壊不能ダイス。的中時、沈潜1を付与\n```\n[指令] 最大1 中立バフ\n特定条件によって指令[紙片]が与えられる\n[指令の加護] 最大9 バフ\n数値/3だけダメージ量増加";

const pdfTableExcerpt = `「旧G社兵士 アリスの人格」 RANK\nHP 150 SAN 45 速度 4d2 斬撃 弱点 貫通 抵抗 打撃 普通 弾丸 ×\n名称 つわものどもが夢の跡\nパッシブ 発動条件 憂鬱x2 保有\n効果 死亡時、両隣の味方にパワー3を付与\n0\n危機予測 回避：憂鬱\n2d10：回避成功時、沈潜2を付与`;

const bareRankDraft = `人格名：「単独ランク草案人格」
HP：165 SAN：50 速度：1d2+2
パッシブ名：確認用
効果：確認
戦術
0
ファウヌス
マッチ可能防御：怠惰
6d2：防御成功時、確認
0-2
ラブポーション
貫通：怠惰
4d3+3：的中時、確認
固有
[空式施術]最大3 デバフ
確認`;

const colonOnlyRankDraft = `人格名：「番号コロン草案人格」
HP：160 SAN：55 速度：1d5+2
パッシブ名：確認用
効果：確認
0：
先制の一撃
斬撃：傲慢
2d9：的中時、確認
０－２ ：
追撃
貫通：嫉妬
3d6：的中時、確認
固有
[確認] 最大1 バフ
確認`;

const completedSections = {
  name: `人差し指ミケの完成人格`,
  status: `RANK：000
HP：160 SAN：55 速度：1d5+2
斬撃：普通 貫通：抵抗 打撃：弱点
パッシブ名：完成用パッシブ
発動条件：傲慢x3保有
効果：確認`,
  skills: `0：
指令を遂行する
斬撃：傲慢
2d9：的中時、確認`,
  uniques: `[指令] 最大1 中立バフ
R開始時、対象を指定する。
[指令の加護] 最大9 バフ
数値に応じて効果が変化する。`
};

/* 同期テストデータ：硝子窓の実公開ドキュメントの写しではない。
 * 個人情報を含まないよう実在の人格名・スキル名だけを借りた合成データで、
 * tactics の code（0-2/4-2 など）も公式の番号体系を写したものではない。
 * 番号体系の一次根拠は原典PDFと docs/derivative-skill-audit.md を参照すること。 */
const garasumadoSyncedDocument = {
  fields: {
    isPublic: { booleanValue: true },
    name: { stringValue: "ロボトミーE.G.O::涙で研ぎ澄まされた剣 ユサの人格 000 同期MAX" },
    status: { mapValue: { fields: {
      hp: { stringValue: "152" }, san: { stringValue: "63" }, speed: { stringValue: "1d7" }, bullet: { integerValue: "0" },
      slash: { stringValue: "普通" }, pierce: { stringValue: "抵抗" }, blunt: { stringValue: "弱点" }
    } } },
    passives: { arrayValue: { values: [{ mapValue: { fields: {
      name: { stringValue: "空虚に堕した心に" }, condition: { stringValue: "傲慢 ×3 保有" }, alwaysEffect: { stringValue: "希望を1得る" }, effect: { stringValue: "守る剣を得る" }
    } } }] } },
    tactics: { arrayValue: { values: [
      { mapValue: { fields: { code: { stringValue: "0-2" }, name: { stringValue: "あなたに勝利を" }, attr: { stringValue: "マッチ可能貫通反撃" }, sin: { stringValue: "憂鬱" }, effect: { stringValue: "2d10+1\n8d2+1" } } } },
      { mapValue: { fields: { code: { stringValue: "4-2" }, name: { stringValue: "小さな希望を灯した我が主よ" }, attr: { stringValue: "貫通" }, sin: { stringValue: "傲慢" }, effect: { stringValue: "25-2d10：的中時、沈潜3付与" } } } }
    ] } },
    uniques: { arrayValue: { values: [{ mapValue: { fields: {
      name: { stringValue: "守る剣" }, type: { stringValue: "バフ" }, maxCount: { integerValue: "1" }, effect: { stringValue: "戦闘開始時、保護2を得る" }
    } } }] } },
    ownerId: { stringValue: "移行しない所有者ID" },
    memo: { stringValue: "移行しないメモ" },
    chatPaletteManual: { stringValue: "移行しないパレット" }
  }
};

function loadParser() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  return context.window.LBT_parsePersonaDraft;
}

function loadParserApi() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  return context.window;
}

function loadStateReducer(db = {}) {
  const context = { window: { DB: { normal_personas: [], tokui_personas: [], default_statuses: [], ...db } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

test("ラベル形式の同期人格草案は基本能力・二つのパッシブ・派生スキル・固有を保持して解析する", () => {
  const parse = loadParser();
  const result = parse(labeledDraft);

  assert.equal(result.ok, true);
  assert.equal(result.persona.name, "草案テスト人格");
  assert.equal(result.persona.hp, 160);
  assert.equal(result.persona.san, 55);
  assert.equal(result.persona.speed, "1d5+2");
  assert.equal(result.persona.bullets, "10");
  assert.equal(result.persona.res_pierce, "抵抗");
  assert.equal(result.secondaryPassive.name, "第二の演算");
  assert.equal(result.persona.skills.length, 2);
  assert.equal(result.persona.skills[1].rank, "スキル3-2");
  assert.equal(result.persona.skills[0].dice[1].roll, "20-1d15");
  assert.equal(result.persona.unique_buffs[0].name, "予知眼");
  assert.equal(result.persona.unique_buffs[0].max, 30);
  assert.equal(result.syncRank, "000");
  assert.equal(result.suggestSyncMax, true);
});

test("簡略形式の同期人格草案も戦術ランク・大罪・ダイス・固有を解析する", () => {
  const parse = loadParser();
  const result = parse(compactDraft);

  assert.equal(result.ok, true);
  assert.equal(result.persona.name, "簡略草案人格");
  assert.equal(result.persona.skills[0].rank, "スキル0-1");
  assert.equal(result.persona.skills[0].type, "マッチ可能斬撃反撃");
  assert.equal(result.persona.skills[0].sin, "嫉妬");
  assert.equal(result.persona.skills[1].aoe, "広域");
  assert.equal(result.persona.skills[1].aoeCount, "3");
  assert.equal(result.persona.unique_buffs[0].max, 15);
});

test("コードフェンス・行内引用名・番号付きパッシブ・見出しなし固有を含むGoogle草案を解析する", () => {
  const result = loadParser()(fencedGoogleDraft);

  assert.equal(result.ok, true);
  assert.equal(result.persona.name, "人差し指伝令：【紙片】 マスカの人格");
  assert.equal(result.persona.hp, 150);
  assert.equal(result.persona.san, 55);
  assert.equal(result.persona.skills.length, 3);
  assert.equal(result.persona.skills[0].rank, "スキル0-1");
  assert.equal(result.persona.skills[2].rank, "スキル4-2");
  assert.equal(result.persona.passive_name, "歪んでしまった伝令/愉悦");
  assert.equal(result.secondaryPassive.name, "指令に背く者への応援と嘲笑を。");
  assert.equal(result.persona.unique_buffs.length, 2);
  assert.equal(result.persona.unique_buffs[0].name, "指令");
  assert.equal(result.syncRank, "000");
});

test("PDF抽出で表構造が崩れた人格データは草案として誤作成せず、基本能力不足で停止する", () => {
  const result = loadParser()(pdfTableExcerpt);

  assert.equal(result.ok, false);
  assert.equal(result.persona.name, "旧G社兵士 アリスの人格");
  assert.equal(result.errors.some((message) => message.includes("HP・SAN・速度")), true);
});

test("速度が文章や未指定の草案は成功扱いにせず、基本能力の記法を明示して停止する", () => {
  const result = loadParser()(`人格名：「ダルタニャン専用テスト人格」
HP：100 SAN：45 速度：早い 3dy希望
パッシブ名：確認用
効果：確認
1：確認スキル 斬撃：傲慢
2d10：的中時、確認`);

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((message) => message.includes("HP・SAN・速度")), true);
});

test("単独ランク行と裸スキル名の草案を解析し、人格名が欠ける実草案は安全停止できる", () => {
  const result = loadParser()(bareRankDraft);

  assert.equal(result.ok, true);
  assert.equal(result.persona.skills.length, 2);
  assert.equal(result.persona.skills[0].rank, "スキル0");
  assert.equal(result.persona.skills[0].name, "ファウヌス");
  assert.equal(result.persona.skills[0].type, "マッチ可能防御");
  assert.equal(result.persona.skills[1].rank, "スキル0-2");
  // 見出し語の「戦術」行がパッシブ効果欄へ吸収されないこと。
  // 吸収されると passive_effect に「確認\n戦術\n0\nファウヌス…」が混入する。
  assert.equal(result.persona.passive_effect, "確認");
});

test("全角半角の番号コロンだけで始まる戦術一覧を、次行のスキル名と属性から解析する", () => {
  const result = loadParser()(colonOnlyRankDraft);

  assert.equal(result.ok, true);
  assert.equal(result.persona.skills.length, 2);
  assert.equal(result.persona.skills[0].rank, "スキル0");
  assert.equal(result.persona.skills[0].name, "先制の一撃");
  assert.equal(result.persona.skills[1].rank, "スキル0-2");
  assert.equal(result.persona.skills[1].name, "追撃");
  assert.equal(result.persona.skills[1].type, "貫通");
});

test("硝子窓の公開人格データは草案の4区分へ変換し、同期ランク・MAX候補と派生反撃を保持する", () => {
  const api = loadParserApi();
  const result = api.LBT_parseGarasumadoPersonaDocument(garasumadoSyncedDocument, "https://lbt-garasumado.vercel.app/persona/view/XY6v8SWFWwJ7Y1VWTlM1");

  assert.equal(result.ok, true);
  assert.equal(result.source.kind, "garasumado");
  assert.equal(result.source.id, "XY6v8SWFWwJ7Y1VWTlM1");
  assert.equal(result.persona.name, garasumadoSyncedDocument.fields.name.stringValue);
  assert.equal(result.persona.hp, 152);
  assert.equal(result.persona.san, 63);
  assert.equal(result.persona.speed, "1d7");
  assert.equal(result.persona.bullets, "×");
  assert.equal(result.persona.res_pierce, "抵抗");
  assert.equal(result.persona.passive_name, "空虚に堕した心に");
  assert.equal(result.persona.skills.length, 2);
  assert.equal(result.persona.skills[0].rank, "スキル0-2");
  assert.equal(result.persona.skills[0].type, "マッチ可能貫通反撃");
  assert.equal(result.persona.skills[1].rank, "スキル4-2");
  assert.equal(result.persona.unique_buffs[0].name, "守る剣");
  assert.equal(result.persona.unique_buffs[0].max, 1);
  assert.equal(result.syncRank, "000");
  assert.equal(result.suggestSyncMax, true);
});

test("人格シートのメモ・強化一覧・チャットパレット・元の戦術を保持する", () => {
  const api = loadParserApi();
  const record = {
    id: "ABCDEF0123456789GHIJ",
    isPublic: true,
    name: "メタデータ保持テスト RANK_000",
    status: { hp: "100", san: "45", speed: "1d5", slash: "普通", pierce: "普通", blunt: "普通", bullet: 0 },
    tactics: [
      { code: "0", name: "試験戦術", attr: "斬撃", sin: "憤怒", effect: "1d5" },
      { code: "3", name: "", attr: "打撃", sin: "憤怒", effect: "" }
    ],
    passive: { name: "試験パッシブ", condition: "", alwaysEffect: "", effect: "" },
    passives: [],
    uniques: [],
    enhancements: ["闘志", "サポートスロット解放"],
    memo: "元シートのメモ",
    chatPaletteAuto: "自動パレットの原文",
    chatPaletteManual: "手動パレットの原文",
    chatPaletteMode: "manual"
  };
  const result = api.LBT_parseGarasumadoPersonaDocument(record, "https://lbt-garasumado.vercel.app/persona/view/ABCDEF0123456789GHIJ");
  assert.equal(result.ok, true);
  assert.equal(result.syncRank, "000", "RANK_000 を同期ランクとして検出する");
  assert.equal(result.persona.passive_name, "試験パッシブ", "空の passives 配列より passive を使う");
  assert.equal(result.extraData.memo, "元シートのメモ");
  assert.deepEqual(JSON.parse(JSON.stringify(result.extraData.enhancements)), ["闘志", "サポートスロット解放"]);
  assert.equal(result.extraData.chatPaletteAuto, "自動パレットの原文");
  assert.equal(result.extraData.chatPaletteManual, "手動パレットの原文");
  assert.equal(result.extraData.chatPaletteMode, "manual");
  assert.equal(result.extraData.originalSheet.tactics[0].effect, "1d5");
  assert.equal(result.extraData.originalSheet.tactics.length, 2, "空欄戦術も元データに残る");
  assert.equal(result.persona.skills.length, 1, "空欄戦術は実装用スキルに変換しない");
  assert.match(result.warnings.join(" "), /空欄／不完全な戦術スロット/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.persona.garasumadoExtras.enhancements)), ["闘志", "サポートスロット解放"]);
});

test("硝子窓URL移行は非公開データと非対応URLを解析済み人格へ変換せず、安全に停止する", () => {
  const api = loadParserApi();
  const privateDocument = structuredClone(garasumadoSyncedDocument);
  privateDocument.fields.isPublic.booleanValue = false;
  const privateResult = api.LBT_parseGarasumadoPersonaDocument(privateDocument, "https://lbt-garasumado.vercel.app/persona/view/XY6v8SWFWwJ7Y1VWTlM1");
  const invalidUrl = api.LBT_parseGarasumadoPersonaUrl("https://example.com/persona/view/XY6v8SWFWwJ7Y1VWTlM1");

  assert.equal(privateResult.ok, false);
  assert.equal(privateResult.persona, null);
  assert.match(privateResult.errors[0], /公開されていない/);
  assert.equal(invalidUrl.ok, false);
  assert.match(invalidUrl.errors[0], /硝子窓の公開人格URL/);
});

test("完成データを区分別に統合し、固有見出しのない指令も明示した固有一覧から登録する", () => {
  const parseSections = loadParser();
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  const result = context.window.LBT_parsePersonaDraftSections(completedSections);

  assert.equal(typeof context.window.LBT_composePersonaDraftSections, "function");
  assert.equal(result.ok, true);
  assert.equal(result.persona.name, "人差し指ミケの完成人格");
  assert.equal(result.persona.skills[0].name, "指令を遂行する");
  assert.equal(result.persona.unique_buffs.length, 2);
  assert.equal(result.persona.unique_buffs[0].name, "指令");
  assert.equal(result.persona.unique_buffs[1].name, "指令の加護");
  assert.equal(result.syncRank, "000");
  assert.equal(typeof parseSections, "function");
});

test("四欄の部分入力は人格名と戦術スキルが空でも、記入済みのステータス・パッシブ・固有だけを解析する", () => {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  const result = context.window.LBT_parsePersonaDraftSections({
    name: "",
    status: "パッシブ名：部分入力パッシブ\n発動条件：確認\n効果：確認",
    skills: "",
    uniques: "[指令] 最大1 中立バフ\n確認"
  });

  assert.equal(result.ok, true);
  assert.equal(result.provided.name, false);
  assert.equal(result.provided.skills, false);
  assert.equal(result.provided.passives, true);
  assert.equal(result.provided.uniques, true);
  assert.equal(result.persona.name, "テキスト反映人格");
  assert.equal(result.persona.unique_buffs[0].name, "指令");
});

test("ファイル名側の蜘蛛の巣を除外し、同期草案本文の東部親指元アンダーボスを人格名として採用する", () => {
  const parse = loadParser();
  const result = parse(`人格名：【蜘蛛の巣 親指の親方 ユサの人格】
同期 ＭＡＸ　草案 （作成中）
人格 名 ： 「東部親指元アンダーボス ユサの人格」
ＲＡＮＫ：０００
ＨＰ：１６０　ＳＡＮ：５５　速度：１ｄ５＋２　弾丸：１０
斬撃：普通　貫通：抵抗　打撃：弱点
パッシブ 名：本文パッシブ
発動 条件：憤怒×３保有
効果：本文の効果
【 戦術 スキル １ 】
スキル 名：本文スキル
斬撃：傲慢
２ｄ９：的中時、火傷２を付与
固有 − 同期ＭＡＸ
[本文固有] バフ 最大値：３０
効果：本文の固有効果`);

  assert.equal(result.ok, true);
  assert.equal(result.nameSource, "sync-draft");
  assert.equal(result.persona.name, "東部親指元アンダーボス ユサの人格");
  assert.equal(result.persona.hp, 160);
  assert.equal(result.persona.skills[0].name, "本文スキル");
  assert.equal(result.persona.unique_buffs[0].name, "本文固有");
  assert.equal(result.syncRank, "000");
  assert.equal(result.suggestSyncMax, true);
});

test("解析済み草案は既存人格を消さず、手動編集可能なカスタム人格として装備する", () => {
  const parse = loadParser();
  const parsed = parse(labeledDraft);
  const { reducer, initState } = loadStateReducer();
  const existing = { ...initState, roster: { personas: [{ uid: "keep", mode: "n", no: 1, equipped: true }], egos: [] } };
  const next = reducer(existing, { type: "IMPORT_PERSONA_DRAFT", persona: parsed.persona, secondaryPassive: parsed.secondaryPassive, syncRank: parsed.syncRank, syncMax: true });

  assert.equal(next.personaMode, "custom");
  assert.equal(next.syncedManual, true);
  assert.equal(next.personaSrc.name, "草案テスト人格");
  assert.equal(next.extraPassives.length, 1);
  assert.equal(next.extraPassives[0].name, "第二の演算");
  assert.equal(next.pas2Enabled, false);
  assert.equal(next.skills.length, 2);
  assert.equal(next.roster.personas.length, 2);
  assert.equal(next.roster.personas[0].equipped, false);
  assert.equal(next.roster.personas[1].syncRank, "000");
  assert.equal(next.roster.personas[1].syncMax, true);
});

test("草案取込の失敗は人格名または戦術スキルがない場合に適用前で止まる", () => {
  const parse = loadParser();
  const result = parse("HP：100\nSAN：45\n速度：1d5");

  assert.equal(result.ok, false);
  assert.equal(result.errors.length >= 2, true);
});

test("草案の同期帰属先を選ぶと、既存人格のmode/noを維持した同期編集ビルドとして保存・再装備する", () => {
  const parse = loadParser();
  const parsed = parse(labeledDraft);
  const official = { no: 17, name: "既存の通常人格", hp: 100, san: 45, speed: "1d5", bullets: "×", skills: [], unique_buffs: [], keywords: [] };
  const { reducer, initState } = loadStateReducer({ normal_personas: [official] });
  const existing = {
    ...initState,
    roster: { personas: [{ uid: "official-17", mode: "n", no: 17, equipped: false, notes: "既存メモ" }], egos: [] }
  };
  const next = reducer(existing, { type: "IMPORT_PERSONA_DRAFT", persona: parsed.persona, secondaryPassive: parsed.secondaryPassive, syncRank: parsed.syncRank, syncMax: true, affiliation: { mode: "n", no: 17 } });

  assert.equal(next.personaMode, "n");
  assert.equal(next.personaNo, 17);
  assert.equal(next.syncedManual, true);
  assert.equal(next.personaSrc.name, "草案テスト人格");
  assert.equal(next.personaSrc.__custom, false);
  assert.equal(next.personaSrc.__affiliation.mode, "n");
  assert.equal(next.personaSrc.__affiliation.no, 17);
  assert.equal(next.roster.personas.length, 1);
  assert.equal(next.roster.personas[0].mode, "n");
  assert.equal(next.roster.personas[0].no, 17);
  assert.equal(next.roster.personas[0].displayName, "草案テスト人格");
  assert.equal(next.roster.personas[0].syncRank, "000");
  assert.equal(next.roster.personas[0].syncMax, true);
  assert.equal(next.roster.personas[0].build.personaSrc.name, "草案テスト人格");
  assert.equal(official.name, "既存の通常人格");

  const restored = reducer(next, { type: "EQUIP_PERSONA", mode: "n", no: 17, src: official });
  assert.equal(restored.personaMode, "n");
  assert.equal(restored.personaNo, 17);
  assert.equal(restored.personaSrc.name, "草案テスト人格");
  assert.equal(restored.syncedManual, true);
  assert.equal(restored.skills[0].name, "切断");
});

test("既存人格へ同期草案を取り込んでも既存の同期ランクとMAXを消さない（加算のみ）", () => {
  const parse = loadParser();
  const parsed = parse(labeledDraft);
  const official = { no: 17, name: "既存の通常人格", hp: 100, san: 45, speed: "1d5", bullets: "×", skills: [], unique_buffs: [], keywords: [] };
  const { reducer, initState } = loadStateReducer({ normal_personas: [official] });
  const existing = {
    ...initState,
    roster: { personas: [{ uid: "official-17", mode: "n", no: 17, equipped: true, syncRank: "000", syncMax: true }], egos: [] }
  };

  const next = reducer(existing, { type: "IMPORT_PERSONA_DRAFT", persona: parsed.persona, secondaryPassive: parsed.secondaryPassive, syncRank: null, syncMax: false, affiliation: { mode: "n", no: 17 } });

  assert.equal(next.roster.personas[0].syncRank, "000");
  assert.equal(next.roster.personas[0].syncMax, true);
  assert.equal((next.entries || []).length, (existing.entries || []).length);

  const upgradeBase = { ...existing, roster: { personas: [{ uid: "official-17", mode: "n", no: 17, equipped: true, syncRank: "0", syncMax: false }], egos: [] } };
  const upgraded = reducer(upgradeBase, { type: "IMPORT_PERSONA_DRAFT", persona: parsed.persona, secondaryPassive: parsed.secondaryPassive, syncRank: "000", syncMax: true, affiliation: { mode: "n", no: 17 } });
  assert.equal(upgraded.roster.personas[0].syncRank, "000");
  assert.equal(upgraded.roster.personas[0].syncMax, true);
});

test("人格名と戦術が空の部分入力を既存人格へ同期反映すると、未入力区分を維持して固有だけを更新する", () => {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  const partial = context.window.LBT_parsePersonaDraftSections({ name: "", status: "", skills: "", uniques: "[指令] 最大1 中立バフ\n確認" });
  const official = { no: 18, name: "手動帰属人格", hp: 111, san: 44, speed: "2d2", bullets: "8", res_slash: "抵抗", res_pierce: "普通", res_blunt: "弱点", passive_name: "既存パッシブ", skills: [{ rank: "スキル0", name: "既存戦術", dice: [] }], unique_buffs: [], keywords: [] };
  const { reducer, initState } = loadStateReducer({ normal_personas: [official] });
  const next = reducer({ ...initState, roster: { personas: [], egos: [] } }, { type: "IMPORT_PERSONA_DRAFT", persona: partial.persona, secondaryPassive: partial.secondaryPassive, provided: partial.provided, affiliation: { mode: "n", no: 18 } });

  assert.equal(next.personaMode, "n");
  assert.equal(next.personaSrc.name, "手動帰属人格");
  assert.equal(next.hp, "111");
  assert.equal(next.skills[0].name, "既存戦術");
  assert.equal(next.uniqueBuffs[0].name, "指令");
});

test("人格図鑑は草案の解析・プレビュー・確認後の適用入口を提供する", () => {
  const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  assert.match(source, /PersonaDraftImportDialog/);
  assert.match(source, /LBT_parsePersonaDraft/);
  assert.match(source, /IMPORT_PERSONA_DRAFT/);
  assert.match(source, /テキスト流し込み反映/);
  assert.match(source, /表記は多少異なっても読み込みます/);
  assert.match(source, /０－２：/);
  assert.match(source, /完成データを分けて入力/);
  assert.match(source, /人格名（任意）/);
  assert.match(source, /ステータス・パッシブ（任意）/);
  assert.match(source, /固有一覧（明示登録）/);
  assert.match(source, /LBT_parsePersonaDraftSections/);
  assert.match(source, /同期元を検索して選択/);
  assert.match(source, /人格名・No.で検索（クイック検索と同じ）/);
  assert.match(source, /persona-draft-affiliation-search/);
  assert.match(source, /persona-draft-affiliation-results/);
  assert.match(source, /draftAffiliationOptions/);
  assert.match(source, /findDraftAffiliationCandidates/);
  assert.match(source, /解析した人格名と一致した/);
  assert.match(source, /硝子窓URLから移行/);
  assert.match(source, /persona-draft-garasumado-url/);
  assert.match(source, /LBT_fetchGarasumadoPersona/);
  assert.match(source, /所有者・メモ・チャットパレット・強化一覧は移行しません/);
  assert.match(source, /draftSyncMaxLocked/);
  assert.match(source, /既に同期MAX/);
  assert.match(source, /自我の欠片が足りないため同期は未設定/);
});

test("破損疑いマークはDB原典データのみに表示し、同期・カスタム人格には出さない", () => {
  const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  assert.match(source, /!p\.__custom && !p\.__draftImported && personaHasIssue\(p\)/);
});


test("MEMOのルールブック形式固有一覧は初期値・管理先・対象付与を保ち、次の見出しで終わる", () => {
  const parse = loadParser();
  const result = parse(`人格名：「MEMO書式テスト」
HP：100 SAN：45 速度：1d5
固有
[固有見本] 最大5 固有バフ
戦闘開始時、保護1を得る。
[斬撃補正] 最大2 その他 初期2 パラメータ側
斬撃スキル威力+2
[未管理] 最大3 その他 登録先なし
管理用の変数を使わない。
[弾丸固有] 最大9 固有弾丸
専用弾丸を1つ消費する。
[指令対象] 最大1 中立バフ 対象に付与
R開始時、対象を指定する。
■ 特殊強化
・次の項目`, { allowPartial: true });

  assert.equal(result.ok, true);
  assert.equal(result.persona.unique_buffs.length, 5);
  /* vm レルムの配列は deepStrictEqual がプロトタイプ差で拒む（assert/strict では deepEqual が厳格比較）。
     呼び出し側レルムの配列へ写してから比較する。 */
  assert.deepEqual(Array.from(result.persona.unique_buffs, (b) => b.name), ["固有見本", "斬撃補正", "未管理", "弾丸固有", "指令対象"]);
  assert.equal(result.persona.unique_buffs[0].max, 5);
  assert.equal(result.persona.unique_buffs[0].initial, 0);
  assert.equal(result.persona.unique_buffs[0].desc, "戦闘開始時、保護1を得る。");
  assert.equal(result.persona.unique_buffs[1].initial, 2);
  assert.equal(result.persona.unique_buffs[1].place, "params");
  assert.equal(result.persona.unique_buffs[1].desc, "斬撃スキル威力+2");
  assert.equal(result.persona.unique_buffs[2].place, "none");
  assert.equal(result.persona.unique_buffs[2].desc, "管理用の変数を使わない。");
  assert.equal(result.persona.unique_buffs[3].type, "固有弾丸");
  assert.equal(result.persona.unique_buffs[3].desc, "専用弾丸を1つ消費する。");
  assert.equal(result.persona.unique_buffs[4].noST, true);
  assert.equal(result.persona.unique_buffs[4].desc, "R開始時、対象を指定する。");
  assert.ok(result.persona.unique_buffs.every((b) => !/後続見出し確認/.test(b.desc)));
});

test("硝子窓人格の一括登録は所持ライブラリへ追加し、装備中ビルドを変更せずURL IDで重複排除する", () => {
  const { reducer, initState } = loadStateReducer();
  const activeSource = { name: "現在装備中の人格", no: 17, __custom: false };
  const existingEntry = {
    uid: "pr-active-17", no: 17, mode: "n", equipped: true,
    src: activeSource, syncRank: "00", syncMax: false
  };
  const initial = {
    ...initState,
    personaMode: "n",
    personaNo: 17,
    personaSrc: activeSource,
    hp: "123",
    san: "48",
    speed: "2d3",
    skills: [{ id: "active-skill", rank: "スキル0", name: "装備中スキル", dice: [] }],
    roster: { ...(initState.roster || {}), personas: [existingEntry], egos: [], supports: [], spirits: [] },
    inventory: [{ itemId: "test-item", quantity: 2 }]
  };
  const persona = {
    name: "硝子窓から取り込む人格",
    no: 999,
    hp: 152,
    san: 63,
    speed: "1d7",
    bullets: "×",
    res_slash: "普通",
    res_pierce: "抵抗",
    res_blunt: "弱点",
    passive_name: "主パッシブ",
    passive_cond: "傲慢×3 保有",
    passive_always: "R開始時、保護1を得る",
    passive_effect: "マッチ威力+1",
    skills: [{
      rank: "スキル0-2",
      name: "共有された戦術",
      type: "貫通反撃",
      sin: "憂鬱",
      aoe: "",
      aoeCount: "",
      effect: "",
      dice: [{ roll: "2d10+1", effect: "呼吸1を得る" }]
    }],
    unique_buffs: [{ name: "共有固有", type: "バフ", initial: 0, max: 1, desc: "保護を得る", place: "status" }],
    keywords: [],
    __custom: true,
    __draftImported: true
  };
  const action = {
    type: "ADD_GARASUMADO_PERSONA",
    persona,
    secondaryPassive: { name: "副パッシブ", cond: "嫉妬×2", always: "", effect: "ダメージ量+1" },
    syncRank: "000",
    syncMax: true,
    source: {
      kind: "garasumado-persona",
      id: "EPm6O9SU11aYYj0obEar",
      url: "https://lbt-garasumado.vercel.app/persona/view/EPm6O9SU11aYYj0obEar",
      label: persona.name,
      extras: { memo: "元データ", enhancements: ["闘志"], chatPaletteAuto: "パレット" }
    }
  };

  const next = reducer(initial, action);
  assert.equal(next.roster.personas.length, 2);
  assert.equal(next.roster.personas[0].uid, "pr-active-17");
  assert.equal(next.roster.personas[0].equipped, true);
  const imported = next.roster.personas[1];
  assert.equal(imported.mode, "custom");
  assert.equal(imported.src.name, persona.name);
  assert.equal(imported.build.personaSrc.name, persona.name);
  assert.equal(imported.build.skills[0].rank, "スキル0-2");
  assert.equal(imported.build.skills[0].dice[0].roll, "2d10+1");
  assert.equal(imported.build.extraPassives[0].name, "副パッシブ");
  assert.equal(imported.build.uniqueBuffs[0].name, "共有固有");
  assert.equal(imported.syncRank, "000");
  assert.equal(imported.syncMax, true);
  assert.equal(imported.equipped, false);
  assert.equal(imported.importSource.id, action.source.id);
  assert.equal(JSON.stringify(imported.importSource.metadata), JSON.stringify(action.source.extras));

  assert.equal(next.personaMode, initial.personaMode);
  assert.equal(next.personaNo, initial.personaNo);
  assert.equal(next.personaSrc, activeSource);
  assert.equal(next.hp, initial.hp);
  assert.equal(next.san, initial.san);
  assert.equal(next.speed, initial.speed);
  assert.equal(next.skills[0].name, "装備中スキル");
  assert.deepEqual(next.inventory, initial.inventory);

  const duplicate = reducer(next, action);
  assert.equal(duplicate, next, "同じ共有IDは再取り込みしない");

  const otherVersion = reducer(next, {
    ...action,
    source: { ...action.source, id: "AnotherPersonaShareID123" }
  });
  assert.equal(otherVersion.roster.personas.length, 3, "別URLの同名人格は既存行を上書きしない");
  assert.notEqual(otherVersion.roster.personas[2].uid, imported.uid);
});
