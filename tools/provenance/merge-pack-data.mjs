#!/usr/bin/env node
/* 照合済みのパック抽出データを data/db.json へ取り込む。

   取り込む前に verify-pack-extract.mjs を通しておくこと。
   この道具は「追加」だけを行い、既存のレコードには一切触れない。

   取り込みを拒む条件（どれも取り違えの兆候である）
     - 抽出データの件数・番号が期待と違う
     - 既存レコードと名前が衝突している
     - 既存レコードと番号が衝突している
     - 項目の構成（キー）が既存レコードと違う

   使い方:
     node tools/provenance/merge-pack-data.mjs          # 追加内容を確認する
     node tools/provenance/merge-pack-data.mjs --write  # data/db.json を更新する */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dbPath = path.join(root, "data", "db.json");
const write = process.argv.includes("--write");

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const extracted = JSON.parse(
  readFileSync(path.join(root, "data", "provenance", "pack1-extracted.json"), "utf8")
);

/* 各区分の期待値。パックは基本ルールブックからの続き番号である。 */
const SECTIONS = [
  { key: "normal_personas", label: "\u901A\u5E38\u4EBA\u683C", from: 111, count: 35 },
  { key: "tokui_personas", label: "\u7279\u7570\u4EBA\u683C", from: 21, count: 34 },
  { key: "egos", label: "E.G.O", from: 101, count: 15 }
];

const problems = [];

for (const section of SECTIONS) {
  const current = db[section.key] || [];
  const incoming = extracted[section.key] || [];

  if (incoming.length !== section.count) {
    problems.push(`${section.label}: \u62BD\u51FA\u4EF6\u6570\u304C${incoming.length}\u4EF6\uFF08\u671F\u5F85 ${section.count}\u4EF6\uFF09`);
  }

  const numbers = incoming.map((row) => row.no).sort((a, b) => a - b);
  const expected = Array.from({ length: incoming.length }, (_, at) => section.from + at);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    problems.push(`${section.label}: \u756A\u53F7\u304C\u9023\u7D9A\u3057\u3066\u3044\u306A\u3044`);
  }

  const currentNames = new Set(current.map((row) => row.name));
  const currentNumbers = new Set(current.map((row) => row.no));
  for (const row of incoming) {
    if (currentNames.has(row.name)) {
      problems.push(`${section.label}: \u540D\u524D\u304C\u65E2\u5B58\u3068\u885D\u7A81 \u300C${row.name}\u300D`);
    }
    if (currentNumbers.has(row.no)) {
      problems.push(`${section.label}: \u756A\u53F7\u304C\u65E2\u5B58\u3068\u885D\u7A81 No.${row.no}`);
    }
  }

  /* 項目の構成が既存と違えば、抽出器がDBの形から外れている。

     「既存にある項目」と「無いと困る項目」は別物である。
     - 既知の項目 = 既存レコードのどれかが持つ項目の和集合。
       これに無いキーが来たら、抽出器がDBに無い名前を作っている。
     - 必須の項目 = 既存レコードの全てが持つ項目の積集合。
       一部のレコードだけが持つ項目（E.G.Oの sub_skills、特異人格の effect など）は
       任意項目であり、無いことが誤りではない。

     和集合を必須として扱うと、任意項目まで要求してしまう。実際に特異人格20件中
     7件しか持たない effect を「欠けている」と報告して取り込みを拒んでいた。
     どれを任意とみなすかを手で列挙すると、列挙漏れが次の誤判定になる。
     既存データの形そのものから導く。 */
  const knownKeys = new Set(current.flatMap((row) => Object.keys(row)));
  const requiredKeys = current.length
    ? [...knownKeys].filter((key) => current.every((row) => key in row))
    : [];
  for (const row of incoming) {
    const extra = Object.keys(row).filter((key) => !knownKeys.has(key));
    if (extra.length) problems.push(`${section.label}\u300C${row.name}\u300D: \u65E2\u5B58\u306B\u306A\u3044\u9805\u76EE ${extra.join(", ")}`);
    const missing = requiredKeys.filter((key) => !(key in row));
    if (missing.length) problems.push(`${section.label}\u300C${row.name}\u300D: \u9805\u76EE\u304C\u6B20\u3051\u3066\u3044\u308B ${missing.join(", ")}`);
  }
}

for (const section of SECTIONS) {
  const incoming = extracted[section.key] || [];
  console.log(`${section.label}: ${(db[section.key] || []).length}\u4EF6 + ${incoming.length}\u4EF6`
    + (incoming.length ? ` (No.${incoming[0].no}\u301C No.${incoming[incoming.length - 1].no})` : ""));
}

if (problems.length) {
  console.log(`\n\u25A0 \u53D6\u308A\u8FBC\u3081\u307E\u305B\u3093: ${problems.length}\u4EF6`);
  problems.forEach((problem) => console.log(`  - ${problem}`));
  process.exit(1);
}

if (!write) {
  console.log("\n\u554F\u984C\u306A\u3057\u3002--write \u3092\u4ED8\u3051\u308B\u3068 data/db.json \u3092\u66F4\u65B0\u3057\u307E\u3059\u3002");
  process.exit(0);
}

for (const section of SECTIONS) {
  db[section.key] = [...(db[section.key] || []), ...(extracted[section.key] || [])];
}

writeFileSync(dbPath, `${JSON.stringify(db, null, 1)}\n`, "utf8");
console.log("\ndata/db.json \u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002");
SECTIONS.forEach((section) => console.log(`  ${section.label}: ${db[section.key].length}\u4EF6`));
