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

test("B-type home has the prototype's command hero, searchable nine-action grid, and resume row", () => {
  const app = read("../js/App.js");
  assert.match(app, /className: "btype-command-hero"/);
  assert.match(app, /className: "btype-command-search"/);
  assert.match(app, /className: "btype-launcher-grid"/);
  assert.match(app, /className: "btype-continue-panel"/);
  assert.match(app, /"基本情報・駒整形"/);
  assert.match(app, /"データを取り込む"/);
  assert.match(app, /"保存・復元・共有"/);
  assert.match(app, /onOpenImportRouter: openImportRouter/);
});

test("B-type production styles adapt to tablet and mobile without disabling reduced motion", () => {
  const css = read("../assets/b-type-workbench.css");
  assert.match(css, /\.btype-command-hero\s*\{/);
  assert.match(css, /\.btype-launcher-grid\s*\{/);
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Basic workspace keeps image editing but removes inline portrait and duplicate preview", () => {
  const sections = read("../js/OtherSections.js");
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  const previewCapture = read("../tools/ui/capture-preview-control-regression.mjs");
  const base = sections.slice(sections.indexOf("const BaseSection ="), sections.indexOf("const PersonaSection ="));
  assert.doesNotMatch(base, /piece-art-frame|piece-art-wrap|piece-art-thumbs|basic-ccfolia-preview/);
  assert.match(base, /piece-image-urls/);
  assert.match(previewCapture, /collapsed Basic workspace contains no preview image, miniature or duplicate panel/);
  assert.match(previewCapture, /previewPanelCount === 0/);
  assert.doesNotMatch(audit, /basic-workspace-v4-hero|portraitGeometry\.ratio/);
  assert.match(audit, /preview-panel/);
});

test("UI audit covers desktop, tablet and mobile across Home, settings and all record tabs", () => {
  const audit = read("../tools/ui/capture-ui-audit.mjs");
  assert.match(audit, /for\(const mode of \["desktop","tablet","mobile","mobile-narrow"\]\)/);
  assert.match(audit, /width:1024,height:768/);
  assert.match(audit, /width:320,height:640/);
  assert.match(audit, /記録・所持品の6カテゴリタブが揃っていません/);
  assert.match(audit, /details\.settings-disclosure/);
  assert.match(audit, /home-launcher-review/);
  assert.match(audit, /import-router-all-destinations/);
  assert.match(audit, /settingsDisclosurePanels/);
  assert.match(audit, /build-editor-operation-paths/);
  assert.match(audit, /all six owned-library categories/);
});
