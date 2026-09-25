import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROVENANCE_DIR = path.join(root, "data", "provenance");

function canonLike(s) {
  return String(s ?? "").normalize("NFKC")
    .replace(/[\s\u3000。、，,．.・：:；;／/ー]/g, "");
}

const db = JSON.parse(readFileSync(path.join(root, "data", "db.json"), "utf8"));
const corpusTexts = {};
for (const f of ["core.txt", "supplement.txt", "pack1.txt"]) {
  corpusTexts[f.replace(/\.txt$/, "")] = readFileSync(path.join(PROVENANCE_DIR, f), "utf8").replace(/\r/g, "");
}

let missing = 0, ok = 0;
const report = [];
for (const sp of db.support_passives) {
  const effect = sp.effect;
  if (!effect) { report.push({ name: sp.name, status: "no-effect" }); continue; }
  const ne = canonLike(effect);
  let found = null;
  for (const [src, text] of Object.entries(corpusTexts)) {
    if (canonLike(text).includes(ne)) { found = src; break; }
  }
  if (found) { ok++; }
  else { missing++; report.push({ name: sp.name, cond: sp.cond, effect, source: sp.source, status: "missing" }); }
}
console.log(`support_passives: ok=${ok} missing=${missing} total=${db.support_passives.length}`);
for (const r of report.slice(0, 40)) {
  console.log(`\n=== ${r.name} (${r.source}) :: ${r.status}`);
  console.log(`  cond: ${r.cond}`);
  console.log(`  effect: ${JSON.stringify(r.effect).slice(0, 120)}`);
}