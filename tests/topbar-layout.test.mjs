import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("上部のライブラリ保存ラベルは中間幅で半端に表示せず、広幅時だけ全文を表示する", () => {
  assert.match(css, /@media \(max-width: 1540px\)/);
  assert.match(css, /topbar-library-save::after \{ display: none; \}/);
  assert.match(css, /@media \(min-width: 1541px\)/);
  assert.match(css, /topbar-library-save::after \{\s*display: inline;/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("中間幅ではJSON出力を操作群の先頭へ置き、操作・保存と競合させない", () => {
  assert.match(css, /@media \(min-width: 641px\) \{\s*\.topbar-actions > \.btn:last-of-type \{/);
  assert.match(css, /\.topbar-actions > \.btn:last-of-type \{\s*order: -1;/);
  assert.match(css, /\.topbar-actions > \.btn:last-of-type \{\s*order: -1;\s*flex: 0 0 auto;/);
});
