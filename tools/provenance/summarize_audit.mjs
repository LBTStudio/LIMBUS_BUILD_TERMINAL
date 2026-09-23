#!/usr/bin/env node
/* G6: Summarize audit issues by persona path and label.
   Reuses existing audit output; no new audit logic.
   Usage: node tools/provenance/summarize_audit.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";

const buf = readFileSync("/tmp/audit_new_full.txt");
const text = buf.toString("utf16le").replace(/\u0000/g, "");

const issueRe = /\n  (.+?) :: (.+?)\n    (.+?)(?=\n  .+? :: |\n\n■|$)/gs;
const issues = [];
let m;
while ((m = issueRe.exec(text)) !== null) {
  issues.push({ path: m[1].trim(), label: m[2].trim(), body: m[3].trim() });
}

console.log(`Total issues: ${issues.length}`);

const byLabel = {};
for (const i of issues) {
  (byLabel[i.label] ||= []).push(i);
}
console.log(`\nBy label type:`);
for (const [label, items] of Object.entries(byLabel).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${label}: ${items.length}`);
}

const byKind = {};
for (const i of issues) {
  const kind = i.path.startsWith("E.G.O") ? "E.G.O" : i.path.startsWith("特異") ? "特異" : "通常";
  (byKind[kind] ||= []).push(i);
}
console.log(`\nBy kind:`);
for (const [kind, items] of Object.entries(byKind)) {
  console.log(`  ${kind}: ${items.length}`);
}

console.log(`\nFirst 15 issues:`);
issues.slice(0, 15).forEach((i, n) => {
  const bodyPreview = i.body.length > 120 ? i.body.slice(0, 120) + "…" : i.body;
  console.log(`  ${n + 1}. ${i.path} :: ${i.label}`);
  console.log(`     ${bodyPreview}`);
});

// Write classified JSON for later reference
const out = {
  total: issues.length,
  byLabel: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, v.length])),
  byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
  issues: issues.map(i => ({ path: i.path, label: i.label, body: i.body.slice(0, 200) }))
};
writeFileSync("/tmp/classified_issues.json", JSON.stringify(out, null, 2));
console.log(`\nWrote /tmp/classified_issues.json`);