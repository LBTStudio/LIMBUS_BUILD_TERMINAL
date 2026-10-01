/* axe 違反の内訳を JSON で保存し、対象要素を特定できるようにする。
 * （axe's node 詳細取出用）
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPlaywright, walkSections, REPO_ROOT } from "./harness.mjs";

const axeJs = readFileSync(path.join(REPO_ROOT, ".browser-deps", "node_modules", "axe-core", "axe.min.js"), "utf8");
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/", { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);
await page.addScriptTag({ content: axeJs });

const all = [];
await walkSections(page, {
  onSection: async (i, name) => {
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
    for (const v of r) all.push({ section: `${i}:${name}`, ...v });
  },
});

await ctx.close();
await browser.close();
writeFileSync("axe-detail.json", JSON.stringify(all, null, 1));
console.log(`axe-detail.json: ${all.length} rules across sections`);
all.forEach((v) => console.log(`  ${v.section.padEnd(12)} ${v.id} ${v.nodes.length} nodes`));