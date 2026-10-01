/* 12 セクションを巡回して axe 違反を集計する。
 *
 *   node tools/ui/axe-scan.mjs [ベースURL]
 *
 * axe は 12 セクションすべてを走査する。
 * 「非常好 1 セクションだけ見て 0 だった」 セクションだけ見て 0 だったことを安心材料にしないため。
 *
 * 出力例:
 *   violations: 0 rules / 0 nodes
 *   passes: 42  incomplete: 2
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadPlaywright, openApp, walkSections, requireDep, SECTIONS, BASE_URL, VIEWPORTS } from "./harness.mjs";

const url = process.argv[2] || BASE_URL;
const axeJs = readFileSync(requireDep("axe-core").path ?? path.join(".browser-deps/node_modules/axe-core/axe.min.js"), "utf8");

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const { context, page, errors } = await openApp(browser);

console.log(`target: ${url}\n`);

// axe をページへ注入
await page.addScriptTag({ content: axeJs });

const byRule = new Map();
let totalPass = 0;
let totalIncomplete = 0;

for (let i = 0; i < SECTIONS.length; i++) {
  await page.locator(".rail-item").nth(i).click();
  await page.waitForTimeout(900);
  if (await page.locator(".utility-sheet-backdrop").count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ["violations", "passes", "incomplete"] });
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
      passes: r.passes.length,
      incomplete: r.incomplete.length,
    };
  });
  totalPass += result.passes;
  totalIncomplete += result.incomplete;
  for (const v of result.violations) {
    if (!byRule.has(v.id)) byRule.set(v.id, { ...v, sections: [] });
    byRule.get(v.id).sections.push(`${i}:${SECTIONS[i]}(${v.nodes})`);
  }
  const v = result.violations.length;
  console.log(`  ${String(i).padStart(2)} ${SECTIONS[i].padEnd(6)} violations=${v}  passes=${result.passes}  incomplete=${result.incomplete}`);
}

await context.close();
await browser.close();

const nodeCount = [...byRule.values()].reduce((a, v) => a + v.nodes, 0);
console.log(`\n=== axe summary ===`);
console.log(`violations: ${byRule.size} rules / ${nodeCount} nodes`);
console.log(`passes: ${totalPass}  incomplete: ${totalIncomplete}`);
if (byRule.size) {
  console.log(`\n--- rules ---`);
  for (const v of byRule.values()) {
    console.log(`  ${v.id} (${v.impact}) ${v.nodes} nodes`);
    console.log(`    ${v.help}`);
    console.log(`    ${v.sections.join(", ")}`);
  }
  process.exitCode = 1;
}
if (errors.length) {
  console.log(`\nconsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
}