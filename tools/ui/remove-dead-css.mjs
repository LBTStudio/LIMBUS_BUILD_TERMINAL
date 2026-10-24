import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./harness.mjs";

/*
 * 機械的な未使用候補からCSSルールを削除する補助ツール。
 * 推定上の「未使用」は誤検知し得るため、通常実行は必ず dry-run とする。
 * 実ファイルの変更には --apply を明示し、候補ファイルは assets直下のCSS名だけ許可する。
 *
 *   node tools/ui/remove-dead-css.mjs tmp/dead-list.json
 *   node tools/ui/remove-dead-css.mjs tmp/dead-list.json --apply
 */

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRunFlag = args.includes("--dry-run");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && !["--apply", "--dry-run"].includes(arg));
if (unknownFlags.length) {
  console.error(`未知のオプション: ${unknownFlags.join(", ")}`);
  process.exit(1);
}
if (apply && dryRunFlag) {
  console.error("--apply と --dry-run は同時に指定できません");
  process.exit(1);
}
const dryRun = !apply || dryRunFlag;
const listPath = args.find((arg) => !arg.startsWith("--"));
if (!listPath) {
  console.error("使い方: node tools/ui/remove-dead-css.mjs <候補JSON> [--dry-run | --apply]");
  process.exit(1);
}

let candidates;
try {
  candidates = JSON.parse(readFileSync(listPath, "utf8"));
} catch (error) {
  console.error(`候補JSONを読めません: ${error?.message || error}`);
  process.exit(1);
}
if (!Array.isArray(candidates)) {
  console.error("候補JSONのトップレベルは配列である必要があります");
  process.exit(1);
}

const assetsRoot = path.resolve(REPO_ROOT, "assets");
const cssNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.css$/;
function safeCssPath(file) {
  if (typeof file !== "string" || !cssNamePattern.test(file) || file === "." || file === "..") {
    throw new Error(`assets直下のCSSファイル名ではありません: ${String(file)}`);
  }
  const abs = path.resolve(assetsRoot, file);
  if (path.dirname(abs) !== assetsRoot) {
    throw new Error(`assetsディレクトリ外へのパスを拒否しました: ${file}`);
  }
  return abs;
}

// 先に全候補を検証する。途中の不正レコードで一部ファイルだけ変更される事態を避ける。
for (const [index, candidate] of candidates.entries()) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    console.error(`候補 ${index + 1} はオブジェクトではありません`);
    process.exit(1);
  }
  try {
    safeCssPath(candidate.f);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (typeof candidate.sel !== "string" || !candidate.sel.trim()) {
    console.error(`候補 ${index + 1} のselectorが不正です`);
    process.exit(1);
  }
}

// セレクタ文字列 -> そのセレクタを含むルールを持つ
const byFile = new Map();
for (const candidate of candidates) {
  if (!byFile.has(candidate.f)) byFile.set(candidate.f, []);
  byFile.get(candidate.f).push(candidate);
}

let totalRules = 0;
let totalBytes = 0;
const plans = [];

// 変更対象を全て読み込み、変更計画を先に作る。実ファイルへの書き込みは最後にまとめて行う。
for (const [file, list] of byFile) {
  const abs = safeCssPath(file);
  const src = readFileSync(abs, "utf8");
  const before = src.length;

  // コメントを長さを保って空白化し、ルール境界を正確に辿る
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

  // 削除対象のルール区間（複数セレクタ含むルールは、そのうち一部だけなら残す）
  const dropRanges = [];
  const targets = new Set(list.map((candidate) => candidate.sel));
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(masked))) {
    const selectorText = match[1].trim().replace(/\s+/g, " ");
    if (!selectorText) continue;
    const selectors = selectorText.split(",").map((selector) => selector.trim()).filter(Boolean);
    const hits = selectors.filter((selector) => targets.has(selector));
    if (!hits.length) continue;
    if (hits.length === selectors.length) {
      // ルール全体が対象 → ブロックごと削除
      dropRanges.push([match.index, match.index + match[0].length]);
      totalRules += hits.length;
    }
    // 一部だけ対象の場合は削除しない（セレクタ単位で surgery すると危険）
  }

  // 区間を除いてつなぎ直す（後ろから処理して添字ずれを避ける）
  let out = src;
  for (const [start, end] of dropRanges.reverse()) {
    // 直前の改行も一緒に落とす
    let startAt = start;
    while (startAt > 0 && (out[startAt - 1] === "\n" || out[startAt - 1] === "\r")) startAt--;
    out = out.slice(0, startAt) + out.slice(end);
  }

  if (out !== src) {
    totalBytes += before - out.length;
    plans.push({ file, abs, before: src, after: out, blocks: dropRanges.length, bytes: before - out.length });
  }
}

for (const plan of plans) {
  if (!dryRun) writeFileSync(plan.abs, plan.after, "utf8");
  console.log(`${plan.file}: ${plan.blocks} blocks, ${plan.bytes} characters${dryRun ? " (dry-run; unchanged)" : " (applied)"}`);
}

console.log(`\n合計 ${totalRules} selectors, ${totalBytes} characters${dryRun ? " (dry-run; files unchanged)" : " removed"}`);
if (dryRun) console.log("実ファイルは変更していません。削除を確定する場合だけ --apply を指定してください。");
