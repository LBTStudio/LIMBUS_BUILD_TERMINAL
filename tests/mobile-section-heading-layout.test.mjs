import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("モバイルのセクション補助文は右端プレビュー展開タブを避け、見出しの次行へ配置する", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(css, /\.section-title-row \{[\s\S]*?padding-right: 68px;/);
  assert.match(css, /\.section-title-secondary \{\s*white-space: nowrap;/, "日本語の見出しを一文字だけ次の行へ分離しない");
  assert.match(css, /\.preview-edge-toggle \{[\s\S]*?writing-mode: horizontal-tb;[\s\S]*?min-height: 34px;/, "プレビュー操作を本文を覆わない横長ボタンへ");
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
  assert.match(css, /\.build-tabs \.segmented,\s*\.record-tabbar \.segmented \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow: visible;/, "ビルド／記録のタブを4列グリッドで全て見せる");
  assert.match(css, /\.build-tabs \.segmented > button,[\s\S]*?\.record-tabbar \.segmented > button \{[\s\S]*?white-space: normal;/, "狭幅でもタブの文字を押し潰さない");
});
