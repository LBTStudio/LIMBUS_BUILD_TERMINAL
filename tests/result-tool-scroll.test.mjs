import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("リザルト取り込みの入口を押したら、追加パネルへ移動して最初の入力欄にフォーカスする", () => {
  const start = source.indexOf("const switchResultTool = (mode) =>");
  const end = source.indexOf("const openResultEditor", start);
  assert.ok(start >= 0 && end > start, "取り込みパネルの切替ロジックが存在する");
  const block = source.slice(start, end);
  assert.match(block, /const activeResultTool = importPanel \? "glass" : textPanel \? "text" : heldOpen \? "held" : null;/);
  assert.match(block, /React\.useEffect\(\(\) => \{/);
  assert.match(block, /panel\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.ok(block.includes("firstField?.focus?.({ preventScroll: true })"), "最初の入力欄へスクロールなしでフォーカスする");
  assert.match(block, /prefers-reduced-motion/);
  assert.doesNotMatch(block, /dispatch\(\{ type: "APPLY_IMPORT_BATCH"/, "パネルを開くだけでインポートを確定しない");
});

test("硝子窓・テキスト流し込み・所持人格リストの各パネルが一意なスクロール先を持つ", () => {
  assert.match(source, /id: "ledger-glass-import-panel"/);
  assert.match(source, /id: "ledger-text-import-panel"/);
  assert.match(source, /\.ledger-held-paste/);
  assert.match(source, /closest\("\.ledger-gara-wrap"\)/);
  assert.match(source, /className: "ledger-import-toggle"/);
});
