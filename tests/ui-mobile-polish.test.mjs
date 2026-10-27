import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const workspace = read("../assets/workspace.css");
const polish = read("../assets/v69-ui-mobile-polish.css");
const index = read("../index.html");
const capture = read("../tools/ui/capture-ui-audit.mjs");

test("mobile build tabs use a visible 4-by-2 grid, not a clipped horizontal strip", () => {
  assert.match(polish, /\.build-tabs > \.segmented\s*\{[^}]*display:\s*grid/s);
  assert.match(polish, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(polish, /grid-auto-rows:\s*minmax\(44px,\s*auto\)/);
  assert.match(polish, /\.build-tabs > \.segmented > button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(polish, /\.record-tabbar \.segmented\s*\{[^}]*overflow-x:\s*auto/s);
});

test("mobile preview control is moved below the heading and uses a horizontal, accessible target", () => {
  assert.match(polish, /\.preview-edge-toggle\s*\{[^}]*bottom:\s*calc\(var\(--lbt-mobile-rail-h,\s*114px\)\s*\+\s*8px\)/s);
  assert.match(polish, /writing-mode:\s*horizontal-tb/);
  assert.match(polish, /min-height:\s*44px/);
  assert.match(polish, /\.section-title-row\s*\{[^}]*padding-right:\s*0/s);
  assert.match(polish, /\.section-title\s*\{[^}]*word-break:\s*keep-all/s);
  assert.match(workspace, /\.preview-edge-toggle/);
});

test("save-state import shows only applicable categories and folds empty categories away", () => {
  assert.match(app, /const availableImportGroups = importData \? IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\)/);
  assert.match(app, /const emptyImportGroups = importData \? IMPORT_GROUPS\.filter\(\(g\) => !g\.fields\.some\(\(f\) => f in importData\)\)/);
  assert.match(app, /availableImportGroups\.map\(\(g\) =>/);
  assert.match(app, /state-import-empty-groups/);
  assert.match(app, /このファイルに含まれない項目/);
  assert.match(app, /aria-labelledby": "state-import-title"/);
  assert.match(app, /aria-label": "読み込みをキャンセルして閉じる"/);
});

test("save-state import dialog has a bounded scrolling list and persistent action footer", () => {
  assert.match(app, /className: "state-import-scroll"/);
  assert.match(app, /className: "state-import-actions"/);
  assert.match(app, /className: "state-import-actions-confirm"/);
  assert.match(polish, /\.state-import-dialog\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/s);
  assert.match(polish, /\.state-import-scroll\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(polish, /\.state-import-actions\s*\{[^}]*border-top:/s);
  assert.match(polish, /\.state-import-actions-confirm \.btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(index, /assets\/v69-ui-mobile-polish\.css\?v=[0-9a-f]{8}/);
});

test("save-state import dialog supports focus entry, focus trap, Escape, and focus return", () => {
  assert.match(app, /requestAnimationFrame\(\(\) => document\.querySelector\("\.state-import-close"\)\?\.focus\(\)\)/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /document\.addEventListener\("keydown", onKey, true\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /document\.removeEventListener\("keydown", onKey, true\)/);
  assert.match(app, /previous\.focus\(\)/);
});

test("save-state import still applies only selected, present fields and has a zero-selection guard", () => {
  assert.match(app, /const fields = all\s*\? IMPORT_GROUPS\.flatMap\(\(g\) => g\.fields\)/);
  assert.match(app, /if \(!fields\.length\).*\\u8AAD/);
  assert.match(app, /dispatch\(\{ type: "APPLY_PARTIAL", state: importData, fields \}\)/);
});


test("UI audit fixture stores favorites in the same string-key format consumed by PersonaCodex", () => {
  assert.match(capture, /favorites:\s*\[mode \+ ":" \+ p\.no\]/);
  assert.doesNotMatch(capture, /favorites:\s*\[\{\s*key:/);
});
