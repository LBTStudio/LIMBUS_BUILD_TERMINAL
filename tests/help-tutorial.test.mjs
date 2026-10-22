import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const sectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const coreSource = readFileSync(new URL("../js/core.js", import.meta.url), "utf8");
const liveSource = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("初回導線は駒整形からビルド・プレビューまでの順に案内する", () => {
  assert.ok(appSource.includes("まず「駒整形」で名前や立ち絵などを設定し、「ビルド」で人格・E.G.O・スキルを整えます。"));
  assert.ok(appSource.includes("「駒整形」でキャラクター名・PL名・立ち絵などを設定します"));
  assert.ok(appSource.includes("左側の「ビルド」を開き、ビルド内の「人格」タブ"));
  assert.ok(appSource.includes("通常の編集内容はブラウザー内へ自動保存されます"));
  assert.ok(appSource.includes("guide-quick"));
});

test("人格編集の実ボタン名と、変更を所持ビルドへ保存する操作が説明されている", () => {
  const tutorial = appSource.indexOf("はじめに：人格を選ぶ・作る");
  const edit = appSource.indexOf("◈ 同期化して手動編集", tutorial);
  const finish = appSource.indexOf("✓ 編集を終了（内容は保持）", tutorial);
  assert.ok(tutorial >= 0);
  assert.ok(edit > tutorial);
  assert.ok(finish > edit);
  assert.ok(appSource.includes("所持人格の保存ビルドとして変更を残すには"));
  assert.ok(personaSource.includes("OK：変更を所持人格へ保存して装備解除"));
  assert.ok(personaSource.includes("キャンセル：装備を継続（変更はそのまま）"));
  assert.ok(appSource.includes("同期ランクと同期MAXは別設定です。"));
  assert.ok(personaSource.includes('isSynced ? "✓ 編集を終了（内容は保持）" : "◈ 同期化して手動編集"'));
});

test("E.G.Oの案内は簡易詳細・解析開始／終了・オリジナル作成を区別する", () => {
  assert.ok(appSource.includes("装備済み枠を押すと右側に簡易詳細が表示されます。"));
  assert.ok(appSource.includes("「解析を開始」を押します。終えるときは「解析を終了」"));
  assert.ok(appSource.includes("オリジナルE.G.Oを作成する"));
  assert.ok(appSource.includes("E.G.Oを新規作成"));
  assert.ok(sectionsSource.includes('state.egoManual ? " 解析を終了" : " 解析を開始"'));
  assert.ok(sectionsSource.includes('dispatch({ type: "SAVE_EGO_BUILD", rank: detailSlot })'));
});

test("パッシブとサポートの編集条件・未所持候補の表示方法が案内されている", () => {
  assert.ok(appSource.includes("人格パッシブの入力欄を編集するには"));
  assert.ok(appSource.includes("「この枠を編集」を押します。"));
  assert.ok(appSource.includes("「所持のみ」です。未所持候補は「未所持も表示（全体から選ぶ）」"));
  assert.ok(sectionsSource.includes("未所持も表示（全体から選ぶ）"));
  assert.ok(sectionsSource.includes("const gated = ownedOnly && !gateOpen"));
});

test("設定タブのステータス順とプレビューのメモ／パレット順を混同しない", () => {
  assert.ok(appSource.includes("ステータスの出力順"));
  assert.ok(appSource.includes("メモ／チャットパレットの段落順は設定タブではなく、プレビューの各タブで並べ替えます。"));
  assert.ok(appSource.includes("ステータス順は設定タブの「ステータス一覧・編集・出力順」"));
  assert.ok(sectionsSource.includes("ステータス一覧・編集・出力順"));
  assert.ok(liveSource.includes("previewSectionOrder"));
  assert.ok(!appSource.includes("メモ・チャットパレット・JSONの出力順を確認・調整します"));
});

test("人格図鑑のフィルターと記録タブの同期フィルターを区別する", () => {
  assert.ok(appSource.includes("通常の人格図鑑では名前・効果・キーワード"));
  assert.ok(appSource.includes("「記録」の所持人格一覧には同期・同期ランク／MAXの絞り込みがあり"));
  assert.ok(personaSource.includes("filterSins.length"));
  assert.ok(personaSource.includes("filterAffs.length"));
  assert.ok(sectionsSource.includes("syncRankFilter"));
  assert.ok(sectionsSource.includes("requiredResources"));
  assert.ok(sectionsSource.includes("excludedResources"));
});

test("所持ライブラリの書き出しに含まれるお気に入りと履歴は読み込みカテゴリにも含まれる", () => {
  assert.ok(appSource.includes("favorites: state.favorites || []"));
  assert.ok(appSource.includes("historyRecent: state.historyRecent || []"));
  assert.ok(appSource.includes('fields: ["roster","favorites","historyRecent"]'));
  assert.ok(stateSource.includes('"favorites","historyRecent"'));
});

test("作業状態ファイルの範囲、読込時の初期選択、抽選ログの制限を説明する", () => {
  assert.ok(appSource.includes("現在のキャラクターだけでなく、所持データ・導入アイテム・リザルト／収支明細・設定なども含む広い作業データ"));
  assert.ok(appSource.includes("ファイルに存在するカテゴリが初期選択されます"));
  assert.ok(appSource.includes("残したいものはチェックを外し、表示された適用範囲を確認してください。"));
  assert.ok(appSource.includes("抽選ログは現行のカテゴリ選択読み込みでは復元されません。"));
  assert.ok(appSource.includes("const { ui, ...data } = state"));
  assert.ok(appSource.includes("sel[g.key] = g.fields.some((f) => f in data)"));
  assert.ok(stateSource.includes("const ALLOWED = ["));
});

test("元に戻す・クイック検索の説明が現行ショートカットと一致する", () => {
  assert.ok(appSource.includes("PCでは入力欄の外でCtrl+Z"));
  assert.ok(appSource.includes("入力欄にカーソルがある間は、Ctrl+Zは文字入力の取り消しを優先します。"));
  assert.ok(appSource.includes("クイック検索はPCではCtrl+K（Macでは⌘K）、スマートフォンでは検索ボタンから開きます。"));
  assert.ok(appSource.includes('if (isCtrl && e.key === "k")'));
  assert.ok(appSource.includes("if (isTyping) return"));
});

test("ナビゲーションとモバイル表示が現行レイアウトに沿って案内されている", () => {
  assert.ok(appSource.includes("PCでは画面左側のナビゲーション、スマートフォンでは画面下部のタブ"));
  assert.ok(appSource.includes("「ビルド」内に人格・スキル・パッシブ・サポート・E.G.Oなどのタブがあります。"));
  assert.ok(guideCss.includes(".guide-quick,.guide-items"));
  assert.ok(guideCss.includes("grid-template-columns:1fr"));
});
