import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("../assets/v74-ledger-multicolumn.css");
const classificationCss = read("../assets/v75-ledger-classification.css");
const source = read("../js/OtherSections.js");
const auditSource = read("../tools/ui/capture-ui-audit.mjs");

test("リザルト一覧はPC3列・タブレット2列・スマホ1列で表示する", () => {
  assert.match(css, /\.ledger-cards\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/s);
  assert.match(css, /@media \(min-width: 701px\) and \(max-width: 1100px\)[\s\S]*?\.ledger-cards\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ledger-cards\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /\.ledger-card-wrap \.ledger-card \.card-body\.ledger-card-body\s*\{[^}]*display: flex !important;[^}]*flex-direction: column !important/s);
});

test("複列カードでも獲得資源と支出を識別できる", () => {
  assert.match(css, /--ledger-lp:\s*#f0d18b/);
  assert.match(css, /--ledger-shards:\s*#8bd5df/);
  assert.match(css, /--ledger-cost:\s*#f0a079/);
  assert.match(css, /\.ledger-card-income > \.ledger-pair:first-child\s*\{[^}]*background:/s);
  assert.match(css, /\.ledger-card-income > \.ledger-pair:nth-child\(2\)\s*\{[^}]*background:/s);
  assert.match(css, /\.ledger-card-income \.ledger-card-spent\s*\{[^}]*border-left:[^}]*var\(--ledger-cost\)/s);
});

test("一覧カードと入力・明細の境界は暗色背景から独立して見える", () => {
  assert.match(css, /--ledger-card-border:\s*#746759/);
  assert.match(css, /\.ledger-card-wrap \.ledger-card\s*\{[^}]*border:[^}]*var\(--ledger-card-border\)/s);
  assert.match(css, /\.ledger-card-wrap \.ledger-card \.card-header\s*\{[^}]*background:\s*var\(--ledger-card-head\) !important/s);
  assert.match(css, /\.ledger-results-search,[\s\S]*?\.ledger-results-sort\s*\{[^}]*border-color:\s*var\(--ledger-card-border\)/);
  assert.match(css, /\.ledger-result-summary\s*\{[^}]*border:\s*1px solid #655a4e/s);
});

test("100件以上でもページ単位の配列切り出しと件数表示を維持する", () => {
  assert.match(source, /const RESULTS_PAGE_SIZE = 12/);
  assert.match(source, /Math\.ceil\(sortedResults\.length \/ RESULTS_PAGE_SIZE\)/);
  assert.match(source, /sortedResults\.slice\([\s\S]{0,160}RESULTS_PAGE_SIZE/);
  assert.match(source, /sortedResults\.length/);
});


test("スマートフォンのリザルト編集ボタンは40px以上のタッチ領域を維持する", () => {
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ledger-card-edit-btn\s*\{[^}]*min-height: 40px !important/s);
});

test("分類ワークベンチは未分類と移動先を同時表示し、双方をページ分割する", () => {
  assert.match(source, /ledger-classification-overlay/);
  assert.match(source, /ledger-classification-targets-pane/);
  assert.match(source, /const QUEUE_PAGE_SIZE = 20/);
  assert.match(source, /const MOVE_DESTINATION_PAGE_SIZE = 12/);
  assert.match(source, /pageQueueEntries\.map/);
  assert.match(source, /pageMoveDestinations\.map/);
  assert.match(classificationCss, /grid-template-columns:\s*minmax\(320px, 390px\) minmax\(0, 1fr\)/);
  assert.match(classificationCss, /@media \(max-width: 800px\)[\s\S]*?grid-template-columns: minmax\(0,1fr\)/);
});

test("未分類オブジェクトはドラッグハンドル・複数選択・一括帰属変更に対応する", () => {
  assert.match(source, /ledger-queue-drag-handle/);
  assert.match(source, /selectedQueueIds/);
  assert.match(source, /JSON\.stringify\(ids\)/);
  assert.match(source, /readDragIds/);
  assert.match(source, /type: "SET_ENTRIES_RESULT"/);
  assert.match(source, /このページを選択/);
  assert.match(classificationCss, /\.ledger-queue-drag-handle/);
  assert.match(classificationCss, /@media \(max-width: 800px\)[\s\S]*?\.ledger-queue-drawer \.ledger-queue-item-move,[\s\S]*?min-height: 40px/);
});

test("未分類検索では日本語と全角空白を正しく正規化し、全リザルトを検索できる", () => {
  assert.ok(source.includes(String.raw`.replace(/[\s\u3000・･]/g`),
    "空白除去は空白文字クラスを使い、s/u/数字の文字を誤って消さない");
  assert.match(source, /allSortedResults\.filter\(\(result\) => \{/);
  assert.match(source, /リザルトページを直接指定/);
  assert.match(source, /setResultPage\(Math\.max\(0, Math\.min\(resultPageCount - 1/);
});

test("分類ワークベンチは既存明細のドラッグ移動とモバイル用ページ選択に対応する", () => {
  assert.match(source, /ledger-queue-transfer-drag-handle/);
  assert.match(source, /ledger-classification-targets-pane/);
  assert.match(source, /aria-label": "移動先のリザルトを検索"/);
  assert.ok(classificationCss.includes("@media (max-width: 640px) {"));
  assert.match(classificationCss, /ledger-results-page-jump select/);
  assert.match(classificationCss, /min-height: 40px;/);
});

test("モバイル分類画面は通常の縦フローで重なりを防ぎ、移動先カードに十分な表示領域を確保する", () => {
  assert.match(classificationCss, /@media \(max-width: 800px\)[\s\S]*?display: flex !important;[\s\S]*?flex-direction: column;[\s\S]*?overflow-y: auto;/);
  assert.match(classificationCss, /\.ledger-queue-drawer,\s*\.ledger-classification-targets-pane\s*\{[^}]*flex: 0 0 auto;[^}]*height: auto;/);
  assert.match(classificationCss, /\.ledger-queue-drawer\s*\{[^}]*min-height: max-content;[^}]*overflow: visible;/);
  assert.match(classificationCss, /\.ledger-classification-targets-pane\s*\{[^}]*min-height: 380px;/);
  assert.match(classificationCss, /\.ledger-classification-results-grid\s*\{[^}]*min-height: 190px;[^}]*max-height: 230px;/);
  assert.match(classificationCss, /\.ledger-classification-target\s*\{[^}]*min-height: 128px;/);
});

test("操作監査はPC/タブレットのドラッグとスマートフォンのタップ代替を実行する", () => {
  assert.match(auditSource, /dragHandle\.dragTo\(originalDestination\)/);
  assert.match(auditSource, /Phone: use the explicit select -> search -> tap route/);
  assert.match(auditSource, /\.ledger-queue-drag-handle/);
});

test("未分類100件のページング・検索・ページ内20件一括移動を画面監査する", () => {
  assert.match(auditSource, /length:100/);
  assert.match(auditSource, /QA未分類オブジェクト/);
  assert.match(auditSource, /ledger-100-unclassified-first-page/);
  assert.match(auditSource, /ledger-100-unclassified-last-page/);
  assert.match(auditSource, /ledger-100-unclassified-search/);
  assert.match(auditSource, /ledger-100-unclassified-bulk-selected/);
  assert.match(auditSource, /ledger-100-unclassified-bulk-assigned/);
  assert.match(auditSource, /!==20/);
  assert.match(auditSource, /moved!==20/);
  assert.match(auditSource, /stillUnclassified!==80/);
});


test("監査ナビゲーションはDOM順の非表示項目を避け、表示中のレール／下部ナビを選ぶ", () => {
  assert.match(auditSource, /\.btype-mobile-bottom-nav:visible/);
  assert.match(auditSource, /\.rail-item:visible/);
  assert.match(auditSource, /表示中のナビゲーション項目が見つかりません/);
});

test("分類ワークベンチは検索変更と閉じる操作で選択を解除し、モバイルのタップ面を40px確保する", () => {
  assert.match(source, /const closeClassificationWorkbench = \(\) => \{/);
  assert.match(source, /closeClassificationWorkbench\(\);/);
  assert.match(source, /setQueueSearch\(event\.target\.value\);[\s\S]{0,180}setSelectedQueueIds\(\[\]\)/);
  assert.match(source, /ledger-queue-item-check-wrap/);
  assert.match(source, /ledger-classification-instruction-mobile/);
  assert.match(classificationCss, /\.ledger-queue-item-check-wrap\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/s);
  assert.match(classificationCss, /@media \(max-width: 800px\)[\s\S]*?\.ledger-queue-drag-handle\s*\{[^}]*display: none !important;/s);
});


test("監査ナビゲーションは前のシナリオのダイアログを閉じ、レール表示後に遷移する", () => {
  assert.match(auditSource, /async function go\(label\) \{[\s\S]{0,260}await closeOverlay\(\)/);
  assert.match(auditSource, /const rail = page\.locator\("\.rail:visible"\)\.first\(\);[\s\S]{0,120}await rail\.waitFor/);
  assert.match(auditSource, /const nav = page\.locator\("\.btype-mobile-bottom-nav:visible"\)\.first\(\);[\s\S]{0,120}await nav\.waitFor/);
  assert.match(auditSource, /activeDialogs:/);
});


test("監査の閉じる操作は非表示の重複ボタンを飛ばし、表示中ボタンを選択する", () => {
  assert.match(auditSource, /button\[aria-label\*="閉じる"\]:visible/);
  assert.match(auditSource, /button\[title\*="閉じる"\]:visible/);
  assert.match(auditSource, /visibleLabel\.count\(\)/);
  assert.match(auditSource, /閉じる操作後も操作を遮るオーバーレイが残っています/);
});


test("監査ナビゲーションは非表示の重複レールを待たず、可視要素を直接待機する", () => {
  assert.match(auditSource, /\.btype-mobile-bottom-nav:visible"\)\.first\(\)/);
  assert.match(auditSource, /\.rail:visible"\)\.first\(\)/);
  assert.doesNotMatch(auditSource, /page\.locator\("\.rail"\);\s*await rail\.waitFor/);
  assert.doesNotMatch(auditSource, /page\.locator\("\.btype-mobile-bottom-nav"\);\s*await mobileNav\.waitFor/);
});


test("200件・100件のUI監査は再読込ごとにSINNER SELECTで監査アカウントを選び直す", () => {
  assert.match(auditSource, /async function restoreAuditAccountAfterReload\(\)/);
  assert.match(auditSource, /\.acct-gate:visible/);
  assert.match(auditSource, /UI監査用キャラクター/);
  assert.match(auditSource, /const navSelector = viewportWidth <= 640/);
  assert.equal((auditSource.match(/await restoreAuditAccountAfterReload\(\);/g) || []).length, 3);
});


test("200件ページング監査はツールバー外の一覧ページ番号を読む", () => {
  assert.match(auditSource, /const pageNumber=page\.locator\("\.ledger-results-pagination \.ledger-results-page-number"\)\.first\(\)/);
  assert.doesNotMatch(auditSource, /const pageNumber=toolbar\.locator\("\.ledger-results-page-number"\)/);
});


test("100件分類監査は検索で先頭ページへ戻るため、無効な最初ボタンを押さない", () => {
  assert.match(auditSource, /if \(\(await queuePageLabel\.innerText\(\)\)\.trim\(\) !== "1 \/ 5"\)\s*\{\s*await click\(queueNav\.getByRole\("button",\{name:"最初",exact:true\}\)\);/);
  assert.match(auditSource, /未分類100件の検索解除後に先頭ページへ戻っていません/);
});
