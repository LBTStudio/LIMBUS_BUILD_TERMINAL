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
const fails = [];
for (const m of [...missing, ...truncated]) {
  const block = findPersonaBlock(m.persona);
  if (!block) { fails.push({ ...m, status: "block-not-found" }); continue; }
  const canonDb = canon(m.text);
  const canonBlock = canon(block.text);
  let blockStartCanonIdx = -1;
  for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
    const idx = canonBlock.indexOf(canonDb.substring(0, searchLen));
    if (idx >= 0) { blockStartCanonIdx = idx; break; }
  }
  if (blockStartCanonIdx < 0) fails.push({ ...m, status: "extract-failed", block, canonDb, canonBlock });
}
console.log("FAILS:", fails.length);
for (const f of fails) {
  const cd = f.canonDb;
  const cb = f.canonBlock;
  let best = {len:0, idx:-1, stripL:0};
  for (let stripL=0; stripL<=2; stripL++){
    const core = cd.slice(stripL);
    for (let i=0;i<cb.length;i++){
      let l=0; while(l<core.length && i+l<cb.length && cb[i+l]===core[l]) l++;
      if(l>best.len){best={len:l,idx:i,stripL};}
    }
  }
  console.log("\n=== " + f.persona + " :: " + f.label);
  console.log("  DB(" + cd.length + "): " + JSON.stringify(cd.slice(0,60)));
  console.log("  best fuzzy: len=" + best.len + " idx=" + best.idx + " stripL=" + best.stripL);
  console.log("  corpus @best: " + JSON.stringify(cb.slice(Math.max(0,best.idx-3), best.idx+60)));
}