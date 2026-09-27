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

// Check specific cases - show DB text and corpus block context
const checkLabels = [
  "ロジック・アトリエ所属フィクサー",
  "シュエ家私兵",
  "鉄腕兄弟構成員",
  "東部シ協会3課フィクサー",
  "ホイールズ・インダストリー所属フィクサー",
  "北部ジエーヴィチ協会4課フィクサー",
];

for (const m of targets) {
  if (!checkLabels.some(n => m.persona.includes(n))) continue;
  const block = findPersonaBlock(m.persona);
  if (!block) continue;
  const cd = canon(m.text);
  const cb = canon(block.text);

  // Find best sub-match
  let bestLen = 0, bestIdx = -1;
  for (let i = 0; i < cb.length; i++) {
    let l = 0;
    while (l < cd.length && i + l < cb.length && cb[i + l] === cd[l]) l++;
    if (l > bestLen) { bestLen = l; bestIdx = i; }
  }

  console.log(`\n=== ${m.persona} :: ${m.label} ===`);
  console.log(`  DB len=${cd.length} block len=${cb.length} bestSub=${bestLen}@${bestIdx}`);
  console.log(`  DB: ${JSON.stringify(cd)}`);
  if (bestIdx >= 0 && bestLen > 0) {
    console.log(`  BLK: ${JSON.stringify(cb.substring(Math.max(0,bestIdx-10), bestIdx + bestLen + 30))}`);
  }
}