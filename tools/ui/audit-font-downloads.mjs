import { loadPlaywright, BASE_URL } from "./harness.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/* 正しい正規化で「何が実際に落ちているか」を確定させる。
 * 前回の帰属は @font-face のパースが壊れていただけ。判定に使う数字はここだけ。 */

mkdirSync("tmp", { recursive: true });
const FONT_CSS = /https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/;

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const got = [];
page.on("response", async (r) => {
  if (r.request().resourceType() !== "font") return;
  let len = 0;
  try { len = (await r.body()).length; } catch {}
  got.push({ url: r.url(), len });
});
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  if (FONT_CSS.test(u)) {
    const res = await route.fetch();
    const css = await res.text();
    writeFileSync("tmp/google-fonts.css", css, "utf8");
    return route.fulfill({ response: res, body: css });
  }
  return route.continue();
});

await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 12; i++) {
  await page.locator(".rail-item").nth(i).click();
  await page.waitForTimeout(500);
  if (await page.locator(".utility-sheet-backdrop").count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}
await page.waitForTimeout(2500);
await b.close();

const css = readFileSync("tmp/google-fonts.css", "utf8");
const map = new Map();
for (const blk of css.split("@font-face").slice(1)) {
  const fam = (blk.match(/font-family:\s*['"]?([^'";]+)['"]?/) || [])[1];
  const wt = (blk.match(/font-weight:\s*(\d+)/) || [])[1];
  const url = (blk.match(/url\(\s*['"]?(https:\/\/[^)'" ]+)/) || [])[1];
  if (fam && url) map.set(url, `${fam.trim()}|${wt}`);
}

const byFam = new Map();
const selfHosted = { req: 0, kb: 0 };
for (const g of got) {
  const k = map.get(g.url);
  if (!k) {
    selfHosted.req++;
    selfHosted.kb += g.len;
    continue;
  }
  const e = byFam.get(k) || { req: 0, bytes: 0 };
  e.req++;
  e.bytes += g.len;
  byFam.set(k, e);
}

const rows = [
  "実際にダウンロードされたフォント（family|weight）",
  "-".repeat(52),
  ...[...byFam.entries()].sort((a, c) => c[1].bytes - a[1].bytes).map(([k, v]) =>
    `  ${k.padEnd(28)}${String(v.req).padStart(4)} req${String(Math.round(v.bytes / 1024)).padStart(7)} KB`),
  "-".repeat(52),
  `  ${"(self-hosted: CorporateLogo)".padEnd(28)}${String(selfHosted.req).padStart(4)} req${String(Math.round(selfHosted.kb / 1024)).padStart(7)} KB`,
  "",
  `合計 ${got.length} req / ${Math.round(got.reduce((a, g) => a + g.len, 0) / 1024)} KB`,
  "",
  "宣言のみの combo（1 もダウンロードされない = 使われていない）:",
  ...[...new Set([...map.values()])].filter((v) => !byFam.has(v)).sort().map((v) => "  " + v),
];
writeFileSync("tmp/font-real-usage.txt", rows.join("\n"), "utf8");
console.log(rows.join("\n"));