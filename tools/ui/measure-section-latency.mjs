import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* セクション切替の応答性を、初回訪問と再訪問に分けて測る。
 * 初回は「そのセクションのカードが何十〜何百件も新しく作られる」ため重い。
 * 再訪問は React の reconciliation が効くので軽い。
 * 利用者が最初issu cruzarときexpensive なのが見えていないか確認するのが目的。 */
const NAMES = { 0: "人格", 1: "スキル", 2: "パッシブ", 3: "サポート", 4: "E.G.O", 5: "精神", 6: "強化", 7: "所持", 8: "アイテム", 9: "進otype", 10: "その他", 11: "設定" };

const visit = async (page, idx) => {
  const t0 = Date.now();
  await page.evaluate((i) => document.querySelectorAll(".rail-item")[i].click(), idx);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ms = Date.now() - t0;
  const stat = await page.evaluate(() => ({
    nodes: document.querySelectorAll(".focus *").length,
    total: document.querySelectorAll("*").length,
    listNodes: document.querySelectorAll(".focus [class*='item'], .focus [class*='card'], .focus .spirit-item, .focus .p-card, .focus .ego-card").length,
  }));
  return { ms, ...stat };
};

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });

const runPass = async (label) => {
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
  await page.waitForTimeout(600);

  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ i, ...(await visit(page, i)) });
  await page.close();
  return { label, rows };
};

const first = await runPass("初回訪問");
const second = await runPass("再訪問（別タブ・新規ロード）");

await b.close();

const pad = (s, n) => String(s).padEnd(n);
console.log("セクション     初回ms   DOM要素   一覧カード  | 再訪ms   差");
console.log("-".repeat(66));
let sumF = 0, sumS = 0;
for (let i = 0; i < 12; i++) {
  const f = first.rows[i], s = second.rows[i];
  sumF += f.ms; sumS += s.ms;
  console.log(
    pad((NAMES[i] || `?${i}`) + `(${i})`, 12) +
    String(f.ms).padStart(6) + String(f.nodes).padStart(9) + String(f.listNodes).padStart(11) + "  |" +
    String(s.ms).padStart(8) + String(s.ms - f.ms >= 0 ? "+" : "") + (s.ms - f.ms) + "ms"
  );
}
console.log("-".repeat(66));
console.log(pad("合計", 12) + String(sumF).padStart(6) + "ms" + " ".repeat(20) + " |" + String(sumS).padStart(8) + "ms  (12 セクション一周)");