#!/usr/bin/env node
/* DB本文が原典PDFの段落構造を保っているかを監査する（docs/output-fidelity-goal.md の G3）。

   先行の audit-db-text.mjs は canon() で比較前に改行を除去するため、
   「原典が2段落で書いた本文をDBが1段落へ連結している」型の破損を
   定義上検出できない。この監査はその死角を埋める。

   照合には組版情報から段落境界を復元したコーパス
   （data/provenance/*.paragraphs.txt）を使う。

   報告する破損は二種類。

     連結  原典が改段している位置で、DBが改行を落としている
     分断  原典が一文で書いている位置に、DBが改行を入れている

   どちらも出力の読みやすさに直結する。連結は発動タイミング見出しが
   前の文へ続いて表示され、分断は一文が途中で切れて表示される。

   使い方:
     node tools/provenance/audit-db-paragraphs.mjs
     node tools/provenance/audit-db-paragraphs.mjs --json */
import { loadRuntime, collectDbTexts } from "./pipeline-harness.mjs";
import { auditDbParagraphs } from "./db-paragraphs.mjs";

const asJson = process.argv.includes("--json");
const runtime = loadRuntime();
const { checked, merged, split } = auditDbParagraphs(collectDbTexts(runtime.db), runtime.timingMarkerWords);

if (asJson) {
  console.log(JSON.stringify({ checked, merged, split }, null, 2));
  process.exit(merged.length + split.length ? 1 : 0);
}

console.log(`\u7167\u5408\u3057\u305F\u672C\u6587: ${checked}\u4EF6`);

console.log(`\n\u25A0 \u539F\u5178\u304C\u6539\u6BB5\u3057\u3066\u3044\u308B\u4F4D\u7F6E\u3067DB\u304C\u9023\u7D50\u3057\u3066\u3044\u308B\uFF08\u8981\u4FEE\u6B63\uFF09: ${merged.length}\u4EF6`);
for (const finding of merged) {
  console.log(`\n  ${finding.path}  (${finding.source} p.${finding.page})`);
  console.log(`    DB  : ${finding.text}`);
  finding.paragraphs.forEach((paragraph) => console.log(`    \u539F\u5178: ${paragraph}`));
}

console.log(`\n\u25A0 \u539F\u5178\u304C\u4E00\u6587\u3067\u66F8\u3044\u3066\u3044\u308B\u4F4D\u7F6E\u3067DB\u304C\u5206\u65AD\u3057\u3066\u3044\u308B\uFF08\u8981\u4FEE\u6B63\uFF09: ${split.length}\u4EF6`);
for (const finding of split) {
  console.log(`\n  ${finding.path}  (${finding.source} p.${finding.page})`);
  console.log(`    DB  : ${finding.text}`);
  console.log(`    \u539F\u5178: ${finding.paragraph}`);
}

const total = merged.length + split.length;
console.log(`\n\u8981\u4FEE\u6B63: ${total}\u4EF6\uFF08\u9023\u7D50${merged.length} + \u5206\u65AD${split.length}\uFF09`);
if (!total) console.log("DB\u672C\u6587\u306F\u539F\u5178\u306E\u6BB5\u843D\u69CB\u9020\u3092\u4FDD\u3063\u3066\u3044\u307E\u3059\u3002");
process.exit(total ? 1 : 0);
