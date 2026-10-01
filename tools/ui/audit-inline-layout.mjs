import { loadPlaywright, BASE_URL } from "./harness.mjs";

// インライン style 属性のうち、メディアクエリや forced-colors で
// 上書きできない要被を洗い出す。
//
// 静的 style は!important 無しでクラスより強いので、
// media query でレスポンシブに Changing したい値はインラインに置けない。

const VIEWPORTS = [
  { name: "desktop 1440", w: 1440, h: 900 },
  { name: "tablet 768", w: 768, h: 1024 },
  { name: "mobile 375", w: 375, h: 812 },
];

// レスポンシブに変えたい・変えたくないが決まっているプロパティ
const RESPONSIVE_WORTHY = new Set([
  "width", "height", "max-width", "min-width", "max-height", "min-height",
  "display", "margin", "margin-top", "margin-left", "grid-template-columns",
  "flex-direction", "gap", "padding", "padding-top",
]);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const perWidth = new Map();
const details = new Map();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1200);

  for (let i = 0; i < 12; i++) {
    await page.locator(".rail-item").nth(i).click();
    await page.waitForTimeout(500);
    if (await page.locator(".utility-sheet-backdrop").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    const rows = await page.evaluate((worthy) => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const attr = el.getAttribute("style");
        if (!attr) continue;
        for (const decl of attr.split(";")) {
          const prop = decl.split(":")[0]?.trim();
          if (!prop || !worthy.includes(prop)) continue;
          out.push({
            prop,
            value: decl.split(":").slice(1).join(":").trim().slice(0, 42),
            cls: (el.className && typeof el.className === "string" ? el.className : el.tagName).split(/\s+/).slice(0, 3).join("."),
            text: (el.textContent || "").trim().slice(0, 12),
          });
        }
      }
      return out;
    }, [...RESPONSIVE_WORTHY]);

    for (const r of rows) {
      const k = `${r.cls}|${r.prop}`;
      if (!details.has(k)) details.set(k, { ...r, n: 0, widths: [] });
      const d = details.get(k);
      d.n++;
      if (!d.widths.includes(vp.w)) d.widths.push(vp.w);
    }
    perWidth.set(vp.w, (perWidth.get(vp.w) || 0) + rows.length);
  }
  await ctx.close();
}
await browser.close();

console.log("=== 画面幅ごとの「上書き不可能な layout インライン宣言」数 ===");
for (const vp of VIEWPORTS) console.log(`  ${vp.name.padEnd(14)} ${perWidth.get(vp.w) || 0}`);

console.log(`\n=== 該当セレクタ（${details.size} 種類）===`);
for (const d of [...details.values()].sort((a, b) => b.n - a.n)) {
  console.log(`  ${String(d.n).padStart(3)}x  ${d.prop.padEnd(22)} ${d.cls.slice(0, 40).padEnd(42)} ${d.widths.join(",")}`);
}