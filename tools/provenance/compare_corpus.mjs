#!/usr/bin/env node
/* G1: Compare old (tracked PDF) corpus against new errata corpus page-by-page.
   Usage: node tools/provenance/compare_corpus.mjs <key>
*/
import { readFileSync, existsSync } from "node:fs";

const ROOT = process.cwd();
const keys = process.argv.slice(2).length ? process.argv.slice(2) : ["core", "supplement", "pack1"];

function splitPages(text) {
  const parts = text.split(/===== PAGE (\d+) =====/);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ page: parseInt(parts[i], 10), text: parts[i + 1] || "" });
  }
  return out;
}

function norm(s) { return s.replace(/\s+/g, ""); }

function snippet(text, max = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function diffMid(o, n) {
  const a = norm(o), b = norm(n);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return { prefix, suffix, oldMid: a.slice(prefix, a.length - suffix), newMid: b.slice(prefix, b.length - suffix) };
}

for (const key of keys) {
  const oldPath = `/tmp/new_${key}.txt`;
  const newPath = `${ROOT}/data/provenance/${key}.txt`;
  if (!existsSync(oldPath) || !existsSync(newPath)) {
    console.log(`${key}: missing corpus`);
    continue;
  }
  const oldPages = splitPages(readFileSync(oldPath, "utf8"));
  const newPages = splitPages(readFileSync(newPath, "utf8"));
  const oldMap = new Map(oldPages.map((p) => [p.page, p.text]));
  const newMap = new Map(newPages.map((p) => [p.page, p.text]));
  const allPages = new Set([...oldMap.keys(), ...newMap.keys()]);
  const report = { added: [], removed: [], changed: [], same: 0 };
  const changedDetails = [];
  for (const page of [...allPages].sort((a, b) => a - b)) {
    const o = oldMap.get(page);
    const n = newMap.get(page);
    if (!o && n) report.added.push(page);
    else if (o && !n) report.removed.push(page);
    else if (norm(o) !== norm(n)) {
      report.changed.push(page);
      changedDetails.push({ page, ...diffMid(o, n) });
    } else report.same++;
  }
  console.log(`\n=== ${key} ===`);
  console.log(`pages: old=${oldPages.length} new=${newPages.length} same=${report.same}`);
  console.log(`added: ${report.added.length}  removed: ${report.removed.length}  changed: ${report.changed.length}`);
  if (report.added.length) console.log(`  added: ${report.added.join(", ")}`);
  if (report.removed.length) console.log(`  removed: ${report.removed.join(", ")}`);
  for (const c of changedDetails.slice(0, 20)) {
    console.log(`  page ${c.page}: prefix=${c.prefix} suffix=${c.suffix}`);
    console.log(`    OLD-MID: ${snippet(c.oldMid, 140)}`);
    console.log(`    NEW-MID: ${snippet(c.newMid, 140)}`);
  }
}