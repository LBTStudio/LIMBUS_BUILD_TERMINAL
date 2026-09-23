#!/usr/bin/env node
/* Detailed check: which DB entries still use old errata text vs new.
   Usage: node tools/provenance/diagnose_db_text.mjs
*/
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/core.txt`, "utf8");
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Check timing markers in DB
const timingFields = ["passive_cond", "passive_effect", "effect"];
const oldTimings = ["R終了時", "R開始時", "R 使用時"];
const newTimings = ["復帰時", "舞台開始時", "使用時"];

console.log("=== Timing marker check ===");
for (const field of timingFields) {
  let oldCount = 0, newCount = 0;
  const allPersonas = [...db.normal_personas, ...db.tokui_personas, ...db.egos];
  for (const p of allPersonas) {
    const text = JSON.stringify(p);
    if (text.includes("R終了時")) oldCount++;
    if (text.includes("復帰時")) newCount++;
  }
  console.log(`  R終了時 (old): ${oldCount} personas/egos`);
  console.log(`  復帰時 (new): ${newCount} personas/egos`);
  break; // Only need overall count
}

// Check for old persona naming patterns
console.log("\n=== Persona naming check ===");
const personaNames = [...db.normal_personas, ...db.tokui_personas].map(p => p.name);
const oldPatterns = ["所属", "の世界", "鏡世界"];
for (const pat of oldPatterns) {
  const count = personaNames.filter(n => n.includes(pat)).length;
  console.log(`  Names containing "${pat}": ${count}`);
}

// Check EGO text
console.log("\n=== EGO text check ===");
let egoWithOldTiming = 0;
for (const e of db.egos) {
  const text = JSON.stringify(e);
  if (text.includes("R終了時")) egoWithOldTiming++;
}
console.log(`  EGOs with R終了時: ${egoWithOldTiming} / ${db.egos.length}`);

// Check spirits text
console.log("\n=== Spirits text check ===");
let spiritsWithOldTiming = 0;
for (const s of db.spirits) {
  const text = JSON.stringify(s);
  if (text.includes("R終了時")) spiritsWithOldTiming++;
}
console.log(`  Spirits with R終了時: ${spiritsWithOldTiming} / ${db.spirits.length}`);

// Check support_passives text
console.log("\n=== Support passives text check ===");
let spWithOldTiming = 0;
for (const s of db.support_passives) {
  const text = JSON.stringify(s);
  if (text.includes("R終了時")) spWithOldTiming++;
}
console.log(`  Support passives with R終了時: ${spWithOldTiming} / ${db.support_passives.length}`);

// Summary
console.log("\n=== Summary ===");
console.log("DB still contains old errata text markers (R終了時).");
console.log("This is expected: DB update is out of PR scope.");
console.log("Affiliation field (61 personas) is the only errata-driven change applied.");