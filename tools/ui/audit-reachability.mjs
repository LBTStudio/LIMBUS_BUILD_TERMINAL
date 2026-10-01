/* 幅を変えながら「到達不能な要素」を洗い出す。
 *
 *   node tools/ui/audit-reachability.mjs [ベースURL]
 *
 * body に overflow-x: hidden が残っているため、ページ横スクロールが出ないこと
 * だけでは「溢れていない」証明にならない。祖先が overflow で要素を切り落として
 * いる場合、document はOverflow しないが、その要素はクリックできない。
 *
 * 各 viewport で 12 セクションを巡回し、
 *   - 良性: 横スクロール可能な祖先があり、スクロールで届く
 *   - 到達不能: 祖先で切られている（クリックできない）
 * を分けて報告する。
 */

import { loadPlaywright, walkSections, VIEWPORTS } from "./harness.mjs";

const url = process.argv[2] || undefined;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });

let unreachableTotal = 0;
let benignTotal = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  await page.goto(url || (await import("./harness.mjs")).BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1200);

  const agg = new Map();
  await walkSections(page, {
    onSection: async () => {
      const rows = await page.evaluate(() => {
        const de = document.documentElement;
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const bb = el.getBoundingClientRect();
          if (!bb.width || !bb.height) continue;
          if (bb.right <= de.clientWidth + 1) continue;
          // 祖先を辿って、スクロール可能か切り落とすかを見る
          let scrollable = false;
          let clippedBy = null;
          let n = el.parentElement;
          while (n && n !== document.documentElement) {
            const ncs = getComputedStyle(n);
            if (ncs.overflowX === "auto" || ncs.overflowX === "scroll") { scrollable = true; break; }
            if (ncs.overflowX === "hidden" || ncs.overflow === "hidden" || ncs.overflowX === "clip") {
              const nbb = n.getBoundingClientRect();
              if (bb.right > nbb.right + 1) clippedBy = n.tagName.toLowerCase() + "." + String(n.className || "").split(/\s+/)[0];
            }
            n = n.parentElement;
          }
          const desc = el.tagName.toLowerCase() + "." + String(el.className || "").trim().split(/\s+/).slice(0, 2).join(".") + "|" + (el.textContent || "").trim().slice(0, 10);
          out.push({ desc, right: Math.round(bb.right), scrollable, clippedBy });
        }
        return out;
      });
      for (const r of rows) {
        if (!agg.has(r.desc)) agg.set(r.desc, { ...r, n: 0 });
        agg.get(r.desc).n++;
      }
    },
  });

  const unreachable = [...agg.values()].filter((x) => !x.scrollable);
  const benign = [...agg.values()].filter((x) => x.scrollable);
  unreachableTotal += unreachable.length;
  benignTotal += benign.length;

  console.log(`=== ${vp.name} (${vp.w}x${vp.h}) ===`);
  console.log(`  document 横溢れ: ${await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)}px`);
  if (!unreachable.length) {
    console.log("  到達不能要素: なし");
  } else {
    console.log(`  到達不能要素: ${unreachable.length} 種`);
    unreachable.forEach((x) => console.log(`    ${x.desc.padEnd(44)} right=${x.right} clip=${x.clippedBy || "?"}`));
  }
  if (benign.length) {
    console.log(`  良性（横スクロール可能内）: ${benign.length} 種`);
    benign.slice(0, 4).forEach((x) => console.log(`    ${x.desc.padEnd(44)} right=${x.right}`));
  }
  console.log("");
  await ctx.close();
}
await browser.close();

console.log(`=== summary ===`);
console.log(`到達不能: ${unreachableTotal} 種 / 良性: ${benignTotal} 種`);
if (unreachableTotal) process.exitCode = 1;