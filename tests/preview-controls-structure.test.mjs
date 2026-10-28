import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const preview = read("../js/LivePreview.js");
const index = read("../index.html");
const css = read("../assets/v70-preview-controls.css");
const workspace = read("../assets/workspace.css");

test("プレビューの開閉ボタンはReact管理の単一コントロールで状態を公開する", () => {
  assert.equal((app.match(/id: "lbt-preview-edge-toggle"/g) || []).length, 1);
  assert.match(app, /"aria-controls": "preview-panel"/);
  assert.match(app, /"aria-expanded": previewOpen/);
  assert.ok(app.includes('className: `preview-edge-toggle${previewOpen ? " is-open" : " is-collapsed"}`'));
  assert.doesNotMatch(app, /className: "preview-reopen"/);
  assert.doesNotMatch(preview, /lbt-preview-edge-toggle/);
  assert.doesNotMatch(preview, /className: "preview-close"/);
  assert.match(preview, /id: "preview-panel"/);
});

test("プレビュー領域自身は開閉ボタンを生成せず、状態に応じた表示だけを担当する", () => {
  assert.ok(preview.includes('className: `preview${state.ui.previewOpen ? " is-open" : ""}`'));
  assert.doesNotMatch(workspace, /\.preview-reopen\s*\{/);
  assert.doesNotMatch(workspace, /\.preview-close\s*\{/);
  assert.doesNotMatch(workspace, /\.preview-edge-toggle\s*\{/);
});

test("開閉コントロールは最終のCSSレイヤーでPC・タブレット・スマホの位置を管理する", () => {
  assert.match(index, /v68-interaction-a11y,\s*v70-preview-controls;/);
  assert.match(index, /assets\/v70-preview-controls\.css\?v=[0-9a-f]{8}/);
  assert.match(css, /\.preview-edge-toggle\.is-collapsed\s*\{\s*right:\s*0;/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1024px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /writing-mode:\s*horizontal-tb/);
  assert.match(css, /\.preview-edge-toggle:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
