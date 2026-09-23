#!/usr/bin/env node
/* Map affiliation values from errata corpus to persona names in DB.
   Usage: node tools/provenance/map_affiliation.mjs
*/
import { readFileSync } from "node:fs";

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

// Persona names
const personaNames = [];
for (const p of db.normal_personas) personaNames.push({ name: p.name, kind: "normal" });
for (const p of db.tokui_personas) personaNames.push({ name: p.name, kind: "tokui" });

// Match: exact match, contains, fuzzy
const exactMatches = [];
const containsMatches = [];
const noMatches = [];

for (const a of affiliations) {
  let found = false;
  for (const pn of personaNames) {
    if (pn.name === a.value) {
      exactMatches.push({ affil: a.value, page: a.page, persona: pn.name, kind: pn.kind });
      found = true;
      break;
    }
  }
  if (!found) {
    for (const pn of personaNames) {
      if (pn.name.includes(a.value) || a.value.includes(pn.name)) {
        containsMatches.push({ affil: a.value, page: a.page, persona: pn.name, kind: pn.kind });
        found = true;
        break;
      }
    }
  }
  if (!found) {
    noMatches.push(a);
  }
}

console.log(`Total affiliations: ${affiliations.length}`);
console.log(`Exact matches: ${exactMatches.length}`);
console.log(`Contains matches: ${containsMatches.length}`);
console.log(`No matches: ${noMatches.length}`);

console.log("\n--- Exact matches ---");
for (const m of exactMatches) {
  console.log(`  ${m.affil} (page ${m.page}) => ${m.persona} (${m.kind})`);
}

console.log("\n--- Contains matches ---");
for (const m of containsMatches) {
  console.log(`  ${m.affil} (page ${m.page}) => ${m.persona} (${m.kind})`);
}

console.log("\n--- No matches (first 30) ---");
for (const a of noMatches.slice(0, 30)) {
  console.log(`  page ${a.page}: ${a.value}`);
}