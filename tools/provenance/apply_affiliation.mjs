#!/usr/bin/env node
/* Build structured affiliation data and apply to DB.
   Usage: node tools/provenance/apply_affiliation.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/core.txt`, "utf8");
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Parse pages
const parts = corpus.split(/===== PAGE (\d+) =====/);
const pages = [];
for (let i = 1; i < parts.length; i += 2) {
  pages.push({ page: parseInt(parts[i], 10), text: parts[i + 1] || "" });
}

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

// Match affiliations to personas
const results = [];
const unmatched = [];

for (const a of affiliations) {
  // Try exact match first
  if (personaLookup.has(a.value)) {
    results.push({ affil: a.value, page: a.page, persona: a.value, kind: personaLookup.get(a.value).kind, matchType: "exact" });
    continue;
  }
  // Try contains match
  let found = false;
  for (const [name, info] of personaLookup) {
    if (name.includes(a.value) || a.value.includes(name)) {
      results.push({ affil: a.value, page: a.page, persona: name, kind: info.kind, matchType: "contains" });
      found = true;
      break;
    }
  }
  if (!found) {
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

// Write updated DB (ensure_ascii=false to preserve Japanese)
writeFileSync(`${ROOT}/data/db.json`, JSON.stringify(db, null, 1), "utf8");

// Write affiliation reference
const refData = {
  generated: new Date().toISOString(),
  source: "data/provenance/core.txt",
  totalAffiliations: affiliations.length,
  matched: results.length,
  unmatched: unmatched.length,
  affiliations: results,
  unmatchedList: unmatched
};
writeFileSync(`${ROOT}/data/provenance/affiliations.json`, JSON.stringify(refData, null, 1), "utf8");

console.log(`Added affiliation to ${addedCount} personas`);
console.log(`Matched: ${results.length}, Unmatched: ${unmatched.length}`);