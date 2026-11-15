import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("B-type shell gives non-workbench pages the full canvas and scopes preview to the workbench", () => {
  const css = read("../assets/b-type-workbench.css");
  const app = read("../js/App.js");
  assert.match(css, /--b-rail-w:\s*190px/);
  assert.match(css, /--b-preview-w:\s*clamp\(340px, 28vw, 420px\)/);
  assert.match(css, /--preview-w:\s*var\(--b-preview-w\)/);
  assert.match(css, /--b-preview-w:\s*clamp\(300px, 27vw, 340px\)/);
  assert.match(css, /--preview-w:\s*var\(--b-preview-w\)/);
  assert.match(css, /\.app\.has-preview\s*\{\s*grid-template-columns:\s*var\(--b-rail-w\) minmax\(0, 1fr\) var\(--b-preview-w\)/);
  assert.match(app, /className: "rail"/);
  assert.match(app, /className: "focus"/);
  assert.match(app, /isBuildWorkspace && previewOpen \? React\.createElement\(LivePreview, \{ state, dispatch \}\)/);
  assert.match(app, /label: "ビルド"/);
  assert.match(app, /label: "記録・所持品"/);
});

test("B-type home prioritizes the next setup action and keeps secondary tools folded", () => {
  const app = read("../js/App.js");
  assert.match(app, /className: "home-launcher btype-home btype-home-v2"/);
  assert.match(app, /className: "btype-home-primary"/);
  assert.match(app, /className: "btype-home-progress"/);
  assert.match(app, /className: "btype-home-start-grid"/);
  assert.match(app, /className: "btype-home-more"/);
  assert.match(app, /次へ：/);
  assert.match(app, /既存データを取り込む/);
  assert.match(app, /記録・所持品を管理/);
  assert.match(app, /その他の機能を探す/);
});
test("B-type production styles adapt to tablet and mobile without disabling reduced motion", () => {
  const css = read("../assets/b-type-workbench.css");
  assert.match(css, /\.btype-home-primary\s*\{/);
  assert.match(css, /\.btype-home-start-grid\s*\{/);
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Basic workspace keeps image editing but removes inline portrait and duplicate preview", () => {
  const sections = read("../js/OtherSections.js");
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  const previewCapture = read("../tools/ui/capture-preview-control-regression.mjs");
  const base = sections.slice(sections.indexOf("const BaseSection ="), sections.indexOf("const PassiveCard ="));
  assert.doesNotMatch(base, /piece-art-frame|piece-art-wrap|piece-art-thumbs|basic-ccfolia-preview/);
  assert.match(base, /piece-image-urls/);
  assert.match(previewCapture, /collapsed Basic workspace contains no preview image, miniature or duplicate panel/);
  assert.match(previewCapture, /previewPanelCount === 0/);
  assert.doesNotMatch(audit, /basic-workspace-v4-hero|portraitGeometry\.ratio/);
  assert.match(audit, /preview-panel/);
});

test("UI audit covers desktop, tablet and mobile across Home, settings and all record tabs", () => {
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /for\(const mode of \["desktop","tablet","mobile","mobile-narrow"\]\)/);
  assert.match(audit, /width:1024,height:768/);
  assert.match(audit, /width:320,height:640/);
  assert.match(audit, /記録・所持品の6カテゴリタブが揃っていません/);
  assert.match(audit, /details\.settings-disclosure/);
  assert.match(audit, /home-launcher-review/);
  assert.match(audit, /import-router-all-destinations/);
  assert.match(audit, /settingsDisclosurePanels/);
  assert.match(audit, /build-editor-operation-paths/);
  assert.match(audit, /all six owned-library categories/);
});


test("Build workspace groups all nine existing tabs without changing their persisted IDs", () => {
  const sections = read("../js/OtherSections.js");
  assert.match(sections, /id: "character", label: "基本・人格", description: "基本・キャラクター", tabIds: \["baseinfo", "persona"\]/);
  assert.match(sections, /id: "battle", label: "戦闘データ", tabIds: \["skill", "passive", "enh"\]/);
  assert.match(sections, /id: "equipment", label: "装備・構成", tabIds: \["support", "ego", "spirit", "items-build"\]/);
  assert.match(sections, /BUILD_TABS\.filter\(\(tab\) => activeGroup.tabIds.includes\(tab.id\)\)/);
  assert.match(sections, /id: "btab-" \+ tab.id/);
  assert.match(sections, /id: "bpanel-" \+ tab.id/);
});
test("Shop catalog keeps category selection in one place and exposes one return control", () => {
  const sections = read("../js/OtherSections.js");
  const catalogStart = sections.indexOf('className: "shop-workspace btype-shop-catalog"');
  const filtersStart = sections.indexOf('/* ガチャは商品を並べた画面ではなく、抽選権利の操作画面。', catalogStart);
  const catalog = sections.slice(catalogStart, filtersStart);
  assert.ok(catalogStart >= 0 && filtersStart > catalogStart);
  assert.match(catalog, /className: "btype-shop-catalog-heading"/);
  assert.match(catalog, /className: "btype-shop-categories-trigger"/);
  assert.doesNotMatch(catalog, /shop-tabs/);
});


test("Build workspace exposes all nine destinations as one direct tab row", () => {
  const sections = read("../js/OtherSections.js");
  assert.doesNotMatch(sections, /BUILD_TAB_GROUPS|build-group-nav|build-group-button/);
  assert.match(sections, /BUILD_TABS\.map\(\(tab\) => h\("button", \{/);
  assert.match(sections, /className: "build-tabs is-b-workbench subtabs btype-build-tabs"/);
  assert.match(sections, /className: "segmented btype-build-tablist", role: "tablist", "aria-label": "ビルドセクション"/);
  const tabSource = sections.slice(sections.indexOf("const BUILD_TABS = ["), sections.indexOf("if (typeof window !== \"undefined\")"));
  for (const label of ["基本", "人格", "スキル", "パッシブ", "強化", "サポート", "E.G.O", "精神", "アイテム"]) {
    assert.match(tabSource, new RegExp(`label: "${label}"`));
  }
});

test("mobile UI audit checks nine direct build tabs in a five-column two-row grid", () => {
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /\.build-tabs \.btype-build-tablist\[role="tablist"\]\[aria-label="ビルドセクション"\]/);
  assert.match(audit, /buttonCount !== 9/);
  assert.match(audit, /rowCount < 2/);
  assert.match(audit, /build-tabs-not-reflowed/);
  assert.doesNotMatch(audit, /build-group-nav|buttonCount !== 3|build-group-nav-not-reflowed/);
  const index = read("../index.html");
  assert.ok(index.includes('<style id="lbt-mobile-build-tab-grid-final">'));
  assert.ok(index.includes("grid-template-columns: repeat(5, minmax(0, 1fr)) !important"));
  assert.ok(index.includes("min-height: 40px !important"));
});

test("nine mobile build tabs remain directly selectable without a hidden horizontal rail", () => {
  const index = read("../index.html");
  const finalTouchStyles = index.slice(index.indexOf('<style id="lbt-mobile-build-tab-grid-final">'));
  assert.match(finalTouchStyles, /display: grid !important/);
  assert.match(finalTouchStyles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\) !important/);
  assert.match(finalTouchStyles, /overflow: visible !important/);
  assert.match(finalTouchStyles, /min-width: 40px !important/);
  assert.match(finalTouchStyles, /min-height: 40px !important/);
  assert.match(finalTouchStyles, /width: 100% !important/);
});

