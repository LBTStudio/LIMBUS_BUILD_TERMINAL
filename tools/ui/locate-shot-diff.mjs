import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* スクリーンショットの差分領域にある要素を特定する。
   bounding box を指定して、そのあたりに何が描かれているかを DOM から調べる。 */

const D = "C:/Users/hanap/AppData/Local/Temp/opencode/a11y";
const x0 = Number(process.argv[2] || 1239);
const y0 = Number(process.argv[3] || 227);
const x1 = Number(process.argv[4] || 1409);
const y1 = Number(process.argv[5] || 244);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(css|js|mjs)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}`) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(2000);

const r = await page.evaluate(({ x0, y0, x1, y1 }) => {
  const found = new Map();
  for (let y = y0; y <= y1; y += 3) {
    for (let x = x0; x <= x1; x += 8) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const chain = [];
      let n = el;
      while (n && n !== document.body && chain.length < 4) {
        chain.push(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".") : ""));
        n = n.parentElement;
      }
      const key = chain.join(" < ");
      const cs = getComputedStyle(el);
      const bb = el.getBoundingClientRect();
      if (!found.has(key)) {
        found.set(key, {
          text: (el.textContent || "").trim().slice(0, 24),
          rect: `${Math.round(bb.x)},${Math.round(bb.y)} ${Math.round(bb.width)}x${Math.round(bb.height)}`,
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily.split(",")[0],
          letterSpacing: cs.letterSpacing,
          color: cs.color,
          inline: el.getAttribute("style") || "",
        });
      }
    }
  }
  return [...found.entries()].map(([k, v]) => ({ k, ...v }));
}, { x0, y0, x1, y1 });

console.log(`領域 (${x0},${y0})-(${x1},${y1}) にある要素:\n`);
for (const x of r) {
  console.log(`  ${x.k}`);
  console.log(`     text      : ${x.text}`);
  console.log(`     rect      : ${x.rect}`);
  console.log(`     font      : ${x.fontSize} ${x.fontFamily} ls=${x.letterSpacing}`);
  console.log(`     color     : ${x.color}`);
  if (x.inline) console.log(`     inline    : ${x.inline.slice(0, 90)}`);
}
await browser.close();