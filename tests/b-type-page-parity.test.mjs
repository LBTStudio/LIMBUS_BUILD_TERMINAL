import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const reference = read("../docs/ui-reference/LBT_UI_Refinement_Prototypes.html");
const app = read("../js/App.js");
const sections = read("../js/OtherSections.js");
const workbenchCss = read("../assets/b-type-workbench.css");

test("prototype B page structure is represented by the production page entry points", () => {
  const bStart = reference.indexOf('id="prototype-b"');
  const bEnd = reference.indexOf('id="prototype-c"', bStart);
  assert.ok(bStart >= 0 && bEnd > bStart, "the supplied B prototype must be the source of truth");
  const b = reference.slice(bStart, bEnd);
  for (const page of ["home", "editor", "record", "shop", "settings", "help"]) {
    assert.ok(b.includes('data-pageview="' + page + '"'), "B source must contain " + page);
  }
  assert.match(b, /data-workbench-panel="basic"/);
  assert.match(b, /data-workbench-panel="build"/);
  assert.match(b, /data-main/);
});

test("Record opens on the three-choice B landing; existing library, ledger and inventory remain reachable", () => {
  const roster = sections.slice(sections.indexOf("const RosterSection ="), sections.indexOf("const InventoryPanel ="));
  assert.match(roster, /state\.ui\?\.libraryTab \|\| "home"/);
  for (const label of ["所持ライブラリ", "リザルト／収支", "テキスト取り込み"]) assert.ok(roster.includes(label));
  assert.match(roster, /onClick: \(\) => openRecordTab\("personas"\)/);
  assert.match(roster, /onClick: \(\) => openRecordTab\("ledger"\)/);
  assert.match(roster, /onOpenImportRouter/);
  assert.match(roster, /items\.map\(renderItem\)/);
  assert.match(roster, /h\(LedgerPanel, \{ state, dispatch \}\)/);
  assert.match(roster, /h\(InventoryPanel, \{ state, dispatch \}\)/);
  assert.match(app, /libraryTab: "home"/);
});

test("Shop opens on the always-visible category hub and retains the real category catalog", () => {
  const shop = sections.slice(sections.indexOf("const ShopSection ="), sections.indexOf("const BuildWorkspace ="));
  assert.match(shop, /state\\.ui\\?\\.shopView \\|\\| "overview"/);
  assert.match(shop, /const shopCategories = \\[/);
  for (const tab of ["persona", "support", "ego", "spirit", "item", "gacha"]) {
    assert.match(shop, new RegExp('id: "' + tab + '"'), "category hub keeps " + tab);
    assert.ok(shop.includes('["' + tab + '"'), "catalog tab remains " + tab);
  }
  assert.match(shop, /className: "btype-shop-category-card"/);
  assert.match(shop, /shopView: "catalog", shopTab: id/);
  assert.match(shop, /onChange: \\(event\\) => setQuery\\(event\\.target\\.value\\)/);
  assert.match(shop, /shop-grid/);
  assert.match(shop, /shop-filters codex-filters/);
  assert.match(shop, /shopView: "catalog"/);
});

test("Settings opens on the two-route B landing and keeps all detailed settings panels", () => {
  const settings = sections.slice(sections.indexOf("const SettingsSection ="));
  assert.match(settings, /state\.ui\?\.settingsView \|\| "overview"/);
  assert.match(settings, /ステータス・出力順・計算式/);
  assert.match(settings, /保存・読み込み・共有/);
  for (const category of ["share", "formulas", "accounts", "danger"]) {
    assert.ok(settings.includes('data-settings-category": "' + category + '"'), "detailed settings retains " + category);
  }
  assert.match(settings, /settingsView: "detail"/);
  assert.match(settings, /settingsView: "overview"/);
  assert.match(app, /SettingsSection, \{ state, dispatch, onOpenUtilities: openUtilities \}/);
});

test("Help opens on the B import entry while retaining searchable guide content", () => {
  const help = app.slice(app.indexOf("const HelpSection ="), app.indexOf("const CommandPalette ="));
  assert.match(help, /helpView === "overview"/);
  assert.match(help, /取り込みの違いを確認/);
  assert.match(help, /onOpenImportRouter/);
  assert.match(help, /setHelpView\("guide"\)/);
  assert.match(help, /guide-search-input/);
  assert.match(help, /guide-filter-row/);
  assert.match(help, /guide-index-list/);
});

test("Build keeps the real edit tabs and adds the B-style right preview summary", () => {
  const build = sections.slice(sections.indexOf("const BuildWorkspace ="), sections.indexOf("const SYNC_RANKS ="));
  assert.match(build, /className: "btype-work-layout"/);
  assert.match(build, /className: "btype-workbench-preview-panel"/);
  assert.match(build, /onClick: onTogglePreview/);
  assert.match(build, /onClick: onCopyJson/);
  assert.match(build, /visitedRef/);
  assert.match(build, /paneCacheRef/);
  const tabDefinitions = sections.slice(sections.indexOf("const BUILD_TABS = ["), sections.indexOf("const OwnedItemsPanel"));
  for (const id of ["baseinfo", "persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"]) {
    assert.ok(tabDefinitions.includes('id: "' + id + '"'), "Build keeps route " + id);
  }
  assert.match(build, /: EnhancementSection;/, "the enhancement tab remains routed to the existing editor");
  assert.match(workbenchCss, /\.btype-work-layout\s*\{/);
  assert.match(workbenchCss, /\.btype-record-card-grid\s*\{/);
  assert.match(workbenchCss, /\.btype-shop-entry\s*\{/);
  assert.match(workbenchCss, /\.btype-settings-task-list\s*\{/);
});
