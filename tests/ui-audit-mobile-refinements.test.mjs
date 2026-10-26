import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const css = read("../assets/v69-ui-audit-refinements.css");
const index = read("../index.html");

test("モバイルのプレビュー切替は本文を覆わず、既存の操作・保存から引き続き開閉できる", () => {
  assert.match(index, /assets\/v69-ui-audit-refinements\.css\?v=[0-9a-f]{8}/);
  assert.match(index, /v68-interaction-a11y,\s*v69-ui-audit/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?#lbt-preview-edge-toggle\s*\{\s*display: none;/);
  assert.match(app, /key: "preview", icon: "eye", label: previewOpen \? "プレビューを閉じる" : "プレビューを開く"/);
  assert.ok(app.includes("スマートフォンでは「操作・保存」→「プレビューを開く／閉じる」から操作します。"));
});

test("8つのビルドタブをモバイルで4列グリッドにし、記録の分類も2段で表示する", () => {
  assert.match(css, /\.build-tabs \.segmented\[aria-label="ビルドセクション"\]\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.build-tabs \.segmented\[aria-label="ビルドセクション"\] > button\s*\{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 0;/);
  assert.match(css, /\.segmented\[aria-label="記録セクションの種別"\]\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("セーブデータ読み込みはデータがあるカテゴリを先に表示し、空カテゴリは任意で展開できる", () => {
  assert.match(app, /const availableImportGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /const emptyImportGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /const visibleImportGroups = showEmptyImportGroups \? IMPORT_GROUPS : availableImportGroups/);
  assert.match(app, /className: "state-import-toggle-empty"/);
  assert.match(app, /"aria-expanded": showEmptyImportGroups/);
  assert.match(app, /className: "state-import-groups"\}, visibleImportGroups\.map/);
  assert.match(css, /\.state-import-dialog\s*\{[\s\S]*?max-height: calc\(100dvh - 24px\);[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.state-import-groups\s*\{[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.state-import-actions\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?border-top/);
});

test("読み込み確認ダイアログはdialog属性・Escape・Tab循環・フォーカス復帰を実装する", () => {
  assert.match(app, /role: "dialog", "aria-modal": "true", "aria-labelledby": "state-import-title"/);
  assert.match(app, /event\.key === "Escape"[\s\S]*?setImportData\(null\)/);
  assert.match(app, /event\.key !== "Tab"/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /if \(previousFocus && previousFocus instanceof HTMLElement && document\.contains\(previousFocus\)\)/);
});
