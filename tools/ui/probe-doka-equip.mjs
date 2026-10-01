import { readFileSync } from "node:fs";
import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* #2 決定的な再現: DB の同化型E.G.O を egoSlots へ直接入れて装備状態を作り、
 * 「◆ 同化」(.ego-card-marks) と「EQUIPPED」(.p-card::after) の重なりを測る。
 * dblclick 経由だと装備が反映されないため、状態を直接種する。 */
const db = JSON.parse(readFileSync("data/db.json", "utf8"));
const doka = db.egos.find((e) => (e.sub_skills || []).length > 0);
console.log(`種するE.G.O: ${doka.name} (${doka.rank} No.${doka.no}) sub_skills=${doka.sub_skills.length}`);

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(css|js|mjs)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}`) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1000);

await page.evaluate((ego) => {
  const KEY = "lbt_v46_state";
  const s = JSON.parse(localStorage.getItem(KEY) || "{}");
  s.egoSlots = s.egoSlots || {};
  s.egoSlots[ego.rank] = ego;
  if (!s.ui) s.ui = {};
  delete s.ui.egoListExpanded;
  localStorage.setItem(KEY, JSON.stringify(s));
}, doka);

await page.reload({ waitUntil: "load" });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1400);
await page.locator(".rail-item").nth(4).click();
await page.waitForTimeout(900);

// 既定は「所持・最近使用」だけなので、全件を開かないと同化カードが出ない
const browse = page.locator("button.ego-browse-all").first();
if (await browse.count()) { await browse.click(); await page.waitForTimeout(900); }
console.log("カード総数:", await page.locator(".p-card").count(), "/ 同化バッジ:", await page.locator(".ego-doka-badge").count());

const state = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("lbt_v46_state") || "{}");
  const equipped = [...document.querySelectorAll(".p-card.is-equipped")].map((c) => (c.querySelector(".p-name")?.textContent || "").trim());
  return { slots: Object.entries(s.egoSlots || {}).filter(([, v]) => v).map(([k, v]) => `${k}:${v.name}`), equippedCards: equipped, dokaTotal: document.querySelectorAll(".ego-doka-badge").length };
});
console.log("egoSlots:", JSON.stringify(state.slots));
console.log("装着済みカード:", JSON.stringify(state.equippedCards));
console.log("同化バッジ数:", state.dokaTotal);

const meas = await page.evaluate(() => {
  const rows = [];
  for (const c of document.querySelectorAll(".p-card")) {
    const doka = c.querySelector(".ego-doka-badge");
    if (!doka) continue;
    const cs = getComputedStyle(c, "::after");
    const equipped = c.classList.contains("is-equipped");
    const name = (c.querySelector(".p-name")?.textContent || "").trim();
    if (!equipped) { rows.push({ name, equipped: false }); continue; }
    const marks = c.querySelector(".ego-card-marks").getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const w = parseFloat(cs.width) || 0, h = parseFloat(cs.height) || 0;
    const after = { l: cr.right - 8 - w, t: cr.top + 8, r: cr.right - 8, b: cr.top + 8 + h };
    const ow = Math.min(marks.right, after.r) - Math.max(marks.left, after.l);
    const oh = Math.min(marks.bottom, after.b) - Math.max(marks.top, after.t);
    const pn = c.querySelector(".p-num");
    const pr = pn.getBoundingClientRect();
    rows.push({
      name, equipped: true,
      marks: `${Math.round(marks.left)},${Math.round(marks.top)} → ${Math.round(marks.right)},${Math.round(marks.bottom)}`,
      after: `${Math.round(after.l)},${Math.round(after.t)} → ${Math.round(after.r)},${Math.round(after.b)}`,
      afterSize: `${Math.round(w)}x${Math.round(h)}`,
      overlapDoka: ow > 0 && oh > 0 ? `${Math.round(ow)}x${Math.round(oh)}` : "なし",
      pnumOverflowRight: Math.round(pr.right - cr.right),
      pnumH: Math.round(pr.height),
    });
  }
  return rows;
});

console.log("\n=== 同化カード実測 ===");
for (const r of meas) {
  console.log(`\n  ${r.name}${r.equipped ? "" : "  [未装備]"}`);
  if (!r.equipped) continue;
  console.log(`    マーク群(E.G.O内) : ${r.marks}`);
  console.log(`    EQUIPPED(絶対位置): ${r.after}  ${r.afterSize}`);
  console.log(`    → 重なり          : ${r.overlapDoka}`);
  console.log(`    p-num 右はみ出し  : ${r.pnumOverflowRight}px / 高さ ${r.pnumH}px`);
}

const tgt = page.locator(".p-card", { has: page.locator(".ego-doka-badge") }).first();
if (await tgt.count()) { await tgt.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await tgt.screenshot({ path: "tools/ui/shots/ego-doka-card.png" }); console.log("\n撮影: tools/ui/shots/ego-doka-card.png"); }
await b.close();