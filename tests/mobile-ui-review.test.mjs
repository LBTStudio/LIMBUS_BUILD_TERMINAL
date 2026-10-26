import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/v68-interaction-a11y.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("mobile preview toggle no longer overlays the workspace", () => {
  const rule = css.match(/#lbt-preview-edge-toggle\.preview-edge-toggle\s*\{([^}]*)\}/s);
  assert.ok(rule, "mobile override targets the actual external preview toggle");
  assert.match(rule[1], /top:\s*auto/);
  assert.match(rule[1], /bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 4px\)/);
  assert.match(rule[1], /writing-mode:\s*horizontal-tb/);
  assert.match(rule[1], /min-height:\s*40px/);
});

test("mobile build navigation exposes all eight tabs in a two-row grid", () => {
  assert.match(css, /\.build-tabs \.segmented\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.build-tabs \.segmented > button\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.build-tabs \.segmented > button\s*\{[^}]*min-height:\s*40px/s);
});

test("mobile save-import dialog scrolls its category list and keeps footer actions visible", () => {
  assert.match(css, /\.share-modal-backdrop:has\(\.import-apply-summary\) > \.card\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.share-modal-backdrop:has\(\.import-apply-summary\) \.stack-2\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.share-modal-backdrop:has\(\.import-apply-summary\) > \.card > div:last-child\s*\{[^}]*display:\s*grid !important/s);
  assert.match(css, /label\[style\*="opacity: 0\.4"\]\s*\{\s*display:\s*none/);
  assert.match(index, /assets\/v68-interaction-a11y\.css\?v=[0-9a-f]{8}/);
  assert.match(sw, /assets\/v68-interaction-a11y\.css\?v=[0-9a-f]{8}/);
});
