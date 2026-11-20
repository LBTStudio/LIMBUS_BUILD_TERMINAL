#!/usr/bin/env node
/* Build structured affiliation data and apply to DB.
   Usage: node tools/provenance/apply_affiliation.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
/* 所属行を持つ corpus は版によって違う（core.txt には無いことがある）。
   既定は core.txt、--corpus <path> で明示できる。 */
const corpusIdx = process.argv.indexOf("--corpus");
const corpusPath = corpusIdx >= 0 && process.argv[corpusIdx + 1]
  ? process.argv[corpusIdx + 1]
  : `${ROOT}/data/provenance/core.txt`;
const corpus = readFileSync(corpusPath, "utf8");
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Parse pages
const parts = corpus.split(/===== PAGE (\d+) =====/);
const pages = [];
for (let i = 1; i < parts.length; i += 2) {
  pages.push({ page: parseInt(parts[i], 10), text: parts[i + 1] || "" });
}
/* ページ区切りの無い corpus（plain_full.txt など）は全体を1ページとして扱う。 */
if (!pages.length) pages.push({ page: 0, text: corpus });

// Extract standalone "所属：XXX" lines
const affiliations = [];
const seen = new Set();
for (const page of pages) {
  const lines = page.text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    const m = t.match(/^所属[：:](.+)$/);
    if (m && t.length < 50) {
      const value = m[1].trim();
      if (!seen.has(value)) {
        seen.add(value);
        affiliations.push({ value, page: page.page });
      }
    }
  }
}

// Build persona lookup: name -> { kind, index, persona }
const personaLookup = new Map();
db.normal_personas.forEach((p, i) => personaLookup.set(p.name, { kind: "normal", index: i, persona: p }));
db.tokui_personas.forEach((p, i) => personaLookup.set(p.name, { kind: "tokui", index: i, persona: p }));

/* 所属値は「組織名 + 分類タグ」のことがある（例: "マルチクラック事務所 機械融和生命体"）。
   末尾の空白区切りタグを順に落として組織名の候補を作る（長い順）。 */
function orgCandidates(value) {
  const parts = String(value).trim().split(/\s+/);
  const out = [];
  for (let n = parts.length; n >= 1; n--) out.push(parts.slice(0, n).join(" "));
  return out;
}

/* 照合は「完全一致」→「人格名が組織名で始まる」に限定する。
   かつて name.includes(value) を許していたため、"ク事務所" が
   "マルチクラック事務所フィクサー" に部分一致し、別人格の所属が誤って
   書き込まれた（正しい "ク事務所フィクサー" からは外れた）。 */
const names = [...personaLookup.keys()].sort();
const results = [];
const unmatched = [];
const ordered = [...affiliations].sort((x, y) => y.value.length - x.value.length);

for (const a of ordered) {
  let matchedName = null;
  let matchedAffil = null;
  let matchType = null;
  for (const cand of orgCandidates(a.value)) {
    if (personaLookup.has(cand)) { matchedName = cand; matchedAffil = cand; matchType = "exact"; break; }
    const hit = names.find((name) => name.startsWith(cand));
    if (hit) { matchedName = hit; matchedAffil = cand; matchType = "prefix"; break; }
  }
  if (matchedName) {
    results.push({ affil: matchedAffil, value: a.value, page: a.page, persona: matchedName, kind: personaLookup.get(matchedName).kind, matchType });
  } else {
    unmatched.push(a);
  }
}

// Apply to DB: add affiliation field to matched personas
let addedCount = 0;
for (const r of results) {
  const info = personaLookup.get(r.persona);
  if (info && !info.persona.affiliation) {
    info.persona.affiliation = r.affil;
    addedCount++;
  }
}

/* data/db.json は 788KB のミニファイ済み（改行 0 バイト）。
   インデント付き JSON.stringify で書くと全体が再整形され、
   diff が全行のノイズになる。コミット済みの形式を保つ。 */
const write = process.argv.includes("--write");

console.log(`Added affiliation to ${addedCount} personas`);
console.log(`Matched: ${results.length}, Unmatched: ${unmatched.length}`);
if (process.argv.includes("--verbose")) {
  console.log("\n[matched]");
  for (const r of results) console.log(`  ${r.persona}  <-  ${r.affil}  (${r.matchType}, page ${r.page})`);
}

if (!write) {
  console.log(`\n[--write 無し] data/db.json と data/provenance/affiliations.json は変更していません。`);
  console.log(`書き込みを適用するには: node tools/provenance/apply_affiliation.mjs --write`);
  process.exit(0);
}

// ensure_ascii=false で日本語を保つ。
writeFileSync(`${ROOT}/data/db.json`, JSON.stringify(db), "utf8");

// Write affiliation reference
const refData = {
  generated: new Date().toISOString(),
  source: corpusPath.replace(`${ROOT}/`, ""),
  totalAffiliations: affiliations.length,
  matched: results.length,
  unmatched: unmatched.length,
  affiliations: results,
  unmatchedList: unmatched
};
writeFileSync(`${ROOT}/data/provenance/affiliations.json`, JSON.stringify(refData, null, 1), "utf8");

console.log(`書き込みました: data/db.json, data/provenance/affiliations.json`);