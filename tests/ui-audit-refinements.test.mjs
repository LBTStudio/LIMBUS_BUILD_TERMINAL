import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const captureScript = readFileSync(new URL("../tools/ui/capture-ui-audit.mjs", import.meta.url), "utf8");

test("mobile preview toggle is moved into the unused bottom-nav cell instead of overlaying section content", () => {
  const mobile = workspace.slice(workspace.indexOf("UI audit refinements"));
  assert.match(mobile, /\.preview-edge-toggle\s*\{[^}]*top:\s*auto/s);
  assert.match(mobile, /\.preview-edge-toggle\s*\{[^}]*bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 4px\)/s);
  assert.match(mobile, /\.preview-edge-toggle\s*\{[^}]*writing-mode:\s*horizontal-tb/s);
  assert.match(mobile, /\.preview-edge-toggle\s*\{[^}]*height:\s*52px/s);
  assert.match(mobile, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none/s);
  assert.match(mobile, /left:\s*calc\(\(100vw - 28px\) \/ 6 \+ 8px\)/);
});

test("mobile build tabs fit in an explicit grid and do not depend on horizontal swiping", () => {
  const mobile = workspace.slice(workspace.indexOf("UI audit refinements"));
  assert.match(mobile, /\.build-tabs > \.segmented\s*\{[^}]*display:\s*grid/s);
  assert.match(mobile, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.build-tabs > \.segmented > button\s*\{[^}]*min-height:\s*40px/s);
  assert.match(mobile, /\.build-tabs > \.segmented > button\s*\{[^}]*white-space:\s*normal/s);
});

test("narrow section headings no longer reserve space for the floating preview tab", () => {
  const mobile = workspace.slice(workspace.indexOf("UI audit refinements"));
  assert.match(mobile, /\.section-title-row\s*\{[^}]*padding-right:\s*0/s);
  assert.match(mobile, /\.section-title\s*\{[^}]*font-size:\s*clamp\(15px, 4vw, 17px\)/s);
});

test("import scope hides unavailable categories by default but lets the user reveal them", () => {
  assert.match(app, /const \[showEmptyImportGroups, setShowEmptyImportGroups\] = React\.useState\(false\)/);
  assert.match(app, /setShowEmptyImportGroups\(false\);\s*setImportData\(data\)/);
  assert.match(app, /const emptyImportGroupCount = importData \? IMPORT_GROUPS\.filter\(\(g\) => !g\.fields\.some\(\(f\) => f in importData\)\)\.length : 0;/);
  assert.match(app, /className: "import-empty-groups-toggle"[\s\S]{0,260}aria-expanded": showEmptyImportGroups/s);
  assert.match(app, /if \(!has && !showEmptyImportGroups\) return null;/);
  assert.match(app, /const selectedImportGroups = importData \? IMPORT_GROUPS\.filter\(\(g\) => importSel\[g\.key\] && g\.fields\.some\(\(f\) => f in importData\)\) : \[\]/);
});

test("import scope actions stay visible while the category list scrolls on a phone", () => {
  assert.match(app, /maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0/);
  const mobile = workspace.slice(workspace.indexOf("UI audit refinements"));
  assert.match(mobile, /\.share-modal-backdrop > \.card > \.stack-2\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(mobile, /\.share-modal-backdrop > \.card > div:last-child\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(mobile, /\.share-modal-backdrop > \.card > div:last-child \.btn\s*\{[^}]*min-height:\s*40px/s);
});


test("UI audit selectors track the current import panels and share modal instead of stale DOM IDs", () => {
  assert.match(captureScript, /\\.ledger-gara-wrap/);
  assert.doesNotMatch(captureScript, /#ledger-text-import-panel|#ledger-glass-import-panel|import-scope-empty-categories/);
  assert.match(captureScript, /#lbt-share-modal-root \\.share-modal/);
  assert.match(captureScript, /#lbt-share-modal-root \[data-act='tab'\]/);
  assert.match(captureScript, /\\.import-empty-groups-toggle/);
  assert.match(captureScript, /share-html-self-preview/);
});
