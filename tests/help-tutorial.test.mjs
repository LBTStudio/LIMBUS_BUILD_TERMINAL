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
  assert.ok(appSource.includes("まず「何をしたいか」から選んでください"));
  assert.ok(appSource.includes("キャラクターを選ぶ"));
  assert.ok(appSource.includes("人格と装備を整える"));
  assert.ok(appSource.includes("記録または文章を取り込む"));
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
  /* 読込カテゴリは「所持ライブラリ」と「お気に入り・最近の履歴」に分離している。
     favorites/historyRecent が roster カテゴリへ重複して入らないことも固定する。 */
  assert.ok(appSource.includes('fields: ["roster"]'));
  assert.ok(appSource.includes('{ key: "usage-history", label: "お気に入り・最近の履歴", fields: ["favorites","historyRecent"] }'));
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
  assert.ok(appSource.includes("PCでは左側のナビゲーション、スマートフォンでは画面下部のタブで移動します。"));
  assert.ok(appSource.includes("「操作・保存」から保存や復元を開けます。"));
  assert.ok(appSource.includes("ビルド → 人格 → テキスト流し込み反映"));
  assert.ok(guideCss.includes(".guide-quick,.guide-items"));
  assert.ok(guideCss.includes("grid-template-columns:1fr"));
});

const beginnerTutorial = readFileSync(new URL("../docs/tutorial-guide.md", import.meta.url), "utf8");
const tutorialDiagrams = [
  "tutorial-overview.svg",
  "tutorial-text-import-routes.svg",
  "tutorial-account-management.svg",
  "tutorial-save-share.svg"
].map((name) => ({
  name,
  source: readFileSync(new URL("../docs/" + name, import.meta.url), "utf8")
}));

test("初見向けガイドは目的ごとの操作経路を示し、画面へ直接移動できる", () => {
  assert.match(appSource, /const GuideRouteCard = /);
  assert.match(appSource, /const GUIDE_FLOWS = /);
  assert.match(appSource, /onOpenUtilities: openUtilities/);
  assert.match(appSource, /onNavigate: \(id, ui = \{\}\) => dispatch/);
  assert.match(appSource, /window\.dispatchEvent\(new Event\("lbt:open-accounts"\)\)/);
  assert.match(appSource, /人格データの文章がある/);
  assert.match(appSource, /リザルト／購入履歴の文章がある/);
  assert.match(appSource, /硝子窓のキャラクターURLがある/);
  assert.match(appSource, /所持人格の名前一覧がある/);
});

test("人格テキスト、リザルトテキスト、硝子窓キャラクター取込、所持リストの入口が別々に説明される", () => {
  assert.match(appSource, /テキスト流し込み反映/);
  assert.match(appSource, /記録.*リザルトを記録.*取り込む.*テキスト流し込み/);
  assert.match(appSource, /共有URLから取り込む/);
  assert.match(appSource, /所持人格リストを取り込む/);
  assert.match(appSource, /硝子窓URLから移行/);
  assert.match(sectionsSource, /テキスト流し込み/);
  assert.match(personaSource, /テキスト流し込み反映/);
});

test("アカウント管理の入口とローカル保存・削除注意が案内されている", () => {
  assert.match(appSource, /アカウントを切替・管理/);
  assert.match(appSource, /データはキャラクターごとに分かれ/);
  assert.match(appSource, /最後の1件は削除できません/);
  assert.match(appSource, /そのアカウントの保存領域を復元できなくする/);
});

test("初心者向けMarkdownには実際のSVGフローチャートを埋め込み、図の代替テキストを用意する", () => {
  assert.match(beginnerTutorial, /!\[基本の進め方\]\(tutorial-overview\.svg\)/);
  assert.match(beginnerTutorial, /!\[文章や共有URLの取り込み口の違い\]\(tutorial-text-import-routes\.svg\)/);
  assert.match(beginnerTutorial, /!\[アカウント管理から共有URLを取り込む手順\]\(tutorial-account-management\.svg\)/);
  assert.match(beginnerTutorial, /!\[保存、バックアップ、所持ライブラリ、共有の違い\]\(tutorial-save-share\.svg\)/);
  for (const diagram of tutorialDiagrams) {
    assert.ok(diagram.source.includes("<svg "), diagram.name + " はSVG図である");
    assert.ok(diagram.source.includes("<title"), diagram.name + " にタイトルがある");
    assert.ok(diagram.source.includes("<desc"), diagram.name + " に説明がある");
  }
});

test("取り込み後の確認、データ適用範囲、保存形式の違いを説明する", () => {
  assert.match(beginnerTutorial, /読み取れなかった行/);
  assert.match(beginnerTutorial, /適用するカテゴリを確認/);
  assert.match(beginnerTutorial, /バックアップファイルの代用ではありません/);
  assert.match(beginnerTutorial, /同じ端末・同じブラウザー/);
  assert.match(beginnerTutorial, /Ctrl\+K/);
});
