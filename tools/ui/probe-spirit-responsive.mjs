import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 精神グリッドの列数と、カードの可読な下限幅を各幅で確認する。
 * 列幅を 340px → 230px に詰めたため、狭い幅で潰れないことを見る。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const rows = [];
for (const [label, w, h] of [["desktop 1440", 1440, 900], ["laptop 1280", 1280, 800], ["small 1024", 1024, 768], ["tablet 768", 768, 1024], ["mobile 375", 375, 812], ["mobile 320", 320, 640]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/\.(css|js|mjs)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}`) });
    return route.continue();
  });
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1000);
  await page.locator(".rail-item").nth(5).click();
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const list = document.querySelector(".spirit-list");
    const items = [...document.querySelectorAll(".spirit-item")];
    if (!list) return { note: "精神セクションなし" };
    const lb = list.getBoundingClientRect();
    const widths = [...new Set(items.map((e) => Math.round(e.getBoundingClientRect().width)))];
    const overflow = items.filter((e) => {
      const b = e.getBoundingClientRect();
      return b.right > lb.right + 1 || b.left < lb.left - 1;
    }).length;
    // テキストが折り返して読めなくなるくらい狭いか
    const clipped = items.filter((e) => {
      const n = e.querySelector(".spirit-item-name");
      return n && n.scrollWidth > n.clientWidth + 2;
    }).length;
    return {
      cols: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      listW: Math.round(lb.width),
      itemWidths: widths.slice(0, 4),
      itemCount: items.length,
      overflowItems: overflow,
      nameClipped: clipped,
    };
  });
  rows.push([label, r]);
  await page.close();
}
await b.close();

const lines = rows.map(([label, r]) => `${label}: ${JSON.stringify(r)}`);
await (await import("node:fs")).writeFileSync("tmp/spirit-responsive.txt", lines.join("\n"), "utf8");
console.log("written");