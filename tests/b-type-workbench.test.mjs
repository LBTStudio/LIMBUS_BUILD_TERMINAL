import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("B-type shell gives non-workbench pages the full canvas and scopes preview to the workbench", () => {
  const css = read("../assets/b-type-workbench.css");
  const app = read("../js/App.js");
  assert.match(css, /--b-rail-w:\s*190px/);
  assert.match(css, /--b-preview-w:\s*clamp\(340px, 28vw, 420px\)/);
  assert.match(css, /--preview-w:\s*var\(--b-preview-w\)/);
  assert.match(css, /--b-preview-w:\s*clamp\(300px, 27vw, 340px\)/);
  assert.match(css, /--preview-w:\s*var\(--b-preview-w\)/);
  assert.match(css, /\.app\.has-preview\s*\{\s*grid-template-columns:\s*var\(--b-rail-w\) minmax\(0, 1fr\) var\(--b-preview-w\)/);
  assert.match(app, /className: "rail"/);
  assert.match(app, /className: "focus"/);
  assert.match(app, /isBuildWorkspace && previewOpen \? React\.createElement\(LivePreview, \{ state, dispatch \}\)/);
  assert.match(app, /label: "ビルド"/);
  assert.match(app, /label: "記録・所持品"/);
});

test("B-type home guides the next character-sheet action and folds secondary tools", () => {
  const app = read("../js/App.js");
  assert.match(app, /className: "btype-home-primary"/);
  assert.match(app, /className: "btype-home-primary-action"/);
  assert.match(app, /className: "btype-home-progress"/);
  assert.match(app, /className: "btype-home-start-grid"/);
  assert.match(app, /className: "btype-home-more"/);
  assert.match(app, /既存データを取り込む/);
  assert.match(app, /記録・所持品を管理/);
  assert.match(app, /その他の機能を探す/);
  assert.match(app, /onOpenImportRouter/);
});

test("B-type production styles adapt to tablet and mobile without disabling reduced motion", () => {
  const css = read("../assets/b-type-workbench.css");
  assert.match(css, /\.btype-home-primary\s*\{/);
  assert.match(css, /\.btype-home-progress\s*\{/);
  assert.match(css, /\.btype-home-start-card\s*\{/);
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Basic layout follows v4: portrait and settings share the hero, formatting stays below", () => {
  const css = read("../assets/b-type-ui-parity.css");
  const reference = read("../docs/ui-reference/LBT_UI_Refinement_Prototypes.html");
  assert.match(reference, /Unified Workbench v4/);
  assert.match(reference, /\.piece-hero-grid\s*\{/);
  assert.match(css, /\.piece-hero-grid\{display:grid;grid-template-columns:minmax\(230px,\.78fr\) minmax\(0,1\.22fr\)/);
  assert.match(css, /\.piece-format-panel/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.piece-hero-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.doesNotMatch(css, /\.app\.preview-collapsed \.baseinfo-workspace\s*\{\s*grid-template-columns/, "the obsolete editor/format side-by-side override must stay removed");
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /basic-workspace-v4-hero/);
  assert.match(audit, /portraitGeometry\.ratio/);
});

test("UI audit covers desktop, tablet and mobile across Home, settings and all record tabs", () => {
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /for\(const mode of \["desktop","tablet","mobile","mobile-narrow"\]\)/);
  assert.match(audit, /width:1024,height:768/);
  assert.match(audit, /width:320,height:640/);
  assert.match(audit, /記録・所持品の6カテゴリタブが揃っていません/);
  assert.match(audit, /details\.settings-disclosure/);
  assert.match(audit, /home-guided-workflow-review/);
  assert.match(audit, /import-router-all-destinations/);
  assert.match(audit, /settingsDisclosurePanels/);
  assert.match(audit, /build-editor-operation-paths/);
  assert.match(audit, /all six owned-library categories/);
});
