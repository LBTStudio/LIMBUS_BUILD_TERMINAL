#!/usr/bin/env node
/* Simulate shop_ranges() last_table logic against the pack1 corpus to
   verify the fix without needing pymupdf/python in this environment.
   Usage: node tools/provenance/verify_shop_ranges.mjs
*/
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const corpus = readFileSync(`${ROOT}/data/provenance/pack1.txt`, "utf8");

// Parse page markers like the real pipeline does
const lines = corpus.split(/\r?\n/);
const pageMarkers = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^===== PAGE (\d+) =====$/);
  if (m) pageMarkers.push({ page: parseInt(m[1], 10), line: i });
}

// Build per-page text (raw lines between markers)
const pages = [];
for (let pi = 0; pi < pageMarkers.length; pi++) {
  const start = pageMarkers[pi].line + 1;
  const end = pi + 1 < pageMarkers.length ? pageMarkers[pi + 1].line : lines.length;
  const text = lines.slice(start, end).join("\n");
  pages.push({ page: pageMarkers[pi].page, lines: lines.slice(start, end), text });
}

// Find section start (heading "ショップ" on its own line)
let shopStart = null;
for (const p of pages) {
  for (const l of p.lines) {
    if (l.trim() === "ショップ") { shopStart = p.page; break; }
  }
  if (shopStart) break;
}
if (!shopStart) { console.error("shop section not found"); process.exit(1); }

// Build heading strings from code points to avoid encoding corruption
// サポートパassiブ = U+30B5 U+30DD U+30FC U+30C8 U+30D1 U+30C3 U+30B7 U+30D6
const HEADING_SUPPORT = String.fromCharCode(0x30B5, 0x30DD, 0x30FC, 0x30C8, 0x30D1, 0x30C3, 0x30B7, 0x30D6);
const HEADING_SPIRITS = "精神の種類";

// Find headings
const headings = {};
for (const p of pages) {
  if (p.page < shopStart) continue;
  for (const l of p.lines) {
    const t = l.trim();
    if (t === HEADING_SUPPORT || t === HEADING_SPIRITS) {
      headings[t] = p.page;
    }
  }
}
console.log("shopStart:", shopStart);
console.log("headings:", headings);

const supportKey = headings[HEADING_SUPPORT] !== undefined ? HEADING_SUPPORT : null;
if (!supportKey) {
  console.error("MISSING support passive heading - fix is NOT working");
  process.exit(1);
}
const support = headings[supportKey];
const spirits = headings[HEADING_SPIRITS];
console.log("support page:", support, "spirits page:", spirits);

// Simulate last_table detection using vertical column detection proxy:
// count lines that look like table rows (contain 「：」 or 「」」 and have price-like tokens)
function hasTwoColumns(page) {
  // Proxy: look for lines containing a colon 「：」 (table body rows) AND a price suffix
  let tableRows = 0;
  for (const l of page.lines) {
    if (/[：:]/.test(l) && /(\d+)(LP|欠片)/.test(l)) tableRows++;
  }
  return tableRows >= 2;
}

// Find last page in shop range with table-like content
const shopPages = pages.filter(p => p.page >= shopStart);
const maxPage = shopPages[shopPages.length - 1].page;

let lastTable = spirits;
for (const p of pages) {
  if (p.page < spirits || p.page > maxPage) continue;
  if (hasTwoColumns(p)) lastTable = p.page;
  else break;
}
console.log("last_table (proxy):", lastTable);
console.log("spirits range:", spirits, "to", lastTable);
console.log("post-table pages (unresolved by design):");
for (const p of pages) {
  if (p.page > lastTable && p.page <= maxPage) {
    const sample = p.lines.slice(0, 3).map(l => l.trim()).join(" | ");
    console.log(`  page ${p.page}: ${sample.slice(0, 100)}`);
  }
}

// Check what's on pages 225-230
console.log("\n--- Pages 225-230 content preview ---");
for (const p of pages) {
  if (p.page >= 225 && p.page <= 230) {
    const sample = p.lines.slice(0, 6).map(l => l.trim()).join(" | ");
    console.log(`page ${p.page}: ${sample.slice(0, 150)}`);
  }
}