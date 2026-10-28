import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("記録の取り込みパネルを開いたら対象パネルを画面内へスクロールする", () => {
  assert.match(source, /const activeType = textPanel \? "text" : importPanel \? "glass" : heldOpen \? "held" : null;/);
  assert.match(source, /panels\.find\(\(panel\) => panel\.querySelector\("textarea\.ledger-textarea"\)\)/);
  assert.match(source, /target\?\.scrollIntoView\?\.\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(source, /\}, \[textPanel, importPanel, heldOpen\]\);/);
});
