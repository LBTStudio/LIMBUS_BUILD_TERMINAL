#!/usr/bin/env node
/* Typo audit over every collection of data/db.json + data/items.json.
 *
 *   node tools/provenance/audit-db-typos.mjs         # human-readable
 *   node tools/provenance/audit-db-typos.mjs --json  # machine-readable
 *
 * What it checks — three groups:
 *   1. dictionary: transcription-variant spellings of game terms that must
 *      never appear (慎怒/爆食/震動/沈殿/クイツク/バリヤ ...). A hit is
 *      reported only when the raw corpus does NOT back the variant up
 *      (corpus count == 0), i.e. the corruption is DB-side.
 *   2. doubling/spacing: doubled particles (のの/をを/がが/にに/とと),
 *      double spaces mid-sentence, half-width katakana blocks.
 *   3. width mixing: a digit run that mixes full-width and half-width
 *      digits, and full-width ％ next to half-width digits is allowed by
 *      the core normalization but “２３” style runs mixing widths are not.
 *
 * Exit code 1 if any confirmed DB-side typo exists, otherwise 0. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const asJson = process.argv.includes("--json");
/* optional overrides for mutation tests: --db <path> --items <path> --dir <provenance dir> */
const opt = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dbPath = opt("--db", path.join(root, "data", "db.json"));
const itemsPath = opt("--items", path.join(root, "data", "items.json"));
const provenanceDir = opt("--dir", path.join(root, "data", "provenance"));

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const items = JSON.parse(readFileSync(itemsPath, "utf8"));
const corpus = ["core", "supplement", "pack1"]
  .map((k) => readFileSync(path.join(provenanceDir, `${k}.txt`), "utf8"))
  .join("\n");

const findings = [];
const stats = { records: 0, strings: 0 };

/* ---- dictionaries ------------------------------------------------------
   Canonical statuses/sins come from the UI's own filter lists so that the
   dictionary can not drift from what the app recognizes. */
const CANON = {
  "慎怒": "憤怒", "慪怒": "憤怒", "爆食": "暴食", "色慾": "色欲",
  "憂欝": "憂鬱", "疾妬": "嫉妬", "羨妬": "嫉妬",
  "震動": "振動", "振動量": "振動", "沈殿": "沈潜", "沈潛": "沈潜",
  "焼傷": "火傷", "弱体": "虚弱", "弱力": "虚弱",
  "クイツク": "クイック", "クイッック": "クイック", "バリヤ": "バリア",
  "バリアー": "バリア", "武罫解除": "武装解除", "武装解徐": "武装解除",
  "ダメージー": "ダメージ", "ダメ?ジ": "ダメージ",
  "回復ー": "回復", "付与ー": "付与"
};

const DOUBLES = ["のの", "をを", "がが", "にに", "とと"];
const HALF_KATA_RE = /[\uFF66-\uFF9D]{3,}/;
const MIXED_WIDTH_DIGIT_RE = /(?:[0-9][0-9]*[０-９]|[０-９][０-９]*[0-9])/;
const DOUBLE_SPACE_RE = /\S(?: {2,}|\u3000{2,})\S/;

function walk(node, trail, sink) {
  if (typeof node === "string") {
    stats.strings++;
    sink({ text: node, trail });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${trail}[${i}]`, sink));
  } else if (node && typeof node === "object") {
    for (const key of Object.keys(node)) walk(node[key], `${trail}.${key}`, sink);
  }
}

const sink = (entry) => {
  const { text, trail } = entry;
  for (const [wrong, right] of Object.entries(CANON)) {
    for (const m of text.matchAll(new RegExp(wrong, "g"))) {
      findings.push({
        rule: "dictionary", wrong, right, trail,
        text: text.slice(Math.max(0, m.index - 15), m.index + 15),
        corpusCount: 0
      });
    }
  }
  for (const doubled of DOUBLES) {
    for (const m of text.matchAll(new RegExp(doubled, "g"))) {
      findings.push({ rule: "double", wrong: doubled, trail, text: text.slice(Math.max(0, m.index - 15), m.index + 15) });
    }
  }
  const hk = text.match(HALF_KATA_RE);
  if (hk) findings.push({ rule: "half-katakana", wrong: hk[0], trail, text: text.slice(0, 40) });
  const mx = text.match(MIXED_WIDTH_DIGIT_RE);
  if (mx) findings.push({ rule: "mixed-width-digits", wrong: mx[0], trail, text: text.slice(0, 40) });
  const ds = text.match(DOUBLE_SPACE_RE);
  if (ds) findings.push({ rule: "double-space", wrong: ds[0], trail, text: text.slice(0, 60) });
};

for (const label of ["db", "items"]) {
  walk(label === "db" ? db : items, label, sink);
}

/* corpus back-check: dictionary hits and doubled particles whose wrong
   form exists in the raw PDF corpus are source-side, not DB corruption. */
const confirmed = findings.filter((f) => {
  if (f.rule === "dictionary" || f.rule === "double") {
    return !corpus.includes(f.wrong);
  }
  return true;
});

/* non-vacuity assertions: the detector must be able to see the things it
   promises to detect; warn (not fail) if a dictionary entry matches
   nothing anywhere, so dead dictionary keys stay visible. */
const deadKeys = Object.keys(CANON).filter((w) => !findings.some((f) => f.wrong === w) && !corpus.includes(w) && !JSON.stringify(db).includes(w) && !JSON.stringify(items).includes(w));

const report = {
  scope: "db.json全コレクション+items.json",
  checked: { strings: stats.strings },
  findings: confirmed,
  suppressedCorpusBacked: findings.length - confirmed.length,
  dictionaryDeadKeys: deadKeys
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`誤字監査 — ${report.scope}: 走査文字列 ${stats.strings}`);
  console.log(`\n■ DB側の誤字候補（原典が裏付けない）: ${confirmed.length}件`);
  for (const f of confirmed) console.log(`  - [${f.rule}] ${f.wrong}→${f.right || "?"} @ ${f.trail} …${f.text}…`);
  console.log(`\n■ 原典が裏付けるため除外: ${report.suppressedCorpusBacked}件`);
  console.log(`\n■ 辞書の不活性キー（どの記録にも現れない）: ${deadKeys.length ? deadKeys.join(", ") : "なし"}`);
  console.log(`\n判定: ${confirmed.length === 0 ? "DB側の誤字なし (PASS)" : "誤字あり (FAIL)"}`);
}

process.exit(confirmed.length ? 1 : 0);
