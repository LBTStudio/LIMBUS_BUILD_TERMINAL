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
function canonToRawOffset(raw, canonOffset) {
  if (canonOffset <= 0) return 0;
  let r = 0;
  while (r < raw.length) { r++; if (canon(raw.substring(0, r)).length >= canonOffset) { while (r < raw.length) { const c = canon(raw.substring(0, r)).length; if (c > canonOffset) break; r++; } return r; } }
  return raw.length;
}
const HEAD_PARTICLES = ["の","を","は","が","に","で","と","や","も","へ","か","だ","ら"];
const TAIL_PARTICLES = ["る","た","ます","です","だ","である"];
function headVariants(head) {
  const out = [head];
  const lim = Math.min(head.length - 1, 10);
  for (let k = 0; k < lim; k++) {
    if (HEAD_PARTICLES.includes(head[k]) || HEAD_PARTICLES.includes(head[k + 1])) {
      const arr = head.split(""); [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]]; out.push(arr.join(""));
    }
  }
  for (const p of HEAD_PARTICLES) { if (head.startsWith(p) && head.length > p.length) out.push(head.substring(p.length)); }
  for (const p of TAIL_PARTICLES) { if (head.endsWith(p) && head.length > p.length) out.push(head.substring(0, head.length - p.length)); }
  return out;
}
function findMatchingParagraph(blockText, dbText) {
  const canonDb = canon(dbText);
  const canonBlock = canon(blockText);
  const paragraphs = blockText.split("\n").filter(l => l.trim());
  let blockStartCanonIdx = -1;
  const minHeadLen = Math.min(6, canonDb.length);
  for (let searchLen = Math.min(canonDb.length, 40); searchLen >= minHeadLen; searchLen--) {
    const head = canonDb.substring(0, searchLen);
    for (const v of headVariants(head)) {
      const idx = canonBlock.indexOf(v);
      if (idx >= 0) { blockStartCanonIdx = idx; break; }
    }
    if (blockStartCanonIdx >= 0) break;
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
const { auditPersonas } = await import("./db-provenance.mjs");
const findings = auditPersonas(db, corpus);
const missing = findings.filter(f => f.code === "missing");
const truncated = findings.filter(f => f.code === "truncated");
const fails = [];
for (const m of [...missing, ...truncated]) {
  const block = findPersonaBlock(m.persona);
  if (!block) { fails.push({ ...m, status: "block-not-found" }); continue; }
  const r = findMatchingParagraph(block.text, m.text);
  if (!r.found) fails.push({ ...m, status: "extract-failed", block });
}
console.log("FAILS:", fails.length);
for (const f of fails) {
  const cd = canon(f.text);
  const cb = canon(f.block.text);
  console.log("\n=== " + f.persona + " :: " + f.label);
  console.log("  DB(" + cd.length + "): " + JSON.stringify(cd.slice(0,80)));
  // best fuzzy
  let best = {len:0, idx:-1};
  for (let i=0;i<cb.length;i++){ let l=0; while(l<cd.length && i+l<cb.length && cb[i+l]===cd[l]) l++; if(l>best.len) best={len:l,idx:i}; }
  console.log("  best exact: len=" + best.len + " idx=" + best.idx);
  console.log("  corpus @best: " + JSON.stringify(cb.slice(Math.max(0,best.idx-3), best.idx+80)));
}