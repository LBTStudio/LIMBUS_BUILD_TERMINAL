import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 鮭マークの遊泳アニメーションと免責ダイアログを目視・数値で確認する。
 * アニメーションは getComputedStyle で animationName / duration を読み、
 * 実際に transform が時間経過で変わるかを複数フレーム観測する。 */

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })).newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.fonts.ready).catch(() => {});

/* --- 1. 鮭マークの状態 --- */
const fish = await page.evaluate(() => {
  const btn = document.querySelector(".brand-author");
  const fishEl = document.querySelector(".brand-author .brand-author-fish") || btn?.firstElementChild;
  if (!btn) return { present: false };
  const cs = fishEl ? getComputedStyle(fishEl) : null;
  return {
    present: true,
    tag: btn.tagName.toLowerCase(),
    hasHaspopup: btn.getAttribute("aria-haspopup"),
    title: btn.getAttribute("title"),
    name: btn.textContent.trim(),
    box: (() => { const r = btn.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`; })(),
    animationName: cs?.animationName,
    animationDuration: cs?.animationDuration,
    animationTimingFunction: cs?.animationTimingFunction,
    animationIterationCount: cs?.animationIterationCount,
  };
});
console.log("=== 鮭マーク ===");
console.log("  " + JSON.stringify(fish, null, 1).replace(/\n\s*/g, "\n  "));

/* --- 2. 実際に transform が動くか（8回観測） --- */
const motion = await page.evaluate(async () => {
  const el = document.querySelector(".brand-author .brand-author-fish");
  if (!el) return [];
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 260));
    seen.push(getComputedStyle(el).transform);
  }
  return seen;
});
const unique = [...new Set(motion)];
console.log(`\n=== アニメーション実測（8回 / ${unique.length} 種類） ===`);
motion.forEach((m, i) => console.log(`  ${i}: ${m}`));

/* --- 3. reduced-motion で止まるか --- */
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForTimeout(400);
const reduced = await page.evaluate(() => {
  const el = document.querySelector(".brand-author .brand-author-fish");
  return el ? getComputedStyle(el).animationName : "(なし)";
});
console.log(`\n=== reduced-motion: animation-name = ${reduced} ===`);
await page.emulateMedia({ reducedMotion: null });

/* --- 4. クリックで免責が開くか --- */
await page.locator(".brand-author").click();
await page.waitForTimeout(700);
const dialog = await page.evaluate(() => {
  const d = document.querySelector(".disclaimer-sheet");
  if (!d) return { open: false };
  const r = d.getBoundingClientRect();
  return {
    open: true,
    role: d.getAttribute("role"),
    modal: d.getAttribute("aria-modal"),
    label: d.getAttribute("aria-label"),
    box: `${Math.round(r.width)}x${Math.round(r.height)}`,
    blocks: [...d.querySelectorAll(".disclaimer-block h3")].map((e) => e.textContent.trim()),
    firstPara: d.querySelector(".disclaimer-block p")?.textContent.trim().slice(0, 46),
    sign: d.querySelector(".disclaimer-sign")?.textContent.trim(),
    scrollable: (() => { const body = d.querySelector(".disclaimer-body"); return body.scrollHeight > body.clientHeight + 4; })(),
  };
});
console.log("\n=== 免責ダイアログ ===");
console.log("  " + JSON.stringify(dialog, null, 1).replace(/\n\s*/g, "\n  "));

await page.screenshot({ path: "tools/ui/shots/disclaimer.png" });
await page.locator(".brand-author").screenshot({ path: "tools/ui/shots/brand-author.png" });
console.log("\n撮影: tools/ui/shots/disclaimer.png / brand-author.png");

/* --- 5. Escape で閉じるか --- */
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const closed = await page.evaluate(() => !document.querySelector(".disclaimer-sheet"));
console.log(`Escape で閉じる: ${closed ? "OK" : "NG"}`);

await b.close();