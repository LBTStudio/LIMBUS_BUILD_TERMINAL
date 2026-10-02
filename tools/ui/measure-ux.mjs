import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 利用者から見える応答性を測る。
 * 1) フォントの謎: 実際に落ちるのは Noto Sans JP 700 だけなのに、本文の漢字は
 *    太くなく CDP は "Thin" と報告した。本文が 400 と 700 で同じ絵になるなら
 *    「本文が太字で描かれている」ことになる。インク量を比べる。
 * 2) 操作の体感: セクション切替・文字入力・自動保存の実測。
 */

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);

/* ---- 1) 本文の漢字が 400 と 700 で違う濃さで描かれるか ---- */
const ink = await page.evaluate(async () => {
  await document.fonts.ready;
  const cv = document.createElement("canvas");
  cv.width = 900; cv.height = 160;
  const c = cv.getContext("2d", { willReadFrequently: true });
  const sample = "黒雲会組員の抵抗精神";
  const measure = (weight) => {
    c.clearRect(0, 0, 900, 160);
    c.fillStyle = "#000";
    c.font = `48px ${weight} "CorporateLogo","Noto Sans JP",sans-serif`;
    c.textBaseline = "top";
    c.fillText(sample, 10, 10);
    const d = c.getImageData(0, 0, 900, 160).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) ink += 255 - d[i];
    return Math.round(ink / 1000);
  };
  const w400 = measure(400);
  const w500 = measure(500);
  const w700 = measure(700);
  return { w400, w500, w700, ratio: w700 / w400 };
});

/* ---- 2) 実 DOM における本文の描画.switch 応答 ---- */
const latency = await page.evaluate(async () => {
  const out = [];
  const rail = document.querySelectorAll(".rail-item");
  for (const idx of [1, 2, 3, 4, 5, 7]) {
    const t0 = performance.now();
    rail[idx].click();
    // 次のフレーム描画まで + セクション見出しの入れ替わり
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const paint = performance.now() - t0;
    const h = document.querySelector(".focus h2, .focus .eyebrow, h2");
    out.push({ section: idx, ms: Math.round(paint), heading: (h?.textContent || "").trim().slice(0, 12) });
  }
  return out;
});

/* ---- 3) 入力と自動保存 ---- */
await page.locator(".rail-item").nth(0).click();
await page.waitForTimeout(600);
const memoInput = await page.evaluate(() => {
  const cands = [...document.querySelectorAll("textarea,input[type=text]")];
  const m = cands.find((e) => /memo|メモ|備考/i.test((e.getAttribute("aria-label") || "") + (e.placeholder || "")));
  if (m) return { found: true, tag: m.tagName, label: m.getAttribute("aria-label") };
  return { found: false, total: cands.length };
});

let typing = null;
if (memoInput.found) {
  const sel = `textarea[aria-label="${memoInput.label}"], input[aria-label="${memoInput.label}"]`;
  const loc = page.locator(sel).first();
  await loc.click();
  const t0 = Date.now();
  for (const ch of "テスト漢字入力") await page.keyboard.type(ch, { delay: 0 });
  typing = { ms: Date.now() - t0, chars: 8 };
  await page.waitForTimeout(1200);
}

/* ---- 4) localStorage 書き込みの実態 ---- */
const storage = await page.evaluate(() => {
  const raw = localStorage.getItem("lbt_v46_state");
  return { bytes: raw ? raw.length : 0, kb: raw ? +(raw.length / 1024).toFixed(1) : 0 };
});

/* ---- 5) long task / レイアウト揺れの観測 ---- */
const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const paints = {};
  for (const p of performance.getEntriesByType("paint")) paints[p.name] = Math.round(p.startTime);
  const res = performance.getEntriesByType("resource");
  const byHost = {};
  for (const r of res) {
    const h = new URL(r.name).host;
    byHost[h] = byHost[h] || { n: 0, kb: 0 };
    byHost[h].n++;
    byHost[h].kb += r.encodedBodySize / 1024;
  }
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
    paints,
    requests: res.length,
    totalKB: Math.round(res.reduce((a, r) => a + r.encodedBodySize, 0) / 1024),
    byHost: Object.entries(byHost).sort((a, c) => c[1].kb - a[1].kb).slice(0, 6),
  };
});

await b.close();
console.log(JSON.stringify({ ink, latency, memoInput, typing, storage, perf }, null, 1));