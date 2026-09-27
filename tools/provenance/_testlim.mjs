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

const HEAD_PARTICLES = ["の","を","は","が","に","で","と","や","も","へ","か","だ","ら"];
const TAIL_PARTICLES = ["る","た","ます","です","だ","である"];

function headVariants(head, lim) {
  const out = [head];
  const limit = Math.min(head.length - 1, lim);
  for (let k = 0; k < limit; k++) {
    if (HEAD_PARTICLES.includes(head[k]) || HEAD_PARTICLES.includes(head[k + 1])) {
      const arr = head.split("");
      [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]];
      out.push(arr.join(""));
    }
  }
  for (const p of HEAD_PARTICLES) {
    if (head.startsWith(p) && head.length > p.length) out.push(head.substring(p.length));
  }
  for (const p of TAIL_PARTICLES) {
    if (head.endsWith(p) && head.length > p.length) out.push(head.substring(0, head.length - p.length));
  }
  return out;
}

function tailVariants(tail, lim) {
  const out = [tail];
  const limit = Math.min(tail.length - 1, lim);
  for (let k = 0; k < limit; k++) {
    if (HEAD_PARTICLES.includes(tail[k]) || HEAD_PARTICLES.includes(tail[k + 1])) {
      const arr = tail.split("");
      [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]];
      out.push(arr.join(""));
    }
  }
  for (const p of TAIL_PARTICLES) {
    if (tail.endsWith(p) && tail.length > p.length) out.push(tail.substring(0, tail.length - p.length));
  }
  return out;
}

const corpus = loadCorpus();
const db = loadDb();
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const targets = [...missing, ...truncated];

// Test specific cases with different lim values
const testCases = targets.filter(m => 
  m.persona.includes("人差し指遂行者") ||
  m.persona.includes("南部センク協会5課") ||
  m.persona.includes("南部リウ協会5課") ||
  m.persona.includes("バラのスパナ工房B") ||
  m.persona.includes("ロジック・アトリエ") ||
  m.persona.includes("黒獣-巳")
);

for (const m of testCases) {
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const cd = canon(m.text);
  const cb = canon(block.text);
  
  console.log(`\n=== ${m.persona} :: ${m.label} ===`);
  console.log(`  DB len=${cd.length}`);
  
  // Test with lim=10 (current) and lim=40 (proposed)
  for (const lim of [10, 40]) {
    let blockStartCanonIdx = -1;
    let blockEndCanonIdx = -1;
    const minHeadLen = Math.min(6, cd.length);
    
    for (let searchLen = Math.min(cd.length, 40); searchLen >= minHeadLen; searchLen--) {
      const head = cd.substring(0, searchLen);
      const tail = cd.substring(cd.length - searchLen);
      for (const hv of headVariants(head, lim)) {
        const headIdx = cb.indexOf(hv);
        if (headIdx < 0) continue;
        for (const tv of tailVariants(tail, lim)) {
          const tailIdx = cb.lastIndexOf(tv);
          if (tailIdx < 0 || tailIdx + tv.length <= headIdx) continue;
          const spanLen = (tailIdx + tv.length) - headIdx;
          if (spanLen <= cd.length * 1.5 && spanLen >= cd.length * 0.5) {
            blockStartCanonIdx = headIdx;
            blockEndCanonIdx = tailIdx + tv.length;
            break;
          }
        }
        if (blockStartCanonIdx >= 0) break;
      }
      if (blockStartCanonIdx >= 0) break;
    }
    
    console.log(`  lim=${lim}: ${blockStartCanonIdx >= 0 ? `FOUND head=${blockStartCanonIdx} end=${blockEndCanonIdx}` : "NOT FOUND"}`);
  }
}