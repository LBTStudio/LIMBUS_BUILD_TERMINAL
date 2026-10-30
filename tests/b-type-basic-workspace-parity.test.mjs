import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const app = read("../js/App.js");
const generator = read("../js/generator.js");
const parity = read("../assets/b-type-ui-parity.css");
const workbench = read("../assets/b-type-workbench.css");

test("Basic workspace follows the supplied Unified Workbench v4 B prototype", () => {
  const reference = read("../docs/ui-reference/LBT_UI_Refinement_Prototypes.html");
  const baseStart = sections.indexOf("const BaseSection =");
  const baseEnd = sections.indexOf("const PassiveCard =", baseStart);
  const base = sections.slice(baseStart, baseEnd);
  assert.match(reference, /Unified Workbench v4/);
  assert.match(reference, /id="prototype-b"/);
  for (const required of [
    'class="piece-hero-grid"', 'class="piece-art-wrap"', 'class="piece-art-thumbs"',
    'class="piece-control-grid"', 'class="piece-token-preview"', 'class="piece-format-panel"'
  ]) assert.ok(reference.includes(required), "reference must preserve " + required);
  for (const required of [
    'className: "piece-hero-grid"', 'className: "piece-art-wrap"', 'className: "piece-art-thumbs"',
    'className: "piece-control-grid"', 'className: "piece-token-card"', 'className: "piece-format-panel"'
  ]) assert.ok(sections.includes(required) || base.includes(required), "production must render " + required);
  for (const field of ["state.charName", "state.plName", "state.initiative", "state.color", "activeImg", "setImgTab", "state.imgUrls", "state.shareImageData"]) {
    assert.ok(base.includes(field), "Basic workspace must retain live field " + field);
  }
  assert.match(persona, /className: "baseinfo-workspace piece-workspace"/);
  assert.doesNotMatch(base, /className: "pc-sheet"/, "the obsolete pc-sheet layout must not remain the Basic root");
  assert.doesNotMatch(base, /サンプル・フィクサー|Playwright QA/, "QA fixtures must not ship in production data");
});

test("Basic format tabs live in app UI state so Home can deep-link to the output tab", () => {
  const start = sections.indexOf("const BuildParamsPanel =");
  const end = sections.indexOf("\n};", start);
  const panel = sections.slice(start, end);
  assert.match(panel, /state\.ui\?\.basicFormatTab/);
  assert.match(panel, /dispatch\(\{ type: "SET_UI", ui: \{ basicFormatTab: tab \} \}\)/);
  for (const id of ["statuses", "labels", "preview"]) {
    assert.ok(panel.includes('id: "build-params-panel-' + id + '"'), "missing format panel " + id);
    assert.ok(panel.includes('id: "build-params-tab-" + id'), "missing tab identifier");
    assert.ok(panel.includes('hidden: activeBuildParamsTab !== "' + id + '"'), "inactive " + id + " panel must be hidden");
  }
  assert.match(panel, /role: "tablist"/);
  assert.match(panel, /role: "tabpanel"/);
});

test("Basic output preview contains board, sheet and generated JSON views from LBT_gen", () => {
  const start = sections.indexOf("const BasicCcfOutputPreview =");
  const end = sections.indexOf("const BuildParamsPanel =", start);
  assert.ok(start >= 0 && end > start, "the real three-view output preview exists before BuildParamsPanel");
  const component = sections.slice(start, end);
  for (const label of ["盤面上の駒", "キャラクターシート", "出力データ"]) assert.ok(component.includes(label), "missing view " + label);
  for (const mode of ["board", "sheet", "json"]) assert.ok(component.includes('id: "' + "basic-ccfolia-panel-" + mode + '"'), "missing mode panel " + mode);
  assert.match(component, /generator\.buildCcfoliaJSON\(state, \{ palette, memo \}\)/);
  assert.match(component, /JSON\.stringify\(object, null, 2\)/);
  assert.match(component, /navigator\.clipboard\?\.writeText/);
  assert.match(component, /await navigator\.clipboard\.writeText\(built\.json\)/);
  assert.doesNotMatch(component, /const sample|mockData|サンプル・フィクサー/);
  assert.match(generator, /function buildCcfoliaJSON\(state, opts\)/);
});

test("Home preview shortcut opens the Basic integrated preview rather than the separate global preview", () => {
  assert.match(app, /id: "preview", title: "CCFOLIA駒プレビュー"[\s\S]*?run: \(\) => navigate\("baseinfo", \{ basicFormatTab: "preview", basicPreviewMode: "board", previewOpen: false \}\)/);
  assert.match(persona, /window\.LBT_BuildParamsPanel\(\{ state, dispatch \}\)/);
  assert.match(sections, /const BuildWorkspace = \(\{ state, dispatch, saveStatus \}\)/);
  assert.match(sections, /const panelProps = \["persona", "support", "ego", "spirit"\]/);
  assert.doesNotMatch(componentSlice(sections), /onTogglePreview/);
  assert.match(parity, /\.basic-preview-json\s*\{/);
  function componentSlice(source) {
    const start = source.indexOf("const BuildParamsPanel =");
    const end = source.indexOf("\n};", start);
    return source.slice(start, end);
  }
});

test("B-type phone navigation matches the approved four routes and preserves access to Home", () => {
  const start = app.indexOf("const MobileBottomNavigation =");
  const end = app.indexOf("const HomeLauncher =", start);
  assert.ok(start >= 0 && end > start, "mobile navigation component exists separately from the desktop rail");
  const nav = app.slice(start, end);
  for (const label of ["ビルド", "記録", "取込", "その他"]) {
    assert.ok(nav.includes('label: "' + label + '"'), "missing mobile destination " + label);
  }
  assert.match(nav, /onOpenImportRouter/);
  assert.match(nav, /onOpenUtilities/);
  assert.match(app, /SECTIONS\.filter\(\(s\) => s\.group === "utility" \|\| s\.id === "home" \|\| s\.id === "shop"\)/);
  assert.match(workbench, /\.btype-mobile-bottom-nav\s*\{\s*display:\s*none/);
  assert.match(workbench, /@media \(max-width: 640px\)[\s\S]*?\.app > \.rail \{ display: none !important; \}[\s\S]*?\.btype-mobile-bottom-nav/);
  assert.match(workbench, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test("Basic preview views remain responsive and generated JSON stays readable on narrow screens", () => {
  assert.match(parity, /\.basic-preview-mode-tabs\s*\{[^}]*overflow-x:auto/);
  assert.match(parity, /\.basic-preview-json\s*\{[^}]*white-space:pre-wrap/);
  assert.match(parity, /@media\(max-width:640px\)[\s\S]*?\.basic-preview-json\s*\{/);
});
