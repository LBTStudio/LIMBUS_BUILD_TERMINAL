import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");

test("モバイルの見出しは英語と日本語を分離し、短い日本語を一文字だけ次行へ落とさない", () => {
  assert.match(ui, /titleSeparator = typeof title === "string" \? title\.indexOf\(" \/ "\) : -1;/);
  assert.match(ui, /className: "section-title-primary"/);
  assert.match(ui, /className: "section-title-secondary"/);
  assert.match(auditCss, /\.section-title-secondary \{ white-space: nowrap; flex-shrink: 0; \}/);
  assert.match(auditCss, /\.section-title \{[\s\S]*?word-break: keep-all;[\s\S]*?overflow-wrap: normal;/);
});

test("モバイルのプレビュー開閉操作は縦長タブを本文上に置かず、下部に横長で表示する", () => {
  assert.match(auditCss, /\.preview-edge-toggle \{[\s\S]*?top: auto;[\s\S]*?bottom: calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode: horizontal-tb;/);
  assert.match(auditCss, /\.app\.preview-collapsed \.preview-reopen \{ display: none; \}/);
});

test("モバイルのビルド／記録タブは横スクロールに隠さず4列の2段グリッドで表示する", () => {
  assert.match(auditCss, /\.build-tabs \.segmented \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow: visible;/);
  assert.match(css, /\.record-tabbar \.segmented/);
  assert.match(auditCss, /\.build-tabs \.segmented > button \{[\s\S]*?min-height: 44px;[\s\S]*?white-space: normal;/);
});
