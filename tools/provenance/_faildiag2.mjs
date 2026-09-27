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
const all = [...missing, ...truncated];

// Try matching with page markers removed
function findMatchingParagraphClean(blockText, dbText) {
  const bracketRe = /\[(.+?)\]\s*(\d+)/g;
  const normalizeBracket = (s) => String(s).replace(bracketRe, "$1$2");
  // Remove page marker lines
  const cleanBlock = blockText.replace(/===== PAGE \d+ =====\n?/g, "");
  const canonDb = canon(normalizeBracket(dbText));
  const canonBlock = canon(normalizeBracket(cleanBlock));
  const paragraphs = cleanBlock.split("\n").filter(l => l.trim());

  // Simple: find longest common prefix and suffix
  let bestHead = 0, bestTail = 0;
  for (let h = 1; h <= Math.min(canonDb.length, 60); h++) {
    const head = canonDb.substring(0, h);
    if (canonBlock.includes(head)) bestHead = h;
    else break;
  }
  for (let t = 1; t <= Math.min(canonDb.length, 60); t++) {
    const tail = canonDb.substring(canonDb.length - t);
    const idx = canonBlock.lastIndexOf(tail);
    if (idx >= 0 && idx + t > bestHead) bestTail = t;
    else break;
  }
  return { bestHead, bestTail, canonDbLen: canonDb.length, canonBlockLen: canonBlock.length, hasPageBreak: blockText.includes("=====PAGE") };
}

for (const m of all) {
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const result = findMatchingParagraphClean(block.text, m.text);
  const cd = canon(m.text);
  const cb = canon(block.text);
  // Check if DB text is a subsequence of block
  let j = 0;
  for (let i = 0; i < cb.length && j < cd.length; i++) { if (cb[i] === cd[j]) j++; }
  const isSubsequence = j === cd.length;
  // Check for page break in the span
  const pageBreaks = (block.text.match(/=====PAGE/g) || []).length;
  console.log(`${m.mode}/${m.persona} :: ${m.label}`);
  console.log(`  DB(${cd.length}) pageBreaksInBlock=${pageBreaks} isSubseq=${isSubsequence} bestHead=${result.bestHead} bestTail=${result.bestTail}`);
  if (result.hasPageBreak) {
    console.log(`  ** HAS PAGE BREAK **`);
  }
  // Show first 60 and last 60 of DB
  console.log(`  DB head: ${JSON.stringify(cd.substring(0, 60))}`);
  console.log(`  DB tail: ${JSON.stringify(cd.substring(Math.max(0, cd.length - 60)))}`);
  // Show block around best head match
  if (result.bestHead > 0) {
    const headStr = cd.substring(0, result.bestHead);
    const idx = canon(block.text.replace(/===== PAGE \d+ =====\n?/g, "")).indexOf(headStr);
    const rawBlock = block.text.replace(/===== PAGE \d+ =====\n?/g, "");
    console.log(`  BLK around head: ${JSON.stringify(rawBlock.substring(Math.max(0, idx - 20), idx + result.bestHead + 40))}`);
  }
}