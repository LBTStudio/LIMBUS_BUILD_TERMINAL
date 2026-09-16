#!/usr/bin/env node
/* DB本文が原典PDFに実在するかを監査し、差分を人格名・項目パス付きで報告する。

   使い方:
     node tools/audit-db-provenance.mjs            # 破損（missing）のみ表示
     node tools/audit-db-provenance.mjs --all      # 他頁からの引用も表示
     node tools/audit-db-provenance.mjs --json     # 機械処理向けのJSON出力

   終了コードは、例外登録されていない破損が1件以上あれば1になる。 */
import { auditPersonas, loadCorpus, loadDb, loadExceptions, isExcepted } from "./db-provenance.mjs";

const args = new Set(process.argv.slice(2));
const showAll = args.has("--all");
const asJson = args.has("--json");

const corpus = loadCorpus();
const db = loadDb();
const exceptions = loadExceptions();
const findings = auditPersonas(db, corpus);

const needsFix = (code) => code === "missing" || code === "truncated";
const missing = findings.filter((f) => f.code === "missing" && !isExcepted(f, exceptions));
const truncated = findings.filter((f) => f.code === "truncated" && !isExcepted(f, exceptions));
const excepted = findings.filter((f) => needsFix(f.code) && isExcepted(f, exceptions));
const quoted = findings.filter((f) => f.code === "quoted-elsewhere");
const pageless = findings.filter((f) => f.code === "page-not-found");
const fixCount = missing.length + truncated.length;

if (asJson) {
  console.log(JSON.stringify({ missing, truncated, excepted, quoted, pageless }, null, 2));
  process.exit(fixCount || pageless.length ? 1 : 0);
}

const label = (f) => `${f.mode}/${f.persona} :: ${f.label}`;

if (pageless.length) {
  console.log(`\n■ 紙面が見つからない人格: ${pageless.length}件`);
  pageless.forEach((f) => console.log(`  - ${f.mode}/${f.persona}`));
}

console.log(`\n■ 原典に存在しない本文（要修正）: ${missing.length}件`);
missing.forEach((f) => {
  console.log(`\n  ${label(f)}`);
  console.log(`    ${f.text.replace(/\n/g, " ⏎ ")}`);
});

console.log(`\n■ 原典の途中で切れている本文（要修正）: ${truncated.length}件`);
truncated.forEach((f) => {
  console.log(`\n  ${label(f)}`);
  console.log(`    DB  : ${f.text.replace(/\n/g, " ⏎ ")}`);
  console.log(`    原典: \u2026${f.continuation}`);
});

if (excepted.length) {
  console.log(`\n■ 例外登録済み: ${excepted.length}件`);
  excepted.forEach((f) => console.log(`  - ${label(f)}`));
}

console.log(`\n■ 他頁に記載のある本文（用語集等からの引用）: ${quoted.length}件${showAll ? "" : "（--all で一覧）"}`);
if (showAll) {
  quoted.forEach((f) => {
    console.log(`\n  ${label(f)}  [${f.source}]`);
    console.log(`    ${f.text.replace(/\n/g, " ⏎ ")}`);
  });
}

console.log(`\n照合対象の差分: ${findings.length}件 / 要修正: ${fixCount}件（不在${missing.length} + 切断${truncated.length}）`);
process.exit(fixCount || pageless.length ? 1 : 0);
