import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../js/App.js");
const ui = read("../js/ui.js");
const sections = read("../js/OtherSections.js");
const css = read("../assets/v69-ui-audit-fixes.css");
const sw = read("../sw.js");

test("監査修正CSSはv68の後に読み込まれ、Service Workerにも同期される", () => {
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
  assert.match(sw, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.match(index, /js\/ui\.js\?v=[0-9a-f]{8}/);
  assert.match(index, /js\/App\.js\?v=[0-9a-f]{8}/);
  assert.match(index, /js\/OtherSections\.js\?v=[0-9a-f]{8}/);
});

test("プレビュー操作はスマホ本文から分離し、古い重複タブを表示しない", () => {
  assert.match(app, /className: "preview-reopen", onClick: togglePreview/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;\s*\}/);
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf("@media (max-width: 640px) and (max-height: 620px)"));
  assert.match(mobile, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
  assert.match(mobile, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
});

test("スマホのビルド8タブは4列×2段で全件表示する", () => {
  assert.match(css, /\.build-tabs \.segmented\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.build-tabs \.segmented > button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?white-space:\s*normal;/);
});

test("スマホのショップ6分類は3列×2段で全件表示する", () => {
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.shop-tabs\s*>\s*button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
});

test("セーブデータの読み込み確認は短いカテゴリ一覧と固定アクションを持つ", () => {
  assert.match(app, /className: "card import-scope-dialog",\s*role: "dialog"/);
  assert.match(app, /"aria-modal": "true",\s*"aria-labelledby": "import-scope-title"/);
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]{0,180}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /importGroupsWithData\.map/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?max-height:\s*min\(88dvh, 820px\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.import-scope-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});

test("英日併記見出しは日本語側を単語として扱い、末尾1文字を孤立させない", () => {
  assert.match(ui, /section-title-primary/);
  assert.match(ui, /section-title-secondary/);
  assert.match(css, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
  assert.match(css, /\.section-title-secondary\s*\{\s*white-space:\s*nowrap;\s*\}/);
});

test("記録の取り込みパネルを開くと自動で移動し、最初の入力欄にフォーカスする", () => {
  assert.match(sections, /const activeResultTool = importPanel \? "glass" : textPanel \? "text" : heldOpen \? "held" : null/);
  assert.match(sections, /panel\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(sections, /firstField\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(sections, /id: "ledger-glass-import-panel"/);
  assert.match(sections, /id: "ledger-text-import-panel"/);
});

test("初回アカウント作成フォームは高さ制限に隠れず、送信操作を読める", () => {
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\) > \.acct-grid\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?grid-auto-rows:\s*max-content;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\) > \.lbt-cloud-panel\s*\{\s*display:\s*none;\s*\}/);
  const accountUi = read("../js/accounts-ui.js");
  assert.match(accountUi, /className: "acct-form-actions"[\s\S]*?"作成して開く"/);
});
