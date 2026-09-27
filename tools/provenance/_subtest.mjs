import { loadCorpus, loadDb, canon } from "./db-provenance.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROVENANCE_DIR = path.join(root, "data", "provenance");

function loadParagraphCorpus() {
  const parts = [];
  for (const file of ["core.paragraphs.txt","supplement.paragraphs.txt","pack1.paragraphs.txt"]) {
    const text = readFileSync(path.join(PROVENANCE_DIR, file), "utf8").replace(/\r/g, "");
    parts.push({ key: file.replace(/\.paragraphs\.txt$/, ""), text });
  }
  return parts;
}
const paragraphCorpus = loadParagraphCorpus();
const paragraphIndex = paragraphCorpus.map(({ key, text }) => ({ key, text, canon: canon(text) }));
let headingIndex = null;
function buildHeadingIndex() {
  if (headingIndex) return headingIndex;
  headingIndex = new Map();
  for (const part of paragraphIndex) {
    const re = /「([^」\n]*)の人格」/g; let m;
    while ((m = re.exec(part.text)) !== null) {
      const key = canon(m[1]);
      if (!headingIndex.has(key)) headingIndex.set(key, { text: part.text, headingIdx: m.index, name: m[1], source: part.key });
    }
  }
  return headingIndex;
}
function findNextPersonaHeading(text, fromIdx) {
  const re = /「[^」\n]*の人格」/g; let m;
  while ((m = re.exec(text)) !== null) { if (m.index >= fromIdx) return m.index; }
  return -1;
}
function findPersonaBlock(personaName) {
  const entry = buildHeadingIndex().get(canon(personaName));
  if (!entry) return null;
  const blockEnd = findNextPersonaHeading(entry.text, entry.headingIdx + entry.name.length + 5);
  const end = blockEnd > 0 ? blockEnd : entry.text.length;
  return { text: entry.text.substring(entry.headingIdx, end), source: entry.source };
}

const corpus = loadCorpus();
const db = loadDb();
const { auditPersonas } = await import("./db-provenance.mjs");
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const targets = [...missing, ...truncated];

// Test subsequence for specific cases
const testNames = [
  "シュエ家私兵",
  "ロジック・アトリエ所属フィクサー",
  "黒獣-巳",
  "鉄腕兄弟構成員",
  "北部ジエーヴィチ協会4課フィクサー",
];

for (const m of targets) {
  if (!testNames.some(n => m.persona.includes(n))) continue;
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const cd = canon(m.text);
  const cb = canon(block.text);

  // Test subsequence
  let j = 0;
  for (let i = 0; i < cb.length && j < cd.length; i++) {
    if (cb[i] === cd[j]) j++;
  }
  const subFound = j === cd.length;

  // Find where the subsequence starts
  let subStart = -1;
  if (subFound) {
    let endJ = cd.length;
    let ii = cb.length;
    while (endJ > 0 && ii > 0) {
      ii--;
      if (cb[ii] === cd[endJ - 1]) endJ--;
    }
    subStart = ii;
  }

  console.log(`\n=== ${m.persona} :: ${m.label} ===`);
  console.log(`  DB len=${cd.length} block len=${cb.length}`);
  console.log(`  subsequence found: ${subFound}, start=${subStart}`);
  console.log(`  DB: ${JSON.stringify(cd)}`);
  if (subStart >= 0) {
    console.log(`  BLK[${subStart}..${subStart+cd.length}]: ${JSON.stringify(cb.substring(subStart, subStart + cd.length + 20))}`);
  } else {
    // Show where it fails
    let jj = 0;
    let failAt = -1;
    for (let i = 0; i < cb.length; i++) {
      if (cb[i] === cd[jj]) {
        jj++;
        if (jj === cd.length) { failAt = -1; break; }
      } else if (jj > 0 && failAt < 0) {
        failAt = i;
      }
    }
    console.log(`  subsequence failed at DB char ${jj}, block pos ${failAt}`);
    console.log(`  DB remaining: ${JSON.stringify(cd.substring(jj))}`);
    if (failAt >= 0) {
      console.log(`  BLK around fail: ${JSON.stringify(cb.substring(Math.max(0,failAt-20), failAt + 40))}`);
    }
  }
}