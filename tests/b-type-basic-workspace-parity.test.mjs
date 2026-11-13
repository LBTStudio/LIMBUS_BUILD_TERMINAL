import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const app = read("../js/App.js");
const livePreview = read("../js/LivePreview.js");
const workbench = read("../assets/b-type-workbench.css");
const parityCss = read("../assets/b-type-ui-parity.css");
const uiAudit = read("../tools/ui/capture-ui-audit.mjs");
const previewCapture = read("../tools/ui/capture-preview-control-regression.mjs");

test("Basic workspace displays compact URL-backed image previews only inside the expanded image editor", () => {
  const start = sections.indexOf("const BaseSection =");
  const end = sections.indexOf("const PassiveCard =", start);
  const base = sections.slice(start, end);
  assert.ok(base.includes('className: "piece-panel piece-art-panel piece-image-settings"'));
  assert.ok(base.includes("立ち絵URL・差分を編集"));
  assert.ok(base.includes('id: "piece-image-urls"'));
  assert.ok(base.includes("state.imgUrls"));
  assert.ok(base.includes("imgList.length"));
  assert.ok(base.includes('className: "piece-url-preview-list"'));
  assert.ok(base.includes('role: "group"'));
  assert.ok(base.includes('"aria-label": "表示する基本画像・差分を選択"'));
  assert.ok(base.includes('className: "piece-url-preview-featured"'));
  assert.ok(base.includes('className: "piece-url-preview-featured-frame"'));
  assert.ok(base.includes('"aria-pressed": selectedImageIndex === index'));
  assert.ok(base.includes("onClick: () => setActiveImageIndex(index)"));
  assert.ok(base.includes("imgList.map((src, index) => {"), "登録した差分を4枚で打ち切らず、すべて選択できる");
  assert.ok(base.includes("safeImagePreviewUrl(src)"));
  assert.ok(base.includes("onError: () => setFailedImageUrls"));
  assert.ok(base.indexOf('className: "piece-url-preview-list"') > base.indexOf('className: "piece-image-body"'),
    "駒画像のプレビューは設定欄を開いたときだけ表示する");
  assert.ok(base.includes("URL形式を確認"));
  assert.ok(base.includes("画像を読込めません"));
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

test("Build workspace does not render a miniature preview while the shared preview is closed", () => {
  const start = sections.indexOf("const BuildWorkspace =");
  const end = sections.indexOf("const SYNC_RANKS =", start);
  const build = sections.slice(start, end);
  assert.ok(start >= 0 && end > start, "BuildWorkspace component boundaries exist");
  for (const obsolete of ["btype-workbench-preview-panel", "preview-lines", "btype-preflight-note", "プレビューを展開"]) {
    assert.ok(!build.includes(obsolete), "closed workspace must not retain " + obsolete);
  }
  assert.match(build, /className: "btype-work-layout"/);
  assert.match(workbench, /\.btype-work-layout\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
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
  const start = sections.indexOf("const BaseSection =");
  const end = sections.indexOf("const PassiveCard =", start);
  const base = sections.slice(start, end);
  assert.ok(!base.includes("piece-art-frame"));
  assert.ok(!base.includes("basic-ccfolia-preview"));
  assert.ok(uiAudit.includes("basic-workspace-preview-collapsed"));
  assert.ok(uiAudit.includes('snap("basic-image-preview-loaded"'));
  assert.ok(uiAudit.includes("naturalWidth>0"));
  assert.ok(uiAudit.includes("stickyBottom= tabsRect.bottom") || uiAudit.includes("tabsRect.bottom") ,
    "画像プレビューはstickyタブの下へ配置する");
  assert.ok(uiAudit.includes("imageBelowTabs") && uiAudit.includes("imageBeforeBottomNav") && uiAudit.includes("controlsBeforeBottomNav"),
    "画像本体と差分選択列が固定タブ／固定ナビの間に収まることを検査する");
  assert.ok(uiAudit.includes(".btype-mobile-bottom-nav"));
  assert.ok(uiAudit.includes("駒の画像設定：基本画像と差分画像を読み込み、固定ナビに隠れず表示"));
  assert.ok(uiAudit.includes("shared-preview-board"));
  assert.ok(!uiAudit.includes("#build-params-tab-preview"));
  assert.ok(previewCapture.includes("profiles.length*9"));
});

test("mobile pawn image preview stays below sticky tabs and fits above bottom navigation", () => {
  assert.match(parityCss, /@media \(max-width: 560px\)[\s\S]*?\.base-info-panel \.piece-url-preview-featured-frame\s*\{[^}]*height: clamp\(150px, 24vh, 220px\);[^}]*min-height: 150px;/,
    "短い画面では大きな画像プレビューを縮め、顔や頭頂部まで見える高さを確保する");
  assert.match(parityCss, /\.base-info-panel \.piece-url-preview-featured,[\s\S]*?scroll-margin-block-start: calc\(184px \+ env\(safe-area-inset-top, 0px\)\)/,
    "画像プレビューの自動スクロール先を固定タブより下へ配置する");
  assert.match(parityCss, /\.base-info-panel \.piece-url-preview-item\s*\{[^}]*scroll-margin-block-start:/,
    "差分ボタンへフォーカスしても固定タブの裏に隠れない");
});
