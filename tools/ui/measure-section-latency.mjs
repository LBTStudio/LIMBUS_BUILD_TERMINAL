import { loadPlaywright, openApp } from "./harness.mjs";

/* メインナビゲーションの応答性を、初回ロードと別ロードで比較する。 */
const ROUTES = ["ホーム", "ビルド", "ショップ", "記録・所持品", "詳細設定", "使い方"];
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });

async function runPass(label) {
  const { context, page } = await openApp(browser, { width: 1440, height: 900, bypassCache: true });
  const rows = [];
  for (const title of ROUTES) {
    const started = Date.now();
    await page.locator('.rail-item[title="' + title + '"]').click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const elapsed = Date.now() - started;
    const stat = await page.evaluate(() => ({
      nodes: document.querySelectorAll(".focus *").length,
      total: document.querySelectorAll("*").length,
      listNodes: document.querySelectorAll(".focus [class*='item'], .focus [class*='card'], .focus .spirit-item, .focus .p-card, .focus .ego-card").length,
    }));
    rows.push({ title, ms: elapsed, ...stat });
  }
  await context.close();
  return { label, rows };
}

const first = await runPass("初回ロード");
const second = await runPass("別コンテキスト再ロード");
await browser.close();

console.log("メイン画面           初回ms   DOM要素   一覧カード  | 再訪ms   差");
console.log("-".repeat(72));
let sumFirst = 0, sumSecond = 0;
for (let i = 0; i < ROUTES.length; i++) {
  const a = first.rows[i], b = second.rows[i];
  sumFirst += a.ms;
  sumSecond += b.ms;
  console.log(a.title.padEnd(20) + String(a.ms).padStart(7) + String(a.nodes).padStart(9)
    + String(a.listNodes).padStart(11) + "  |" + String(b.ms).padStart(8)
    + String(b.ms - a.ms >= 0 ? "+" : "") + (b.ms - a.ms) + "ms");
}
console.log("-".repeat(72));
console.log("合計".padEnd(20) + String(sumFirst).padStart(7) + "ms" + " ".repeat(20) + " |" + String(sumSecond).padStart(8) + "ms (6 main routes)");
