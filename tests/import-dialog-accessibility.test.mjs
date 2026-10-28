import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const css = read("../assets/v69-mobile-ui-audit.css");
const index = read("../index.html");

test("state-import modal has labelled dialog semantics and only relevant categories", () => {
  assert.match(app, /ref: importDialogRef, className: "card import-scope-dialog", role: "dialog", "aria-modal": "true"/);
  assert.match(app, /"aria-labelledby": "import-scope-title", "aria-describedby": "import-scope-description", tabIndex: -1/);
  assert.match(app, /IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)\.map/);
  assert.match(css, /\.import-scope-dialog/);
  assert.match(css, /\.import-scope-options/);
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
});

test("state-import modal traps Tab and Shift+Tab and redirects escaped focus", () => {
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /const importReturnFocusRef = React\.useRef\(null\)/);
  assert.match(app, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(app, /!dialog\?\.contains\(document\.activeElement\) \|\| !focusable\.includes\(document\.activeElement\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first[\s\S]{0,100}last\.focus\(\)/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last[\s\S]{0,100}first\.focus\(\)/);
});

test("Escape closes the state-import dialog and focus returns to the opening control", () => {
  assert.match(app, /if \(event\.key === "Escape"\)[\s\S]{0,180}setImportData\(null\)/);
  assert.match(app, /importReturnFocusRef\.current = document\.activeElement instanceof HTMLElement/);
  assert.match(app, /if \(trigger && document\.contains\(trigger\)\) trigger\.focus\(\)/);
});
