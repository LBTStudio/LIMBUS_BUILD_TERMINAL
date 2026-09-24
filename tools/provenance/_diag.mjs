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
function bestMatch(canonDb, canonBlock) {
  let bestLen=0, bestIdx=-1;
  for (let i=0;i<canonBlock.length;i++){
    let l=0; while(l<canonDb.length && i+l<canonBlock.length && canonBlock[i+l]===canonDb[l]) l++;
    if(l>bestLen){bestLen=l;bestIdx=i;}
  }
  return {bestLen, bestIdx};
}
const corpus = loadCorpus();
const db = loadDb();
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
for (const m of [...missing, ...truncated]) {
  const block = findPersonaBlock(m.persona);
  if (!block) { console.log(`### ${m.persona} :: ${m.label} :: NO BLOCK`); continue; }
  const cd = canon(m.text);
  const cb = canon(block.text);
  const h = bestMatch(cd, cb);
  // tail match (suffix)
  let tLen=0, tIdx=-1;
  for (let i=0;i<cb.length;i++){
    let l=0; while(l<cd.length && i+l<cb.length && cb[i+l]===cd[cd.length-l-1]) l++;
    // simpler: suffix match
  }
  // proper suffix: longest common suffix
  let sl=0; while(sl<cd.length && sl<cb.length && cd[cd.length-sl-1]===cb[cb.length-sl-1]) sl++;
  // find where suffix starts in block
  const suffix = cd.substring(cd.length-sl);
  let sIdx = cb.lastIndexOf(suffix);
  console.log(`\n=== ${m.mode}/${m.persona} :: ${m.label} ===`);
  console.log(`  block: ${block.source}`);
  console.log(`  DB len=${cd.length} block len=${cb.length}`);
  console.log(`  HEAD best=${h.bestLen} at ${h.bestIdx}`);
  console.log(`  DB head : ${JSON.stringify(cd.substring(0,50))}`);
  console.log(`  blk @head: ${JSON.stringify(cb.substring(Math.max(0,h.bestIdx-3), h.bestIdx+50))}`);
  console.log(`  SUFFIX len=${sl} at ${sIdx} (block end=${cb.length})`);
  console.log(`  DB tail : ${JSON.stringify(cd.substring(cd.length-40))}`);
  console.log(`  blk tail: ${JSON.stringify(cb.substring(sIdx, sIdx+40))}`);
}