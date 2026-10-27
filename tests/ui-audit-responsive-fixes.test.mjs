import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../js/App.js");
const ui = read("../js/ui.js");
const css = read("../assets/v69-ui-audit-fixes.css");
const accounts = read("../assets/v66-accounts.css");

test("監査修正CSSはアプリで読み込まれ、既存スタイルの後に適用される", () => {
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
});
test("モバイルのプレビュー操作は本文横の縦タブから下部の横長ボタンへ移動する", () => {
  assert.match(css, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;\s*\}/);
});
test("スマホのビルド／記録／ショップタブをグリッドにして隠れた項目をなくす", () => {
  assert.match(css, /\.build-tabs \.segmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.record-tabbar \.owned-library-bar > \.record-section-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});
test("保存データ読み込み確認はデータ有りカテゴリ優先・空カテゴリ折りたたみ・固定操作列を使う", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true"/);
  assert.match(app, /IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)\.map/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(app, /className: "import-scope-options"/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?max-height:\s*min\(88dvh, 820px\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
});
test("ダイアログは初期フォーカス、Escape、Tab循環、背景クリックによるキャンセルを備える", () => {
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]{0,160}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /onClick: \(e\) => \{ if \(e\.target === e\.currentTarget\) setImportData\(null\); \}/);
  assert.match(app, /onClick: \(\) => applyImport\(false\)/);
});
test("英日併記の見出しは日本語部分を分離して末尾1字の孤立を防ぐ", () => {
  assert.match(ui, /className: "section-title-primary"/);
  assert.match(ui, /className: "section-title-secondary"/);
  assert.match(css, /\.section-title-secondary \{ white-space:\s*nowrap; word-break:\s*keep-all;/);
});
test("共有URL取り込み中は保全パネル／他カードを隠し、アカウント操作列のスペースを確保する", () => {
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\) > \.lbt-cloud-panel\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\) > \.acct-grid > \.acct-card:not\(\.acct-card--import-open\)\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.acct-card\s*\{\s*min-height:\s*148px;/);
  assert.match(accounts, /\.acct-card-actions\s*\{[\s\S]*?opacity:\s*1/);
});
test("監査用スクリプトはPC／スマホ、ホバー、フォーカス、取り込み画面を撮影する", () => {
  const capture = read("../tools/ui/capture-ui-audit.mjs");
  const workflow = read("../.github/workflows/ui-audit-screenshot-capture.yml");
  assert.match(capture, /for\s*\(const\s+mode\s+of\s+\["desktop",\s*"mobile"\]\)/);
  assert.match(capture, /\.hover\(\)/);
  assert.match(capture, /keyboard\.press\("Tab"\)/);
  assert.match(capture, /state-import-scope-dialog/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
