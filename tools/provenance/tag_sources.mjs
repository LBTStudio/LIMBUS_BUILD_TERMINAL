#!/usr/bin/env node
/* Tag support_passives and spirits with source (core/supplement/pack1).
   Usage: node tools/provenance/tag_sources.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const db = JSON.parse(readFileSync(`${ROOT}/data/db.json`, "utf8"));

// Source tagging rules:
// - support_passives with existing source=supplement stay as supplement
// - support_passives without source get source=core (rulebook default)
// - spirits with existing source=supplement stay as supplement
// - spirits without source get source=core
// - pack1 items are identified by db_conflict detection (already in DB)

let spTagged = 0;
for (const s of db.support_passives) {
  if (!s.source) {
    s.source = "core";
    spTagged++;
  }
}
console.log(`Tagged ${spTagged} support_passives with source=core`);

let spiritTagged = 0;
for (const s of db.spirits) {
  if (!s.source) {
    s.source = "core";
    spiritTagged++;
  }
}
console.log(`Tagged ${spiritTagged} spirits with source=core`);

// Verify distribution
const spDist = {};
for (const s of db.support_passives) {
  spDist[s.source] = (spDist[s.source] || 0) + 1;
}
console.log("support_passives distribution:", spDist);

const spiritDist = {};
for (const s of db.spirits) {
  spiritDist[s.source] = (spiritDist[s.source] || 0) + 1;
}
console.log("spirits distribution:", spiritDist);

writeFileSync(`${ROOT}/data/db.json`, JSON.stringify(db, null, 1), "utf8");
console.log("DB updated");