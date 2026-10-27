import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/v69-ui-audit-fixes.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const capture = readFileSync(new URL("../tools/ui/capture-ui-audit.mjs", import.meta.url), "utf8");

test("mobile build tabs fit into a 4-by-2 grid with usable touch targets", () => {
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.build-tabs \.segmented\[role="tablist"\]\s*>\s*button\s*\{[^}]*min-height:\s*40px/s);
  assert.match(css, /overflow:\s*visible/);
});

test("mobile preview control no longer blocks headings and tab rows", () => {
  assert.match(css, /#lbt-preview-edge-toggle\.preview-edge-toggle\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(var\(--lbt-mobile-rail-h/s);
  assert.match(css, /writing-mode:\s*horizontal-tb/);
});

test("save-state import modal is an accessible dialog and supports Escape and focus trapping", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "import-scope-title"/);
  assert.match(app, /id: "import-scope-title"/);
  assert.match(app, /event\.key === "Escape"[\s\S]*?setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /document\.addEventListener\("keydown", onKeyDown, true\)/);
});

test("empty import categories are collapsed while available categories remain selectable", () => {
  assert.match(app, /const availableImportGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /const emptyImportGroups = importData \? IMPORT_GROUPS\.filter/);
  assert.match(app, /className: "import-scope-empty-groups"/);
  assert.match(app, /className: "import-scope-available-groups"/);
  assert.match(app, /className: "import-scope-empty-badge"/);
  assert.match(css, /\.import-scope-dialog > \.import-scope-groups\s*\{[^}]*overflow-y:\s*auto/s);
});

test("mobile import actions remain visible in the dialog footer", () => {
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(css, /\.import-scope-dialog > \.import-scope-actions\s*\{[^}]*display:\s*grid\s*!important/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /max-height:\s*min\(85dvh,\s*760px\)\s*!important/);
});

test("mobile help category and clear-search targets have a larger hit area", () => {
  assert.match(css, /\.guide-filter-row button,[\s\S]*?min-height:\s*36px/);
  assert.match(css, /button\[aria-label="検索をクリア"\]\s*\{[^}]*min-height:\s*36px/s);
});

test("UI audit CSS is versioned and cached, and audit includes a 320px viewport", () => {
  const match = index.match(/assets\/v69-ui-audit-fixes\.css\?v=([0-9a-f]{8})/);
  assert.ok(match, "index.html references the new hashed stylesheet");
  assert.ok(sw.includes("assets/v69-ui-audit-fixes.css?v=" + match[1]));
  assert.match(capture, /width:320,height:640/);
  assert.match(capture, /for\(const mode of \["desktop","mobile","narrow"\]\)/);
});
