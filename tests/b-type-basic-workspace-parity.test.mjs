import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const app = read("../js/App.js");
const parity = read("../assets/b-type-ui-parity.css");

test("Basic sheet has a live token preview bound to the real character state", () => {
  const start = sections.indexOf('className: "pc-token-preview"');
  assert.notEqual(start, -1, "the actual BaseSection must render the token preview");
  const preview = sections.slice(start, start + 1800);
  for (const expected of [
    "state.charName", "state.plName", "state.initiative", "state.color",
    "state.hp", "state.san", "activeImg"
  ]) assert.ok(preview.includes(expected), "token preview must use the existing state field " + expected);
  assert.doesNotMatch(preview, /サンプル・フィクサー|Playwright QA/, "runtime test fixtures must not be shipped as preview data");
});

test("Basic format separates status, labels and live output into accessible tab panels", () => {
  const start = sections.indexOf("const BuildParamsPanel =");
  const end = sections.indexOf("\n};", start);
  assert.ok(start >= 0 && end > start, "BuildParamsPanel is available");
  const panel = sections.slice(start, end);
  for (const id of ["statuses", "labels", "preview"]) {
    assert.ok(panel.includes('id: "build-params-panel-' + id + '"'), "missing " + id + " panel");
  }
  assert.ok(panel.includes('id: "build-params-tab-" + id'), "each internal tab has a stable, matching ID");
  assert.match(panel, /role: "tablist"/);
  assert.match(panel, /role: "tabpanel"/);
  assert.match(panel, /hidden: activeBuildParamsTab !== "statuses"/);
  assert.match(panel, /hidden: activeBuildParamsTab !== "labels"/);
  assert.match(panel, /hidden: activeBuildParamsTab !== "preview"/);
});

test("Output tab opens the shared live preview rather than creating duplicate preview state", () => {
  assert.match(panelSlice(sections), /onTogglePreview/);
  assert.match(persona, /LBT_BuildParamsPanel\(\{ state, dispatch, onTogglePreview \}\)/);
  assert.match(sections, /const BuildWorkspace = \(\{ state, dispatch, saveStatus, onTogglePreview \}\)/);
  assert.match(app, /React\.createElement\(BuildWorkspace, \{ state, dispatch, saveStatus, onTogglePreview: togglePreview \}\)/);
  assert.match(parity, /\.build-params-pane\[hidden\]\s*\{\s*display:\s*none!important/);
});

function panelSlice(source) {
  const start = source.indexOf("const BuildParamsPanel =");
  const end = source.indexOf("\n};", start);
  return source.slice(start, end);
}

test("Basic tab's responsive tabs remain reachable without adding document overflow", () => {
  assert.match(parity, /\.build-params-tabs\s*\{[^}]*overflow-x:auto/);
  assert.match(parity, /@media\(max-width:700px\)[\s\S]*?\.build-params-preview-grid\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
});
