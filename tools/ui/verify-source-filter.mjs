import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 出典フィルタの動作確認。4 つの選択肢が並び、
 * 「特定抽出パック」で 29 件に絞られ、Packet filter が残ることを確認する。 */

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
await page.locator(".rail-item").nth(3).click();
await page.waitForTimeout(1000);

const countItems = () =>
  page.evaluate(() => {
    const list = document.querySelector(".spirit-list");
    const counter = [...document.querySelectorAll("*")].find((e) => /^\s*\d+\s*\/\s*\d+\s*$/.test((e.textContent || "").trim()) && e.children.length === 0);
    return {
      items: list ? list.children.length : -1,
      counter: counter ? counter.textContent.trim() : "(なし)",
      firstNames: list ? [...list.children].slice(0, 4).map((e) => (e.querySelector(".spirit-item-name")?.textContent || "").trim()) : [],
      sources: list
        ? [...new Set([...list.children].slice(0, 40).map((e) => e.querySelector(".spirit-item-tag")?.textContent?.trim()).filter(Boolean))]
        : [],
    };
  });

const chips = await page.evaluate(() => {
  const row = [...document.querySelectorAll(".chip")].filter((c) => /全て|ルールブック|アンロック|特定抽出/.test(c.textContent || ""));
  return row.map((c) => ({ text: c.textContent.trim(), active: c.className.includes("is-active") || c.getAttribute("aria-pressed") === "true" }));
});
console.log("=== フィルタの選択肢 ===");
chips.forEach((c) => console.log(`  ${c.active ? "[ON] " : "[   ] "}${c.text}`));

console.log("\n=== 初期状態（全て） ===");
console.log("  " + JSON.stringify(await countItems()));

for (const label of ["特定抽出パック", "アンロックド・シンク", "ルールブック"]) {
  const chip = page.locator(".chip", { hasText: label }).first();
  if (!(await chip.count())) { console.log(`\n「${label}」のチップが見つからない`); continue; }
  await chip.click();
  await page.waitForTimeout(800);
  console.log(`\n=== ${label} を選択 ===`);
  console.log("  " + JSON.stringify(await countItems()));
}

await page.locator(".chip", { hasText: "全て" }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: "tools/ui/shots/source-filter.png" });
console.log("\n撮影: tools/ui/shots/source-filter.png");
await b.close();