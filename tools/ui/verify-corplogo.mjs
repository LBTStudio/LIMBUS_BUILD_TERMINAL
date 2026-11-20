import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* コーポレート・ロゴが実際に効いているか確認する。
 * CSS の積載だけでは判断しない。document.fonts で実際に読み込まれたか、
 * かなと漢字が別々のフォントに falling しているか、
 * tofu（.notdef 豆腐）が出ていないかを見る。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const fontReqs = [];
page.on("response", async (r) => {
  if (r.request().resourceType() !== "font") return;
  let len = 0;
  try { len = (await r.body()).length; } catch {}
  fontReqs.push({ url: r.url().split("/").pop().slice(0, 58), bytes: len });
});
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-z]+/, "v=" + Date.now()) });
  return route.continue();
});

await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(2000);
for (let i = 0; i < 12; i++) {
  await page.locator(".rail-item").nth(i).click();
  await page.waitForTimeout(450);
}
await page.waitForTimeout(2500);

const res = await page.evaluate(async () => {
  await document.fonts.ready;
  const loaded = [...document.fonts].map((f) => `${f.family}|${f.weight}|${f.status}`);
  const corp = loaded.filter((s) => s.startsWith("CorporateLogo"));
  // かなと漢字が実際に別の書体で描けるか measureText で比べる
  const c = document.createElement("canvas").getContext("2d");
  const probe = (text, font) => { c.font = font; return c.measureText(text).width; };
  const kana = probe("あいうえお", "16px CorporateLogo");
  const kanjiCorp = probe("黒雲", "16px CorporateLogo");
  const kanjiNoto = probe("黒雲", "16px 'Noto Sans JP'");
  // tofu 検出: 未知グリフは fallback の矩形幅になる
  const tofu = probe("", "16px CorporateLogo");
  return {
    fontFaces: loaded.length,
    corporateLogo: corp,
    ready: document.fonts.status,
    bodyFamily: getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    kanaWidthViaCorp: Math.round(kana),
    kanjiViaCorp: Math.round(kanjiCorp),
    kanjiViaNoto: Math.round(kanjiNoto),
    tofuWidth: Math.round(tofu),
  };
});
await page.screenshot({ path: "tools/ui/shots/corplogo-spirit.png" });
await b.close();

const total = fontReqs.reduce((a, f) => a + f.bytes, 0);
const corpBytes = fontReqs.filter((f) => f.url.includes("corporate")).reduce((a, f) => a + f.bytes, 0);
const out = {
  ...res,
  fontRequests: fontReqs.length,
  totalFontKB: Math.round(total / 1024),
  corporateLogoKB: Math.round(corpBytes / 1024),
  corporateFiles: fontReqs.filter((f) => f.url.includes("corporate")).map((f) => f.url),
};
console.log(JSON.stringify(out, null, 1));