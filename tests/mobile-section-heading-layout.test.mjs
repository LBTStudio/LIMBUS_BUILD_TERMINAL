import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("英日併記の見出しは日本語側を分け、末尾1文字だけの孤立を避ける", () => {
  assert.match(ui, /section-title-primary/);
  assert.match(ui, /section-title-secondary/);
  assert.match(auditCss, /\.section-title-secondary\s*\{[^}]*display:\s*inline-block;[^}]*white-space:\s*nowrap/s);
  assert.match(auditCss, /\.section-title\s*\{[\s\S]*?word-break:\s*keep-all;[\s\S]*?overflow-wrap:\s*normal;/);
});

test("見出しの補助文は次行へ流し、プレビュー操作と衝突させない", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(auditCss, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
  assert.match(auditCss, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
});
