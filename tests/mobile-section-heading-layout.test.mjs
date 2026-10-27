import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");

test("モバイルのセクション補助文は右端プレビュー展開タブを避け、見出しの次行へ配置する", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(auditCss, /\.section-title-row \{\s*padding-right: 0;\s*\}/);
  assert.match(ui, /section-title-secondary/);
  assert.match(auditCss, /\.preview-edge-toggle \{[\s\S]*?bottom: calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});
