import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DB_PATH = resolve(ROOT, "data/db.json");

/* These are tactical status/resource tags reviewed by this audit. The patterns look for
   an operation or a quantitative/conditional relationship, not just a word mention.
   Results are candidates for human review; this module deliberately never edits data. */
export const AUDITABLE_KEYWORDS = Object.freeze([
  "火傷", "恐慌", "呼吸", "充電", "出血", "振動", "沈潜", "毒", "破裂", "麻痺", "煙"
]);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES = new Map(AUDITABLE_KEYWORDS.map((keyword) => {
  const escaped = escapeRegex(keyword);
  return [keyword, [
    new RegExp(escaped + "(?:状態)?(?:\\s*(?:を\\s*)?(?:全て|すべて|[0-9０-９]+)?\\s*(?:を\\s*)?(?:付与|消費|得る|獲得|回復|解除|変換|吸収|蓄積))", "u"),
    new RegExp(escaped + ".{0,8}(?:ごとに|[0-9０-９]+以上|[0-9０-９]+未満|なら|の数|数値|参照|条件|保有|共鳴|付与量|消費量|ダメージ量|マッチ威力|クリティカル|に応じて|必要|変換|獲得|消費|付与)", "u"),
    new RegExp(escaped + "状態.{0,8}(?:対象|ダメージ|与える|増加|減少|強化|条件)", "u")
  ]];
}));

function collectAbilityText(persona) {
  const rows = [];
  const add = (field, value) => {
    if (typeof value === "string" && value.trim()) rows.push({ field, text: value });
  };
  add("passive_cond", persona.passive_cond);
  add("passive_always", persona.passive_always);
  add("passive_effect", persona.passive_effect);
  (Array.isArray(persona.skills) ? persona.skills : []).forEach((skill, i) => {
    add("skills[" + i + "].effect", skill?.effect);
    (Array.isArray(skill?.dice) ? skill.dice : []).forEach((die, j) => add("skills[" + i + "].dice[" + j + "].effect", die?.effect));
  });
  (Array.isArray(persona.unique_buffs) ? persona.unique_buffs : []).forEach((buff, i) => add("unique_buffs[" + i + "].desc", buff?.desc));
  return rows;
}

export function detectPersonaKeywordCandidates(persona) {
  const result = new Map();
  if (!persona || typeof persona !== "object") return result;
  const fields = collectAbilityText(persona);
  for (const [keyword, patterns] of RULES) {
    const evidence = [];
    for (const { field, text } of fields) {
      const match = patterns.map((pattern) => ({ pattern, match: pattern.exec(text) })).find((x) => x.match);
      if (!match) continue;
      const start = Math.max(0, match.match.index - 24);
      const end = Math.min(text.length, match.match.index + match.match[0].length + 36);
      evidence.push({ field, excerpt: text.slice(start, end), rule: String(match.pattern) });
    }
    if (evidence.length) result.set(keyword, evidence);
  }
  return result;
}

export function getPersonaRecords(db) {
  return [
    ...(Array.isArray(db?.normal_personas) ? db.normal_personas.map((persona) => ({ persona, mode: "normal" })) : []),
    ...(Array.isArray(db?.tokui_personas) ? db.tokui_personas.map((persona) => ({ persona, mode: "tokui" })) : [])
  ];
}

export function auditPersonaKeywords(db) {
  const records = getPersonaRecords(db);
  const missingTagCandidates = [];
  const taggedWithoutStrongEvidence = [];
  const byKeyword = Object.fromEntries(AUDITABLE_KEYWORDS.map((keyword) => [keyword, { tagged: 0, detected: 0, missing: 0, unverified: 0 }]));
  for (const { persona, mode } of records) {
    const tags = new Set(Array.isArray(persona.keywords) ? persona.keywords : []);
    const bullets = !!(persona.bullets && !["×", "x", "X"].includes(persona.bullets));
    if (bullets) tags.add("弾丸");
    const candidates = detectPersonaKeywordCandidates(persona);
    for (const keyword of AUDITABLE_KEYWORDS) {
      const row = byKeyword[keyword];
      if (tags.has(keyword)) row.tagged++;
      if (candidates.has(keyword)) row.detected++;
      if (candidates.has(keyword) && !tags.has(keyword)) {
        const candidate = { mode, no: persona.no, name: persona.name, keyword, evidence: candidates.get(keyword) };
        missingTagCandidates.push(candidate);
        row.missing++;
      }
      if (tags.has(keyword) && !candidates.has(keyword)) {
        taggedWithoutStrongEvidence.push({ mode, no: persona.no, name: persona.name, keyword });
        row.unverified++;
      }
    }
  }
  return {
    personaCount: records.length,
    candidateCount: missingTagCandidates.length,
    unverifiedCount: taggedWithoutStrongEvidence.length,
    byKeyword,
    missingTagCandidates,
    taggedWithoutStrongEvidence
  };
}

export function loadPersonaDb(filePath = DEFAULT_DB_PATH) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function main() {
  const report = auditPersonaKeywords(loadPersonaDb());
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\\n");
    return;
  }
  console.log("Persona keyword evidence audit (suggestions only; no data is modified)");
  console.log("Personas scanned: " + report.personaCount);
  console.log("Potential missing tags requiring human review: " + report.candidateCount);
  console.log("Existing tags without a strong text signal: " + report.unverifiedCount);
  console.log("");
  console.log("Keyword     Tagged  Detected  Missing  Unverified");
  for (const [keyword, row] of Object.entries(report.byKeyword)) {
    console.log(keyword.padEnd(10) + "  " + String(row.tagged).padStart(4) + "  " + String(row.detected).padStart(8) + "  " + String(row.missing).padStart(7) + "  " + String(row.unverified).padStart(10));
  }
  console.log("");
  report.missingTagCandidates.slice(0, 40).forEach((candidate) => {
    console.log("REVIEW " + candidate.mode + " #" + candidate.no + " " + candidate.name + " [" + candidate.keyword + "] " + candidate.evidence[0].field + ": " + candidate.evidence[0].excerpt);
  });
  if (report.missingTagCandidates.length > 40) console.log("... " + (report.missingTagCandidates.length - 40) + " more candidates; rerun with --json for the full report.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();