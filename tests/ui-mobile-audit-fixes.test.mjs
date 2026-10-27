import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const css = read("../assets/v69-mobile-ui-audit.css");
const index = read("../index.html");
const livePreview = read("../js/LivePreview.js");

test("the mobile preview control is in the top bar and remains keyboard-accessible", () => {
  assert.match(app, /className: "preview-mobile-toggle"/);
  assert.match(app, /onClick: togglePreview[\s\S]{0,200}"aria-expanded": previewOpen/);
  assert.match(app, /name: previewOpen \? "eye-off" : "eye"/);
  assert.match(css, /\.preview-mobile-toggle:focus-visible[\s\S]*?outline: 2px solid var\(--gold-hi\)/);
  assert.match(css, /\.preview-edge-toggle,[\s\S]*?\.preview-reopen \{\s*display: none !important;/);
  assert.match(livePreview, /id = "lbt-preview-edge-toggle"/);
});

test("all eight build tabs are visible in a four-column grid on phone widths", () => {
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\[aria-label="ビルドセクション"\][\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\[aria-label="ビルドセクション"\] > button[\s\S]*?white-space: normal/);
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
});

test("state import only lists categories present in the chosen file", () => {
  assert.match(app, /IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)\.map/);
  assert.match(app, /className: "stack-2 import-scope-options"/);
  assert.doesNotMatch(app, /className: "stack-2" \}, IMPORT_GROUPS\.map\(\(g\) => \{\s*const has = g\.fields\.some/);
  assert.doesNotMatch(app, /データなし/);
});

test("long state-import lists scroll independently while decision controls remain visible", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true"/);
  assert.match(app, /"aria-labelledby": "import-scope-title", "aria-describedby": "import-scope-description"/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(app, /const focusInitialControl = \(\) =>/);
  assert.match(app, /if \(event\.key === "Escape"\)[\s\S]{0,100}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first[\s\S]{0,120}last\.focus\(\)/);
  assert.match(css, /\.import-scope-dialog \{[\s\S]*?display: flex;[\s\S]*?max-height: calc\(100dvh - 48px\);[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.import-scope-options \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.import-scope-actions \{[\s\S]*?flex: 0 0 auto;/);
});

test("the new stylesheet loads after the existing UI styles", () => {
  const v68 = index.indexOf("assets/v68-interaction-a11y.css");
  const v69 = index.indexOf("assets/v69-mobile-ui-audit.css");
  assert.ok(v68 >= 0 && v69 > v68);
});
