import { loadPlaywright } from "./harness.mjs";

/* インライン layout 宣言を「安全に CSS へ移せるもの」に絞る。
 *
 * 前回 .pv-sec-head で失敗した理由:
 *   - 同じ class が div と button の両方に付いている
 *   - JS のインラインは button 側だけに効いていた
 *   - div 側は3つの layer が互いに矛盾する値を持っていた
 *
 * したがって判定基準は「その class を持つ要素が1種類だけ」かつ
 * 「その要素の style 属性が毎回同じ値」であること。
 * 複数種類に同じ class が付いている場合は、どちらに効くか了很多.
 * 条件を満たすものだけを「安全」とする。
 */

const browser = (await import("./harness.mjs")).loadPlaywright();
const b = await browser.chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/*", async (route) => {
  const url = route.request().url();
  if (/\.(css|js|mjs)\?v=/.test(url)) return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}`) });
  return route.continue();
});
const { BASE_URL } = await import("./harness.mjs");
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);

// class -> { tags:Set, styleValues:Set, count, sample }
const map = new Map();
for (let si = 0; si < 12; si++) {
  await page.locator(".rail-item").nth(si).click();
  await page.waitForTimeout(600);
  if (await page.locator(".utility-sheet-backdrop").count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const attr = el.getAttribute("style");
      if (!attr) continue;
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      /* 判定には「style を持つ要素」だけでなく、その class を持つ
         すべての要素を使う。style がない要素は上のループで見えないため、
         同じ class が div と button の両方に付いているケースを
         検出できない。前回 .pv-sec-head で exatamenteこの穴に落ちた。 */
      const owners = [];
      if (cls) {
        for (const other of document.querySelectorAll("." + CSS.escape(cls.split(/\s+/)[0]))) {
          owners.push(other.tagName.toLowerCase() + (other.hasAttribute("style") ? "*" : ""));
        }
      }
      out.push({
        cls,
        tag: el.tagName.toLowerCase(),
        style: attr.replace(/\s+/g, " ").trim(),
        owners: [...new Set(owners)].sort(),
      });
    }
    return out;
  });
  for (const r of rows) {
    const key = r.cls || `(${r.tag})`;
    if (!map.has(key)) map.set(key, { tags: new Set(), styles: new Set(), owners: new Set(), n: 0, sample: r });
    const e = map.get(key);
    e.tags.add(r.tag);
    e.styles.add(r.style);
    for (const o of r.owners) e.owners.add(o);
    e.n++;
  }
}
await b.close();

/* 安全の判定基準:
 *   1. style の値が常に同一（値が可変なら CSS に書けない）
 *   2. その class の持ち主が「style を持つ要素」1種類だけ
 *      （* が付かない要素が同じ class を持っていると、CSS に移すと
 *       そちらにも適用されて前回 .pv-sec-head で見た差分が出る）
 */
const safe = [];
const unsafe = [];
for (const [key, e] of map) {
  const owners = [...e.owners];
  const singleValue = e.styles.size === 1;
  const onlyStyledOwner = owners.length > 0 && owners.every((o) => o.endsWith("*")) && new Set(owners.map((o) => o.slice(0, -1))).size === 1;
  const safeCandidate = singleValue && onlyStyledOwner;
  (safeCandidate ? safe : unsafe).push({ key, ...e, singleValue, owners });
}

console.log(`インライン style を持つ class: ${map.size} 種類\n`);
console.log(`CSS へ移せる（値が単一・保持者が1種のみ）: ${safe.length} 種類`);
console.log(`移せない                                        : ${unsafe.length} 種類\n`);

console.log("=== 移せる ===");
for (const e of safe.sort((a, b) => b.n - a.n)) {
  console.log(`  ${String(e.n).padStart(3)}x  ${e.key.slice(0, 44).padEnd(46)} ${e.owners.join(",")}`);
  console.log(`         ${e.sample.style.slice(0, 78)}`);
}

console.log("\n=== 移せない（理由付き）===");
for (const e of unsafe.sort((a, b) => b.n - a.n)) {
  const bare = e.owners.filter((o) => !o.endsWith("*"));
  const why = !e.singleValue
    ? `style の値が ${e.styles.size} 通り（可変）`
    : bare.length
      ? `style なしの要素が同じ class（${bare.join(",")}）`
      : `保持者が ${e.owners.length} 種類`;
  console.log(`  ${String(e.n).padStart(3)}x  ${e.key.slice(0, 40).padEnd(42)} ${why}`);
}