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

function headVariants(head) {
  const out = [head];
  const lim = head.length - 1;
  for (let k = 0; k < lim; k++) {
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
function tailVariants(tail) {
  const out = [tail];
  const lim = tail.length - 1;
  for (let k = 0; k < lim; k++) {
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

// Replicate findMatchingParagraph logic exactly
function findMatchingParagraph(blockText, dbText) {
  const canonDb = canon(dbText);
  const canonBlock = canon(blockText);
  const paragraphs = blockText.split("\n").filter(l => l.trim());
  let blockStartCanonIdx = -1;
  let blockEndCanonIdx = -1;
  const minHeadLen = Math.min(6, canonDb.length);
  for (let searchLen = Math.min(canonDb.length, 40); searchLen >= minHeadLen; searchLen--) {
    const head = canonDb.substring(0, searchLen);
    const tail = canonDb.substring(canonDb.length - searchLen);
    for (const hv of headVariants(head)) {
      const headIdx = canonBlock.indexOf(hv);
      if (headIdx < 0) continue;
      for (const tv of tailVariants(tail)) {
        const tailIdx = canonBlock.lastIndexOf(tv);
        if (tailIdx < 0 || tailIdx + tv.length <= headIdx) continue;
        const spanLen = (tailIdx + tv.length) - headIdx;
        if (spanLen <= canonDb.length * 1.5 && spanLen >= canonDb.length * 0.5) {
          blockStartCanonIdx = headIdx;
          blockEndCanonIdx = tailIdx + tv.length;
          break;
        }
      }
      if (blockStartCanonIdx >= 0) break;
    }
    if (blockStartCanonIdx >= 0) break;
  }
  if (blockStartCanonIdx < 0) {
    let j = 0;
    for (let i = 0; i < canonBlock.length && j < canonDb.length; i++) {
      if (canonBlock[i] === canonDb[j]) j++;
    }
    if (j === canonDb.length) {
      let endJ = canonDb.length;
      let ii = canonBlock.length;
      while (endJ > 0 && ii > 0) {
        ii--;
        if (canonBlock[ii] === canonDb[endJ - 1]) endJ--;
      }
      blockStartCanonIdx = ii;
      blockEndCanonIdx = -1;
    }
  }
  if (blockStartCanonIdx < 0) return { found: false };
  return { found: true, start: blockStartCanonIdx, end: blockEndCanonIdx };
}

let shown = 0;
for (const m of targets) {
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const result = findMatchingParagraph(block.text, m.text);
  if (!result.found) {
    const cd = canon(m.text);
    const cb = canon(block.text);
    console.log(`\n=== ${m.persona} :: ${m.label} ===`);
    console.log(`  DB len=${cd.length} block len=${cb.length}`);
    console.log(`  DB: ${JSON.stringify(cd).slice(0,120)}`);
    shown++;
    if (shown >= 30) break;
  }
}
console.log(`\nTotal failures: ${shown}`);