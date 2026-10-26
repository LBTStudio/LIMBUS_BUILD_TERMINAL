import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../assets/v69-ui-audit-fixes.css");
const app = read("../js/App.js");
const ui = read("../js/ui.js");
const other = read("../js/OtherSections.js");
const index = read("../index.html");
const capture = read("../tools/ui/capture-ui-audit.mjs");
const workflow = read("../.github/workflows/ui-audit-screenshot-capture.yml");

test("監査修正CSSは既存テーマの後に読み込まれる", () => {
  assert.match(index, /assets\/v68-interaction-a11y\.css\?v=[0-9a-f]{8}/);
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
});

test("スマホのプレビュー操作は見出しと本文を覆わない横長ボタンになる", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
  assert.match(mobile, /\.section-title-row\s*\{\s*padding-right:\s*0;/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;/);
});

test("ビルド・記録タブはスマホで4列の2段になり、ショップの6分類もすべて表示できる", () => {
  assert.match(css, /\.build-tabs \.segmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.record-tabbar \.segmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
});

test("英日併記の見出しは日本語部分をまとまりとして扱う", () => {
  assert.match(ui, /title\.indexOf\(" \/ "\)/);
  assert.match(ui, /className: "section-title-primary"/);
  assert.match(ui, /className: "section-title-secondary"/);
  assert.match(css, /\.section-title-secondary\s*\{\s*white-space:\s*nowrap;/);
});

test("セーブデータ読み込みはデータのある分類を先に表示し、空分類を折りたたみ、操作を固定する", () => {
  assert.match(app, /className: "card import-scope-dialog"/);
  assert.match(app, /role: "dialog"/);
  assert.match(app, /"aria-modal": "true"/);
  assert.match(app, /importGroupsWithData\.map\(renderImportGroup\)/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /event\.key !== "Tab"/);
  assert.match(app, /setImportData\(null\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.import-scope-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?max-height:\s*min\(88dvh, 820px\);[\s\S]*?overflow:\s*hidden;/);
});

test("記録の取り込みメニューを開くと該当パネルへスクロールし、入力欄へフォーカスする", () => {
  assert.match(other, /const activeResultTool = importPanel \? "glass" : textPanel \? "text" : heldOpen \? "held" : null;/);
  assert.match(other, /id: "ledger-glass-import-panel"/);
  assert.match(other, /id: "ledger-text-import-panel"/);
  assert.match(other, /panel\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(other, /firstField\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(other, /prefers-reduced-motion/);
  assert.doesNotMatch(other.slice(other.indexOf("const switchResultTool"), other.indexOf("const openResultEditor")), /APPLY_IMPORT_BATCH/);
});

test("共有URL取り込み中は選択中のアカウントフォームに集中できる", () => {
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\) > \.lbt-cloud-panel\s*\{\s*display:\s*none;/);
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\) > \.acct-grid\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\) > \.acct-grid > \.acct-card:not\(\.acct-card--import-open\)\s*\{\s*display:\s*none;/);
});

test("監査用スクリーンショットは横はみ出し・実際の可視状態・取り込みフォーム表示位置を記録する", () => {
  assert.match(capture, /Number\(style\.opacity\) < 0\.03/);
  assert.match(capture, /aria-hidden/);
  assert.match(capture, /horizontalOverflow/);
  assert.match(capture, /record-result-text-import-preview/);
  assert.match(capture, /inputFocused/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 30/);
});
