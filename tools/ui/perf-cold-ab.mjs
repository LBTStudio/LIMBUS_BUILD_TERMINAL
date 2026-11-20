import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* ?v= の方式を変えても読み込みが遅くならないかを、コールドキャッシュ固定で A/B する。
 *
 * 前回の測定は「改造前=初回のコールド」「改造後=ウォード」で、16 倍差が出たが
 * それはキャッシュ效果で、方式の差ではない。毎回 context を作り
 * Network.setCacheDisabled(true) でキャッシュを無効化して中立な条件を揃える。
 * ローカルサーバは応答が速いので、CDP の CPU スロットルは使わない。
 * 3 回ずつ取り中央値で比較する。 */
const { chromium } = loadPlaywright();

async function once(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  let requests = 0;
  let bytes = 0;
  page.on("response", async (r) => {
    requests++;
    const h = r.headers();
    if (h["content-length"]) bytes += Number(h["content-length"]);
  });

  const t0 = Date.now();
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  const load = Date.now() - t0;
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  const ready = Date.now() - t0;
  const fcp = await page.evaluate(() => {
    const e = performance.getEntriesByName("first-contentful-paint")[0];
    return e ? Math.round(e.startTime) : -1;
  });
  const concurrent = await page.evaluate(() => {
    // 読み込み中に並行して走っていた最大リクエスト数を推定する
    const rs = performance.getEntriesByType("resource").filter((e) => e.responseEnd > 0);
    const events = [];
    for (const e of rs) { events.push([e.startTime, 1]); events.push([e.responseEnd, -1]); }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, max = 0;
    for (const [, d] of events) { cur += d; if (cur > max) max = cur; }
    return max;
  });
  await ctx.close();
  return { load, ready, fcp, requests, bytes, maxConcurrent: concurrent };
}

const b = await chromium.launch({ headless: true });
const runs = [];
for (let i = 0; i < 3; i++) runs.push(await once(b));
await b.close();

const med = (k) => { const v = runs.map((r) => r[k]).sort((x, y) => x - y); return v[1]; };
const out = {
  runs,
  median: {
    load: med("load"), ready: med("ready"), fcp: med("fcp"),
    requests: med("requests"), bytes: med("bytes"), maxConcurrent: med("maxConcurrent"),
  },
};
(await import("node:fs")).writeFileSync(process.argv[2], JSON.stringify(out, null, 2), "utf8");
console.log("median", JSON.stringify(out.median));