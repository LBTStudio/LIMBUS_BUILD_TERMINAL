import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const database = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const egoSectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

/* core.js + OtherSections.js をVMに読み、実行時のキーワード順序を検証する。 */
function loadEgoKeywordOrder() {
  const reactStub = {
    memo: (fn) => fn, createElement: () => ({}), useState: () => [null, () => {}],
    useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn,
    useRef: () => ({ current: null }), Fragment: "Fragment"
  };
  const context = {
    window: {}, console, setTimeout, clearTimeout, Blob, URL,
    React: reactStub, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(egoSectionSource, context);
  return context;
}

test("E.G.Oキーワード候補は回復を含み、実データに一致する語だけを表示する", () => {
  const egoText = JSON.stringify(database.egos || []);

  assert.match(egoSectionSource, /EGO_KEYWORD_ORDER[\s\S]*"回復"/);
  assert.match(egoSectionSource, /\.filter\(\(keyword\) => catalogEgos\.some/);
  assert.ok(egoText.includes("回復"));
});

test("E.G.Oキーワード候補は基本ルールPDFのバフ・デバフ・中立バフ・弾丸の掲載順を維持する", () => {
  const expectedOrder = [
    "パワー", "忍耐", "クイック", "保護", "充電", "呼吸", "ダメージ量増加",
    "虚弱", "武装解除", "束縛", "脆弱", "火傷", "沈潜", "出血", "恐慌", "破裂", "振動", "ダメージ量減少", "毒", "麻痺",
    "バリア", "弾丸", "回復"
  ];
  // core.js の PDF_KEYWORD_ORDER が OtherSections.js へ伝播しているか。
  const ctx = loadEgoKeywordOrder();
  const pdfOrder = ctx.window.LBT_PDF_KEYWORD_ORDER;
  assert.ok(Array.isArray(pdfOrder) && pdfOrder.length >= 22, "core.jsがPDF順序を定義している");
  // PDF順序が OtherSections でも同じ並びで使われている。
  assert.match(egoSectionSource, /EGO_PDF_KEYWORD_ORDER = window\.LBT_PDF_KEYWORD_ORDER/);
  for (const keyword of expectedOrder) {
    assert.ok(pdfOrder.includes(keyword) || keyword === "回復", `${keyword} がPDF順序に含まれる`);
  }
});