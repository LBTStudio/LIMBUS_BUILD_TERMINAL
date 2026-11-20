#!/usr/bin/env node
/* Layout differences are evidence, not semantic judgements. A joined DB cell
   is valid if the consumer can display its full content without losing the
   effect's ownership. Only splits / missing rendered boundaries fail here. */
import { loadRuntime, collectDbTexts } from "./pipeline-harness.mjs";
import { auditDbParagraphs } from "./db-paragraphs.mjs";
import { canon } from "./db-provenance.mjs";

const runtime = loadRuntime();
const { checked, merged, split } = auditDbParagraphs(collectDbTexts(runtime.db), runtime.timingMarkerWords);
const rendered = merged.map((finding) => {
  const actual = runtime.splitEffectLinesPlain(finding.text).map(canon);
  // Layout-derived paragraphs may themselves be physical wraps. Check the
  // consumer's text and order, not equality of those uncertain boundaries.
  // This is not semantic approval; real output routes are audited separately.
  const represented = actual.join("") === canon(finding.text);
  return { ...finding, severity: represented ? "layout-only" : "consumer-review" };
});
const unresolved = rendered.filter((finding) => finding.severity === "consumer-review");
const report = { checked, layoutDifferences: rendered, split, unresolved };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`照合本文: ${checked}件`);
  console.log(`原典とDBの連結差（DB修正を要求しない）: ${merged.length}件`);
  console.log(`参照・表示側の要確認: ${unresolved.length}件 / 一文の分断候補: ${split.length}件`);
  for (const finding of [...rendered, ...split]) {
    console.log(`\n${finding.severity || "split-review"}: ${finding.path} (${finding.source} p.${finding.page})`);
    console.log(finding.text);
  }
}
process.exit(unresolved.length + split.length ? 1 : 0);
