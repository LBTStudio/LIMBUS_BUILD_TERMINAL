#!/usr/bin/env node
/* 出力生成が原典の段落構造を保っているかを監査する（docs/output-fidelity-goal.md の G1・G2）。

   先行の audit-output-lossless.mjs は splitEffectLinesPlain() を直接呼び、
   その戻り値だけを検査していた。しかし利用者が受け取るのは
   buildPalette / buildMemo / buildCcfoliaJSON / buildShareSheetHTML の出力である。

   ダイス効果はこの分割器を一度も通らず、sanitizeInline() が改行を空白へ
   置換したうえで連結されていた。監査が通る経路と出力の経路が別だったため、
   「N社握らんとする者」戦術4の `敵討伐時` が改行されない事象を検出できなかった。

   この監査は分割器ではなく実出力を対象にする。全人格を実際に装備し、
   4経路すべての出力に、DB本文の段落境界がその経路の改行表現で現れることを確かめる。

   使い方:
     node tools/provenance/audit-output-paragraphs.mjs
     node tools/provenance/audit-output-paragraphs.mjs --json */
import { loadRuntime, equipPersona } from "./pipeline-harness.mjs";
import { auditOutputParagraphs, PATH_LABELS } from "./output-paragraphs.mjs";

const asJson = process.argv.includes("--json");
const runtime = loadRuntime();
const { checked, findings } = auditOutputParagraphs(runtime, equipPersona);

if (asJson) {
  console.log(JSON.stringify({ checked, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`\u691c\u67FB\u3057\u305F\u6BB5\u843D\u5883\u754C: ${checked}\u4EF6\uFF08\u4EBA\u683C\u3092\u5B9F\u969B\u306B\u88C5\u5099\u3057\u30014\u7D4C\u8DEF\u3092\u7167\u5408\uFF09`);
console.log(`\u691c\u51FA: ${findings.length}\u4EF6`);
for (const finding of findings) {
  console.log(`\n[${finding.route}] ${PATH_LABELS[finding.route] || ""}`);
  console.log(`  ${finding.path}`);
  console.log(`  \u539F\u5178\u306E\u6BB5\u843D: \u300C…${finding.before}\u300D\u3068\u300C${finding.after}…\u300D\u306E\u9593`);
  console.log(`  \u51FA\u529B: ${finding.excerpt}`);
}
if (!findings.length) {
  console.log("\n\u51FA\u529B\u306F\u539F\u5178\u306E\u6BB5\u843D\u69CB\u9020\u3092\u4FDD\u3063\u3066\u3044\u307E\u3059\u3002");
}
process.exit(findings.length ? 1 : 0);
