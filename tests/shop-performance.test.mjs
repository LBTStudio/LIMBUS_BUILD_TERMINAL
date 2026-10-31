import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const start = source.indexOf("const ShopSection =");
const end = source.indexOf("const BuildWorkspace =", start);
assert.ok(start >= 0 && end > start, "ShopSection source is present");
const shop = source.slice(start, end);

test("ショップホームでは選択していない商品カタログを索引化しない", () => {
  assert.match(shop, /const personaSearchRows = React\.useMemo\(\(\) => \{\s*if \(shopView !== "catalog" \|\| tab !== "persona"\) return \[\];/);
  assert.match(shop, /const supportSearchRows = React\.useMemo\(\(\) => \{\s*if \(shopView !== "catalog" \|\| tab !== "support"\) return \[\];/);
  assert.match(shop, /const egos = shopView === "catalog" && tab === "ego"/);
  assert.match(shop, /if \(shopView !== "catalog" \|\| tab !== "ego"\) return \[\];/);
  assert.match(shop, /const spirits = shopView === "catalog" && tab === "spirit"/);
  assert.match(shop, /const items = shopView === "catalog" && tab === "item"/);
  assert.match(shop, /shopView === "catalog" && tab === "item"\s*\? \[\.\.\.new Set\(catalogItems\.map/);
});

test("カード要素は48件の表示窓に絞ってから生成する", () => {
  assert.match(shop, /const visibleEntries = activeEntries\.slice\(0, Math\.max\(0, visibleCount\)\);\s*const shownList = lists\[tab\] \? lists\[tab\]\(visibleEntries\) : \[\];/);
  for (const kind of ["persona", "support", "ego", "spirit", "item"]) {
    assert.match(shop, new RegExp(kind + ": \\(entries\\) => entries\\.map\\("), `${kind} card builder accepts a limited entry set`);
  }
  assert.doesNotMatch(shop, /lists\[tab\]\(\)/, "all filtered entries must not be converted to cards at once");
  assert.match(shop, /h\("div", \{ className: "codex-count" \}, h\("strong", null, filteredCount\)/);
  assert.match(shop, /Math\.min\(count \+ 48, filteredCount\)/);
});

test("一覧の増分読み込みはカテゴリ表示後のスクロール操作でのみ進む", () => {
  assert.match(shop, /if \(shopView !== "catalog" \|\| tab === "gacha"\) return;/);
  assert.match(shop, /const grow = \(\) => \{ if \(!scheduled\) \{ scheduled = true; requestAnimationFrame\(measure\); \} \};/);
  assert.match(shop, /scroller\.addEventListener\("scroll", grow, onScroll\)/);
  assert.match(shop, /window\.addEventListener\("scroll", grow, onScroll\)/);
  assert.doesNotMatch(shop, /^\s*grow\(\);\s*$/m, "mount時の自動追加読み込みをしない");
  assert.match(shop, /useSourceFilterControl\(SOURCE_KINDS\[tab\] \|\| "", sourceFilter, setSourceFilter, shopView === "catalog" && !!SOURCE_KINDS\[tab\]\)/);
  assert.match(shop, /visibleWindow\.key === filterWindowKey \? visibleWindow\.count : 48/);
});
