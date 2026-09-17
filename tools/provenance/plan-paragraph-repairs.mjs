#!/usr/bin/env node
/* 段落照合（audit-db-paragraphs.mjs）の指摘から、repairs.json の追記案を作る。

   修正は「原典が改段している位置へ改行を戻す」だけで、文字は一切変えない。
   after は原典の段落をそのまま改行で連ねたものになる。
   before が現在のDB本文と一致しない案は出さない（apply-repairs.mjs が中止するため）。

   出力をそのまま repairs.json の entries へ足せる形で書き出す。

   使い方:
     node tools/provenance/plan-paragraph-repairs.mjs            # 件数と内容を確認
     node tools/provenance/plan-paragraph-repairs.mjs --write    # repairs.json へ追記 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRuntime, collectDbTexts } from "./pipeline-harness.mjs";
import { auditDbParagraphs } from "./db-paragraphs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repairsPath = path.join(here, "repairs.json");
const write = process.argv.includes("--write");

const runtime = loadRuntime();
const { merged } = auditDbParagraphs(collectDbTexts(runtime.db), runtime.timingMarkerWords);

/* 監査が報告する項目パスから、repairs.json の target 形式へ変換する。

     通常/黒獣-卯/スキル4「刻呪殺剣」/効果       -> { kind:"skill", rank, name, field:"effect" }
     通常/黒獣-巳/固有バフ「巳腕」                -> { kind:"buff", name, field:"desc" }
     特異/夜明事務所代表/passive_effect          -> { kind:"persona", field }
     特異/…/スキル2「…」/ダイス2                -> { kind:"dice", rank, name, index, field:"effect" } */
function parsePath(itemPath) {
  const parts = itemPath.split("/");
  const kind = parts[0];

  /* E.G.Oは人格に属さない独立したレコード。
     名称に「：」を含むが、項目パスの区切りは「/」なので誤らない。

       E.G.O/火柱：無数の生贄/kakusei/効果      -> 覚醒の効果
       E.G.O/桃色の欲望：桃色の靴/unique_buff  -> E.G.Oの固有バフ
       E.G.O/…/kakusei/ダイス1                 -> 覚醒のダイス効果 */
  if (kind === "E.G.O") {
    const ego = parts[1];
    const rest = parts.slice(2);
    if (rest.length === 1 && (rest[0] === "unique_buff" || rest[0] === "passive_effect")) {
      return { ego, target: { kind: "ego", field: rest[0] } };
    }
    // 同化スキルは E.G.O の sub_skills にあり、表示順の番号で指す。
    const sub = /^\u540C\u5316(\d+)\u300C(.*)\u300D$/.exec(rest[0]);
    if (sub && rest[1] === "\u52B9\u679C") {
      return { ego, target: { kind: "egoSub", index: Number(sub[1]), name: sub[2], field: "effect" } };
    }
    const form = rest[0];
    if (form !== "kakusei" && form !== "shinshoku") return null;
    if (rest[1] === "\u52B9\u679C") {
      return { ego, target: { kind: "ego", form, field: "effect" } };
    }
    const egoDice = /^\u30C0\u30A4\u30B9(\d+)$/.exec(rest[1] || "");
    if (egoDice) {
      return { ego, target: { kind: "egoDice", form, index: Number(egoDice[1]), field: "effect" } };
    }
    return null;
  }

  if (kind !== "\u901A\u5E38" && kind !== "\u7279\u7570") return null;
  const persona = parts[1];
  const rest = parts.slice(2);

  if (rest.length === 1 && /^passive_(effect|always)$/.test(rest[0])) {
    return { persona, target: { kind: "persona", field: rest[0] } };
  }
  const buff = /^\u56FA\u6709\u30D0\u30D5\u300C(.*)\u300D$/.exec(rest[0]);
  if (buff && rest.length === 1) {
    return { persona, target: { kind: "buff", name: buff[1], field: "desc" } };
  }
  const skill = /^(\u30B9\u30AD\u30EB[\w\-]*)\u300C(.*)\u300D$/.exec(rest[0]);
  if (!skill) return null;
  const [, rank, name] = skill;
  if (rest[1] === "\u52B9\u679C") {
    return { persona, target: { kind: "skill", rank, name, field: "effect" } };
  }
  const dice = /^\u30C0\u30A4\u30B9(\d+)$/.exec(rest[1] || "");
  if (dice) {
    return { persona, target: { kind: "dice", rank, name, index: Number(dice[1]), field: "effect" } };
  }
  return null;
}

const entries = [];
const unsupported = [];
for (const finding of merged) {
  const parsed = parsePath(finding.path);
  if (!parsed) {
    unsupported.push(finding.path);
    continue;
  }
  entries.push({
    ...(parsed.ego ? { ego: parsed.ego } : { persona: parsed.persona }),
    target: parsed.target,
    source: `${finding.source} p.${finding.page}`,
    reason: "\u539F\u5178\u304C\u6539\u6BB5\u3057\u3066\u3044\u308B\u4F4D\u7F6E\u3067\u6539\u884C\u304C\u843D\u3061\u3066\u3044\u305F\u3002\u7D44\u7248\u60C5\u5831\u304B\u3089\u5FA9\u5143\u3057\u305F\u6BB5\u843D\u3078\u623B\u3059\uFF08\u6587\u5B57\u306F\u5909\u3048\u306A\u3044\uFF09\u3002",
    before: finding.fieldBefore,
    after: finding.fieldAfter
  });
}

console.log(`\u6BB5\u843D\u306E\u5FA9\u5143\u6848: ${entries.length}\u4EF6`);
if (unsupported.length) {
  console.log(`\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u9805\u76EE\u30D1\u30B9: ${unsupported.length}\u4EF6`);
  unsupported.forEach((item) => console.log(`  ${item}`));
}
for (const entry of entries.slice(0, 5)) {
  console.log(`\n  ${entry.persona} / ${JSON.stringify(entry.target)}  (${entry.source})`);
  console.log(`    before: ${entry.before}`);
  console.log(`    after : ${entry.after.replace(/\n/g, " \u23CE ")}`);
}
if (entries.length > 5) console.log(`\n  … \u4ED6 ${entries.length - 5}\u4EF6`);

if (!write) {
  console.log("\n--write \u3092\u4ED8\u3051\u308B\u3068 repairs.json \u3078\u8FFD\u8A18\u3057\u307E\u3059\u3002");
  process.exit(0);
}

const repairs = JSON.parse(readFileSync(repairsPath, "utf8"));
repairs.entries.push(...entries);
writeFileSync(repairsPath, `${JSON.stringify(repairs, null, 2)}\n`, "utf8");
console.log(`\nrepairs.json \u3078 ${entries.length}\u4EF6\u3092\u8FFD\u8A18\u3057\u307E\u3057\u305F\uFF08\u5408\u8A08 ${repairs.entries.length}\u4EF6\uFF09\u3002`);
console.log("node tools/provenance/apply-repairs.mjs --write \u3067\u9069\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
