#!/usr/bin/env node
/* Show the corpus structure around persona entries to understand how
   affiliation lines relate to persona names. Usage:
   node tools/provenance/show_corpus_structure.mjs [page]
*/
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/core.txt`, "utf8");
const parts = corpus.split(/===== PAGE (\d+) =====/);
const pages = [];
for (let i = 1; i < parts.length; i += 2) {
  pages.push({ page: parseInt(parts[i], 10), text: parts[i + 1] || "" });
}

const targetPage = parseInt(process.argv[2], 10) || 57;
const page = pages.find(p => p.page === targetPage);
if (!page) {
  console.log(`Page ${targetPage} not found`);
  process.exit(1);
}

console.log(`=== Page ${targetPage} ===`);
const lines = page.text.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t) console.log(`  ${i}: ${t}`);
}