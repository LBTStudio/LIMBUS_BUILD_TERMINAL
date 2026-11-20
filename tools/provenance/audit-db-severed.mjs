#!/usr/bin/env node
/* DBの本文が、原典の一文を途中で断ち切っていないかを調べる。

   これは `audit-db-paragraphs.mjs`（原典の段落構造との一致）とも
   `audit-db-text.mjs`（本文の実在と切断）とも別の問いである。

     audit-db-text        DBの本文が原典にあるか（DB → 原典）
     audit-db-paragraphs  DBの改段位置が原典と一致するか（対応の取れた本文のみ）
     この道具            DBの改行の各断片が、原典でも独立した段落なのか

   組版の折り返しを段落境界と読み違えると、一文の途中で改行が入る。

     原典   マッチ開始時、互いの出血ダメージ量+3。使用するスキルが色欲属性なら
            さらに互いの出血ダメージ量+2            ← 紙面の折り返し
     DB     …さらに互いの出血ダメー \n ジ量+2        ← 語の途中で切れている

   利用者から見ると本文が寸断されて読めない。出力（CCFOLIA）にもそのまま出る。

   判定は原典の段落を根拠にする。DBが改行で区切った各断片について、
   その断片が原典でも段落の切れ目と揃っているかを問う。
   揃っていなければ、原典が一文で組んでいる位置でDBが割っている。

     node tools/provenance/audit-db-severed.mjs
     node tools/provenance/audit-db-severed.mjs --json */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canon, loadDb } from "./db-provenance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS = ["core", "supplement", "pack1"];
const asJson = process.argv.includes("--json");

/* 原典の段落を、先頭・末尾の一致を高速に引けるようにして持つ。 */
function loadParagraphs() {
  const all = [];
  for (const key of CORPUS) {
    const file = path.join(root, "data", "provenance", `${key}.paragraphs.txt`);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const flat = canon(line);
      if (flat) all.push(flat);
    }
  }
  return all;
}

const paragraphs = loadParagraphs();
const paragraphSet = new Set(paragraphs);

/* 断片が原典の段落の切れ目と揃っているか。

   この道具が探すのは「原典の一文の途中でDBが改行している」ことだけである。
   言い回しの違い（`の内` と `のうち`）や、DBが複数の段落をまとめて
   一つの項目に持つことは、別の監査（audit-db-text / audit-db-paragraphs）の
   担当であり、ここで報告すると本来の問いが埋もれる。

   揃っているとみなすのは次のいずれか。
     - 断片がそのまま原典の段落である
     - 断片が段落の末尾で終わる（前に見出しやダイス表記が付いた形）
     - 断片が段落の先頭から始まる（後ろが別項目として切り出された形）
     - 断片が原典の段落を丸ごと含む（DBが複数の段落を一行にまとめた形）

   最後の一つが要る理由。

     原典   R開始時、ダメージ量増加1、HP回復量増加2と脆弱1を得る
            特殊スキルに使用される                    ← 別段落
     DB     R開始時、…脆弱1を得る。特殊スキルに使用される  ← 一行にまとめている

   これは連結であって分断ではない。分断を探す道具が連結を報告しては
   findings が混ざり、どちらも直せなくなる。 */
/* 断片と段落が、数文字の言い回しの差しかないか。

   原典  …パワー、忍耐、クイック、保護の内1つを…
   DB    …パワー、忍耐、クイック、保護のうち1つを…

   この差は転記の揺れであって分断ではない。分断かどうかを見るこの道具は、
   「断片が一文として完結しているか」だけを問えばよく、
   語が一致するかは audit-db-text の担当である。

   ここで距離を測るのは、完結した一文であることを確かめるためであって、
   差そのものを見逃すためではない。差は audit-db-text が別に報告する。 */
function nearlyWholeParagraph(fragment) {
  const slack = Math.max(2, Math.floor(fragment.length * 0.1));
  for (const paragraph of paragraphs) {
    if (Math.abs(paragraph.length - fragment.length) > slack) continue;
    let budget = slack;
    let at = 0;
    let bt = 0;
    while (at < fragment.length && bt < paragraph.length && budget >= 0) {
      if (fragment[at] === paragraph[bt]) { at++; bt++; continue; }
      budget--;
      // 置換・挿入・削除のどれかとして1文字ぶん進める。
      if (fragment.length - at > paragraph.length - bt) at++;
      else if (fragment.length - at < paragraph.length - bt) bt++;
      else { at++; bt++; }
    }
    budget -= (fragment.length - at) + (paragraph.length - bt);
    if (budget >= 0) return true;
  }
  return false;
}

/* 断片が原典の段落の切れ目と揃っているか。

   `last` は、その断片がDBの値の最後の行かどうか。
   これで許してよい形が変わる。

     断片が段落の先頭から始まる（`startsWith`）
       最後の行なら  → 原典の続きを別項目として切り出した形。正しい。
       途中の行なら  → 原典がまだ続いているのに次の行へ折り返している。分断。

   この区別が無いと、まさに分断である

     原典  自分が使うスキルの大罪の共鳴数が4以上ならダメージ量+2
     DB    自分が使うスキルの大罪の共鳴数が4以上ならダメ ⏎ ージ量+2

   の前半が「段落の先頭と揃っている」として見逃される。 */
function alignsWithParagraph(fragment, last) {
  if (paragraphSet.has(fragment)) return true;
  // 短い断片は何にでも当たるため、根拠として弱い。素の一致だけを認める。
  if (fragment.length < 4) return true;
  for (const paragraph of paragraphs) {
    // 段落の末尾で終わるなら、文はそこで終わっている。
    if (paragraph.endsWith(fragment)) return true;
    // 段落の途中までで終わってよいのは、値の最後の行だけ。
    if (last && paragraph.startsWith(fragment)) return true;
    /* 断片が原典の複数段落をまとめた形。末尾がどれかの段落の末尾と
       揃っていれば、文はそこで終わっている。

         原典  R開始時、…脆弱1を得る ／ 特殊スキルに使用される
         DB    R開始時、…脆弱1を得る。特殊スキルに使用される

       「丸ごと含む」だけでは不十分で、末尾が揃うことを要る。
       `マッチ勝利時` のような行見出しも独立した段落として現れるため、
       含むだけを根拠にすると `マッチ勝利時、対象が出血状態` のような
       文の途中で切れた断片まで通してしまう。 */
    if (paragraph.length >= 6 && fragment.length > paragraph.length
      && fragment.endsWith(paragraph)) return true;
  }
  return nearlyWholeParagraph(fragment);
}

const findings = [];
function walk(value, trail) {
  if (typeof value === "string") {
    if (!value.includes("\n")) return;
    const fragments = value.split("\n").map(canon).filter(Boolean);
    // 断片が1つしか無ければ、改行は空行であって分断ではない。
    if (fragments.length < 2) return;
    fragments.forEach((fragment, at) => {
      if (alignsWithParagraph(fragment, at === fragments.length - 1)) return;
      findings.push({ path: trail, fragment, text: value });
    });
  } else if (Array.isArray(value)) {
    value.forEach((item, at) => walk(item, `${trail}[${at}]`));
  } else if (value && typeof value === "object") {
    const label = value.name ? `(${value.name})` : "";
    for (const key of Object.keys(value)) walk(value[key], `${trail}${label}.${key}`);
  }
}

const db = loadDb();
for (const key of Object.keys(db)) walk(db[key], key);

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`\u539F\u5178\u306E\u4E00\u6587\u3092\u9014\u4E2D\u3067\u65AD\u3061\u5207\u3063\u3066\u3044\u308B\u672C\u6587: ${findings.length}\u4EF6`);
for (const finding of findings.slice(0, 40)) {
  console.log(`\n  ${finding.path}`);
  console.log(`    \u65AD\u7247: ${JSON.stringify(finding.fragment).slice(0, 90)}`);
  console.log(`    \u5168\u6587: ${JSON.stringify(finding.text).slice(0, 150)}`);
}
if (findings.length > 40) console.log(`\n  \u2026 \u4ED6 ${findings.length - 40}\u4EF6`);
if (!findings.length) console.log("DB\u672C\u6587\u306F\u539F\u5178\u306E\u6587\u3092\u5206\u65AD\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
process.exit(findings.length ? 1 : 0);
