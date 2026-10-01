/* 未使用 CSS セレクタを洗い出す。
 *
 *   node tools/ui/dead-css.mjs [ベースURL]
 *
 * 注意（重要）:
 * ここが出す「未使用」は**上限値**であり、死んだコードの件数ではない。
 *
 * クリックしないと開かないパネル（デッキ編集、E.G.O のモード切替など）は
 * 初期表示の 12 セクションに現れないため、死んだコードと誤判定する。
 * そのため2段階で判定する:
 *   (1) 12 セクション巡回で一度も DOM に現れない
 *   (2) かつ JS ファイル中にその文字列が一切現れない
 * この両方を満たすものだけを「確実なデッド」として出力する。
 *
 * ただし JS は template literal で class 名を連結して生成する場合があり、
 * (2) はそれを見落とす。よって確実なデッドの件数も上限値である。
 *
 * 実数は「全フローを操作した状態での検出」が必要で、このスクリプトだけでは
 * 达不到。削除の判断はここ:Person の出力だけを根拠にしないこと。
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadPlaywright, walkSections, REPO_ROOT } from "./harness.mjs";

const url = process.argv[2] || undefined;
const assetsDir = path.join(REPO_ROOT, "assets");
const jsDir = path.join(REPO_ROOT, "js");

// 状態を持たないセレクタ（:hover や .is-* があると「状態でしか出ない」ので除く）
const STATE = /:(hover|active|focus|focus-visible|focus-within|checked|disabled|target|before|after|placeholder|selection|marker|backdrop|first-line|first-letter)\b|\[(?![a-z-]+\])|\.((is|has)-)|::/i;

// ---- CSS からセレクタを抽出 ----
const entries = [];
for (const f of readdirSync(assetsDir).filter((f) => f.endsWith(".css"))) {
  const src = readFileSync(path.join(assetsDir, f), "utf8");
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(masked))) {
    const raw = m[1].trim().replace(/\s+/g, " ");
    if (!raw) continue;
    const line = masked.slice(0, m.index).split("\n").length;
    for (const one of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      entries.push({ f, line, sel: one });
    }
  }
}
const pure = entries.filter((e) => !STATE.test(e.sel));

// ---- JS 側の文字列を全部つなげる ----
const jsSrc = readdirSync(jsDir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(jsDir, f), "utf8")).join("\n");

// ---- 12 セクションを巡回して、及各セクションに出現した class / id を集める ----
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(url || (await import("./harness.mjs")).BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);

const present = new Set();
await walkSections(page, {
  onSection: async () => {
    const r = await page.evaluate(() => {
      const s = new Set();
      for (const el of document.querySelectorAll("*")) {
        if (el.className && typeof el.className === "string") el.className.split(/\s+/).filter(Boolean).forEach((c) => s.add(c));
        if (el.id) s.add("#" + el.id);
      }
      return [...s];
    });
    r.forEach((c) => present.add(c));
  },
});
await ctx.close();
await browser.close();

// ---- 判定 ----
const dead = [];
for (const e of pure) {
  const parts = [...e.sel.matchAll(/([.#])([\w-]+)/g)].map((m) => (m[1] === "." ? m[2] : "#" + m[2]));
  if (!parts.length) continue; // 要素だけのセレクタは判定しない
  const inDom = parts.every((p) => present.has(p));
  const inJs = parts.some((p) => jsSrc.includes(p));
  if (!inDom && !inJs) dead.push({ ...e, parts });
}

console.log(`状態を持たないセレクタ: ${pure.length}`);
console.log(`確実なデッド（DOM も JS も現れない）: ${dead.length}`);
console.log(`  ↑ これでも上限値。JS の template literal で連結生成される class は検出できない。\n`);

const byFile = new Map();
for (const d of dead) {
  if (!byFile.has(d.f)) byFile.set(d.f, []);
  byFile.get(d.f).push(d);
}
for (const [f, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${f}: ${list.length} 件`);
  list.slice(0, 12).forEach((d) => console.log(`     ${String(d.line).padStart(5)}: ${d.sel.slice(0, 58)}`));
  if (list.length > 12) console.log(`     ... 他 ${list.length - 12} 件`);
}
console.log(`\n合計 ${dead.length} セレクタ（上限値として扱って）`);
writeFileSync(path.join(REPO_ROOT, "tmp", "dead-list.json"), JSON.stringify(dead, null, 1));
console.log(`→ dead-list.json（削除候補の機械可読リスト）`);