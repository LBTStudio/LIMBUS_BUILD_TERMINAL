import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("E.G.O簡易詳細はダイス効果本文を表示する", () => {
  assert.match(source, /ego-quick-dice-effects/);
  assert.match(source, /formatPreview\(die\.effect, 120\)/);
  assert.match(source, /ego-quick-dice-colon/);
});

test("E.G.O詳細の属性・罪とダイス値・効果の区切りはPDF表記のコロンを使う", () => {
  assert.match(source, /skill\.attr && skill\.sin && "："/);
  assert.match(source, /join\("："\)/);
  assert.match(source, /d\.effect \? .*"："/s);
});
