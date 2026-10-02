/* axe 違反の内訳を JSON で保存し、対象要素を特定できるようにする。
 * （axe's node 詳細取出用）
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadPlaywright, walkSections, REPO_ROOT, BASE_URL } from "./harness.mjs";

const axeJs = readFileSync(path.join(REPO_ROOT, ".browser-deps", "node_modules", "axe-core", "axe.min.js"), "utf8");
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(process.env.PROBE_URL || BASE_URL, { waitUntil: "load", timeout: 90000 });
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
// 出力はルートではなく tmp/ へ。tmp/ は .gitignore 済みで、ルートに
// 使い捨ての JSON を残さない（AGENTS.md の一時生成物の扱いに合わせる）。
mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/axe-detail.json", JSON.stringify(all, null, 1));
console.log(`tmp/axe-detail.json: ${all.length} rules across sections`);
all.forEach((v) => console.log(`  ${v.section.padEnd(12)} ${v.id} ${v.nodes.length} nodes`));