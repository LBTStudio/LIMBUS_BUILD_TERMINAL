import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/v69-ui-audit-refinements.css", import.meta.url), "utf8");

test("mobile build tabs show all eight options in a two-row grid rather than hiding tabs offscreen", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.build-tabs \{\s*display: block;/);
  assert.match(mobile, /\.build-tabs \.segmented \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.build-tabs \.segmented > button \{[\s\S]*?min-height: 42px;[\s\S]*?white-space: normal;/);
});

test("the fixed preview handle no longer obscures the mobile heading or tab strip", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.preview-edge-toggle \{\s*display: none;/);
  assert.match(mobile, /\.section-title-row \{[\s\S]*?padding-right: 0;/);
  assert.match(mobile, /\.section-title \{[\s\S]*?font-size: clamp\(15px, 4\.35vw, 17px\)/);
  assert.match(app, /label: previewOpen \? "プレビューを閉じる" : "プレビューを開く"/);
});

test("state import initially displays data-bearing categories and keeps the action footer reachable", () => {
  assert.match(app, /const \[showEmptyImportGroups, setShowEmptyImportGroups\] = React\.useState\(false\)/);
  assert.match(app, /const importGroupsWithData = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /if \(!has && !showEmptyImportGroups\) return null/);
  assert.match(app, /aria-expanded": showEmptyImportGroups/);
  assert.match(app, /className: "stack-2 state-import-list"/);
  assert.match(app, /className: "state-import-footer"/);
  assert.match(css, /\.state-import-dialog \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.state-import-list \{[\s\S]*?flex: 1 1 auto;[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.state-import-footer \{[\s\S]*?flex: 0 0 auto;[\s\S]*?border-top: 1px solid var\(--line\)/);
});

test("state import dialog exposes dialog semantics and traps/restores keyboard focus", () => {
  assert.match(app, /role: "dialog",[\s\S]{0,100}"aria-modal": "true",[\s\S]{0,100}"aria-labelledby": "state-import-dialog-title"/);
  assert.match(app, /if \(event\.key === "Escape"\)[\s\S]*?setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /document\.activeElement === last/);
  assert.match(app, /document\.contains\(previous\)\) previous\.focus\(\)/);
});
