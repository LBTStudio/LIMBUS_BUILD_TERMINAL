import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadParagraphs } from "../tools/provenance/db-paragraphs.mjs";
import { loadCorpus } from "../tools/provenance/db-provenance.mjs";

/* コーパスの紙面見出しが、読む側すべてで同じように解釈されるかを確かめる。

   この検査が要る理由。

   抽出器の見出しに印を足したことがある（節見出しのある紙面を示す `SECTION`）。
   読む側は2か所あり、片方（db-provenance.mjs）だけを直して、
   もう片方（db-paragraphs.mjs）の正規表現を古いままにしてしまった。

     旧 ^===== PAGE (\d+) =====$
     新 ===== PAGE 85 SECTION =====      ← 旧の正規表現に一致しない

   一致しないと紙面の区切りを見失い、以降の本文がすべて直前の紙面に
   属することになる。ところが監査は例外を出さず「0件」を報告した。
   紙面の対応がずれて、比較する相手がいなくなっただけだったからである。

   壊れたまま「問題なし」と言う監査がいちばん危ない。
   形式が変わったら、読む側すべてが気づけるようにする。 */

const CORPUS = ["core", "supplement", "pack1"];
const PAGE_HEADER_RE = /^===== PAGE (\d+)(?: SECTION)? =====$/;

const corpora = CORPUS.map((key) => ({
  key,
  text: readFileSync(new URL(`../data/provenance/${key}.paragraphs.txt`, import.meta.url), "utf8")
}));

test("紙面見出しの形式が既知のものだけである", () => {
  const unknown = [];
  for (const { key, text } of corpora) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("===== PAGE")) continue;
      if (!PAGE_HEADER_RE.test(trimmed)) unknown.push(`${key}: ${trimmed}`);
    }
  }
  assert.deepEqual(unknown, []);
});

test("紙面番号が1から連番で現れる", () => {
  // 見出しを読み落とすと番号が飛ぶ。飛びを検出すれば読み落としに気づける。
  for (const { key, text } of corpora) {
    const pages = [];
    for (const line of text.split("\n")) {
      const header = PAGE_HEADER_RE.exec(line.trim());
      if (header) pages.push(Number(header[1]));
    }
    assert.ok(pages.length > 0, `${key}: 紙面見出しが一つも読めていない`);
    const expected = Array.from({ length: pages.length }, (_, at) => at + 1);
    assert.deepEqual(pages, expected, `${key}: 紙面番号が連番でない`);
  }
});

test("コーパスを読む道具が紙面の区切りを見失っていない", () => {
  /* 読む側が複数ある。どれか一つだけ形式に追随しそこねると、
     その道具だけが静かに壊れる。同じ紙面数に届くかで気づく。 */
  const total = new Map(corpora.map(({ key, text }) => [
    key,
    text.split("\n").filter((line) => PAGE_HEADER_RE.test(line.trim())).length
  ]));

  const paragraphs = loadParagraphs();
  for (const key of CORPUS) {
    const seen = new Set(paragraphs.filter((row) => row.source === key).map((row) => row.page));
    assert.ok(seen.size > 0, `${key}: db-paragraphs が紙面を読めていない`);
    assert.ok(Math.max(...seen) <= total.get(key),
      `${key}: db-paragraphs の紙面番号が総数 ${total.get(key)} を超えている`);

    /* 見るのは番号の最大値ではなく、読めた紙面の「数」である。

       区切りを一部読み落としても、最後の見出しさえ読めていれば最大値は
       ほとんど変わらない（core で 378 → 377）。一方で数は大きく減る
       （378 → 359）。最大値で見ていたときは、この検査自体が
       読み落としを見逃した。

       本文の無い紙面（白紙・扉）は段落を持たず数に現れないため、
       総数とは一致しない。原典ごとの実測値を下限として持つ。 */
    const FLOOR = { core: 370, supplement: 168, pack1: 238 };
    assert.ok(seen.size >= FLOOR[key],
      `${key}: db-paragraphs が紙面の区切りを読み落としている`
      + `（読めた紙面数 ${seen.size} / 総数 ${total.get(key)} / 下限 ${FLOOR[key]}）`);
  }

  for (const part of loadCorpus()) {
    const count = part.text.split("\n").filter((line) => PAGE_HEADER_RE.test(line.trim())).length;
    assert.ok(count > 0, `${part.key}: db-provenance が紙面見出しを読めていない`);
  }
});
