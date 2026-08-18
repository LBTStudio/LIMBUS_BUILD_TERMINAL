import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const sectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

const sourceOf = (entry) => entry?.source === "supplement" ? "supplement" : "rulebook";

test("サポートパッシブは既存sourceメタデータからルールブック・サプリメントへ区別できる", () => {
  const rows = db.support_passives || [];
  const supplements = rows.filter((entry) => sourceOf(entry) === "supplement");
  const rulebooks = rows.filter((entry) => sourceOf(entry) === "rulebook");
  assert.ok(supplements.length > 0);
  assert.ok(rulebooks.length > 0);
  assert.equal(supplements.length + rulebooks.length, rows.length);
});

test("提供PDFの精神の種類54〜55頁に掲載された7件をサプリメント由来として区別できる", () => {
  const names = ["快撃", "潜撃", "指令崩壊の危機", "狂奔", "時代遅れの芸術", "もっといい存在に成れるという希望", "生き続けるという勇気"];
  const supplements = (db.spirits || []).filter((entry) => sourceOf(entry) === "supplement");
  assert.deepEqual(supplements.map((entry) => entry.name), names);
});

test("サポートパッシブと精神の検索結果は出典フィルタと併用できる", () => {
  assert.match(sectionSource, /const catalogSource = \(entry\) => entry\?\.source === "supplement" \? "supplement" : "rulebook";/);
  assert.match(sectionSource, /sourceFilter !== "all" && catalogSource\(s\) !== sourceFilter/);
  assert.match(sectionSource, /h\(SourceFilterRow, \{ h, kind: "サポートパッシブ", value: sourceFilter, onChange: setSourceFilter \}\)/);
  assert.match(sectionSource, /useSourceFilterControl\("精神", sourceFilter, setSourceFilter\)/);
  assert.match(sectionSource, /\[\["all", "全て"\], \["rulebook", "ルールブック"\], \["supplement", "サプリメント"\]\]/);
});
