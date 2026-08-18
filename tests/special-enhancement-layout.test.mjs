import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const sectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("特殊強化は肉体強化と精神強化を対にして左右列へ配置できる順序を作る", () => {
  const rows = db.normal_enhancements || [];
  const body = rows.filter((entry) => entry.name.startsWith("肉体強化"));
  const mind = rows.filter((entry) => entry.name.startsWith("精神強化"));
  assert.ok(body.length > 0);
  assert.equal(body.length, mind.length);
  assert.match(sectionSource, /const pairedSpecialRows = Array\.from/);
  assert.match(sectionSource, /\[bodyRows\[index\], mindRows\[index\]\]/);
  assert.match(workspaceCss, /\.spp-list\[style\*="max-height: none"\] \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(workspaceCss, /@media \(max-width: 1024px\)[\s\S]*\.spp-list\[style\*="max-height: none"\] \{ grid-template-columns: 1fr; \}/);
});
