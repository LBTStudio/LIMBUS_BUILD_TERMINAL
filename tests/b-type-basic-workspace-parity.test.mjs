import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const app = read("../js/App.js");
const generator = read("../js/generator.js");
const parity = read("../assets/b-type-ui-parity.css");

test("Basic identity token card follows existing character data without embedding QA data", () => {
  const start = sections.indexOf('className: "pc-token-preview"');
  assert.notEqual(start, -1, "the production Basic sheet renders its token summary");
  const preview = sections.slice(start, start + 1800);
  for (const expected of [
    "state.charName", "state.plName", "state.initiative", "state.color",
    "state.hp", "state.san", "activeImg"
  ]) assert.ok(preview.includes(expected), "token summary must use state field " + expected);
  assert.doesNotMatch(preview, /サンプル・フィクサー|Playwright QA/, "QA fixtures must not ship in production data");
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
  assert.match(component, /navigator\.clipboard\?\.writeText\(built\.json\)/);
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

test("Basic preview views remain responsive and generated JSON stays readable on narrow screens", () => {
  assert.match(parity, /\.basic-preview-mode-tabs\s*\{[^}]*overflow-x:auto/);
  assert.match(parity, /\.basic-preview-json\s*\{[^}]*white-space:pre-wrap/);
  assert.match(parity, /@media\(max-width:640px\)[\s\S]*?\.basic-preview-json\s*\{/);
});
