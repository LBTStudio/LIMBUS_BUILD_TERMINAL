/* axe 違反の内訳を JSON で保存し、対象要素を特定できるようにする。
 * （axe's node 詳細取出用）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { loadPlaywright, openApp, walkSections, REPO_ROOT, BASE_URL, UI_VIEWS } from "./harness.mjs";

const axeJs = readFileSync(path.join(REPO_ROOT, ".browser-deps", "node_modules", "axe-core", "axe.min.js"), "utf8");
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-narrow", width: 320, height: 640 },
];
const all = [];
const bootErrors = [];
let scannedViews = 0;
for (const viewport of VIEWPORTS) {
  const { context, page, errors } = await openApp(browser, {
    url: process.env.PROBE_URL || BASE_URL,
    width: viewport.width,
    height: viewport.height
  });
  await page.addScriptTag({ content: axeJs });
  await walkSections(page, {
    onSection: async (i, name) => {
      scannedViews++;
      const r = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"] });
        return res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            html: n.html.slice(0, 180),
            target: n.target.join(" "),
            summary: (n.failureSummary || "").slice(0, 220),
            data: n.any?.[0]?.data ? JSON.stringify(n.any[0].data).slice(0, 120) : "",
          })),
        }));
      });
      for (const v of r) all.push({
        viewport: viewport.name,
        viewportWidth: viewport.width,
        section: `${i}:${name}`,
        ...v
      });
    },
  });
  bootErrors.push(...errors.map((error) => `${viewport.name}: ${error}`));
  await context.close();
}
await browser.close();
// 出力はルートではなく tmp/ へ。tmp/ は .gitignore 済みで、ルートに
// 使い捨ての JSON を残さない（AGENTS.md の一時生成物の扱いに合わせる）。
mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/axe-detail.json", JSON.stringify(all, null, 1));
const violationNodeCount = all.reduce((total, item) => total + item.nodes.length, 0);
const blocking = all.filter((item) => item.impact === "critical" || item.impact === "serious");
const blockingNodeCount = blocking.reduce((total, item) => total + item.nodes.length, 0);
/* axe の page-has-heading-one は moderate だが、本文の主見出しが無い状態は
   ページ移動・読み上げ構造を壊すため、個別の必須条件としてゲートする。 */
const missingPrimaryHeading = all.filter((item) => item.id === "page-has-heading-one");
const missingPrimaryHeadingNodeCount = missingPrimaryHeading.reduce((total, item) => total + item.nodes.length, 0);
const expectedViewScans = UI_VIEWS.length * VIEWPORTS.length;
console.log(`tmp/axe-detail.json: ${all.length} rule/view findings across ${scannedViews}/${expectedViewScans} viewports/views`);
console.log(`full-view axe nodes: ${violationNodeCount}; serious/critical nodes: ${blockingNodeCount}; missing primary headings: ${missingPrimaryHeadingNodeCount}; viewports: ${VIEWPORTS.map((v) => v.width + "x" + v.height).join(", ")}`);
all.forEach((v) => {
  console.log(`  ${v.section.padEnd(32)} ${v.id} (${v.impact}) ${v.nodes.length} nodes`);
  for (const node of v.nodes) console.log(`    - ${node.target} ${node.summary}`);
});

const manifestPath = path.join(REPO_ROOT, "artifacts", "ui-audit-screenshots", "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.fullViewAccessibility = {
    scope: "26 main views and internal tabs across 4 viewport profiles",
    viewports: VIEWPORTS,
    expectedViews: expectedViewScans,
    scannedViews,
    ruleViewFindings: all.length,
    violationNodeCount,
    seriousOrCriticalNodeCount: blockingNodeCount,
    missingPrimaryHeadingNodeCount,
    violations: all
  };
  manifest.overlayAccessibilityScope = manifest.overlayAccessibilityScope || "可視化したダイアログ／シート状態のみ（4 viewport）";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
if (scannedViews !== expectedViewScans) {
  console.error(`axe scanned ${scannedViews}/${expectedViewScans} viewport/view states; incomplete coverage is a failure.`);
  process.exitCode = 1;
}
if (blockingNodeCount > 0) {
  console.error(`axe found ${blockingNodeCount} serious/critical nodes; UI audit must be fixed before merge.`);
  process.exitCode = 1;
}
if (missingPrimaryHeadingNodeCount > 0) {
  console.error(`axe found ${missingPrimaryHeadingNodeCount} pages without a main H1 heading; page structure must be fixed before merge.`);
  process.exitCode = 1;
}
if (bootErrors.length) {
  console.error(`app boot emitted ${bootErrors.length} console/page errors during axe scan.`);
  bootErrors.slice(0, 8).forEach((error) => console.error("  " + error));
  process.exitCode = 1;
}