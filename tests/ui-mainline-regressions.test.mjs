import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const livePreview = read("../js/LivePreview.js");
const otherSections = read("../js/OtherSections.js");
const css = read("../assets/v69-mobile-ui-audit.css");
const index = read("../index.html");

test("mobile preview can be opened from the top bar while App retains the sole persistent edge control", () => {
  assert.match(app, /className: "preview-mobile-toggle"/);
  assert.match(app, /onClick: togglePreview[\s\S]{0,250}"aria-expanded": previewOpen/);
  assert.match(app, /id: "lbt-preview-edge-toggle"/);
  assert.match(app, /"aria-controls": "preview-panel"/);
  assert.match(app, /"aria-expanded": previewOpen/);
  assert.doesNotMatch(livePreview, /lbt-preview-edge-toggle/);
  assert.match(livePreview, /className: `preview\$\{state\.ui\.previewOpen \? " is-open" : ""\}`/);
  assert.match(css, /\.preview-mobile-toggle:focus-visible[\s\S]*?outline: 2px solid var\(--gold-hi\)/);
});

test("the mobile audit stylesheet is loaded after the preview-controls stylesheet", () => {
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v70-preview-controls.css") < index.indexOf("assets/v69-mobile-ui-audit.css"));
});

test("phone widths keep account creation controls and category tabs usable", () => {
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s*>\s*\.lbt-cloud-panel\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s*>\s*\.acct-grid\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\[aria-label="ビルドセクション"\][\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.guide-filter-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.shop-tabs-sticky \.shop-tabs\[role="tablist"\]\[aria-label="ショップの種別"\]\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.record-tabbar \.card-header > \.segmented\[role="tablist"\]\[aria-label="記録セクションの種別"\]\s*\{[^}]*display:\s*grid/s);
});

test("Playwright preview audit follows the visible control at each viewport width", () => {
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  assert.match(capture, /profile\.mobile\?"\.preview-mobile-toggle":"#lbt-preview-edge-toggle"/);
  assert.match(capture, /async function metrics\(page,profile\)/);
  assert.match(capture, /await page\.locator\(profile\.mobile\?"\.preview-mobile-toggle":"#lbt-preview-edge-toggle"\)\.waitFor\(\{state:"visible",timeout:10000\}\)/);
  assert.match(app, /"aria-controls": "preview-panel", "aria-expanded": previewOpen/);
});

test("result import routes scroll their selected panel into view", () => {
  assert.match(otherSections, /const activeType = textPanel \? "text" : importPanel \? "glass" : heldOpen \? "held" : null;/);
  assert.match(otherSections, /panels\.find\(\(panel\) => panel\.querySelector\("textarea\.ledger-textarea"\)\)/);
  assert.match(otherSections, /target\?\.scrollIntoView\?\.\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(otherSections, /\}, \[textPanel, importPanel, heldOpen\]\);/);
});
