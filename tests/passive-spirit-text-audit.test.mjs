import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const audit = JSON.parse(readFileSync(new URL("../data/provenance/three-book-audit.json", import.meta.url), "utf8"));

/* サポートパッシブ・精神のテキスト監査。
 *
 * 1. 語途中改行: 転記時にPDFの行折返しがそのまま残ると「使用するス\nキル」のような
 *    語の途中の改行が混入する（続く暴食で実際に発生した）。原典の改行位置
 *    （three-book監査候補=エラッタ反映PDFから適切に結合したテキスト）に対応
 *    しないDB側の改行は全て語途中とみなし、機械的に検出する。
 *
 * 2. 直近エラッタ: 「混乱終了時」は「混乱復帰時」へ全て修正された。DBの
 *    精神・サポートパッシブは修正済み表記を持つ。ただし現行の原典PDF
 *    （sources/エラッタ最新版）は精神の種類表がまだ旧表記のため、
 *    three-book監査には「原典(旧) vs DB(新)」の差分として記録される。これは
 *    PDF側が新しいエラッタへ置き換わっていない事実の記録であり、DBの誤りではない。 */

const TEXT_FIELDS = ["cond", "always_effect", "morale_effect", "confuse_effect", "effect"];

function whitespacePrefixLengths(text) {
  const lengths = new Set();
  let count = 0;
  let pending = false;
  for (const ch of String(text)) {
    if (/\s/.test(ch)) {
      pending = true;
    } else {
      if (pending) {
        lengths.add(count);
        pending = false;
      }
      count++;
    }
  }
  return lengths;
}

test("精神とサポートパッシブの改行は原典の折返し位置にのみ存在する", () => {
  const violations = [];
  for (const candidate of audit.candidates || []) {
    if (candidate.kind !== "support_passives" && candidate.kind !== "spirits") continue;
    const record = (db[candidate.kind] || []).find((r) => r.name === candidate.data.name);
    if (!record) continue;
    for (const field of TEXT_FIELDS) {
      const dbValue = record[field];
      const srcValue = candidate.data[field];
      if (typeof dbValue !== "string" || !dbValue.includes("\n")) continue;
      if (typeof srcValue !== "string") continue;
      const sourceBreaks = whitespacePrefixLengths(srcValue);
      let prefix = 0;
      const chars = dbValue.split("");
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === "\n") {
          if (!sourceBreaks.has(prefix)) {
            violations.push(`${candidate.kind} ${record.name} .${field}: 改行が原典の折返し位置にない (正位置=${prefix})`);
          }
        } else if (!/\s/.test(chars[i])) {
          prefix++;
        }
      }
    }
  }
  assert.deepEqual(violations, [], `語途中改行: ${violations.length}件`);
});

test("直近エラッタどおり精神・パッシブに「混乱終了時」は残っていない", () => {
  const stale = [];
  for (const kind of ["support_passives", "spirits"]) {
    for (const record of db[kind] || []) {
      for (const field of TEXT_FIELDS) {
        if (typeof record[field] === "string" && record[field].includes("混乱終了時")) {
          stale.push(`${kind} ${record.name} .${field}`);
        }
      }
    }
  }
  assert.deepEqual(stale, [], `エラッタ未適用: ${stale.length}件`);
});

test("既知の語途中改行は修正済みの結合形を持つ", () => {
  const expected = new Map([
    ["続く暴食", "常時：暴食資源獲得量+1\n戦闘開始時、HP回復量増加2を得る。使用するスキルが暴食属性ならこのRで回復したHP10ごとに次のRにダメージ量増加1と破裂2を得る（最大3）"],
  ]);
  for (const [name, effect] of expected) {
    const record = db.support_passives.find((r) => r.name === name);
    assert.ok(record, `${name} が存在する`);
    assert.equal(record.effect, effect);
  }
});
