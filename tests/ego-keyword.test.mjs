import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const database = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const egoSectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("E.G.Oキーワード候補は回復を含み、実データに一致する語だけを表示する", () => {
  const egoText = JSON.stringify(database.egos || []);

  assert.match(egoSectionSource, /EGO_KEYWORD_ORDER[\s\S]*"回復"/);
  assert.match(egoSectionSource, /\.filter\(\(keyword\) => \(DB\.egos \|\| \[\]\)\.some/);
  assert.ok(egoText.includes("回復"));
});
