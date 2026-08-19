import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("モバイルのセクション補助文は右端プレビュー展開タブを避け、見出しの次行へ配置する", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(css, /\.section-title-row \{[\s\S]*?padding-right: 48px;/);
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});
