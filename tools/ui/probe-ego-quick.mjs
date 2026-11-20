import { readFileSync } from "node:fs";
import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* EGO 簡易詳細の「：：」を再現する。DB の E.G.O をそのまま装備し、
 * 簡易詳細を開いて実際に描かれるテキストと絵字を採取する。 */
const db = JSON.parse(readFileSync("data/db.json", "utf8"));
const ego = db.egos.find((e) => (e.kakusei && e.kakusei.dice && e.kakusei.dice.length) || (e.sub_skills || []).some((s) => (s.dice || []).length));
console.log("再現対象:", ego.name, ego.rank);

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1200);

await page.evaluate((e) => {
  const raw = localStorage.getItem("lbt_v46_state");
  const s = raw ? JSON.parse(raw) : {};
  s.egoSlots = s.egoSlots || {};
  s.egoSlots[e.rank] = e;
  localStorage.setItem("lbt_v46_state", JSON.stringify(s));
}, ego);

await page.reload({ waitUntil: "load" });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1400);
await page.locator(".rail-item").nth(4).click();
await page.waitForTimeout(900);

// 装備スロットをクリックして簡易詳細を開く
const slot = page.locator(`.ego-slot.is-equipped, .ego-slot`).first();
await slot.click();
await page.waitForTimeout(1200);

const found = await page.evaluate(() => {
  const d = document.querySelector(".ego-quick-detail");
  if (!d) return { present: false };
  const r = d.getBoundingClientRect();
  const effects = [...d.querySelectorAll(".ego-quick-dice-effect")].map((e) => ({
    text: e.textContent,
    childTexts: [...e.children].map((c) => JSON.stringify(c.textContent)),
  }));
  return {
    present: true,
    rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) },
    scrollH: d.scrollHeight, clientH: d.clientHeight,
    overflowY: getComputedStyle(d).overflowY,
    clipped: d.scrollHeight > d.clientHeight + 1,
    rolls: [...d.querySelectorAll(".ego-quick-rolls")].map((e) => e.textContent),
    effects,
    fullText: d.textContent.replace(/\s+/g, " ").slice(0, 260),
  };
});
console.log(JSON.stringify(found, null, 1));

if (found.present) {
  await page.locator(".ego-quick-detail").screenshot({ path: "tools/ui/shots/ego-quick.png" });
  console.log("\n撮影: tools/ui/shots/ego-quick.png");
}
await b.close();