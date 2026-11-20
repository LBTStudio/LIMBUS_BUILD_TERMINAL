import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 左上タイトル周辺の実際の配置を目視確認する。
 * スクリーンショットでは文字が小さく読めないため、
 * deviceScaleFactor で拡大して撮る。 */

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 })).newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(2000);
await page.evaluate(() => document.fonts.ready).catch(() => {});

// topbar 内の要素を列挙して、鱼アイコン相当を探す
const info = await page.evaluate(() => {
  const bar = document.querySelector(".topbar");
  if (!bar) return { noTopbar: true };
  const rect = bar.getBoundingClientRect();
  const kids = [...bar.children].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 40),
      text: (el.textContent || "").trim().slice(0, 30),
      box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      svgs: el.querySelectorAll("svg").length,
    };
  });
  // svg を含む要素を全部探す（魚アイコンの候補）
  const svgHosts = [...document.querySelectorAll("svg")].slice(0, 12).map((s) => {
    const r = s.getBoundingClientRect();
    return {
      parentCls: (s.parentElement?.className || "").toString().slice(0, 34),
      box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      paths: s.querySelectorAll("path,circle,ellipse,polygon").length,
    };
  });
  return { topbar: `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`, kids, svgHosts };
});

console.log("topbar:", info.topbar);
console.log("\n=== topbar の直下要素 ===");
for (const k of info.kids || []) console.log(`  [${k.tag}.${k.cls}] ${k.box}  svg=${k.svgs}  «${k.text}»`);
console.log("\n=== svg 要素の位置（先頭12） ===");
for (const s of info.svgHosts || []) console.log(`  ${s.box}  paths=${s.paths}  親=${s.parentCls}`);

// 左上を拡大撮影
await page.screenshot({ path: "tools/ui/shots/topbar-left.png", clip: { x: 0, y: 0, width: 560, height: 52 } });
console.log("\n拡大撮影: tools/ui/shots/topbar-left.png");
await b.close();