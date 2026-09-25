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

// Check a few specific cases
const checkNames = [
  "人差し指遂行者：【紙片】",
  "南部センク協会5課フィクサー",
  "南部リウ協会5課フィクサー",
  "バラのスパナ工房B",
  "ロジック・アトリエ所属フィクサー",
  "黒獣-巳",
];

for (const m of targets) {
  if (!checkNames.some(n => m.persona.includes(n))) continue;
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const cd = canon(m.text);
  const cb = canon(block.text);

  // Check if full DB text appears in block
  const fullIdx = cb.indexOf(cd);
  
  // Check head and tail separately
  const headLen = 40;
  const head = cd.substring(0, headLen);
  const tail = cd.substring(cd.length - headLen);
  const headIdx = cb.indexOf(head);
  const tailIdx = cb.lastIndexOf(tail);
  
  // Check if tail appears after head
  const tailAfterHead = tailIdx >= 0 && tailIdx + tail.length > headIdx ? "YES" : "NO";
  
  // Check span
  const span = tailIdx >= 0 ? (tailIdx + tail.length - headIdx) : 0;
  const spanRatio = cd.length > 0 ? (span / cd.length).toFixed(2) : 0;

  console.log(`\n=== ${m.persona} :: ${m.label} ===`);
  console.log(`  DB len=${cd.length} block len=${cb.length}`);
  console.log(`  full match: ${fullIdx >= 0 ? `YES at ${fullIdx}` : "NO"}`);
  console.log(`  head(${headLen}) at ${headIdx}, tail(${headLen}) at ${tailIdx}`);
  console.log(`  tail after head: ${tailAfterHead}`);
  console.log(`  span=${span}, ratio=${spanRatio}`);
  console.log(`  DB head: ${JSON.stringify(head)}`);
  console.log(`  DB tail: ${JSON.stringify(tail)}`);
  if (headIdx >= 0) {
    console.log(`  blk@head: ${JSON.stringify(cb.substring(headIdx, headIdx + 60))}`);
  }
  if (tailIdx >= 0) {
    console.log(`  blk@tail: ${JSON.stringify(cb.substring(Math.max(0,tailIdx-20), tailIdx + tail.length + 20))}`);
  }
}