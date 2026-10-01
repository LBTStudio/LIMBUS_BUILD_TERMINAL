import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* #1 検証: EGO を持っていても一覧が既定で展開されているか。
 * state.ui.egoListExpanded が未設定の「初回訪問」相当の状態で作る。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(css|js|mjs)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}`) });
  return route.continue();
});

const goEgo = async () => {
  await page.locator(".rail-item").nth(4).click();
  await page.waitForTimeout(700);
};

await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1200);

// egoListExpanded を確実に「未設定」にする
await page.evaluate(() => {
  const raw = localStorage.getItem("lbt_v46_state");
  if (!raw) return;
  const s = JSON.parse(raw);
  if (s.ui) delete s.ui.egoListExpanded;
  localStorage.setItem("lbt_v46_state", JSON.stringify(s));
});
await page.reload({ waitUntil: "load" });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1200);

// EGO を1件作る（オリジナル）
await goEgo();
await page.locator("button.btn--primary", { hasText: "新規作成" }).first().click();
await page.waitForTimeout(700);
const nameInput = page.locator('input[aria-label="新規E.G.O名"]').first();
await nameInput.fill("検証用EGO");
await page.waitForTimeout(300);
const btnEnabled = await page.locator("button", { hasText: "作成して編集" }).first().isEnabled();
console.log("作成ボタンの enabled:", btnEnabled);
await page.locator("button", { hasText: "作成して編集" }).first().click();
await page.waitForTimeout(1200);

const hasEgo = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("lbt_v46_state") || "{}");
  return { egoSlots: Object.entries(s.egoSlots || {}).filter(([, v]) => v).map(([k]) => k), uiEgoListExpanded: s.ui?.egoListExpanded };
});
console.log("EGO所持:", JSON.stringify(hasEgo.egoSlots));
console.log("保存済み ui.egoListExpanded:", hasEgo.uiEgoListExpanded);

// リロードして既定状態を確認
await page.reload({ waitUntil: "load" });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1400);
await goEgo();

const after = await page.evaluate(() => {
  const toggle = document.querySelector(".ego-list-head, .ego-section h2, [class*='ego'] [aria-expanded]");
  const cards = document.querySelectorAll(".ego-card").length;
  const list = document.querySelector(".ego-list, .ego-cards, .ego-section .stack-4");
  const hidden = [];
  for (const el of document.querySelectorAll(".ego-card, .ego-list-body, .ego-catalog")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) hidden.push(el.className.slice(0, 40));
  }
  const heads = [...document.querySelectorAll("button, [role=button]")].filter((e) => (e.textContent || "").includes("E.G.O 一覧") || (e.textContent || "").includes("一覧を") || (e.textContent || "").includes("を畳"));
  return {
    cardCount: cards,
    heads: heads.map((e) => ({ text: (e.textContent || "").trim().slice(0, 26), expanded: e.getAttribute("aria-expanded") })),
    hiddenCount: hidden.length,
    listDisplay: list ? getComputedStyle(list).display : "(要素なし)",
    toggleFound: !!toggle,
  };
});
console.log("\n=== リロード後 ===");
console.log("EGOカード表示数:", after.cardCount);
console.log("一覧トグル:", JSON.stringify(after.heads));
console.log("非表示要素数:", after.hiddenCount);
console.log("一覧コンテナ display:", after.listDisplay);

await page.screenshot({ path: "tools/ui/shots/ego-expanded.png" });
console.log("\n撮影: tools/ui/shots/ego-expanded.png");
await b.close();