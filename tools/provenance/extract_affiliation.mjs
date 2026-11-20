#!/usr/bin/env node
/* Extract affiliation (所属) entries from the errata corpus and map them
   to existing persona names in data/db.json. Usage:
   node tools/provenance/extract_affiliation.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/core.txt`, "utf8");
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Parse the corpus page-by-page
function splitPages(text) {
  const parts = text.split(/===== PAGE (\d+) =====/);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ page: parseInt(parts[i], 10), text: parts[i + 1] || "" });
  }
  return out;
}

const pages = splitPages(corpus);

// Find affiliation entries: lines like "所属：黒雲会" (standalone, not in body text)
const affiliations = [];
const seen = new Set();
for (const page of pages) {
  const lines = page.text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Match standalone "所属：XXX" lines (not part of longer text)
    const m = trimmed.match(/^所属[：:](.+)$/);
    if (m && trimmed.length < 50) {
      const value = m[1].trim();
      // Skip if it's part of a longer sentence
      if (trimmed.length > 30) continue;
      const key = value;
      if (!seen.has(key)) {
        seen.add(key);
        affiliations.push({ value, page: page.page, raw: trimmed });
      }
    }
  }
}

console.log(`Found ${affiliations.length} unique affiliation values:`);
for (const a of affiliations) {
  console.log(`  page ${a.page}: ${a.value}`);
}

// Build persona name set
const personaNames = new Set();
for (const p of db.normal_personas) personaNames.add(p.name);
for (const p of db.tokui_personas) personaNames.add(p.name);

// Match affiliation values to persona names
console.log(`\nPersona names in DB: ${personaNames.size}`);
const matched = [];
const unmatched = [];
for (const a of affiliations) {
  if (personaNames.has(a.value)) {
    matched.push(a);
  } else {
    unmatched.push(a);
  }
}
console.log(`Matched to persona names: ${matched.length}`);
console.log(`Unmatched affiliation values: ${unmatched.length}`);
for (const a of unmatched.slice(0, 20)) {
  console.log(`  page ${a.page}: ${a.value}`);
}