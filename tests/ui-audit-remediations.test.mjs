import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const a11y = readFileSync(new URL("../assets/v68-interaction-a11y.css", import.meta.url), "utf8");

test("保存データ読み込みダイアログは利用可能カテゴリを先に表示し、空カテゴリを折りたたむ", () => {
  assert.match(app, /import-scope-dialog/);
  assert.match(app, /IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)\.map/);
  assert.match(app, /import-scope-empty-details/);
  assert.match(app, /aria-modal": "true", "aria-labelledby": "import-scope-title"/);
  assert.match(app, /className: "import-scope-close"[\s\S]*?onClick: \(\) => setImportData\(null\)/);
  assert.match(app, /if \(event.key === "Escape"\)[\s\S]*?setImportData\(null\)/);
  assert.match(app, /if \(event.shiftKey && \(document.activeElement === first \|\| document.activeElement === dialog\)\)/);
  assert.match(app, /document.addEventListener\("keydown", onKeyDown, true\)/);
});

test("保存データ読み込みダイアログは選択リストのみスクロールし、操作ボタンを常に表示する", () => {
  assert.match(workspace, /\.import-scope-dialog \{[\s\S]*?display: flex;[\s\S]*?overflow: hidden;/);
  assert.match(workspace, /\.import-scope-list \{[\s\S]*?overflow-y: auto;/);
  assert.match(workspace, /\.import-scope-actions \{[\s\S]*?border-top: 1px solid var\(--line-dim\);/);
  assert.match(workspace, /\.import-scope-actions > \.btn \{ min-height: 38px; \}/);
});

test("旧いアプリ側PREVIEW縦タブはスマホで隠し、開閉操作を重複させない", () => {
  assert.match(workspace, /@media \\(max-width: 640px\\) \\{[\\s\\S]*?\\.app\\.preview-collapsed \\.preview-reopen \\{ display: none; \\}/);
});

test("モバイルのコンテンツは固定プレビュー操作の背後に隠れないよう下部余白を確保する", () => {
  assert.match(a11y, /\.app \.focus \{[\s\S]*?padding-bottom: calc\(var\(--lbt-mobile-rail-h, 114px\) \+ 70px\);/);
});
