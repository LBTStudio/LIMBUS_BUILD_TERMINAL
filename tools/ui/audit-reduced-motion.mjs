/* reduced-motion 設定で実際の計算値を測る。
 *
 *   node tools/ui/audit-reduced-motion.mjs [ベースURL]
 *
 * 確認する点:
 *   - CSS 側のガード（transition-duration / animation-duration / animation-iteration-count）
 *   - JS 側の scrollBehavior() が OS 設定に追従するか
 *   - 無限アニメーションが iteration-count で停止するか
 *
 * Playwright の reducedMotion コンテキスト設定で OS 設定を模擬する。
 */

import { loadPlaywright, BASE_URL } from "./harness.mjs";

const url = process.argv[2] || BASE_URL;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });

for (const mode of ["no-preference", "reduce"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: mode });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const rail = document.querySelector(".rail-item");
    const anim = [...document.querySelectorAll("*")]
      .map((el) => getComputedStyle(el).animationIterationCount)
      .filter((v) => v === "infinite").length;
    return {
      mq: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      helper: typeof window.scrollBehavior === "function" ? window.scrollBehavior() : "(helper なし)",
      railTransition: rail ? getComputedStyle(rail).transitionDuration : "-",
      infiniteAnimations: anim,
    };
  });

  console.log(`reducedMotion=${mode}`);
  console.log(`   matchMedia reduce : ${r.mq}`);
  console.log(`   scrollBehavior()  : ${r.helper}`);
  console.log(`   rail transition   : ${r.railTransition}`);
  console.log(`   infinite anims    : ${r.infiniteAnimations}`);
  await ctx.close();
}
await browser.close();