#!/usr/bin/env node
/* 監査で「原典に存在しない」と指摘された本文について、
   原典のどこまでが一致していて、どこから食い違うのかを示す。

   破損の型を見分けるために使う。
     - 末尾に余分な断片が付いている  -> 隣接セル・次行の流入
     - 途中で終わっている            -> 転記途中の切断
     - 中間が食い違う                -> 要約への置き換え

   最長一致の前方・後方を求め、原典側の対応箇所を併記する。

   使い方:
     node tools/provenance/diagnose-db-text.mjs
     node tools/provenance/diagnose-db-text.mjs "黒獣-巳"        # 人格名で絞る
     node tools/provenance/diagnose-db-text.mjs --json */
import { auditPersonas, loadCorpus, loadDb, canon, buildPersonaBlocks } from "./db-provenance.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const filter = args.find((a) => !a.startsWith("--"));

const corpus = loadCorpus();
const db = loadDb();
const names = [...(db.normal_personas || []), ...(db.tokui_personas || [])].map((p) => p?.name).filter(Boolean);
const blocks = buildPersonaBlocks(corpus, names);

/* 原典ブロック内に収まる最長の先頭部分と末尾部分を二分探索で求める。
   先頭が長く一致し末尾が短い場合は「末尾の流入」、
   逆なら「先頭の欠落」を示す。 */
function longestPrefix(needle, hay) {
  let lo = 0;
  let hi = needle.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (hay.includes(needle.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
function longestSuffix(needle, hay) {
  let lo = 0;
  let hi = needle.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (hay.includes(needle.slice(needle.length - mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const findings = auditPersonas(db, corpus).filter((f) => f.code === "missing");
const rows = [];
for (const finding of findings) {
  if (filter && finding.persona !== filter) continue;
  const block = blocks.get(canon(finding.persona));
  if (!block) continue;
  const hay = block.delabeled.length >= block.canon.length ? block.delabeled : block.canon;
  const needle = canon(finding.text);
  const prefix = longestPrefix(needle, hay);
  const suffix = longestSuffix(needle, hay);

  // 原典側で、一致した先頭の直後に続く文字列を見せる（正しい続きの手がかり）。
  const at = hay.indexOf(needle.slice(0, prefix));
  const continuation = at >= 0 ? hay.slice(at + prefix, at + prefix + 40) : "";

  let kind = "middle-mismatch";
  if (prefix + suffix >= needle.length) kind = "split-across-source";
  else if (prefix >= needle.length * 0.8) kind = "tail-extra";
  else if (suffix >= needle.length * 0.8) kind = "head-missing";

  rows.push({
    persona: finding.persona,
    label: finding.label,
    kind,
    matchedPrefix: finding.text.length ? needle.slice(0, prefix) : "",
    unmatchedTail: needle.slice(prefix),
    matchedSuffixLen: suffix,
    continuation,
    text: finding.text
  });
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const KIND = {
  "tail-extra": "末尾に原典外の断片が付いている（隣接セルの流入）",
  "head-missing": "先頭が欠落している",
  "middle-mismatch": "中間が食い違う（要約・別断片の混入）",
  "split-across-source": "原典では離れた位置にある二つの記載が連結されている"
};
const byKind = {};
rows.forEach((r) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });

console.log(`指摘: ${rows.length}件`);
Object.entries(byKind).forEach(([k, n]) => console.log(`  ${k}: ${n}件 — ${KIND[k]}`));
for (const r of rows) {
  console.log(`\n[${r.kind}] ${r.persona} :: ${r.label}`);
  console.log(`  DB    : ${r.text.replace(/\n/g, " \u23CE ")}`);
  console.log(`  一致  : ${r.matchedPrefix.slice(-50) || "(なし)"}`);
  console.log(`  不一致: ${r.unmatchedTail || "(なし)"}`);
  console.log(`  原典続: ${r.continuation || "(なし)"}`);
}
