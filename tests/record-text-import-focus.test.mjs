import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("リザルトのテキスト流し込みはアクセシブルな安定IDを持つ", () => {
  assert.match(source, /textPanel\s*&&\s*h\("div",\s*\{\s*id: "ledger-text-import-panel",\s*role: "region",\s*"aria-label": "テキスト流し込み"/);
});

test("テキスト流し込みを開くと入力欄がスクロール領域内へ移動してフォーカスされる", () => {
  assert.match(source, /if \(!textPanel \|\| typeof document === "undefined"\) return;/);
  assert.match(source, /const panel = document\.getElementById\("ledger-text-import-panel"\);/);
  assert.match(source, /const scroller = panel\.closest\("\.focus"\);/);
  assert.match(source, /scroller\.scrollTop = Math\.max\(0, top - 12\);/);
  assert.match(source, /textarea\.focus\(\{ preventScroll: true \}\);/);
});
