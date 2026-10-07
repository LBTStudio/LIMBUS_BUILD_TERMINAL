#!/usr/bin/env node
/* DB hygiene audit across every collection of data/db.json + data/items.json.
   Complements the three-book audit (content comparison): this tool only asks
   whether the DB itself is structurally and typographically sound.
     node tools/provenance/audit-db-hygiene.mjs          # human-readable report
     node tools/provenance/audit-db-hygiene.mjs --json    # machine-readable
   Checks (only *confirmed* DB-side deficiencies count as violations):
     1. errata residue : the official errata renamed 混乱終了時 to 混乱復帰時.
                         No string in the DB may still contain the old form.
     2. mojibake       : no U+FFFD, control chars, private-use chars, lone
                         surrogates or double-encoding artifacts (Ã/Â/â€/ï¿½).
     3. line breaks    : for body text whose content matches a three-book
                         source candidate, every DB newline must sit at a
                         source whitespace position, a sentence boundary,
                         a heading boundary, or a physical line boundary of
                         the raw PDF corpus. Fields whose content differs from
                         the source belong to the content-comparison audit and
                         are only counted as delegated. Collections without
                         source candidates (enhancements, death passives)
                         are single-cell texts: any newline is a violation.
     4. required fields: every record carries its mandatory fields with the
                         documented type. Empty strings are legal where the
                         source allows an empty cell.
     5. format anomalies: skill rank notation, derived-skill metadata,
                         name uniqueness, dice structures.
   Exit code 1 if any confirmed violation exists, otherwise 0. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const asJson = process.argv.includes("--json");

const db = JSON.parse(readFileSync(path.join(root, "data", "db.json"), "utf8"));
const items = JSON.parse(readFileSync(path.join(root, "data", "items.json"), "utf8"));
const audit = JSON.parse(readFileSync(path.join(root, "data", "provenance", "three-book-audit.json"), "utf8"));

const violations = [];
const delegated = [];
const unverifiable = [];
const stats = { strings: 0, fields: 0, linebreakChecks: 0 };

/* ---- shared normalization ------------------------------------------
   The "core" of a body text removes differences that carry no meaning in
   PDF transcription: wide digits/percent/plus/minus/tilde/x and the
   multiplication sign go narrow, long-dash variants unify to the kana
   long vowel, whitespace and boundary punctuation ( 。 、 ， , . ・ ： : ; )
   are dropped entirely. Line-break verification only applies to fields
   whose core equals the source candidate's core. */
const WIDE_TO_NARROW = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5",
  "６": "6", "７": "7", "８": "8", "９": "9", "％": "%", "＋": "+",
  "－": "-", "～": "~", "ｘ": "x", "Ｘ": "x", "\u00D7": "x"
};
const DASH_RE = /[\u2014\u2015\u2212\uFF0D\u30FC\u2043\u002D\u2010\u2011\u2012\u2013]/g;
const WS_RE = /[\s\u3000]/;
const PUNCT_RE = /[。、，,.・：:;]/;
const SENTENCE_FINAL = new Set([..."。！？」）)]】］』…"]);
const HEADING_OPEN = new Set([..."[【「『（(●■"]);

const normName = (value) => String(value == null ? "" : value).replace(/[\s\u3000]/g, "");

/* Colon-keeping variant of core(): identical to core() except the
   fullwidth ： is preserved as a core character. Used only to detect
   colon drift: when core(db) === core(src) but the colon layout differs,
   the DB carries colons the source does not have (or lacks ones it does). */
function coreKeepColon(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/[０１２３４５６７８９％＋－～ｘＸ×]/g, (ch) => WIDE_TO_NARROW[ch] || ch);
  text = text.replace(DASH_RE, "ー");
  return text.replace(/[\s\u3000。、，,.・:;]/g, "");
}

function core(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/[０１２３４５６７８９％＋－～ｘＸ\u00D7]/g, (ch) => WIDE_TO_NARROW[ch] || ch);
  text = text.replace(DASH_RE, "\u30FC");
  return text.replace(/[\s\u3000。、，,.・：:;]/g, "");
}

/* Source candidate break positions, counted in core characters. */
function sourceBreaks(text) {
  const positions = new Set();
  let count = 0;
  let pending = false;
  for (const ch of String(text == null ? "" : text)) {
    if (WS_RE.test(ch)) { pending = true; continue; }
    if (PUNCT_RE.test(ch)) continue;
    if (pending) { positions.add(count); pending = false; }
    count++;
  }
  return positions;
}

/* Raw PDF corpus lines (core-normalized). The candidate extraction can join
   physical lines and lose a break; the corpus is the final authority on
   where the PDF actually wrapped. */
const corpusLines = [];
for (const key of ["core", "supplement", "pack1"]) {
  for (const line of readFileSync(path.join(root, "data", "provenance", `${key}.txt`), "utf8").split("\n")) {
    const flat = core(line);
    if (flat) corpusLines.push(flat);
  }
}

/* Does the raw corpus contain this junction as a physical line boundary?
   Accepted when a corpus line ends with the segment before the break and
   the following corpus line starts with the segment after it. */
function corpusSupportsJunction(beforeCore, afterCore) {
  for (let i = 0; i < corpusLines.length - 1; i++) {
    if (corpusLines[i].endsWith(beforeCore) && corpusLines[i + 1].startsWith(afterCore)) return true;
  }
  return false;
}

/* Line-break verification for one field. */
function verifyLineBreaks(kind, recordName, label, dbValue, srcValue) {
  if (typeof dbValue !== "string" || !dbValue.includes("\n")) return;
  stats.linebreakChecks++;
  if (srcValue == null || typeof srcValue !== "string") {
    unverifiable.push(`${kind}/${recordName}/${label}: 原典候補に対応フィールドがない`);
    return;
  }
  if (core(dbValue) !== core(srcValue)) {
    /* content differs: the three-book content audit owns this field */
    delegated.push(`${kind}/${recordName}/${label}: 原典と内容差（three-book監査の管轄）`);
    return;
  }
  /* Colon drift: core() drops ： as punctuation, so a colon intruded by
     transcription (or one lost from the source) is invisible in the core
     comparison. Compare colon-keeping cores to make it visible. */
  if (coreKeepColon(dbValue) !== coreKeepColon(srcValue)) {
    violations.push(`${kind}/${recordName}/${label}: コロン位置が原典と異なる（混入または欠落）`);
    stats.linebreakChecks--;
    return;
  }
  const breaks = sourceBreaks(srcValue);
  const segments = dbValue.split("\n");
  let prefix = 0;
  for (let s = 0; s < segments.length - 1; s++) {
    const before = segments[s];
    const after = segments[s + 1];
    prefix += core(before).length;
    if (breaks.has(prefix)) continue;
    /* The candidate lost this break, but the DB may still be faithful:
       re-paragraphing at sentence/paren boundaries or at heading starts is
       legitimate, and the raw corpus is the authority on real PDF wraps. */
    const beforeTrim = before.replace(/[\s\u3000]+$/, "");
    const afterTrim = after.replace(/^[\s\u3000]+/, "");
    const lastChar = [...beforeTrim].pop() || "";
    const firstChar = [...afterTrim][0] || "";
    if (SENTENCE_FINAL.has(lastChar)) continue;
    if (HEADING_OPEN.has(firstChar)) continue;
    if (corpusSupportsJunction(core(beforeTrim), core(afterTrim))) continue;
    violations.push(`${kind}/${recordName}/${label}: 語途中改行（核位置=${prefix}）`);
  }
}

/* ---- 1. errata residue: 混乱終了時 -> 混乱復帰時 ---------------------- */
const ERRATA_STALE = "混乱終了時";
function walkErrata(node, trail) {
  if (typeof node === "string") {
    stats.strings++;
    if (node.includes(ERRATA_STALE)) violations.push(`${trail}: エラッタ未適用の旧表記「${ERRATA_STALE}」`);
  } else if (Array.isArray(node)) {
    node.forEach((value, index) => walkErrata(value, `${trail}[${index}]`));
  } else if (node && typeof node === "object") {
    for (const key of Object.keys(node)) walkErrata(node[key], `${trail}.${key}`);
  }
}
walkErrata(db, "db");
walkErrata(items, "items");

/* ---- 2. mojibake / replacement characters ---------------------------- */
const DOUBLE_ENCODE_RE = /Ã.|Â.|â€.|ï¿½/;
function walkChars(node, trail) {
  if (typeof node === "string") {
    for (let i = 0; i < node.length; i++) {
      const code = node.charCodeAt(i);
      const ch = node[i];
      if (code >= 0xD800 && code <= 0xDBFF && !(node.charCodeAt(i + 1) >= 0xDC00 && node.charCodeAt(i + 1) <= 0xDFFF)) {
        violations.push(`${trail}: 不対サロゲート(0x${code.toString(16)})`);
      }
      if (code === 0xFFFD) violations.push(`${trail}: 置換文字(U+FFFD)`);
      else if (code < 0x20 && ch !== "\n" && ch !== "\t" && ch !== "\r") violations.push(`${trail}: 制御文字(0x${code.toString(16)})`);
      else if (code >= 0x7F && code <= 0x9F) violations.push(`${trail}: C1制御文字(0x${code.toString(16)})`);
      else if (code >= 0xE000 && code <= 0xF8FF) violations.push(`${trail}: 私用領域(0x${code.toString(16)})`);
    }
    const m = node.match(DOUBLE_ENCODE_RE);
    if (m) violations.push(`${trail}: 二重エンコード痕跡「${m[0]}」`);
  } else if (Array.isArray(node)) {
    node.forEach((value, index) => walkChars(value, `${trail}[${index}]`));
  } else if (node && typeof node === "object") {
    for (const key of Object.keys(node)) walkChars(node[key], `${trail}.${key}`);
  }
}
walkChars(db, "db");
walkChars(items, "items");

/* ---- 3. mid-word line breaks (position check vs source candidates) --- */
const candidatesByKind = new Map();
for (const candidate of audit.candidates || []) {
  if (!candidatesByKind.has(candidate.kind)) candidatesByKind.set(candidate.kind, new Map());
  candidatesByKind.get(candidate.kind).set(normName(candidate.data.name), candidate.data);
}

function candidateRecord(kind, record) {
  const map = candidatesByKind.get(kind);
  return map ? map.get(normName(record.name)) : undefined;
}

function verifyPersona(kind, persona) {
  const source = candidateRecord(kind, persona);
  if (!source) {
    unverifiable.push(`${kind}/${persona.name}: 原典候補に対応レコードがない`);
    return;
  }
  verifyLineBreaks(kind, persona.name, "passive_always", persona.passive_always, source.passive_always);
  verifyLineBreaks(kind, persona.name, "passive_effect", persona.passive_effect, source.passive_effect);
  const byRank = new Map((source.skills || []).map((skill) => [skill.rank, skill]));
  for (const skill of persona.skills || []) {
    const srcSkill = byRank.get(skill.rank);
    verifyLineBreaks(kind, persona.name, `${skill.rank}効果`, skill.effect, srcSkill?.effect);
    if (srcSkill && Array.isArray(srcSkill.dice) && srcSkill.dice.length === (skill.dice || []).length) {
      (skill.dice || []).forEach((dice, index) => verifyLineBreaks(kind, persona.name, `${skill.rank}ダイス${index + 1}`, dice.effect, srcSkill.dice[index]?.effect));
    } else if ((skill.dice || []).some((dice) => String(dice.effect || "").includes("\n"))) {
      unverifiable.push(`${kind}/${persona.name}/${skill.rank}: ダイス構成が原典候補と一致せず改行照合不能`);
    }
  }
  const byBuffName = new Map((source.unique_buffs || []).map((buff) => [normName(buff.name), buff]));
  for (const buff of persona.unique_buffs || []) {
    verifyLineBreaks(kind, persona.name, `固有バフ「${buff.name}」`, buff.desc, byBuffName.get(normName(buff.name))?.desc);
  }
}

function verifyEgo(ego) {
  const source = candidateRecord("egos", ego);
  if (!source) {
    unverifiable.push(`egos/${ego.name}: 原典候補に対応レコードがない`);
    return;
  }
  verifyLineBreaks("egos", ego.name, "passive_effect", ego.passive_effect, source.passive_effect);
  for (const section of ["kakusei", "shinshoku"]) {
    const src = source[section];
    const own = ego[section];
    verifyLineBreaks("egos", ego.name, `${section}.effect`, own?.effect, src?.effect);
    if (src && own && Array.isArray(src.dice) && src.dice.length === (own.dice || []).length) {
      (own.dice || []).forEach((dice, index) => verifyLineBreaks("egos", ego.name, `${section}ダイス${index + 1}`, dice.effect, src.dice[index]?.effect));
    } else if ((own?.dice || []).some((dice) => String(dice.effect || "").includes("\n"))) {
      unverifiable.push(`egos/${ego.name}/${section}: ダイス構成が原典候補と一致せず改行照合不能`);
    }
  }
  const bySubName = new Map((source.sub_skills || []).map((sub) => [normName(sub.name), sub]));
  for (const sub of ego.sub_skills || []) {
    const src = bySubName.get(normName(sub.name));
    verifyLineBreaks("egos", ego.name, `副スキル「${sub.name}」`, sub.effect, src?.effect);
    if (src && Array.isArray(src.dice) && src.dice.length === (sub.dice || []).length) {
      (sub.dice || []).forEach((dice, index) => verifyLineBreaks("egos", ego.name, `副スキル「${sub.name}」ダイス${index + 1}`, dice.effect, src.dice[index]?.effect));
    } else if ((sub.dice || []).some((dice) => String(dice.effect || "").includes("\n"))) {
      unverifiable.push(`egos/${ego.name}/副スキル「${sub.name}」: ダイス構成が原典候補と一致せず改行照合不能`);
    }
  }
  verifyLineBreaks("egos", ego.name, "unique_buff", ego.unique_buff, source.unique_buff);
}

function verifySimple(kind, record, fields) {
  const source = candidateRecord(kind, record);
  if (!source) {
    unverifiable.push(`${kind}/${record.name}: 原典候補に対応レコードがない`);
    return;
  }
  for (const field of fields) verifyLineBreaks(kind, record.name, field, record[field], source[field]);
}

for (const persona of db.normal_personas || []) verifyPersona("normal_personas", persona);
for (const persona of db.tokui_personas || []) verifyPersona("tokui_personas", persona);
for (const ego of db.egos || []) verifyEgo(ego);
for (const spirit of db.spirits || []) verifySimple("spirits", spirit, ["always_effect", "morale_effect", "confuse_effect"]);
for (const passive of db.support_passives || []) verifySimple("support_passives", passive, ["cond", "effect"]);
for (const item of items || []) verifySimple("items", item, ["effect"]);

/* Collections without source candidates follow a single-cell contract:
   their texts are short one-line cells, so any newline is an anomaly. */
for (const [kind, records] of [["normal_enhancements", db.normal_enhancements], ["special_enhancements", db.special_enhancements], ["death_passives", db.death_passives]]) {
  for (const record of records || []) {
    for (const key of Object.keys(record)) {
      if (typeof record[key] === "string" && record[key].includes("\n")) {
        violations.push(`${kind}/${record.name}.${key}: 単一セル契約のコレクションに改行が存在する`);
      }
    }
  }
}

/* ---- 4. required fields ----------------------------------------------
   Fields present in every record of a collection are mandatory with the
   documented type. Optional fields (affiliation, sub_skills, sync_rank,
   quick, maxOwned) are out of scope. Empty strings are legal where the
   source allows an empty cell (e.g. passive_always). */
const REQUIRED = {
  normal_personas: { name: "string", no: "number", hp: "number", san: "number", speed: "string", res_slash: "string", res_pierce: "string", res_blunt: "string", bullets: "string", passive_name: "string", passive_cond: "string", passive_always: "string", passive_effect: "string", unique_buffs: "array", keywords: "array", skills: "array", self_status: "array" },
  tokui_personas: { name: "string", no: "number", hp: "number", san: "number", speed: "string", res_slash: "string", res_pierce: "string", res_blunt: "string", bullets: "string", passive_name: "string", passive_cond: "string", passive_always: "string", passive_effect: "string", unique_buffs: "array", keywords: "array", skills: "array", self_status: "array" },
  egos: { rank: "string", name: "string", no: "number", shards: "number", san_cost: "number", resources: "string", passive_name: "string", passive_cond: "string", passive_effect: "string", kakusei: "object", shinshoku: "object", unique_buff: "string" },
  spirits: { name: "string", price: "number", always_effect: "string", morale_effect: "string", confuse_effect: "string", source: "string" },
  support_passives: { name: "string", cond: "string", effect: "string", lp: "number", source: "string" },
  normal_enhancements: { name: "string", category: "string", group: "string", shards: "number", effect: "string" },
  special_enhancements: { name: "string", shards: "number", effect: "string", category: "string" },
  death_passives: { name: "string", cond: "string", effect: "string", shards: "number" }
};
const ITEM_REQUIRED = { id: "string", name: "string", category: "string", tags: "array", price: "string", effect: "string", palette: "string" };

function checkRequired(kind, record, spec, trail) {
  stats.fields++;
  for (const [field, type] of Object.entries(spec)) {
    if (record[field] === undefined) {
      violations.push(`${trail}: 必須項目「${field}」が存在しない`);
      continue;
    }
    const actual = Array.isArray(record[field]) ? "array" : typeof record[field];
    if (actual !== type) violations.push(`${trail}: 項目「${field}」の型が${type}でなく${actual}`);
    if (type === "number" && !Number.isFinite(record[field])) violations.push(`${trail}: 項目「${field}」が有限数でない`);
  }
}

for (const [kind, spec] of Object.entries(REQUIRED)) {
  (db[kind] || []).forEach((record, index) => checkRequired(kind, record, spec, `${kind}[${index}](${record.name})`));
}
(items || []).forEach((item, index) => checkRequired("items", item, ITEM_REQUIRED, `items[${index}](${item.name})`));

/* ---- 5. format anomalies ---------------------------------------------- */
/* 5-1. skill rank notation and derived-skill metadata consistency
   (same contract as docs/derivative-skill-audit.md and
   tests/derivative-skills.test.mjs). */
for (const kind of ["normal_personas", "tokui_personas"]) {
  for (const persona of db[kind] || []) {
    const slots = new Map();
    for (const skill of persona.skills || []) {
      const match = String(skill.rank || "").match(/^スキル(\d+)(?:-(\d+))?$/);
      if (!match) {
        violations.push(`${kind}/${persona.name}: 異常なrank書式「${skill.rank}」(${skill.name})`);
        continue;
      }
      if (!slots.has(match[1])) slots.set(match[1], []);
      slots.get(match[1]).push({ skill, slot: match[1], index: match[2] ? Number(match[2]) : 1 });
    }
    for (const [slot, forms] of slots) {
      if (forms.length === 1) {
        if (forms[0].skill.rank !== `スキル${slot}`) violations.push(`${kind}/${persona.name}: 単一形態スロット${slot}がplainでない`);
        if (forms[0].skill.derived_from !== undefined) violations.push(`${kind}/${persona.name}: 基礎形態${forms[0].skill.name}が派生メタデータを持つ`);
      } else {
        const indexes = forms.map((form) => form.index).sort((a, b) => a - b);
        if (JSON.stringify(indexes) !== JSON.stringify(Array.from({ length: forms.length }, (_, i) => i + 1))) {
          violations.push(`${kind}/${persona.name}: スロット${slot}の派生連番が${JSON.stringify(indexes)}で1始まり連番でない`);
        }
        for (const form of forms) {
          if (form.index === 1) continue;
          if (form.skill.derived_from !== `スキル${slot}`) violations.push(`${kind}/${persona.name}: ${form.skill.name}のderived_fromが「スキル${slot}」でない`);
          if (form.skill.derived_index !== form.index) violations.push(`${kind}/${persona.name}: ${form.skill.name}のderived_indexが${form.index}でない`);
          if (form.skill.rank !== `${form.skill.derived_from}-${form.skill.derived_index}`) violations.push(`${kind}/${persona.name}: ${form.skill.name}の派生表示が導出式どおりでない`);
        }
      }
    }
  }
}

/* 5-2. name uniqueness (records are referenced by name). */
for (const [kind, records] of Object.entries(db)) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.name)) violations.push(`${kind}: 名前重複「${record.name}」`);
    seen.add(record.name);
  }
}
{
  const seenId = new Set();
  const seenName = new Set();
  for (const item of items || []) {
    if (seenId.has(item.id)) violations.push(`items: id重複「${item.id}」`);
    if (seenName.has(item.name)) violations.push(`items: 名前重複「${item.name}」`);
    seenId.add(item.id);
    seenName.add(item.name);
  }
}

/* 5-3. dice and unique-buff structural contracts. */
for (const persona of [...(db.normal_personas || []), ...(db.tokui_personas || [])]) {
  for (const buff of persona.unique_buffs || []) {
    if (typeof buff.name !== "string" || !buff.name.trim()) violations.push(`${persona.name}: 固有バフに名前がない`);
    if (buff.desc !== undefined && typeof buff.desc !== "string") violations.push(`${persona.name}: 固有バフ「${buff.name}」のdescが文字列でない`);
  }
  for (const skill of persona.skills || []) {
    if (typeof skill.name !== "string" || !skill.name.trim()) violations.push(`${persona.name}: ${skill.rank}にスキル名がない`);
    if (!Array.isArray(skill.dice)) { violations.push(`${persona.name}: ${skill.rank}のdiceが配列でない`); continue; }
    for (const dice of skill.dice) {
      if (typeof dice.roll !== "string" || typeof dice.effect !== "string") violations.push(`${persona.name}: ${skill.rank}のダイス構造が不正`);
    }
  }
}
for (const ego of db.egos || []) {
  for (const section of ["kakusei", "shinshoku"]) {
    const own = ego[section];
    if (!own || !Array.isArray(own.dice)) { violations.push(`egos/${ego.name}: ${section}にdice配列がない`); continue; }
    for (const dice of own.dice) {
      if (typeof dice.roll !== "string" || typeof dice.effect !== "string") violations.push(`egos/${ego.name}: ${section}のダイス構造が不正`);
    }
  }
  for (const sub of ego.sub_skills || []) {
    if (typeof sub.name !== "string" || !sub.name.trim()) violations.push(`egos/${ego.name}: 副スキルに名前がない`);
    if (!Array.isArray(sub.dice)) { violations.push(`egos/${ego.name}: 副スキル「${sub.name}」にdice配列がない`); continue; }
    for (const dice of sub.dice) {
      if (typeof dice.roll !== "string" || typeof dice.effect !== "string") violations.push(`egos/${ego.name}: 副スキル「${sub.name}」のダイス構造が不正`);
    }
  }
}

/* ---- output ------------------------------------------------------------ */
const asMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (asMain) {
  const report = {
    scope: "db.json全コレクション+items.json",
    checked: { strings: stats.strings, requiredFieldRecords: stats.fields, linebreakVerifiedFields: stats.linebreakChecks },
    violations,
    delegatedCount: delegated.length,
    delegated,
    unverifiableCount: unverifiable.length,
    unverifiable
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`DB衛生監査 — 対象: ${report.scope}`);
    console.log(`  走査文字列: ${stats.strings}  必須項目検査レコード: ${stats.fields}  改行照合フィールド: ${stats.linebreakChecks}`);
    console.log(`\n■ 確認済みの不備: ${violations.length}件`);
    for (const violation of violations) console.log(`  - ${violation}`);
    console.log(`\n■ 内容照合への委譲（原典候補と内容差・three-book監査の管轄）: ${delegated.length}件`);
    if (delegated.length <= 20) delegated.forEach((entry) => console.log(`  - ${entry}`));
    console.log(`\n■ 改行照合不能（原典候補なし・構成不一致）: ${unverifiable.length}件`);
    if (unverifiable.length <= 20) unverifiable.forEach((entry) => console.log(`  - ${entry}`));
    console.log(`\n判定: ${violations.length === 0 ? "確認済みのDB側の不備なし (PASS)" : "不備あり (FAIL)"}`);
  }

  process.exit(violations.length ? 1 : 0);
}

export { core, coreKeepColon, verifyLineBreaks, violations, delegated, unverifiable, stats };
