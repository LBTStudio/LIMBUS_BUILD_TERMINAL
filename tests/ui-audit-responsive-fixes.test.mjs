import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../js/App.js");
const css = read("../assets/v69-ui-audit-fixes.css");
const accounts = read("../js/accounts-ui.js");

test("監査修正CSSはハッシュ付きで読み込まれ、既存スタイルの後に適用される", () => {
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
});

test("スマホのビルド・記録タブは4列、ショップ分類は3列で全候補を見せる", () => {
  assert.match(css, /\.build-tabs \.segmented,[\s\S]*?\.record-tabbar \.segmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
});

test("モバイルではプレビュー開閉を1つに統一し、本文見出しと重ねない", () => {
  assert.match(app, /className: "preview-reopen", onClick: togglePreview/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.preview-edge-toggle\s*\{[\s\S]*?z-index:/);
  assert.match(css, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
});

test("セーブデータ読み込みは named dialog とフォーカストラップを使う", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true"/);
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]{0,180}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
});

test("読み込み画面はデータのあるカテゴリを先に表示し、空カテゴリを閉じておける", () => {
  assert.match(app, /importGroupsWithData = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /importGroupsWithoutData = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?max-height:\s*min\(88dvh, 820px\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.import-scope-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});

test("共有URL取り込み中は他のカードとオンライン保全パネルを退避する", () => {
  assert.match(accounts, /acct-card--import-open/);
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\)\s*>\s*\.lbt-cloud-panel\s*\{\s*display:\s*none;/);
  assert.match(css, /\.acct-panel:has\(\.acct-card--import-open\)\s*>\s*\.acct-grid\s*>\s*\.acct-card:not\(\.acct-card--import-open\)\s*\{\s*display:\s*none;/);
  assert.match(css, /\.acct-meta\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
});
