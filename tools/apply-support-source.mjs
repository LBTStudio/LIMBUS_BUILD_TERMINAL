#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   tools/apply-support-source.mjs
   data/provenance/three-book-audit.json（tools/provenance/audit_three_books.py の出力）
   に含まれるサポートパッシブの文献別判定を、data/db.json の source に反映する。
 *
   なぜ検出器の出力を使うのか
     自作で PDF をパースすると表セルが交互に混ざった抽取のため
     Passive 名の連続性が崩れる。既存パイプラインは罫線と座標で
     表を取り。だから support_passives は db=346 / source_candidates=346
     の 1:1 で、抽出漏れがない。判定はそちらに任せる。
 *
   反映内容
     DB の source は core / supplement の 2 値しかなく、pack1（特定抽出パック）
     が 29 件 core と書かれていた。検出器の判定に合わせて 3 値にする。
     DB の例: [{name,cond,effect,lp,source,quick}] の source を上書き。
     既存 2 値はそのまま使う（core / supplement は検出器も同じ）。
--------------------------------------------------------------------------- */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = resolve(ROOT, "data/provenance/three-book-audit.json");
const DB = resolve(ROOT, "data/db.json");
const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, "").replace(/[　]/g, "");
const nfkc = (s) => String(s == null ? "" : s).normalize("NFKC").replace(/[\s　]+/g, "");

const audit = JSON.parse(readFileSync(AUDIT, "utf8"));
const db = JSON.parse(readFileSync(DB, "utf8"));

const candidates = audit.candidates.filter((c) => c.kind === "support_passives");

/* 検出器の分布を確認してから進む */
const dist = {};
for (const c of candidates) dist[c.source] = (dist[c.source] || 0) + 1;
console.log("=== 検出器の判定（three-book-audit.json） ===");
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`  合計 ${candidates.length} / DB ${db.support_passives.length}`);

/* 名前 → 検出器の source（NFKC 正規化で照合。検出器も NFKC で比較している） */
const map = new Map();
for (const c of candidates) {
  const n = nfkc(c.data && c.data.name);
  if (n && !map.has(n)) map.set(n, c.source);
}

const rows = [];
let missed = [];
for (const s of db.support_passives) {
  const key = nfkc(s.name);
  const src = map.get(key);
  if (!src) { missed.push(s.name); rows.push({ name: s.name, before: s.source, after: s.source, found: null }); continue; }
  rows.push({ name: s.name, before: s.source, after: src, found: src });
}

const change = rows.filter((r) => r.found && r.before !== r.after);
const byPair = {};
for (const r of change) {
  const k = `${r.before} → ${r.after}`;
  byPair[k] = (byPair[k] || 0) + 1;
}
console.log(`\n=== DB との差分: ${change.length} 件 ===`);
for (const [k, v] of Object.entries(byPair)) console.log(`  ${k.padEnd(24)} ${v}`);
if (missed.length) {
  console.log(`\n検出器に対応なし: ${missed.length} 件`);
  missed.slice(0, 10).forEach((n) => console.log("  " + n));
}

const after = {};
for (const r of rows) after[r.after || "(null)"] = (after[r.after || "(null)"] || 0) + 1;
console.log("\n=== 反映後の内訳 ===");
for (const [k, v] of Object.entries(after).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);

if (!APPLY) {
  console.log("\n--apply を付けないと書き込みしません");
  process.exit(0);
}

let n = 0;
for (const r of rows) {
  if (!r.found) continue;
  const item = db.support_passives.find((s) => nfkc(s.name) === nfkc(r.name));
  if (item && item.source !== r.after) { item.source = r.after; n++; }
}

/* 並び順も掲載順に揃える。台帳の並びは PDF のページ順そのものなので、
   それをそのまま使う。文献ごとに連続して並ぶため、新しい出典フィルタ
   （ルールブック / アンロックド・シンク / 特定抽出パック）と整合する。
   DB の並びは台帳と 185 / 346 の位置が違っていた。 */
const ledgerOrder = candidates.map((c) => nfkc(c.data && c.data.name));
const seq = new Map();
ledgerOrder.forEach((key, i) => { if (!seq.has(key)) seq.set(key, i); });
const before = db.support_passives.map((s) => nfkc(s.name));
const sorted = [...db.support_passives].sort((a, b) => {
  const ia = seq.has(nfkc(a.name)) ? seq.get(nfkc(a.name)) : Number.MAX_SAFE_INTEGER;
  const ib = seq.has(nfkc(b.name)) ? seq.get(nfkc(b.name)) : Number.MAX_SAFE_INTEGER;
  return ia - ib;
});
const moved = before.join("|") !== sorted.map((s) => nfkc(s.name)).join("|");
db.support_passives = sorted;

writeFileSync(DB, JSON.stringify(db), "utf8");
console.log(`\ndata/db.json を更新: ${n} 件の source を上書き`);
console.log("  キー: core=ルルブ / supplement=アンロックド・シンク / pack1=特定抽出パック第一弾");
console.log(`  並び順: ${moved ? "台帳（PDF 掲載順）に並べ替え済み" : "既に一致（変更なし）"}`);
console.log(`    先頭: ${sorted.slice(0, 6).map((s) => s.name).join(" / ")}`);