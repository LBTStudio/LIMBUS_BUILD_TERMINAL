import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* キャッシュ版���の一括同期が読み込みに影響しないかを測るためのベースライン。
 * 取得したリクエスト数・合計転送量・waterfall の並列度・主要計測値を記録する。
 * 都已经 Studies: index.html は全 <link>/<script> が並列ロードされる。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const reqs = [];
page.on("response", async (r) => {
  const req = r.request();
  let len = 0;
  const h = r.headers();
  if (h["content-length"]) len = Number(h["content-length"]);
  else { try { len = (await r.body().catch(() => null))?.length ?? 0; } catch {} }
  reqs.push({ url: r.url().replace(BASE_URL, ""), status: r.status(), type: req.resourceType(), len });
});

const t0 = Date.now();
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
const loadMs = Date.now() - t0;
await page.waitForSelector(".rail-item", { timeout: 90000 });
const readyMs = Date.now() - t0;
await page.waitForTimeout(2500);

const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const paints = {};
  for (const p of performance.getEntriesByType("paint")) paints[p.name] = Math.round(p.startTime);
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    loadEvent: Math.round(nav.loadEventEnd || 0),
    domInteractive: Math.round(nav.domInteractive || 0),
    paints,
    resourceCount: performance.getEntriesByType("resource").length,
    transferSize: performance.getEntriesByType("resource").reduce((a, e) => a + (e.transferSize || 0), 0),
    encodedBody: performance.getEntriesByType("resource").reduce((a, e) => a + (e.encodedBodySize || 0), 0),
  };
});

await b.close();

const byType = {};
for (const r of reqs) {
  byType[r.type] = byType[r.type] || { n: 0, bytes: 0 };
  byType[r.type].n++;
  byType[r.type].bytes += r.len;
}
// versioned asset count
const versioned = reqs.filter((r) => /[?&]v=/.test(r.url));
const distinct = [...new Set(versioned.map((r) => (r.url.match(/[?&]v=([^&]+)/) || [])[1]))].sort();

const out = {
  loadMs, readyMs,
  requestCount: reqs.length,
  byType,
  versionedAssetCount: versioned.length,
  distinctVersions: distinct,
  navigation: perf,
};
const fs = await import("node:fs");
fs.writeFileSync(process.argv[2] || "tmp/perf.json", JSON.stringify(out, null, 2), "utf8");
console.log("written", process.argv[2] || "tmp/perf.json");