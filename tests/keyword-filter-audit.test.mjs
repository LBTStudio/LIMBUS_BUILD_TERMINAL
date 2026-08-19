import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const database = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadKeywordEnricher() {
  const context = { window: {}, console, setTimeout, clearTimeout, Blob, URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return context.window.LBT_enrichPersonaKeywords;
}

function loadEgoKeywordMatcher() {
  const context = {
    window: { LBT_PDF_KEYWORD_ORDER: [] }, console,
    React: { createElement: () => ({}), useState: () => [null, () => {}], useMemo: (fn) => fn(), useEffect: () => {} },
    setTimeout, clearTimeout, Blob, URL
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8"), context);
  return context.window.LBT_egoMatchesKeyword;
}

test("全人格の効果文キーワードを補完し、東部親指ソルダートIIに弾丸を追加する", () => {
  const enrich = loadKeywordEnricher();
  const db = JSON.parse(JSON.stringify(database));
  const audit = enrich(db);
  const eastThumb = db.normal_personas.find((persona) => persona.name === "東部親指ソルダートII");

  assert.equal(audit.total, (db.normal_personas || []).length + (db.tokui_personas || []).length);
  assert.equal(audit.updated.length > 0, true);
  assert.equal(eastThumb.keywords.includes("弾丸"), true);
  assert.equal(enrich(db).updated.length, 0);
});

test("E.G.Oの回復キーワードは名称ではなく効果テキストで判定する", () => {
  const matches = loadEgoKeywordMatcher();
  const recoveryOnlyInName = { name: "回復の幻影", kakusei: { effect: "対象へダメージを与える", dice: [] } };
  const recoveryInEffect = { name: "治療の幻影", kakusei: { effect: "HPを5回復する", dice: [] } };

  assert.equal(matches(recoveryOnlyInName, "回復"), false);
  assert.equal(matches(recoveryInEffect, "回復"), true);
});
