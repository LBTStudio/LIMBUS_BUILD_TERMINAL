import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const app = read("../js/App.js");
const livePreview = read("../js/LivePreview.js");
const workbench = read("../assets/b-type-workbench.css");

test("Basic workspace retains image registration but has no permanent portrait preview", () => {
  const start = sections.indexOf("const BaseSection =");
  const end = sections.indexOf("const PassiveCard =", start);
  const base = sections.slice(start, end);
  assert.ok(base.includes('className: "piece-panel piece-art-panel piece-image-settings"'));
  assert.ok(base.includes("立ち絵URL・差分を編集"));
  assert.ok(base.includes('id: "piece-image-urls"'));
  assert.ok(base.includes("state.imgUrls"));
  assert.ok(base.includes("imgList.length"));
  assert.ok(base.includes("state.shareImageData"));
  for (const forbidden of ["piece-art-wrap", "piece-art-frame", "piece-art-thumbs", "piece-art-zoom", "activeImg", "imgZoom", "imgTab", "画像を確認"]) {
    assert.ok(!base.includes(forbidden), "Basic workspace must not render " + forbidden);
  }
  assert.ok(persona.includes('className: "baseinfo-workspace piece-workspace"'));
});

test("Basic format workspace has only ST and label tabs; its preview action opens the shared panel", () => {
  const start = sections.indexOf("const BuildParamsPanel =");
  const end = sections.indexOf("\n};", start);
  const panel = sections.slice(start, end);
  assert.ok(panel.includes('const buildParamTabIds = ["statuses", "labels"]'));
  assert.ok(panel.includes("previewOpen: true, previewTab: \"token\""));
  assert.ok(panel.includes("プレビューを開く"));
  for (const id of ["statuses", "labels"]) {
    assert.ok(panel.includes('id: "build-params-panel-' + id + '"'));
    assert.ok(panel.includes('hidden: activeBuildParamsTab !== "' + id + '"'));
  }
  for (const obsolete of ["build-params-panel-preview", "BasicCcfOutputPreview", "駒・出力プレビュー"]) {
    assert.ok(!panel.includes(obsolete), "duplicate preview tab must be removed: " + obsolete);
  }
});

test("the shared LivePreview is the only CCFOLIA board, editor and JSON preview", () => {
  for (const duplicate of ["BasicCcfOutputPreview", "basic-ccfolia-preview", "piece-board-avatar", "piece-ccfolia-editor-main-image"]) {
    assert.ok(!sections.includes(duplicate), "duplicate output preview remains: " + duplicate);
  }
  assert.ok(livePreview.includes("const renderTokenPreview ="));
  assert.ok(livePreview.includes("pv-ccfolia-map"));
  assert.ok(livePreview.includes("pv-ccfolia-editor"));
  assert.ok(livePreview.includes('tab === "json"'));
  assert.ok(livePreview.includes("tab === \"token\" && renderTokenPreview()"));
  assert.ok(livePreview.includes("LBT_gen.buildCcfoliaJSON(previewData, { palette, memo })"));
});

test("Home and Basic preview shortcuts both open the global preview panel", () => {
  assert.ok(app.includes('run: () => navigate("baseinfo", { previewOpen: true, previewTab: "token" })'));
  const start = sections.indexOf("const BuildParamsPanel =");
  const end = sections.indexOf("\n};", start);
  assert.ok(sections.slice(start, end).includes("previewOpen: true"));
  assert.ok(!app.includes('basicFormatTab: "preview"'));
  assert.ok(!app.includes('basicPreviewMode: "board"'));
});

test("B-type phone navigation preserves access to Home and the four primary routes", () => {
  const start = app.indexOf("const MobileBottomNavigation =");
  const end = app.indexOf("const HomeLauncher =", start);
  const nav = app.slice(start, end);
  for (const label of ["ビルド", "記録", "取込", "その他"]) assert.ok(nav.includes('label: "' + label + '"'));
  assert.ok(nav.includes("onOpenImportRouter"));
  assert.ok(nav.includes("onOpenUtilities"));
  assert.ok(workbench.includes(".btype-mobile-bottom-nav"));
});

test("closing the preview removes the only preview panel and leaves only its reopen control", () => {
  assert.ok(app.includes("const previewOpen = state.ui.previewOpen === true;"));
  assert.ok(app.includes("isBuildWorkspace && previewOpen ? React.createElement(LivePreview"));
  assert.ok(app.includes('className: "preview-mobile-toggle"'));
  assert.ok(app.includes('id: "lbt-preview-edge-toggle"'));
  assert.ok(!sections.includes("piece-art-frame"));
  assert.ok(!sections.includes("basic-ccfolia-preview"));
});
