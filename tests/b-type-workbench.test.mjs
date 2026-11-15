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


test("mobile UI audit validates three grouped build controls instead of the old nine-tab grid", () => {
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /\.build-group-nav\[role="group"\]/);
  assert.match(audit, /buttonCount !== 3/);
  assert.match(audit, /\.pv-ccfolia-preview \.pv-token-mode-switch > button/);
  assert.match(audit, /\.ledger-result-entry-body details > summary/);
  assert.match(audit, /button\.chip\.is-sm/);
  const css = read("../assets/b-type-ui-parity.css");
  assert.match(css, /pv-token-mode-switch\[role="group"\] > button\s*\{\s*min-height:44px/);
  assert.match(css, /button\.chip\.is-sm\s*\{\s*min-width:44px/);
  assert.match(audit, /tabButtonsBelowMinimum/);
  const paletteCss = read("../assets/b-type-ui-parity.css");
  assert.match(paletteCss, /\.build-tabs\.is-b-workbench \.build-group-button small\{[^}]*color:#a39a89/);
  assert.match(audit, /tabRailScrollable && !\["auto", "scroll"\]\.includes\(nav\.tabRailOverflowX\)/);
  assert.doesNotMatch(audit, /buttonCount !== 9/);
  assert.doesNotMatch(audit, /9 tabs in a 5-column grid/);
});


test("mobile build group names and subtabs stay on one line at touch size", () => {
  const sections = read("../js/OtherSections.js");
  const css = read("../assets/b-type-ui-parity.css");
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(sections, /label: "基本・人格", description: "基本・キャラクター"/);
  assert.doesNotMatch(sections, /"aria-label": group\.label \+/, "use the visible tab group text as its accessible name");
  assert.match(sections, /className: "build-group-button-label"/);
  assert.match(sections, /h\("small", null, group\.tabIds\.length \+ "項目"\)/);
  assert.match(css, /\.build-tabs\.is-b-workbench \.build-group-button-label[\s\S]*?white-space:nowrap !important/);
  assert.match(css, /\.build-tabs\.is-b-workbench \.btype-build-tablist > \[role="tab"\][\s\S]*?white-space:nowrap !important/);
  assert.match(css, /min-height:44px !important/);
  assert.match(audit, /tabButtonsWrapping/);
  assert.match(audit, /tabRailFlexWrap/);
});


test("index.html no longer overrides the grouped build navigation with the legacy nine-tab grid", () => {
  const index = read("../index.html");
  assert.ok(index.includes('<style id="lbt-mobile-build-group-navigation-final">'));
  assert.ok(index.includes("grid-template-columns: repeat(3, minmax(0, 1fr)) !important"));
  assert.ok(index.includes("overflow-x: auto !important"));
  assert.ok(index.includes("white-space: nowrap !important"));
  assert.ok(!index.includes("lbt-mobile-build-tab-grid-final"));
  assert.ok(!index.includes("grid-template-columns: repeat(5, minmax(0, 1fr)) !important"));
});


test("build group count labels meet normal-text contrast against the dark surface", () => {
  const css = read("../assets/b-type-ui-parity.css");
  assert.match(css, /\.build-group-button small\{color:#918572\}/);
});
