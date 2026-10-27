import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("記録の取り込みを開いたら該当パネルへ移動して入力にフォーカスする", () => {
  const start = source.indexOf('const activeResultTool = importPanel ? "glass"');
  const end = source.indexOf("const openHeld =", start);
  assert.ok(start >= 0 && end > start, "取り込みパネル表示の監視がある");
  const block = source.slice(start, end);
  assert.match(block, /panel\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(block, /field\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(block, /prefers-reduced-motion/);
  assert.doesNotMatch(block, /dispatch\(\{ type: "APPLY_IMPORT_BATCH"/);
});

test("各パネルのスクロール先IDが一致する", () => {
  assert.match(source, /id: "ledger-glass-import-panel"/);
  assert.match(source, /id: "ledger-text-import-panel"/);
  assert.match(source, /\.ledger-held-paste/);
});
