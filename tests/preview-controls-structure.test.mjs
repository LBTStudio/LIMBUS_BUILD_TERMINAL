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
  assert.match(css, /@media \(max-width: 640px\) and \(orientation: portrait\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1024px\) and \(max-height: 500px\)/);
  assert.match(css, /\.preview-edge-toggle\.is-open\s*\{[\s\S]*?bottom: 20px;/);
  assert.match(css, /\.focus\s*\{\s*padding-bottom: 60px;/);
  assert.match(css, /\.focus\s*\{\s*padding-bottom: 48px;/);
  assert.match(css, /bottom: calc\(98px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /bottom: calc\(var\(--lbt-mobile-rail-h, 114px\) \+ 56px\)/);
  assert.match(css, /height: min\(calc\(62vh - 56px\), 504px\)/);
  assert.match(css, /margin-bottom: calc\(var\(--lbt-mobile-rail-h, 114px\) \+ 56px\)/);
  assert.match(css, /padding-bottom: 12px/);
  assert.match(css, /bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /writing-mode:\s*horizontal-tb/);
  assert.match(css, /\.preview-edge-toggle:focus-visible/);
  assert.match(css, /\.section-title\s*\{\s*word-break:\s*keep-all;\s*overflow-wrap:\s*normal;/);
  assert.match(css, /font-size: clamp\(13px, 4vw, 16px\)/);
  assert.match(css, /@media \(max-width: 640px\)\s*\{\s*\.section-title-row\s*\{\s*padding-right: 0;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});


test("Playwright geometry audit protects both toggle states and the landscape navigation dock", () => {
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  assert.match(capture, /closed toggle avoids preview actions, tabs, hints, headings and navigation/);
  assert.match(capture, /open tablet\/landscape control uses a reserved dock/);
  assert.match(capture, /collapsed tablet\\/landscape control uses a reserved dock/);
  assert.match(capture, /rail\.width>=closed\.viewport\.width-8/);
  assert.match(capture, /headingLayout\.lineCount<=1/);
});
