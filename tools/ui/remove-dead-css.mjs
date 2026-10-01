import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./harness.mjs";

/* 確実なデッドと判定されたセレクタのルールブロックを CSS から削除する。
 *
 * 前提（tools/ui/dead-css.mjs と dead-css-verify.mjs が確認済み）:
 *   - 12 セクションを巡回して一度も DOM に現れない
 *   - JS に文字列として一度も現れない（連結生成の痕跡なし）
 *   - state 疑似クラスを含まない
 *   - 他セレクタから var() で参照されていない
 *
 * それでも削除は危険なので、ピクセル差分と axe で必ず検証する。
 *
 *   node tools/ui/remove-dead-css.mjs tmp/dead-list.json [--dry-run]
 */

const listPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const candidates = JSON.parse(readFileSync(listPath, "utf8"));

// セレクタ文字列 -> そのセレクタを含むルールを持つ
const byFile = new Map();
for (const c of candidates) {
  if (!byFile.has(c.f)) byFile.set(c.f, []);
  byFile.get(c.f).push(c);
}

let totalRules = 0;
let totalBytes = 0;

for (const [file, list] of byFile) {
  const rel = path.join("assets", file);
  const abs = path.join(REPO_ROOT, rel);
  const src = readFileSync(abs, "utf8");
  const before = src.length;

  // コメントを長さを保って空白化し、ルール境界を正確に辿る
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

  // 削除対象のルール区間（複数セレクタ含むルールは、そのうち一部だけなら残す）
  const dropRanges = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(masked))) {
    const selectorText = m[1].trim().replace(/\s+/g, " ");
    if (!selectorText) continue;
    const selectors = selectorText.split(",").map((s) => s.trim()).filter(Boolean);
    const targets = new Set(list.map((c) => c.sel));
    const hits = selectors.filter((s) => targets.has(s));
    if (!hits.length) continue;
    if (hits.length === selectors.length) {
      // ルール全体が対象 → ブロックごと削除
      dropRanges.push([m.index, m.index + m[0].length]);
      totalRules += hits.length;
    }
    // 一部だけ対象の場合は削除しない（セレクタ単位で surgery すると危険）
  }

  // 区間を除いてつなぎ直す（後ろから処理して添字ずれを避ける）
  let out = src;
  for (const [s, e] of dropRanges.reverse()) {
    // 直前の改行も一緒に落とす
    let start = s;
    while (start > 0 && (out[start - 1] === "\n" || out[start - 1] === "\r")) start--;
    out = out.slice(0, start) + out.slice(e);
  }

  if (out !== src) {
    totalBytes += before - out.length;
    if (!dryRun) writeFileSync(abs, out, "utf8");
    console.log(`${file}: ${dropRanges.length} blocks, ${before - out.length} bytes${dryRun ? " (dry-run)" : ""}`);
  }
}

console.log(`\n合計 ${totalRules} selectors, ${totalBytes} bytes${dryRun ? " (dry-run)" : " removed"}`);