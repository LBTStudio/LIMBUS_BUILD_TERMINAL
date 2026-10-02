import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

/* 出典フィルタの契約。
 *
 *   core        ルルブ（新リンバスTRPG）
 *   supplement  アンロックド・シンク
 *   pack1       特定抽出パック第一弾
 *
 * 値は tools/provenance/audit_three_books.py が PDF の表（罫線＋座標）から
 * 判定したもの。data/provenance/three-book-audit.json の台帳が正であり、
 * data/db.json の source はそれに従う。以前は core と supplement の 2 値しか
 * 無く pack1 の 29 件が core と書かれていたため、ルールブックに落ちていた。 */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const sectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const auditPath = new URL("../data/provenance/three-book-audit.json", import.meta.url);

const SOURCES = ["core", "supplement", "pack1"];
const sourceOf = (entry) => entry?.source || "core";

test("サポートパッシブは 3 つの掲載出所に分かれる", () => {
  const rows = db.support_passives || [];
  assert.ok(rows.length > 0);
  const buckets = new Map();
  for (const entry of rows) {
    const s = sourceOf(entry);
    assert.ok(SOURCES.includes(s), `${entry.name} の source が既知の値: ${s}`);
    buckets.set(s, (buckets.get(s) || 0) + 1);
  }
  assert.equal([...buckets.values()].reduce((a, b) => a + b, 0), rows.length);
  for (const s of SOURCES) {
    assert.ok(buckets.get(s) > 0, `${s} に該当Passive があること（実際 ${buckets.get(s) || 0}）`);
  }
  // 特定抽出パックが 0 件のままだとフィルタが空になる
  assert.ok(buckets.get("pack1") >= 20, `pack1 が十分な数あること（実際 ${buckets.get("pack1") || 0}）`);
});

test("db.json の source は検出台帳（three-book-audit.json）と一致する", (t) => {
  if (!existsSync(auditPath)) {
    t.skip("three-book-audit.json がない（tools/provenance/audit_three_books.py を実行してください）");
    return;
  }
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const nfkc = (s) => String(s == null ? "" : s).normalize("NFKC").replace(/[\s　]+/g, "");
  const byName = new Map();
  for (const c of audit.candidates) {
    if (c.kind !== "support_passives") continue;
    const n = nfkc(c.data && c.data.name);
    if (n && !byName.has(n)) byName.set(n, c.source);
  }
  assert.ok(byName.size > 0, "台帳にサポートパッシブの候補があること");

  let checked = 0;
  const mismatch = [];
  for (const entry of db.support_passives) {
    const expected = byName.get(nfkc(entry.name));
    if (!expected) continue;
    checked++;
    if (expected !== sourceOf(entry)) mismatch.push(`${entry.name}: db=${sourceOf(entry)} / 台帳=${expected}`);
  }
  assert.ok(checked >= 300, `台帳と照合できた件数が十分あること（実際 ${checked}）`);
  assert.deepEqual(mismatch, [], "db.json の source が台帳と一致すること");
});

test("提供PDFの精神の種類54〜55頁に掲載された7件をサプリメント由来として区別できる", () => {
  const names = ["快撃", "潜撃", "指令崩壊の危機", "狂奔", "時代遅れの芸術", "もっといい存在に成れるという希望", "生き続けるという勇気"];
  const supplements = (db.spirits || []).filter((entry) => sourceOf(entry) === "supplement");
  assert.deepEqual(supplements.map((entry) => entry.name), names);
});

test("出典フィルタは 4 つの選択肢を持つ", () => {
  assert.match(sectionSource, /const catalogSource = \(entry\) => entry\?\.source \|\| "core";/);
  assert.match(sectionSource, /sourceFilter !== "all" && catalogSource\(s\) !== sourceFilter/);
  assert.match(sectionSource, /h\(SourceFilterRow, \{ h, kind: "サポートパッシブ", value: sourceFilter, onChange: setSourceFilter \}\)/);
  assert.match(sectionSource, /useSourceFilterControl\("精神", sourceFilter, setSourceFilter\)/);
  assert.match(
    sectionSource,
    /const SOURCE_OPTIONS = \[\["all", "全て"\], \["core", "ルールブック"\], \["supplement", "アンロックド・シンク"\], \["pack1", "特定抽出パック"\]\];/
  );
  // 選択肢の配列を 2 箇所（SourceFilterRow と useSourceFilterControl）が共有している
  assert.equal((sectionSource.match(/SOURCE_OPTIONS\.(map|forEach)/g) || []).length, 2);
  assert.doesNotMatch(sectionSource, /"rulebook"/, "旧 2 値リストの 'rulebook' が残っていないこと");
});