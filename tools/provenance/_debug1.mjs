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
const { auditPersonas } = await import("./db-provenance.mjs");
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const targets = [...missing, ...truncated];

// Test specific case: 黒獣-巳 スキル2「巳噛腕」/ダイス3
const target = targets.find(m => m.persona.includes("黒獣-巳") && m.label.includes("巳噛腕"));
if (target) {
  const block = findPersonaBlock(target.persona);
  const cd = canon(target.text);
  const cb = canon(block.text);
  
  console.log("=== 黒獣-巳 スキル2「巳噛腕」/ダイス3 ===");
  console.log("DB:", JSON.stringify(cd));
  console.log("DB len:", cd.length);
  
  // Show head variants
  const head = cd.substring(0, cd.length);
  const variants = headVariants(head);
  console.log("\nHead variants count:", variants.length);
  for (const v of variants) {
    const idx = cb.indexOf(v);
    if (idx >= 0) {
      console.log(`  FOUND variant at ${idx}: ${JSON.stringify(v.substring(0, 40))}...`);
    }
  }
  
  // Check if the transposed variant exists
  const transposed = cd.replace(/を5/, "5を");
  console.log("\nTransposed:", JSON.stringify(transposed));
  console.log("Transposed in block:", cb.indexOf(transposed));
  
  // Check corpus around the expected position
  const expectedIdx = cb.indexOf("的中時呪殺【毒】");
  console.log("\nExpected position:", expectedIdx);
  if (expectedIdx >= 0) {
    console.log("Corpus around expected:", JSON.stringify(cb.substring(expectedIdx, expectedIdx + 60)));
  }
}