import { auditPersonas, loadCorpus, loadDb, canon } from "./db-provenance.mjs";
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
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const targets = [...missing, ...truncated];

// For each target, show the DB text and the corpus block text around the best head match
let shown = 0;
for (const m of targets) {
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const cd = canon(m.text);
  const cb = canon(block.text);

  // Find best head match position
  let bestLen = 0, bestIdx = -1;
  for (let i = 0; i < cb.length; i++) {
    let l = 0;
    while (l < cd.length && i + l < cb.length && cb[i + l] === cd[l]) l++;
    if (l > bestLen) { bestLen = l; bestIdx = i; }
  }

  // Find best tail match
  let bestTailLen = 0, bestTailIdx = -1;
  for (let i = 0; i < cb.length; i++) {
    let l = 0;
    while (l < cd.length && i + l < cb.length && cb[i + l] === cd[cd.length - l - 1]) l++;
    // This is wrong - let me do suffix properly
  }
  // Proper suffix: longest common suffix
  let sl = 0;
  while (sl < cd.length && sl < cb.length && cd[cd.length - sl - 1] === cb[cb.length - sl - 1]) sl++;
  const suffix = cd.substring(cd.length - sl);
  let sIdx = cb.lastIndexOf(suffix);

  // Show only interesting cases: head matches but tail doesn't, or vice versa
  if (bestLen < 10 || sl < 5) {
    console.log(`\n=== ${m.mode}/${m.persona} :: ${m.label} ===`);
    console.log(`  DB len=${cd.length} block len=${cb.length} source=${block.source}`);
    console.log(`  HEAD best=${bestLen} at ${bestIdx}`);
    console.log(`  SUFFIX len=${sl} at ${sIdx} (block end=${cb.length})`);
    console.log(`  DB: ${JSON.stringify(cd)}`);
    if (bestIdx >= 0) {
      const start = Math.max(0, bestIdx - 20);
      const end = Math.min(cb.length, bestIdx + 80);
      console.log(`  BLK[${start}..${end}]: ${JSON.stringify(cb.substring(start, end))}`);
    }
    shown++;
    if (shown >= 20) break;
  }
}