import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const livePreviewSource = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

function loadOrderPreviewSections() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8"), context);
  return context.window.LBT_orderPreviewSections;
}

test("所持品は標準順では末尾、手動順では指定位置を尊重する", () => {
  const orderPreviewSections = loadOrderPreviewSections();
  const sections = [
    { title: "判定・速度", body: [] },
    { title: "戦術スキル", body: [] },
    { title: "所持品", body: [] },
  ];

  assert.deepEqual(Array.from(orderPreviewSections(sections, []), (section) => section.title), ["判定・速度", "戦術スキル", "所持品"]);
  assert.deepEqual(Array.from(orderPreviewSections(sections, ["所持品", "判定・速度"]), (section) => section.title), ["所持品", "判定・速度", "戦術スキル"]);
});

test("プレビューの開閉は出力データを再生成せず、格納中は右端の再展開操作を提供する", () => {
  assert.match(livePreviewSource, /const previewDataChanged = Object\.keys\(state\)\.some/);
  assert.match(livePreviewSource, /LBT_gen\.buildMemo\(previewData\)/);
  assert.match(appSource, /previewOpen: !previewOpen/);
  assert.match(appSource, /className: "preview-reopen"/);
  assert.match(workspaceCss, /width: 40px;/);
  assert.match(workspaceCss, /height: 118px;/);
  assert.match(workspaceCss, /\.app\.preview-collapsed \.preview-reopen \{ display: flex; \}/);
});

test("プレビューの右端タブは展開・格納のどちらでも同一操作で切り替える", () => {
  assert.match(livePreviewSource, /lbt-preview-edge-toggle/);
  assert.match(livePreviewSource, /previewOpen \? "◀ 格納" : "▶ 展開"/);
  assert.match(livePreviewSource, /previewOpen: !previewOpen/);
  assert.match(workspaceCss, /\.preview-edge-toggle \{/);
  assert.match(workspaceCss, /\.preview-edge-toggle\.is-collapsed \{ right: 0; \}/);
});

test("モバイルで開いたプレビューは独立して縦スクロールできる", () => {
  const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");
  assert.match(refinements, /\.app:not\(\.preview-collapsed\) \.preview \{ display:flex;[\s\S]*min-height:0;[\s\S]*transform:none;/);
  assert.match(refinements, /\.app:not\(\.preview-collapsed\) \.preview-body \{ min-height:0; overflow-y:auto;/);
});
