import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 所持一覧の現状を目視・測定する。
 * 1) 「管理」ボタンの視認性（コントラスト・サイズ・位置）
 * 2) 一覧のフィルタ行に「装備中」相当の列があるか */

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })).newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.fonts.ready).catch(() => {});
await page.locator(".rail-item").nth(7).click();  // 所持
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  // 「管理」ボタン（テキスト一致）
  const all = [...document.querySelectorAll("button")];
  const manage = all.find((b) => /管理/.test(b.textContent || ""));
  const owned = all.find((b) => /OWNED|LIBRARY/.test(b.textContent || ""));
  // フィルタ行の select / segmented
  const selects = [...document.querySelectorAll("select")].map((s) => ({
    label: s.getAttribute("aria-label"), value: s.value, options: [...s.options].map((o) => o.textContent.trim()),
  }));
  const segmented = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
  const btns = all.map((b) => {
    const cs = getComputedStyle(b);
    return { text: (b.textContent || "").trim().slice(0, 12), cls: (b.className || "").slice(0, 30), color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) };
  }).filter((x) => x.text);
  return {
    manage: manage ? { text: manage.textContent.trim(), cls: manage.className, ...rect(manage), color: getComputedStyle(manage).color, bg: getComputedStyle(manage).backgroundColor, border: getComputedStyle(manage).borderColor, fontSize: getComputedStyle(manage).fontSize } : null,
    owned: owned ? { text: owned.textContent.trim(), ...rect(owned) } : null,
    selects, segmented,
    itemSample: [...document.querySelectorAll(".roster-item")].slice(0, 3).map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70)),
    hasEquippedBadge: [...document.querySelectorAll(".roster-item *")].some((e) => (e.textContent || "").trim() === "装備中"),
    buttons: btns.slice(0, 14),
  };
});

console.log("=== 管理ボタン ===");
console.log("  " + JSON.stringify(info.manage, null, 1).replace(/\n\s*/g, "\n  "));
console.log("\n=== select ===");
for (const s of info.selects) console.log(`  [${s.label}] value=${s.value} options=${JSON.stringify(s.options)}`);
console.log("\n=== タブ ===");
console.log("  " + JSON.stringify(info.segmented));
console.log("\n=== 一覧アイテム ===");
for (const i of info.itemSample) console.log(`  ${i}`);
console.log(`\n「装備中」バッジ/表示: ${info.hasEquippedBadge ? "ある" : "なし"}`);

await page.screenshot({ path: "tools/ui/shots/owned-library.png", clip: { x: 68, y: 48, width: 1000, height: 400 } });
console.log("\n撮影: tools/ui/shots/owned-library.png");
await b.close();