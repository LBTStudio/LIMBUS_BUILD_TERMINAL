import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/* Noto Sans JP を DB 文字だけにサブセットした場合の弊害を、実測で Estimate する。
 * 1. DB に出現する文字种类を数える（＝この経路だけで必要になる下限）
 * 2. 既存 Google Fonts の 3MB と比べる
 * 3. ユーザーが自由に打てるテキストは別問題なので、その範囲を明示する
 */

mkdirSync("tmp", { recursive: true });

const db = JSON.parse(readFileSync("data/db.json", "utf8"));

/* 画面に出るテキストを総当たりで集める。JSON 全体Walk で 충분な下限になる。 */
const chars = new Set();
let totalChars = 0;
const walk = (v) => {
  if (typeof v === "string") {
    totalChars += v.length;
    for (const ch of v) chars.add(ch);
  } else if (Array.isArray(v)) {
    for (const x of v) walk(x);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) { chars.add(k); walk(v[k]); }
  }
};
walk(db);

const classify = (ch) => {
  const c = ch.codePointAt(0);
  if (c < 0x80) return "ascii";
  if (c >= 0x3000 && c <= 0x303f) return "cjkPunct";
  if (c >= 0x3040 && c <= 0x309f) return "hiragana";
  if (c >= 0x30a0 && c <= 0x30ff) return "katakana";
  if (c >= 0xff01 && c <= 0xff60) return "fullwidth";
  if (c >= 0x4e00 && c <= 0x9fff) return "kanji";
  return "other";
};
const buckets = {};
for (const ch of chars) {
  const k = classify(ch);
  buckets[k] = buckets[k] || { n: 0, sample: [] };
  buckets[k].n++;
  if (buckets[k].sample.length < 12) buckets[k].sample.push(ch);
}

const kanji = buckets.kanji?.n || 0;
const kana = (buckets.hiragana?.n || 0) + (buckets.katakana?.n || 0);
const other = Object.entries(buckets).filter(([k]) => !["ascii", "cjkPunct", "hiragana", "katakana", "fullwidth", "kanji"].includes(k));

/* Noto Sans JP の全体グリフ数（Google Fonts の css2 に含まれる unicode-range 数から概算） */
let totalSubsets = 0;
for (const b of readFileSync("tmp/google-fonts.css", "utf8").split("@font-face")) {
  const f = (b.match(/font-family:\s*['"]Noto Sans JP['"]/) || [])[0];
  if (f && /unicode-range/.test(b)) totalSubsets++;
}

const lines = [
  "=== DB（data/db.json 474KB）に出現する文字の脸wd ===",
  `  走査した文字列の総文字数 : ${totalChars.toLocaleString()}`,
  `  異なる文字数             : ${chars.size.toLocaleString()}`,
  "",
  "| 種別 | 文字数 | 例 |",
  "|---|---|---|",
  `| ASCII | ${buckets.ascii?.n || 0} | ${(buckets.ascii?.sample || []).join("")} |`,
  `| 漢字 | ${kanji.toLocaleString()} | ${(buckets.kanji?.sample || []).slice(0, 8).join("")} |`,
  `| ひらがな | ${buckets.hiragana?.n || 0} | ${(buckets.hiragana?.sample || []).slice(0, 10).join("")} |`,
  `| カタカナ | ${buckets.katakana?.n || 0} | ${(buckets.katakana?.sample || []).slice(0, 10).join("")} |`,
  `| 全角/記号 | ${(buckets.fullwidth?.n || 0) + (buckets.cjkPunct?.n || 0)} | ${(buckets.fullwidth?.sample || []).slice(0, 6).join("")} |`,
  `| その他 | ${other.reduce((a, [, v]) => a + v.n, 0)} | ${other.flatMap(([, v]) => v.sample).slice(0, 10).join("")} |`,
  "",
  `Noto Sans JP の unicode-range サブセット総数 : ${totalSubsets}`,
  `実際に落ちているファイル数                  : 83（実測）`,
  "",
  "=== 导出の見積もり ===",
  `  DB に現れる範囲だけ（漢字 ${kanji.toLocaleString()} + かな + ASCII + 記号）`,
  `  → 未知の_bounds。把 Noto Sans JP が持つ 1 万超の漢字から ${((1 - kanji / 10000) * 100).toFixed(1)}% を削る`,
  "  → 現在の 2,777 KB から大幅に減る見込みだが、上の数字は推定。",
];
writeFileSync("tmp/subset-estimate.txt", lines.join("\n"), "utf8");
console.log(lines.join("\n"));