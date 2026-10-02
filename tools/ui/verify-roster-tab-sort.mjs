import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 所持ライブラリの人格タブで「同期順」を選び、E.G.O タブへ切り替えたとき
 * 並び順が既定（追加順）へ戻り、<select> が空白にならないことを確認する。 */

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
await page.waitForTimeout(1200);
await page.evaluate(() => document.fonts.ready).catch(() => {});

// 所持（7）へ
await page.locator(".rail-item").nth(7).click();
await page.waitForTimeout(1000);

const readState = () =>
  page.evaluate(() => {
    const sel = document.querySelector('select[aria-label="所持一覧の並び順"], select');
    const selEl = [...document.querySelectorAll("select")].find((s) => /並び順/.test(s.getAttribute("aria-label") || "") || /追加順/.test(s.options[0]?.textContent || ""));
    const opts = selEl ? [...selEl.options].map((o) => o.value) : [];
    const tabActive = document.querySelector('[role=tab][aria-selected="true"]')?.textContent?.trim() || "?";
    return {
      tab: tabActive,
      selected: selEl ? selEl.value : "(select 無し)",
      displayed: selEl && selEl.selectedIndex >= 0 ? selEl.options[selEl.selectedIndex].textContent : "(空白表示)",
      options: opts,
      firstItems: [...document.querySelectorAll(".p-card .p-name, [class*='p-name']")].slice(0, 3).map((e) => e.textContent.trim()),
    };
  });

console.log("=== 初期（人格タブ） ===");
console.log("  " + JSON.stringify(await readState()));

const sortSel = page.locator("select").filter({ has: page.locator('option[value="sync"]') }).first();
if (!(await sortSel.count())) { console.log("同期順 option が見つからない"); await b.close(); process.exit(0); }
await sortSel.selectOption("sync");
await page.waitForTimeout(700);
console.log("\n=== 人格タブで「同期順」を選択 ===");
console.log("  " + JSON.stringify(await readState()));

const egoTab = page.locator('[role=tab]', { hasText: "E.G.O" }).first();
await egoTab.click();
await page.waitForTimeout(900);
console.log("\n=== E.G.O タブへ切替 ===");
const after = await readState();
console.log("  " + JSON.stringify(after));

const ok = after.selected === "added" && after.displayed !== "(空白表示)" && !after.options.includes("sync");
console.log(`\n判定: ${ok ? "OK（既定へ戻り、空白也表示なし）" : "NG"}`);

await page.screenshot({ path: "tools/ui/shots/roster-tab-sort.png" });
await b.close();