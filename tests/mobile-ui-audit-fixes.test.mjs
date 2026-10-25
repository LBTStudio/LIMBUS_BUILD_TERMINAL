import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const index = read("../index.html");
const sw = read("../sw.js");
const css = read("../assets/v69-ui-review.css");

test("UI review CSS is loaded after the prior refinements and included in offline precache", () => {
  assert.match(index, /assets\/v69-ui-review\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v69-ui-review.css") > index.indexOf("assets/inline-effect-glossary.css"));
  assert.match(sw, /"assets\/v69-ui-review\.css\?v=[0-9a-f]{8}"/);
  assert.match(index, /js\/App\.js\?v=[0-9a-f]{8}/);
});

test("mobile preview edge tab no longer overlays page content", () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?body > \.preview-edge-toggle,[\s\S]*?\.app \.preview-reopen,[\s\S]*?display:\s*none\s*!important;/);
  assert.match(app, /操作・保存.*プレビューを開く／閉じる/);
});

test("all eight build tabs are visible as a mobile grid, not a hidden horizontal strip", () => {
  assert.match(css, /\.build-workspace \.build-tabs \.segmented\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.build-workspace \.build-tabs \.segmented > button\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?min-height:\s*42px;/);
});

test("mobile help category chips wrap and remain reachable without a horizontal swipe", () => {
  assert.match(css, /\.guide-filter-row\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow-x:\s*visible;/);
});

test("save import dialog shows available categories first and hides unavailable ones behind an explicit toggle", () => {
  assert.match(app, /const \[showEmptyImportGroups, setShowEmptyImportGroups\] = React\.useState\(false\)/);
  assert.match(app, /const importAvailableGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /const importEmptyGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /const visibleImportGroups = showEmptyImportGroups \? IMPORT_GROUPS : importAvailableGroups/);
  assert.match(app, /データのない項目を表示（/);
  assert.match(app, /データあり /);
});

test("save import dialog has modal semantics, a bounded scroll region, and persistent action footer", () => {
  assert.match(app, /className: "card import-dialog"[\s\S]*?role: "dialog"[\s\S]*?"aria-modal": "true"[\s\S]*?"aria-labelledby": "import-state-title"/);
  assert.match(app, /className: "import-groups-scroll", role: "group"/);
  assert.match(app, /className: "import-dialog-footer"/);
  assert.match(css, /\.import-groups-scroll\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.import-dialog-footer\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?border-top:/);
});

test("save import dialog supports Escape and traps keyboard focus while open", () => {
  assert.match(app, /if \(event\.key === "Escape"\) \{[\s\S]*?setImportData\(null\);/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(app, /document\.removeEventListener\("keydown", onKeyDown, true\)/);
});
