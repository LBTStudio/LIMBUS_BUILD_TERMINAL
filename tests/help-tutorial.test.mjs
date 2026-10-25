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

test("使い方ページは検索と分類を先頭に置き、最初から巨大なカード群を表示しない", () => {
  assert.ok(appSource.includes('id: "guide-search-input"'));
  assert.ok(appSource.includes('className: "guide-filter-row"'));
  assert.ok(appSource.includes('className: "guide-index-list"'));
  assert.ok(appSource.includes("押す場所を図で確認"));
  assert.ok(!appSource.includes("まず「何をしたいか」から選んでください"));
  assert.ok(!appSource.includes('className: "guide-route-grid"'));
  assert.ok(!appSource.includes('className: "guide-quick"'));
  assert.ok(guideCss.includes(".guide-index-row"));
  assert.ok(guideCss.includes(".guide-search-field"));
  assert.ok(guideCss.includes(".guide-ui-locator"));
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

test("初回表示は「はじめて」の短い順路を示し、よく使う項目も別タブで参照できる", () => {
  assert.ok(appSource.includes('useState("start")'));
  assert.ok(appSource.includes('{ key: "start", label: "はじめて" }'));
  assert.ok(appSource.includes('起動時の SINNER SELECT / 上部の現在アカウント表示 → アカウント管理'));
  assert.ok(appSource.includes('const starterOrder = ['));
  assert.ok(appSource.includes('"キャラクター（アカウント）を選ぶ・作る"'));
  assert.ok(appSource.includes('"人格を装備する"'));
  assert.ok(appSource.includes('effectiveCategory === "start" && starterItems.has(item.title)'));
  assert.ok(appSource.includes('画像をクリック／タップすると拡大できます。'));
  assert.ok(guideCss.includes("max-height: 560px"));
  assert.ok(beginnerTutorial.includes('summary>「共有シートを開く」ボタンの位置を実画面で確認する</summary>'));
});

test("検索・分類・詳細展開が現行導線に沿っている", () => {
  assert.ok(appSource.includes("押す場所を図で確認"));
  assert.ok(appSource.includes("ビルド → 人格 → テキスト流し込み反映"));
  assert.ok(appSource.includes("const getAction = (item) =>"));
  assert.ok(appSource.includes('className: "guide-index-detail"'));
  assert.ok(guideCss.includes(".guide-filter-row"));
  assert.ok(guideCss.includes("overflow-x: auto"));
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


test("使い方ガイドはPCとスマートフォンの実画面キャプチャを同梱し、幅に応じて表示を切り替える", () => {
  const captures = [
    "persona-import-desktop.webp", "persona-import-mobile.webp",
    "result-text-import-desktop.webp", "result-text-import-mobile.webp",
    "roster-import-desktop.webp", "roster-import-mobile.webp",
    "account-share-import-desktop.webp", "account-share-import-mobile.webp",
    "save-work-state-desktop.webp", "save-work-state-mobile.webp",
    "share-sheet-desktop.webp", "share-sheet-mobile.webp"
  ];
  for (const name of captures) {
    const bytes = readFileSync(new URL("../docs/tutorial-captures/" + name, import.meta.url));
    assert.ok(bytes.byteLength > 10000, name + " が同梱されている");
  }
  assert.ok(appSource.includes('h("source", { media: "(max-width: 640px)"'));
  assert.ok(appSource.includes('secondaryImage: "docs/tutorial-captures/share-sheet-desktop.webp"'));
  assert.match(beginnerTutorial, /スマートフォン版の実画面を見る/);
  assert.match(beginnerTutorial, /tutorial-captures\/share-sheet-mobile\.webp/);
});

test("目的別の操作項目は検索結果から詳細と画面移動へつながる", () => {
  assert.match(appSource, /const HELP_ITEMS = /);
  assert.match(appSource, /const GuideFlowDiagram = /);
  assert.match(appSource, /onOpenUtilities/);
  assert.match(appSource, /onNavigate\?\.\(section, ui \|\| \{\}\)/);
  assert.match(appSource, /window\.dispatchEvent\(new Event\("lbt:open-accounts"\)\)/);
  assert.match(appSource, /人格データを文章から取り込む/);
  assert.match(appSource, /リザルト／購入履歴を文章から取り込む/);
  assert.match(appSource, /硝子窓のキャラクターURLから取り込む/);
  assert.match(appSource, /所持人格の一覧をまとめて取り込む/);
  assert.match(appSource, /expanded \? h\("div", \{ id: detailId, className: "guide-index-detail" \}/);
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
  assert.ok(beginnerTutorial.indexOf("<summary>初回の基本手順") < beginnerTutorial.indexOf("| したいこと | 操作経路 |"));
  assert.match(beginnerTutorial, /!\[文章や共有URLの取り込み口の違い\]\(tutorial-text-import-routes\.svg\)/);
  assert.ok(beginnerTutorial.includes("tutorial-captures/account-share-import-desktop.webp"));
  assert.ok(beginnerTutorial.includes("tutorial-captures/save-work-state-desktop.webp"));
  assert.ok(beginnerTutorial.includes("tutorial-captures/persona-import-desktop.webp"));
  assert.ok(beginnerTutorial.includes("tutorial-captures/result-text-import-desktop.webp"));
  assert.ok(beginnerTutorial.includes("tutorial-captures/roster-import-desktop.webp"));
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


test("複雑な図解は該当する項目を開いた時だけ表示される", () => {
  assert.match(appSource, /const getFlowKind = \(item\) =>/);
  assert.match(appSource, /flowKind \? h\(GuideFlowDiagram, \{ kind: flowKind \}\) : null/);
  assert.doesNotMatch(appSource, /h\(GuideFlowDiagram, \{ kind: "main" \}\)/);
  assert.match(guideCss, /\.guide-flow-svg\s*\{\s*display:\s*none;\s*\}/);
  assert.match(guideCss, /\.guide-flow-mobile\s*\{\s*display:\s*grid/);
});

test("検索可能な索引からアカウント管理とサポート手順に到達できる", () => {
  assert.match(appSource, /アカウントを編集・切替・削除する/);
  assert.match(appSource, /パッシブとサポートを確認・編集する/);
  assert.match(appSource, /選択中のカードをもう一度クリック／タップ/);
  assert.ok(beginnerTutorial.includes("## 6. サポートパッシブを装備する"));
  assert.match(beginnerTutorial, /通常スロットへ装備/);
});


test("検索欄の値はReactイベントから読み取り、検索語入力後も分類で絞り込める", () => {
  assert.match(appSource, /onChange: \(event\) => \{ const value = event\.target\.value; setQuery\(value\); setExpandedKey\(""\); if \(value\.trim\(\)\) setCategory\("all"\); \}/);
  assert.match(appSource, /const effectiveCategory = category;/);
  assert.match(appSource, /onClick: \(\) => \{ setCategory\(entry\.key\); setExpandedKey\(""\); \}/);
});


test("主要な取り込み操作は、実際のUIラベルを示す個別配置図へつながる", () => {
  assert.ok(appSource.includes('title.includes("人格データを文章")) return "persona-import"'));
  assert.ok(appSource.includes('title.includes("リザルト／購入履歴")) return "result-import"'));
  assert.ok(appSource.includes('title.includes("所持人格の一覧")) return "roster-import"'));
  assert.ok(appSource.includes('title.includes("硝子窓のキャラクターURL")) return "account"'));
  assert.ok(appSource.includes("const GUIDE_UI_LOCATORS = {"));
  assert.ok(appSource.includes("const GuideUiLocator = ({ kind }) =>"));
  assert.ok(personaSource.includes("pw-listbar-actions"));
  assert.ok(personaSource.includes("テキスト流し込み反映"));
  assert.ok(sectionsSource.includes("リザルトを記録"));
  assert.ok(sectionsSource.includes("所持人格リストを取り込む"));
  assert.ok(guideCss.includes(".guide-ui-locator-image"));
  assert.ok(tutorialDiagrams.some((diagram) => diagram.name === "tutorial-save-share.svg"));
  assert.ok(!appSource.includes('image: "docs/tutorial-persona-import-ui.svg"'));
});
