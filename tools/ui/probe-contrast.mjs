import { loadPlaywright, walkSections } from "./harness.mjs";

/* color-contrast 違反の対象要素について、
 * 実際の前景色・背景色・フォントサイズ・太字を取得する。
 * axe の報告だけから色を推測せず、計算スタイルから実測する。
 */

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(process.env.PROBE_URL || "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/", { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);

const TARGETS = [
  ".cond-chip[data-sin=\"憤怒\"]",
  ".ego-slot-rank",
  ".ego-resource-filter-note",
  ".spirit-item-tag[data-tag=\"confuse\"]",
  ".detail-empty-icon",
  ".item-filter.is-active > small",
  ".item-filter > small",
];

const seen = new Set();

function parseColor(c) {
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
function relLum([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg) {
  const a = relLum(fg), b = relLum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

await walkSections(page, {
  onSection: async () => {
    const rows = await page.evaluate((sels) => {
      const out = [];
      for (const s of sels) {
        for (const el of Array.from(document.querySelectorAll(s)).slice(0, 2)) {
          const cs = getComputedStyle(el);
          // 背景は祖先を遡って最初の不透明 ones を取る
          let bg = "rgba(0, 0, 0, 0)";
          let n = el;
          while (n && n !== document.documentElement) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; }
            n = n.parentElement;
          }
          out.push({
            sel: s,
            fg: cs.color,
            bg,
            fs: parseFloat(cs.fontSize),
            fw: cs.fontWeight,
            text: (el.textContent || "").trim().slice(0, 12),
          });
        }
      }
      return out;
    }, TARGETS);
    for (const r of rows) {
      const k = r.sel + "|" + r.fg + "|" + r.bg;
      if (seen.has(k)) continue;
      seen.add(k);
      const ratio_ = ratio(parseColor(r.fg), parseColor(r.bg));
      const large = r.fs >= 18.66 || (r.fs >= 24 && Number(r.fw) >= 700);
      const need = large ? 3 : 4.5;
      console.log(`${r.sel}  "${r.text}"`);
      console.log(`   fg=${r.fg}  bg=${r.bg}  ${r.fs}px w${r.fw}`);
      console.log(`   ratio=${ratio_.toFixed(2)}  need=${need}  ${ratio_ >= need ? "OK" : "*** NG (要 " + (ratio_ - need).toFixed(2) + " 改善) ***"}`);
    }
  },
});

await ctx.close();
await browser.close();