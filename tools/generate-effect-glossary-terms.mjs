/*
  Regenerates the OFFICIAL_TERMS block in js/InlineEffectGlossary.js from the
  provenance audit. The popover must show the printed definition, never a
  hand-written summary, so this file is the only place the table is edited.

  Run: node tools/generate-effect-glossary-terms.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = resolve(ROOT, "data/provenance/three-book-audit.json");
const TARGET = resolve(ROOT, "js/InlineEffectGlossary.js");
const BEGIN = "  // BEGIN GENERATED: tools/generate-effect-glossary-terms.mjs";
const END = "  // END GENERATED";

// p.303 terms. They are not in the p.304-312 glossary table, but effect texts
// use them and the old hand-written versions were paraphrases, so keep the
// printed wording verbatim.
const PAGE_303_TERMS = [
  ["状態", "バフ・デバフを1以上持っている場合のことを、そのバフ・デバフ名の後ろに「状態」とつけて呼びます。例：出血状態、火傷状態"],
  ["持ち越し", "「持ち越し」は、[1R]持続のバフ・デバフを指定の数だけ、次のRまで持続させる処理です。"],
  ["中立バフ", "有利・不利両方の効果を併せ持ったものや、それ自体には効果が無いもの、特殊な動作をするものは、バフ・デバフとは別に、中立バフという枠組みに分類されます。"]
];

// p.314 特殊処理一覧. These two are not in the p.304-312 glossary table, but
// they are the terms that appear inside the status definitions above.
const SPECIAL_PROCESS_TERMS = [
  ["破裂爆発", "対象の破裂の数だけHPダメージを与える"],
  ["振動爆発", "対象の振動の数だけSANダメージを与える"]
];

const audit = JSON.parse(readFileSync(AUDIT, "utf8"));
const entries = audit.glossary_definitions.map((definition) => ({
  name: definition.data.name,
  group: definition.printed_category,
  source: "基本ルール p." + definition.pages.join("／"),
  text: definition.data.desc
}));
for (const [name, text] of PAGE_303_TERMS) {
  entries.push({ name, group: "用語", source: "基本ルール p.303", text });
}
for (const [name, text] of SPECIAL_PROCESS_TERMS) {
  entries.push({ name, group: "特殊処理", source: "基本ルール p.314", text });
}

const lines = [BEGIN, "  // Verbatim definitions: p.303 from layout_full.txt, p.304-312 from three-book-audit.json, p.314 from layout_full.txt.", "  const OFFICIAL_TERMS = {"];
for (const entry of entries) {
  lines.push(
    "    " + JSON.stringify(entry.name) + ": { group: " + JSON.stringify(entry.group) +
    ", source: " + JSON.stringify(entry.source) + ", text: " + JSON.stringify(entry.text) + " },"
  );
}
lines.push("  };", END);

const source = readFileSync(TARGET, "utf8");
const start = source.indexOf(BEGIN);
const end = source.indexOf(END);
let next;
if (start >= 0 && end > start) {
  next = source.slice(0, start) + lines.join("\n") + source.slice(end + END.length);
} else {
  const fallbackStart = source.indexOf("  const OFFICIAL_TERMS = {");
  const fallbackEnd = source.indexOf("  const escapeRegExp =");
  if (fallbackStart < 0 || fallbackEnd < fallbackStart) {
    throw new Error("OFFICIAL_TERMS block not found");
  }
  next = source.slice(0, fallbackStart) + lines.join("\n") + "\n\n" + source.slice(fallbackEnd);
}
writeFileSync(TARGET, next, "utf8");
console.log("wrote " + entries.length + " official terms");
