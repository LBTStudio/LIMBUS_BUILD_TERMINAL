import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const preview = read("../js/LivePreview.js");
const css = read("../assets/workspace.css");

test("モバイルのプレビュー操作は見出しやビルドタブを避け、下部ナビの上に表示する", () => {
  const mobile = css.slice(css.lastIndexOf("UI AUDIT REFINEMENTS"));
  assert.match(mobile, /@media \(max-width: 640px\)[\s\S]*?\.preview-edge-toggle,[\s\S]*?top:\s*auto/);
  assert.match(mobile, /bottom:\s*calc\(var\(--lbt-mobile-rail-h,\s*114px\)\s*\+\s*8px\)/);
  assert.match(mobile, /writing-mode:\s*horizontal-tb/);
  assert.match(mobile, /\.section-title-row\s*\{[^}]*padding-right:\s*0/s);
  assert.match(mobile, /\.section-title\s*\{[^}]*text-wrap:\s*balance/s);
  assert.match(preview, /edgeToggle\.textContent = previewOpen \? "◀ 格納" : "▶ プレビュー"/);
});

test("ビルド内8タブはスマートフォンで4列グリッドになり、横に隠れない", () => {
  const mobile = css.slice(css.lastIndexOf("UI AUDIT REFINEMENTS"));
  assert.match(mobile, /\.build-tabs > \.segmented\[role="tablist"\]\s*\{[^}]*display:\s*grid/s);
  assert.match(mobile, /\.build-tabs > \.segmented\[role="tablist"\]\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.build-tabs > \.segmented\[role="tablist"\] > \[role="tab"\]\s*\{[^}]*min-height:\s*44px/s);
  assert.match(mobile, /\.build-tabs > \.segmented\[role="tablist"\]\s*\{[^}]*overflow:\s*visible/s);
});

test("保存データの取り込み確認はアクセシブルなモーダルで、初期表示はデータがあるカテゴリのみ", () => {
  assert.match(app, /className: "card import-scope-dialog", ref: importScopeDialogRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "import-scope-title"/);
  assert.match(app, /const availableImportGroups = importData \? IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\) : \[\]/);
  assert.match(app, /const importGroupsToShow = showEmptyImportGroups \? IMPORT_GROUPS : availableImportGroups/);
  assert.match(app, /className: "import-scope-empty-toggle"/);
  assert.match(app, /"データがない項目も表示"/);
  assert.match(app, /className: "stack-2 import-scope-list",?\s*\}\s*,?\s*importGroupsToShow\.map/);
  assert.match(app, /setShowEmptyImportGroups\(false\)/);
  assert.match(app, /const onKeyDown = \(event\) => \{[\s\S]{0,220}event\.key === "Escape"[\s\S]{0,220}setImportData\(null\)/);
  assert.match(app, /if \(event\.shiftKey && document\.activeElement === first\)[\s\S]*?last\.focus\(\)/);
  assert.match(app, /else if \(!event\.shiftKey && document\.activeElement === last\)[\s\S]*?first\.focus\(\)/);
  assert.match(app, /className: "import-scope-actions"/);
});

test("読み込み選択画面は狭い画面でも一覧だけをスクロールし、操作列を固定する", () => {
  const modalCss = css.slice(css.lastIndexOf("Save-state import"));
  assert.match(modalCss, /\.import-scope-dialog\s*\{[^}]*min-height:\s*0/s);
  assert.match(modalCss, /\.import-scope-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto/s);
  assert.match(modalCss, /\.import-scope-actions\s*\{[^}]*flex:\s*0 0 auto;[^}]*border-top/s);
  assert.match(modalCss, /@media \(max-width: 640px\)[\s\S]*?\.import-scope-actions\s*\{[^}]*display:\s*grid !important;[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(modalCss, /\.import-scope-actions \.btn\s*\{[^}]*min-height:\s*44px/s);
});
