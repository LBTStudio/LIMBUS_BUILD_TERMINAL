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

test("E.G.Oキーワード候補は基本ルールPDFのバフ・デバフ・中立バフ・弾丸の掲載順を維持する", () => {
  const expectedOrder = [
    "パワー", "忍耐", "クイック", "保護", "充電", "呼吸", "ダメージ量増加",
    "虚弱", "武装解除", "束縛", "脆弱", "火傷", "沈潜", "出血", "恐慌", "破裂", "振動", "ダメージ量減少", "毒", "麻痺",
    "バリア", "弾丸", "回復"
  ];
  let previousIndex = -1;
  expectedOrder.forEach((keyword) => {
    const index = egoSectionSource.indexOf(`"${keyword}"`, egoSectionSource.indexOf("const EGO_PDF_KEYWORD_ORDER"));
    assert.ok(index > previousIndex, `${keyword} はPDF基準順で後続する`);
    previousIndex = index;
  });
  assert.match(egoSectionSource, /EGO_PDF_KEYWORD_ORDER = window\.LBT_PDF_KEYWORD_ORDER/);
});
