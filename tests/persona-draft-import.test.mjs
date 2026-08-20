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

test("同期草案ブロック内の最後の人格名を冒頭の参照名より優先し、全角・空白の表記ゆれを認識する", () => {
  const parse = loadParser();
  const result = parse(`人格名：【ファイル名由来の別人格】
同期 ＭＡＸ　草案 （作成中）
人格 名 ： 「本文で明示された同期人格」
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
  assert.equal(result.persona.name, "本文で明示された同期人格");
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

test("人格図鑑は草案の解析・プレビュー・確認後の適用入口を提供する", () => {
  const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  assert.match(source, /PersonaDraftImportDialog/);
  assert.match(source, /LBT_parsePersonaDraft/);
  assert.match(source, /IMPORT_PERSONA_DRAFT/);
  assert.match(source, /草案を貼り付け/);
  assert.match(source, /作成先 \/ 同期帰属先/);
  assert.match(source, /draftAffiliationOptions/);
});
