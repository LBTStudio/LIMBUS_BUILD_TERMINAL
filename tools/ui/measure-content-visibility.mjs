import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* サポート（2,768カード・415ms）と精神（400カード・196ms）が重い。
 * content-visibility: auto + contain-intrinsic-size をカードに適用して、
 * 切替遅延がどれだけ落ちるか、描画は壊れないかを測る。
 * 純粋な CSS なので振舞いは変わらない。 */

const visit = async (page, idx) => {
  const t0 = Date.now();
  await page.evaluate((i) => document.querySelectorAll(".rail-item")[i].click(), idx);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return Date.now() - t0;
};

const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });

const trial = async (apply) => {
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
  await page.waitForTimeout(500);

  // 対象セレクタを、支持/精神セクションを開いて特定する
  const targets = await page.evaluate(() => {
    const found = [];
    const rail = document.querySelectorAll(".rail-item");
    for (const idx of [3, 5]) {
      rail[idx].click();
      const focus = document.querySelector(".focus");
      // 同じ class の親のうち、offscreen に一番大きいものを探す
      const cand = new Map();
      for (const el of focus.querySelectorAll("div,ul,section")) {
        if (el.children.length < 30) continue;
        const cls = (typeof el.className === "string" ? el.className : "").trim();
        if (!cls) continue;
        const r = el.getBoundingClientRect();
        const prev = cand.get(cls);
        if (!prev || r.height > prev.h) {
          cand.set(cls, { cls, kids: el.children.length, h: Math.round(r.height), kidH: Math.round(el.children[0].getBoundingClientRect().height) });
        }
      }
      for (const [cls, v] of cand) found.push({ ...v, section: idx });
    }
    return found;
  });

  if (apply && targets.length) {
    await page.evaluate((list) => {
      const css = list.map((t) => {
        const sel = "." + t.cls.split(/\s+/).map((c) => CSS.escape(c)).join(".");
        return `${sel} > * { content-visibility: auto; contain-intrinsic-size: auto ${Math.max(28, t.kidH)}px; }`;
      }).join("\n");
      const s = document.createElement("style");
      s.id = "__cv";
      s.textContent = css;
      document.head.appendChild(s);
    }, targets);
    await page.waitForTimeout(700);
  }

  const rows = [];
  // 各セクションを2回ずつ訪れ、初回と2回目を取る
  for (const idx of [3, 5, 1, 8]) {
    const first = await visit(page, idx);
    await page.waitForTimeout(300);
    await visit(page, 0);
    await page.waitForTimeout(300);
    const second = await visit(page, idx);
    await page.waitForTimeout(300);
    rows.push({ idx, first, second });
  }
  await page.close();
  return { rows, targets };
};

const before = await trial(false);
const after = await trial(true);
await b.close();

console.log("=== 対象コンテナ ===");
for (const t of before.targets) console.log(`  §${t.section} .${t.cls.slice(0, 46)}  子=${t.kids} 高=${t.h}px 1個=${t.kidH}px`);

const nm = { 3: "サポート", 5: "精神", 1: "スキル", 8: "アイテム" };
console.log("\n=== セクション切替（ms） ===");
console.log("  " + "セクション".padEnd(14) + "現状(初回/2回目)".padEnd(22) + "content-visibility(初回/2回目)");
console.log("  " + "-".repeat(62));
for (const r of before.rows) {
  const a = after.rows.find((x) => x.idx === r.idx);
  const d1 = a.first - r.first, d2 = a.second - r.second;
  console.log(
    "  " + nm[r.idx].padEnd(12) +
    (r.first + " / " + r.second).padStart(10) +
    "        " + (a.first + " / " + a.second).padStart(10) +
    `   初回 ${d1 >= 0 ? "+" : ""}${d1}ms / 2回目 ${d2 >= 0 ? "+" : ""}${d2}ms`
  );
}