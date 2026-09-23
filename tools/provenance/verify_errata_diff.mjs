#!/usr/bin/env node
/* Verify DB reflects errata corpus changes across 4 categories:
   personas, EGO, spirits, support_passives.
   Usage: node tools/provenance/verify_errata_diff.mjs
*/
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/core.txt`, "utf8");
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Known errata text changes (from audit findings)
const errataMarkers = [
  { category: "persona", pattern: "鏡世界", description: "所属→鏡世界 rename" },
  { category: "persona", pattern: "の世界", description: "の世界 suffix added" },
  { category: "persona", pattern: "所属：", description: "affiliation annotation" },
  { category: "timing", pattern: "復帰時", description: "R終了時→復帰時 rename" },
  { category: "text", pattern: "所属", description: "所属 keyword present" },
];

console.log("=== Errata markers in corpus ===");
for (const m of errataMarkers) {
  const count = (corpus.match(new RegExp(m.pattern, "g")) || []).length;
  console.log(`  ${m.pattern}: ${count} occurrences (${m.description})`);
}

// Check DB for errata markers
console.log("\n=== DB errata markers ===");
for (const m of errataMarkers) {
  const json = JSON.stringify(db);
  const count = (json.match(new RegExp(m.pattern, "g")) || []).length;
  console.log(`  ${m.pattern}: ${count} occurrences in DB`);
}

// Check specific persona name changes
console.log("\n=== Persona name check ===");
const personaNames = [...db.normal_personas, ...db.tokui_personas].map(p => p.name);
const hasMirrorWorld = personaNames.some(n => n.includes("鏡世界"));
const hasNoSekai = personaNames.some(n => n.includes("の世界"));
console.log("  Names with 鏡世界:", hasMirrorWorld);
console.log("  Names with の世界:", hasNoSekai);

// Check affiliation field
console.log("\n=== Affiliation field check ===");
let affilCount = 0;
for (const p of [...db.normal_personas, ...db.tokui_personas]) {
  if (p.affiliation) affilCount++;
}
console.log("  Personas with affiliation field:", affilCount);

// Check spirits
console.log("\n=== Spirits check ===");
console.log("  Total spirits:", db.spirits.length);
const spiritNames = db.spirits.map(s => s.name);
console.log("  Sample spirits:", spiritNames.slice(0, 5).join(", "));

// Check support_passives
console.log("\n=== Support passives check ===");
console.log("  Total support_passives:", db.support_passives.length);
const spNames = db.support_passives.map(s => s.name);
console.log("  Sample support_passives:", spNames.slice(0, 5).join(", "));

// Check EGO
console.log("\n=== EGO check ===");
console.log("  Total EGOs:", db.egos.length);
const egoNames = db.egos.map(e => e.name);
console.log("  Sample EGOs:", egoNames.slice(0, 5).join(", "));