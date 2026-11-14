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
  assert.equal((app.split('"aria-controls": previewOpen ? "preview-panel" : void 0').length - 1), 2);
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
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s+\.acct-panel-cloud\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.acct-gate-panel:has\(\.acct-card--form\)\s+\.acct-panel-accounts > \.acct-grid--gate\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\[aria-label="ビルドセクション"\][\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.guide-filter-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.shop-tabs-sticky \.shop-tabs\[role="tablist"\]\[aria-label="ショップの種別"\]\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.record-tabbar \.card-header > \.segmented\[role="tablist"\]\[aria-label="記録セクションの種別"\]\s*\{[^}]*display:\s*grid/s);
});

test("Playwright preview audit follows the visible control at each viewport width", () => {
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  assert.match(capture, /profile\.mobile\?"\.preview-mobile-toggle":"#lbt-preview-edge-toggle"/);
  assert.match(capture, /async function metrics\(page,profile\)/);
  assert.match(capture, /const toggleSelector=profile\.mobile\?"\.preview-mobile-toggle":"#lbt-preview-edge-toggle"/);
  assert.match(capture, /const toggle=page\.locator\(toggleSelector\)/);
  assert.match(capture, /const t=await rect\(toggle\), p=await rect\(panel\)/);
  assert.ok(app.includes('"aria-controls": previewOpen ? "preview-panel" : void 0, "aria-expanded": previewOpen'));
});

test("result import routes scroll their selected panel into view", () => {
  assert.match(otherSections, /const activeType = textPanel \? "text" : importPanel \? "glass" : heldOpen \? "held" : null;/);
  assert.match(otherSections, /panels\.find\(\(panel\) => panel\.querySelector\("textarea\.ledger-textarea"\)\)/);
  assert.match(otherSections, /target\?\.scrollIntoView\?\.\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(otherSections, /\}, \[textPanel, importPanel, heldOpen\]\);/);
});

test("collapsed preview has no residual portrait or miniature CCFOLIA preview in the Basic workspace", () => {
  for (const selector of ["piece-art-frame", "piece-art-wrap", "piece-art-thumbs", "basic-ccfolia-preview", "BasicCcfOutputPreview", "btype-workbench-preview-panel", "preview-lines", "btype-preflight-note"]) {
    assert.ok(!otherSections.includes(selector), "collapsed workspace must not contain " + selector);
  }
  assert.ok(otherSections.includes("立ち絵URL・差分を編集"));
  assert.ok(otherSections.includes('previewOpen: true, previewTab: "token"'));
  assert.ok(app.includes("isBuildWorkspace && previewOpen ? React.createElement(LivePreview"));
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  assert.match(capture, /collapsed Basic workspace contains no preview image, miniature or duplicate panel/);
  assert.match(capture, /Home preview shortcut opens the shared CCFOLIA tab/);
  assert.doesNotMatch(capture, /\.piece-art-frame img|previewFormatTab|previewFormatPanel|basic-ccfolia-panel-board/);
});


test("v72 applies one whole-app type and color system without gradients", () => {
  const v72 = index.match(/<style id="lbt-v72-ui-health-refinement">([\s\S]*?)<\/style>/)?.[1] || "";
  assert.ok(v72.length > 1000, "v72 inline refinement stylesheet must be present");
  for (const token of ["--ui-bg", "--ui-surface", "--ui-line", "--ui-text", "--ui-accent"]) {
    assert.match(v72, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const size of ["11px", "13px", "15px", "18px", "24px"]) assert.ok(v72.includes(size));
  assert.match(v72, /--sin-憤怒: #d94d3f/);
  assert.match(v72, /--ego-influence: #b872d9/);
  assert.match(v72, /\.piece-hero-grid:has\(\.piece-url-preview-empty\)/);
  assert.match(v72, /\.btype-launcher-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});


test("v72 restores the previous LBT semantic palette without changing the five-step type scale", () => {
  const v72 = index.match(/<style id="lbt-v72-ui-health-refinement">([\s\S]*?)<\/style>/)?.[1] || "";
  for (const value of [
    "--ui-bg: #0e0b09", "--ui-surface: var(--surface-2)", "--ui-line: #504a42",
    "--gold: #d4af5f", "--accent: #c8352b", "--amber: #e8963c",
    "--sin-憤怒: #d94d3f", "--sin-色欲: #ea813a", "--sin-怠惰: #d9d357",
    "--sin-暴食: #7ec455", "--sin-憂鬱: #3f9fe9", "--sin-傲慢: #5c5bd6",
    "--sin-嫉妬: #b872d9", "--rank-ALEPH: #b83a3a",
    "--res-脆弱: #8f3a33", "--res-免疫: #6b5a8a"
  ]) assert.ok(v72.includes(value), "missing restored token: " + value);
  for (const size of ["11px", "13px", "15px", "18px", "24px"]) assert.ok(v72.includes(size));
  assert.doesNotMatch(v72, /linear-gradient|radial-gradient|conic-gradient/);
});

test("all pawn portraits and face differences are shown in a wrapping grid and eagerly loaded", () => {
  assert.match(index, /\.base-info-panel \.piece-url-preview-list[\s\S]*?display:\s*grid !important/);
  assert.match(index, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(68px,\s*1fr\)\)/);
  assert.match(index, /@media \(max-width: 560px\)[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(40px, 1fr\)\)/);
  assert.match(index, /\.piece-url-preview-item \.piece-url-preview-frame[\s\S]*?max-height: 64px/);
  assert.match(otherSections, /loading:\s*"eager",\s*fetchPriority:\s*index\s*===\s*selectedImageIndex/);
  assert.doesNotMatch(otherSections, /loading:\s*index\s*===\s*selectedImageIndex\s*\?\s*"eager"\s*:\s*"lazy"/);
  const capture = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(capture, /allPreviewGeometry\.display!=="grid"/);
  assert.match(capture, /allPreviewGeometry\.itemsOutside>0/);
});


test("v71 preserves the restored LBT base palette and semantic surface treatments", () => {
  const v71 = read("../assets/v71-unified-visual.css");
  const design = read("../assets/design-system.css");
  for (const token of ["--ui-bg: #0e0b09", "--ui-surface: #211d1a", "--ui-line: #504a42", "--ui-text: #f2ece1", "--ui-accent: #d4af5f"]) {
    assert.ok(v71.includes(token), "restored base color: " + token);
  }
  assert.doesNotMatch(v71, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.match(v71, /background-image:\\s*none !important;/);
  assert.match(design, /--surface-3:\\s*#292420/);
  assert.match(design, /--sin-憤怒:/);
  assert.match(design, /--ego-influence:\\s*#b872d9/);
  assert.match(design, /--rank-ALEPH:/);
  assert.match(design, /--res-脆弱:/);
});
