import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");

test("モバイルのセクション補助文は右端プレビュー展開タブを避け、見出しの次行へ配置する", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(ui, /section-title-secondary/, "英日併記見出しの日本語側を独立して扱う");
  assert.match(auditCss, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/, "モバイルでは旧プレビュータブぶんの右余白を不要にする");
  assert.match(auditCss, /\.section-title-secondary\s*\{\s*white-space:\s*nowrap;\s*\}/, "日本語部分を一文字単位で折り返さない");
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});
