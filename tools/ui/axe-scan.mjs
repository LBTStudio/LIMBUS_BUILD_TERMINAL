/* 現行UIの各画面・内部タブを巡回して axe 違反を集計する。 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPlaywright, openApp, walkSections, requireDep, BASE_URL } from "./harness.mjs";

const url = process.argv[2] || BASE_URL;
const axeJs = readFileSync(requireDep("axe-core").path ?? path.join(".browser-deps/node_modules/axe-core/axe.min.js"), "utf8");

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const { context, page, errors } = await openApp(browser, { url });

console.log("target: " + url + "\n");
await page.addScriptTag({ content: axeJs });

const byRule = new Map();
let totalPass = 0;
let totalIncomplete = 0;
let scannedViews = 0;

await walkSections(page, {
  onSection: async (i, name) => {
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ["violations", "passes", "incomplete"] });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
        passes: r.passes.length,
        incomplete: r.incomplete.length,
      };
    });
    scannedViews++;
    totalPass += result.passes;
    totalIncomplete += result.incomplete;
    for (const v of result.violations) {
      if (!byRule.has(v.id)) byRule.set(v.id, { ...v, sections: [] });
      byRule.get(v.id).sections.push(i + ":" + name + "(" + v.nodes + ")");
    }
    console.log(String(i).padStart(2) + " " + name.padEnd(32) + " violations=" + result.violations.length + "  passes=" + result.passes + "  incomplete=" + result.incomplete);
  }
});

await context.close();
await browser.close();

const nodeCount = Array.from(byRule.values()).reduce((total, v) => total + v.nodes, 0);
console.log("\n=== axe summary ===");
console.log("views: " + scannedViews + "  violations: " + byRule.size + " rules / " + nodeCount + " nodes");
console.log("passes: " + totalPass + "  incomplete: " + totalIncomplete);
if (byRule.size) {
  console.log("\n--- rules ---");
  for (const v of byRule.values()) {
    console.log("  " + v.id + " (" + v.impact + ") " + v.nodes + " nodes");
    console.log("    " + v.help);
    console.log("    " + v.sections.join(", "));
  }
  process.exitCode = 1;
}
if (errors.length) {
  console.log("\nconsole errors: " + errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  " + e));
  process.exitCode = 1;
}
