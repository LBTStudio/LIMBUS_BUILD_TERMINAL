import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../js/App.js");
const ui = read("../js/ui.js");
const sections = read("../js/OtherSections.js");
const css = read("../assets/v69-ui-audit-fixes.css");
const accountCss = read("../assets/v66-accounts.css");
const cloudCss = read("../assets/cloud-backup.css");

test("監査修正CSSはアプリのコンポーネントCSSより後にハッシュ付きで読み込まれる", () => {
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
  assert.match(index, /js\/App\.js\?v=[0-9a-f]{8}/);
});

test("モバイルのプレビュー操作は縦長の本文上ではなく下部の安全領域に横長で表示する", () => {
  const block = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf("/* Desktop keeps"));
  assert.match(block, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;\s*\}/);
});

test("スマホのビルド8タブと記録タブを4列グリッドで表示し、横スクロールで隠さない", () => {
  for (const selector of [".build-tabs .segmented", ".record-tabbar .segmented"]) {
    const i = css.indexOf(selector);
    assert.ok(i >= 0, selector + " is present");
    const rule = css.slice(i, css.indexOf("}", i) + 1);
    assert.match(rule, /display:\s*grid;/);
    assert.match(rule, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(rule, /overflow:\s*visible;/);
  }
  assert.match(css, /\.build-tabs \.segmented > button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?white-space:\s*normal;/);
});

test("ショップ6分類は3列×2段、下部ナビ7項目は4列×2段で全項目が見える", () => {
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
});

test("英日併記のセクション見出しは日本語部分を分け、末尾一文字の孤立を防ぐ", () => {
  assert.match(ui, /titleSeparator = typeof title === "string" \? title\.indexOf\(" \/ "\) : -1;/);
  assert.match(ui, /className: "section-title-secondary"/);
  assert.match(css, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
  assert.match(css, /\.section-title-secondary\s*\{\s*white-space:\s*nowrap;\s*\}/);
});

test("セーブデータ読み込みは意味付けされたダイアログ・フォーカストラップ・Esc終了を持つ", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "import-scope-title", "aria-describedby": "import-scope-intro"/);
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]{0,180}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
});

test("読み込み項目はデータのあるカテゴリを先に出し、空カテゴリは折りたたんで表示する", () => {
  assert.match(app, /IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)\.map/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(app, /データのないカテゴリも表示/);
  assert.match(app, /className: "import-scope-option is-empty"/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?max-height:\s*min\(88dvh, 820px\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.import-scope-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});

test("アカウント編集のアクション列はカード内の更新日時と重ならず、共有URLフォームが領域を確保する", () => {
  assert.match(accountCss, /\.acct-card\s*\{[\s\S]*?min-height:\s*148px;[\s\S]*?padding:[^}]*34px/);
  assert.match(accountCss, /\.acct-meta\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(cloudCss, /\.acct-panel:has\(\.acct-card--import-open\) > \.lbt-cloud-panel\s*\{\s*display:\s*none;/);
  assert.match(cloudCss, /\.acct-panel:has\(\.acct-card--import-open\) > \.acct-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
});

test("取り込みパネルを開くと表示位置へ移動し、最初の入力欄へフォーカスする", () => {
  assert.match(sections, /const activeResultTool = importPanel \? "glass" : textPanel \? "text" : heldOpen \? "held" : null;/);
  assert.match(sections, /panel\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(sections, /firstField\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(sections, /prefers-reduced-motion/);
});
