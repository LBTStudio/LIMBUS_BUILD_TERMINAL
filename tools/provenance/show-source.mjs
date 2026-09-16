#!/usr/bin/env node
/* 指摘された項目について、原典PDFの該当紙面をそのまま表示する。
   DB本文の修正時に、紙面の記載を確認するために使う。

   使い方:
     node tools/provenance/show-source.mjs "N社握る者"
     node tools/provenance/show-source.mjs "N社握る者" --raw   # 行見出しを除かない */
import { loadCorpus, canon, findPersonaPages } from "./db-provenance.mjs";

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error('使い方: node tools/provenance/show-source.mjs "人格名" [--raw]');
  process.exit(2);
}

const corpus = loadCorpus();
const pages = findPersonaPages(corpus, name, { raw });
if (!pages.length) {
  console.error(`紙面が見つかりません: ${name}`);
  console.error(`（照合キー: ${canon(name)}）`);
  process.exit(1);
}
for (const page of pages) {
  console.log(`\n===== ${page.source} PAGE ${page.page} =====`);
  console.log(page.text);
}
