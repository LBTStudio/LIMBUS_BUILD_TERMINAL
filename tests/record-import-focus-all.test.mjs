import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("3つのリザルト取り込み入口に安定したアクセシブルな対象がある", () => {
  assert.match(source, /id: "ledger-glass-import-panel", role: "region", "aria-label": "硝子窓から一括取り込む"/);
  assert.match(source, /id: "ledger-text-import-panel", role: "region", "aria-label": "テキスト流し込み"/);
  assert.match(source, /className: "ledger-input ledger-held-paste"/);
});

test("硝子窓・テキスト・所持人格リストの各入力欄へ開いた直後にスクロールしてフォーカスする", () => {
  assert.match(source, /if \(importPanel\)/);
  assert.match(source, /textarea\.gara-url-list/);
  assert.match(source, /textarea\.ledger-textarea/);
  assert.match(source, /textarea\.ledger-held-paste/);
  assert.match(source, /const scroller = panel\.closest\("\.focus"\);/);
  assert.match(source, /scroller\.scrollTop = Math\.max\(0, top - 12\);/);
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\);/);
  assert.match(source, /\[importPanel, textPanel, heldOpen\]/);
});
