import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");

test("モバイルのセクション見出しは英日ラベルを分離し、日本語を途中で分断しない", () => {
  assert.match(ui, /className: "section-title-primary"/);
  assert.match(ui, /className: "section-title-secondary"/);
  assert.match(auditCss, /\.section-title-secondary\s*\{\s*white-space:\s*nowrap;\s*\}/);
  assert.match(auditCss, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
  assert.match(auditCss, /\.section-subtitle\s*\{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});

test("モバイルのプレビュー操作は見出し予約領域ではなく独立した下部位置を使う", () => {
  assert.match(css, /\.preview-edge-toggle\s*\{[\s\S]*?position: fixed;/);
  assert.match(auditCss, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
});
