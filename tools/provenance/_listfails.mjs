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
function canonToRawOffset(raw, canonOffset) {
  if (canonOffset <= 0) return 0;
  let r = 0;
  while (r < raw.length) { r++; if (canon(raw.substring(0, r)).length >= canonOffset) { while (r < raw.length) { const curCanonLen = canon(raw.substring(0, r)).length; if (curCanonLen > canonOffset) break; r++; } return r; } }
  return raw.length;
}
function findMatchingParagraph(blockText, dbText) {
  const canonDb = canon(dbText);
  const canonBlock = canon(blockText);
  const paragraphs = blockText.split("\n").filter(l => l.trim());
  let blockStartCanonIdx = -1;
  for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
    const needle = canonDb.substring(0, searchLen);
    const idx = canonBlock.indexOf(needle);
    if (idx >= 0) { blockStartCanonIdx = idx; break; }
  }
  if (blockStartCanonIdx < 0) return { found: false };
  let blockEndCanonIdx = -1;
  for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
    const needle = canonDb.substring(canonDb.length - searchLen);
    const idx = canonBlock.lastIndexOf(needle);
    if (idx >= 0 && idx + searchLen <= canonBlock.length) { blockEndCanonIdx = idx + searchLen; break; }
  }
  let endCanonIdx;
  if (blockEndCanonIdx >= 0 && blockEndCanonIdx > blockStartCanonIdx) endCanonIdx = blockEndCanonIdx;
  else { endCanonIdx = blockStartCanonIdx + canonDb.length; if (endCanonIdx > canonBlock.length) endCanonIdx = canonBlock.length; }
  let canonPos = 0, startParaIdx = -1, startRawOffset = 0, endParaIdx = -1, endRawOffset = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paraCanon = canon(paragraphs[i]);
    const paraStart = canonPos;
    const paraEnd = canonPos + paraCanon.length;
    if (startParaIdx < 0 && blockStartCanonIdx >= paraStart && blockStartCanonIdx < paraEnd) { startParaIdx = i; startRawOffset = canonToRawOffset(paragraphs[i], blockStartCanonIdx - paraStart); }
    if (endParaIdx < 0 && endCanonIdx > paraStart && endCanonIdx <= paraEnd) { endParaIdx = i; endRawOffset = canonToRawOffset(paragraphs[i], endCanonIdx - paraStart); break; }
    canonPos = paraEnd;
  }
  if (startParaIdx < 0) return { found: false };
  if (endParaIdx < 0) { endParaIdx = paragraphs.length - 1; endRawOffset = paragraphs[endParaIdx].length; }
  const parts = [];
  for (let i = startParaIdx; i <= endParaIdx; i++) {
    const paraRaw = paragraphs[i];
    const from = i === startParaIdx ? startRawOffset : 0;
    const to = i === endParaIdx ? endRawOffset : paraRaw.length;
    parts.push(paraRaw.substring(from, to));
  }
  return { found: true, paragraph: parts.join("\n") };
}
const corpus = loadCorpus();
const db = loadDb();
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const failed = [];
for (const m of [...missing, ...truncated]) {
  const block = findPersonaBlock(m.persona);
  if (!block) { failed.push({ ...m, status: "block-not-found" }); continue; }
  const result = findMatchingParagraph(block.text, m.text);
  if (!result.found) failed.push({ ...m, status: "extract-failed", block });
}
console.log("TOTAL FAILS:", failed.length);
for (const f of failed) {
  console.log(`\n=== ${f.mode}/${f.persona} :: ${f.label} ===`);
  console.log(`  DB : ${JSON.stringify(f.text).slice(0,140)}`);
}