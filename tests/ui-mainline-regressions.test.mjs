import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const livePreview = read("../js/LivePreview.js");
const otherSections = read("../js/OtherSections.js");
const css = read("../assets/v69-mobile-ui-audit.css");
const index = read("../index.html");

test("mobile preview can be opened from the top bar and collapsed preview remains reachable", () => {
  assert.match(app, /className: "preview-mobile-toggle"/);
  assert.match(app, /onClick: togglePreview[\s\S]{0,250}"aria-expanded": previewOpen/);
  assert.match(livePreview, /edgeToggle\.id = "lbt-preview-edge-toggle"/);
  assert.match(livePreview, /edgeToggle\.textContent = previewOpen \? "◀ 格納" : "▶ 展開"/);
  assert.match(livePreview, /const previewOpen = state\.ui\.previewOpen === true;/);
  assert.match(css, /\.preview-mobile-toggle:focus-visible[\s\S]*?outline: 2px solid var\(--gold-hi\)/);
  assert.match(css, /\.preview-edge-toggle,[\s\S]*?\.preview-reopen \{\s*display: none !important;/);
});

test("the mobile UI audit stylesheet is loaded after the existing accessibility stylesheet", () => {
  const v68 = index.indexOf("assets/v68-interaction-a11y.css");
  const v69 = index.indexOf("assets/v69-mobile-ui-audit.css");
  assert.ok(v68 >= 0 && v69 > v68, "mobile fixes must be applied after v68");
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
});

test("phone widths keep account creation controls and all main category tabs usable", () => {
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s*>\s*\.lbt-cloud-panel\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s*>\s*\.acct-grid\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\[aria-label="ビルドセクション"\][\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.guide-filter-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.shop-tabs-sticky \.shop-tabs\[role="tablist"\]\[aria-label="ショップの種別"\]\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.record-tabbar \.card-header > \.segmented\[role="tablist"\]\[aria-label="記録セクションの種別"\]\s*\{[^}]*display:\s*grid/s);
});

test("result text, Glass Window, and held-roster import routes scroll their selected panel into view", () => {
  assert.match(otherSections, /const activeType = textPanel \? "text" : importPanel \? "glass" : heldOpen \? "held" : null;/);
  assert.match(otherSections, /panels\.find\(\(panel\) => panel\.querySelector\("textarea\.ledger-textarea"\)\)/);
  assert.match(otherSections, /target\?\.scrollIntoView\?\.\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(otherSections, /\}, \[textPanel, importPanel, heldOpen\]\);/);
});
