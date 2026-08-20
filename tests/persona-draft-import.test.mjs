import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const parserSource = readFileSync(new URL("../js/persona-draft-import.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

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

function loadParser() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  return context.window.LBT_parsePersonaDraft;
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
  assert.equal(result.persona.skills[0].type, "斬撃反撃");
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
  assert.equal(result.persona.skills[0].type, "防御");
  assert.equal(result.persona.skills[1].rank, "スキル0-2");
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
  assert.equal(next.pas2Enabled, true);
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
  assert.match(source, /作成先 \/ 同期帰属先/);
  assert.match(source, /draftAffiliationOptions/);
  assert.match(source, /findDraftAffiliationCandidates/);
  assert.match(source, /解析した人格名と一致した/);
});
