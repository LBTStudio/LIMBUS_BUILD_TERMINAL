import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const sectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
/* 2026-10-01: .spp-list[style*=...] の折り返し指定は workspace.css から
   sections.css へ移動した。@layer では層の優先順位がセレクタ特異度より先に
   効くため、workspace 層（sections より弱い）にあると sections の
   .spp-list に負けてしまい、展開時の2カラムが効かなくなる。 */
const sectionsCss = readFileSync(new URL("../assets/sections.css", import.meta.url), "utf8");

test("特殊強化は肉体強化と精神強化を対にして左右列へ配置できる順序を作る", () => {
  const rows = db.normal_enhancements || [];
  const body = rows.filter((entry) => entry.name.startsWith("肉体強化"));
  const mind = rows.filter((entry) => entry.name.startsWith("精神強化"));
  assert.ok(body.length > 0);
  assert.equal(body.length, mind.length);
  assert.match(sectionSource, /const pairedSpecialRows = Array\.from/);
  assert.match(sectionSource, /\[bodyRows\[index\], mindRows\[index\]\]/);
  assert.match(sectionsCss, /\.spp-list\[style\*="max-height: none"\] \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}/);
  assert.match(sectionsCss, /@media \(max-width: 1024px\)[\s\S]*\.spp-list\[style\*="max-height: none"\] \{ grid-template-columns: 1fr; \}/);
});
