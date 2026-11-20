import { createRequire } from "node:module";
import { loadPlaywright, BASE_URL } from "./harness.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("../../.browser-deps/node_modules/pngjs");

/* 実際のページ要素だけを使い、合成プローブで読み込みを汚染せずに測る。
 * 順序が重要: まず天然に読めた Noto Sans JP のウェイトを記録し、
 * その後で実要素のインク量を比較する。プローブ要素は作らない。 */
const inkOf = (buf) => {
  const png = PNG.sync.read(buf);
  let sum = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    sum += 255 - (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]);
    n++;
  }
  return +(sum / n).toFixed(2);
};

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const fontReqs = [];
page.on("response", async (r) => {
  if (r.request().resourceType() !== "font") return;
  let len = 0;
  try { len = (await r.body()).length; } catch {}
  fontReqs.push({ url: r.url(), len });
});
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1200);
for (let i = 0; i < 12; i++) {
  await page.locator(".rail-item").nth(i).click();
  await page.waitForTimeout(450);
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);

/* 天然に読み込まれた Noto Sans JP のウェイト（プローブ前） */
const natural = await page.evaluate(() => {
  const m = {};
  for (const f of document.fonts) {
    if (f.family !== "Noto Sans JP") continue;
    const key = f.weight + "|" + f.status;
    m[key] = (m[key] || 0) + 1;
  }
  return m;
});

/* 実際の要素を重複文字数で選び、インク量を比べる */
const picks = await page.evaluate(() => {
  const KANJI = /[\u4e00-\u9fff]/;
  const buckets = { w400: [], w700: [] };
  for (const el of document.querySelectorAll(".focus *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!own || !KANJI.test(own)) continue;
    if (el.children.length > 0) continue;
    const w = getComputedStyle(el).fontWeight;
    if (w === "400") buckets.w400.push({ own, size: parseFloat(getComputedStyle(el).fontSize), cls: (typeof el.className === "string" ? el.className : "").slice(0, 24) });
    else if (w === "700" || w === "bold") buckets.w700.push({ own, size: parseFloat(getComputedStyle(el).fontSize), cls: (typeof el.className === "string" ? el.className : "").slice(0, 24) });
  }
  // 同じ文字を含むペアを作る（文字数が違うとインク量が比較できないため）
  const common = (a, o) => o.own.split("").filter((c) => a.includes(c)).join("");
  const w400 = buckets.w400.find((x) => x.own.length >= 4);
  if (!w400) return null;
  const target = w400.own.split("").slice(0, 4).join("");
  const w700 = buckets.w700.find((x) => target.split("").every((c) => x.own.includes(c)));
  return w700 ? { w400, w700, target } : { w400, w700: null, target };
});

let comparison = null;
if (picks?.w400) {
  // 実要素をそのままスクリーンショット。文字数が違う場合はventionを添える。
  const a = page.locator(".focus *", { hasText: picks.w400.own }).last();
  const ba = await a.screenshot().catch(() => null);
  comparison = {
    w400: { text: picks.w400.own.slice(0, 12), size: picks.w400.size, cls: picks.w400.cls, ink: ba ? inkOf(ba) : null },
    matched700: picks.w700 ? { text: picks.w700.own.slice(0, 12), size: picks.w700.size, cls: picks.w700.cls } : null,
  };
}

const byWeight = {};
for (const g of fontReqs) {
  // gstatic の URL に weight の識別子は無いので、クラス分類は，凭吊 表示の実測に任せる
  const m = g.url.match(/\/s\/([^/]+)\//);
  const k = m ? m[1] : "other";
  byWeight[k] = byWeight[k] || { req: 0, kb: 0 };
  byWeight[k].req++;
  byWeight[k].kb += g.len;
}

await b.close();
console.log(JSON.stringify({
  naturalNotoFaces: natural,
  realElements: comparison,
  downloadedFamilies: Object.entries(byWeight).sort((a, c) => c[1].kb - a[1].kb),
  totalReq: fontReqs.length,
  totalKB: Math.round(fontReqs.reduce((a, f) => a + f.len, 0) / 1024),
}, null, 1));