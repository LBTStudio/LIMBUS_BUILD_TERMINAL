import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 削減効果の実測。
 * 「宣言はあるが 1 もダウンロードされない」combo を除いたとき、
 * 実際に転送量が減るのかを計る。減らないなら削減する価値は無い。 */

const CURRENT = "family=Rajdhani:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@500;700&family=Share+Tech+Mono&family=IBM+Plex+Mono:wght@400;500&display=swap";
/* 0 req が確認できた Rajdhani 全ウェイト / Noto Sans JP 500 / IBM Plex Mono 500 を除く。
 * Noto Serif JP は 155KB 落ちているので残す。 */
const TRIMMED = "family=Cormorant+Garamond:wght@500;600;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+JP:wght@500;700&family=Share+Tech+Mono&family=IBM+Plex+Mono:wght@400&display=swap";

async function measure(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let fonts = [];
  let cssBytes = 0;
  page.on("response", async (r) => {
    if (r.request().resourceType() === "font") {
      let len = 0;
      try { len = (await r.body()).length; } catch {}
      fonts.push(len);
    } else if (/fonts\.googleapis\.com\/css2/.test(r.url())) {
      try { cssBytes = (await r.text()).length; } catch {}
    }
  });
  await ctx.route("https://fonts.googleapis.com/**", async (route) => route.fulfill({ response: await route.fetch({ url: "https://fonts.googleapis.com/css2?" + q }) }));
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1200);
  for (let i = 0; i < 12; i++) {
    await page.locator(".rail-item").nth(i).click();
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(2500);
  await ctx.close();
  const bytes = fonts.reduce((a, x) => a + x, 0);
  return { req: fonts.length, kb: Math.round(bytes / 1024), cssKB: Math.round(cssBytes / 1024) };
}

const browser = loadPlaywright().chromium;
const b = await browser.launch({ headless: true });
const cur = await measure(b, CURRENT);
const tri = await measure(b, TRIMMED);
await b.close();

const kb = (n) => String(n).padStart(5) + " KB";
console.log("                現状(全宣言)     削減後(Rajdhani等除去)");
console.log("-".repeat(52));
console.log("フォント req  " + String(cur.req).padStart(12) + String(tri.req).padStart(18));
console.log("フォント容量  " + kb(cur.kb) + "    " + kb(tri.kb));
console.log("css2 応答     " + kb(cur.cssKB) + "    " + kb(tri.cssKB));
console.log("-".repeat(52));
const deltaReq = tri.req - cur.req;
const deltaKB = tri.kb - cur.kb;
const savedPct = cur.kb > 0 ? ((1 - tri.kb / cur.kb) * 100).toFixed(1) : "0.0";
const sign = deltaKB >= 0 ? "+" : "";
console.log("差分          req " + deltaReq + " / " + sign + deltaKB + " KB  削減率 " + savedPct + "%");