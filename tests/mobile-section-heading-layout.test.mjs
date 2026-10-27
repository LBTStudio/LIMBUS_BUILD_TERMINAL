import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("モバイル見出しは日本語の語を分断せず、プレビュー操作は本文の下側に置く", () => {
  const mobileTitle = css.slice(css.indexOf("/* 390px前後"));
  assert.match(mobileTitle, /\.section-title-row \{[\s\S]*?flex-wrap: wrap;[\s\S]*?padding-right: 0;/);
  assert.match(mobileTitle, /\.section-title \{[\s\S]*?word-break: keep-all;/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.preview-edge-toggle \{[\s\S]*?bottom: calc\(var\(--lbt-mobile-rail-h, 114px\) \+ 12px\);[\s\S]*?writing-mode: horizontal-tb;/);
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});
