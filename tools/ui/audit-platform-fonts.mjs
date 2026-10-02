import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 実描画にどの OS フォントが使っているかを CDP で確認する。
 * measureText や document.fonts はフォールバックを隠すので答えにならない。
 * CSS.getPlatformFontsForNode が実際にラスタライズしたフォントを返す。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(2500);

const cdp = await ctx.newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");

/* 日本語（漢字）を含む通常ウェイト本文と、700 の見出しCarrier を集める */
const targets = await page.evaluate(() => {
  const out = [];
  const hasKanji = (s) => /[\u4e00-\u9fff]/.test(s);
  const hasKana = (s) => /[\u3040-\u30ff]/.test(s);
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!own) continue;
    const cs = getComputedStyle(el);
    out.push({
      tag: el.tagName,
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 26),
      text: own.slice(0, 14),
      weight: cs.fontWeight,
      size: cs.fontSize,
      family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      kind: hasKanji(own) && own.trim().length <= 14 ? "kanji" : hasKana(own) && own.trim().length <= 14 ? "kana" : "mixed",
    });
  }
  return out;
});

/* bodyWeight で漢字、headWeight で漢字を実描画したノードをENERGY 1つずつ特定 */
const pick = (filter) => {
  const hits = targets.filter(filter);
  return hits;
};

const byNodeId = new Map();
const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
const collect = async (predicate, label, limit = 6) => {
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "*" });
  const found = [];
  for (const nodeId of nodeIds) {
    if (found.length >= limit) break;
    const { node } = await cdp.send("DOM.describeNode", { nodeId });
    if (!node || node.nodeType !== 1) continue;
    let txt = "";
    try {
      const r = await cdp.send("Runtime.evaluate", { expression: `document.querySelectorAll("*")[0] && (()=>{const e=document.querySelectorAll("*")[${nodeIds.indexOf(nodeId)}]; return e && e.childNodes.length && [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join("")})()`, returnByValue: true });
      txt = (r.result && r.result.value) || "";
    } catch {}
    if (!txt) continue;
    if (!predicate(txt)) continue;
    let fonts = [];
    try { fonts = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts || []; } catch {}
    if (!fonts.length) continue;
    found.push({ label, text: txt.slice(0, 12), fonts: fonts.map((f) => `${f.familyName}(${f.glyphCount})`) });
  }
  return found;
};

const rows = [];
rows.push(...(await collect((t) => /[\u4e00-\u9fff]/.test(t) && t.trim().length <= 8, "漢字")));
rows.push(...(await collect((t) => /[\u3040-\u30ff]/.test(t) && t.trim().length <= 8, "かな")));

await b.close();
const seen = new Set();
const out = [];
for (const r of rows) {
  const k = r.label + "|" + r.fonts.join(",");
  if (seen.has(k)) continue;
  seen.add(k);
  out.push(`  [${r.label}] «${r.text}»  →  ${r.fonts.join(" + ")}`);
}
console.log("実描画に使われた OS フォント:");
out.forEach((o) => console.log(o));