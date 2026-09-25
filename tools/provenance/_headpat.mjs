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
function subsequenceIdx(needle, hay) {
  let j = 0; let firstIdx = -1;
  for (let i = 0; i < hay.length && j < needle.length; i++) {
    if (hay[i] === needle[j]) { if (firstIdx < 0) firstIdx = i; j++; }
  }
  return j === needle.length ? firstIdx : -1;
}
const corpus = loadCorpus();
const db = loadDb();
const { auditPersonas } = await import("./db-provenance.mjs");
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const targets = [...missing, ...truncated];
console.log("total targets:", targets.length);
const byLen = {};
for (const m of targets) {
  const block = findPersonaBlock(m.persona);
  if (!block) { (byLen["noblock"] = byLen["noblock"]||new Set()).add(m.persona); continue; }
  const cd = canon(m.text);
  const cb = canon(block.text);
  let found = null;
  for (let len = Math.min(cd.length, 40); len >= 4; len--) {
    const idx = subsequenceIdx(cd.slice(0, len), cb);
    if (idx >= 0) { found = len; break; }
  }
  const key = found ? String(found) : "NONE";
  (byLen[key] = byLen[key]||new Set()).add(m.persona + " :: " + m.label);
}
for (const k of Object.keys(byLen).sort((a,b)=>Number(a)-Number(b))) {
  console.log("headLen " + k + " (" + byLen[k].size + "):");
  for (const v of [...byLen[k]].slice(0,8)) console.log("   " + v);
}