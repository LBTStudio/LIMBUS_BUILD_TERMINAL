import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/v65r43-ego-readability.css", import.meta.url), "utf8");

test("E.G.O資源は名称と個数を持つ色覚非依存チップとして装備・一覧カードへ表示する", () => {
  assert.match(source, /const EgoResourceChips/);
  assert.match(source, /className: "is-slot"/);
  assert.match(source, /className: "is-catalog"/);
  assert.match(source, /ego-resource-chip-name/);
  assert.match(source, /ego-resource-chip-count/);
  assert.match(css, /min-height: 22px/);
  assert.match(css, /color: var\(--tx\)/);
});

test("E.G.O資源フィルターは複数の必要資源をすべて満たし、除外資源を一つでも含む候補を落とす", () => {
  assert.match(source, /const egoMatchesResourceFilters/);
  assert.match(source, /requiredResources\.every\(\(sin\) => resources\.has\(sin\)\)/);
  assert.match(source, /!excludedResources\.some\(\(sin\) => resources\.has\(sin\)\)/);
  assert.match(source, /appendRow\("必要資源", "すべて含む"/);
  assert.match(source, /appendRow\("除外資源", "一つでも含むと除外"/);
  assert.match(source, /setExcludedResources\(\(values\) => values\.filter\(\(value\) => value !== sin\)\)/);
  assert.match(css, /\.ego-resource-filter-row\.is-exclude/);
  assert.match(css, /text-decoration: line-through/);
  assert.match(css, /\.ego-catalog-filters:not\(\.is-filter-open\) > \.ego-resource-filter-controls/);
});

test("E.G.Oの詳細未選択時だけPC一覧を全幅化し、選択時の二列詳細を保つ", () => {
  assert.match(source, /ego-section\$\{selected \? " has-selection" : " is-catalog-only"\}/);
  assert.match(css, /@media \(min-width: 1281px\)/);
  assert.match(css, /\.ego-section\.is-catalog-only \.codex/);
  assert.match(css, /\.ego-section\.is-catalog-only \.codex-detail \{ display: none; \}/);
});

test("E.G.O選択時は右列の簡易詳細カードを表示し、全文詳細・直接編集は明示操作に分離する", () => {
  const quickCss = readFileSync(new URL("../assets/v65r44-ego-quick-detail.css", import.meta.url), "utf8");
  assert.match(source, /const EgoQuickDetail/);
  assert.match(source, /選択中 E\.G\.O \/ 簡易詳細/);
  assert.match(source, /詳細・直接編集/);
  assert.match(source, /setDetailSlot\(null\);\s+setListExpanded\(true\);/);
  assert.match(source, /setDetailSlot\(currentSlot\)/);
  assert.match(source, /h\(EgoQuickDetail, \{ ego: selected, currentSlot, onEquip: equip/);
  assert.match(source, /\) : egoGrid\)\), h\(EgoQuickDetail/);
  assert.match(quickCss, /\.ego-section\.has-selection \.codex/);
  assert.match(quickCss, /grid-template-columns: minmax\(0, 1fr\) 380px/);
  assert.match(quickCss, /@media \(min-width: 1120px\) and \(max-width: 1280px\)/);
  assert.match(quickCss, /minmax\(320px, \.9fr\)/);
  assert.match(quickCss, /@media \(max-width: 1119px\)/);
  assert.match(quickCss, /@media \(max-width: 640px\)/);
});

test("同化型E.G.O一覧カードはランクと同化表示を独立マーク領域へ置き、狭幅では安全に折り返す", () => {
  const marksCss = readFileSync(new URL("../assets/v65r47-ego-card-marks.css", import.meta.url), "utf8");
  assert.match(source, /p-card-head ego-card-head/);
  assert.match(source, /className: "ego-card-marks"/);
  assert.match(marksCss, /\.ego-card-marks/);
  assert.match(marksCss, /\.ego-card-marks \.badge/);
  assert.match(marksCss, /@media \(max-width: 420px\)/);
  assert.match(marksCss, /flex-wrap: wrap/);
});

test("簡易詳細の効果プレビューは改行を保持し、ロール列挙は本文を持つダイスと重複しない", () => {
  const start = source.indexOf("const EgoQuickDetail");
  const end = source.indexOf("// 基本ルールPDFの掲載順", start);
  assert.ok(start >= 0 && end > start, "EgoQuickDetail の抽出");
  const quick = source.slice(start, end);

  // 改行を1行へ押し込むと原典の段落表記（例: 「[影響] 1R」と「1R：…」の2行）が
  // 「1R 1R：…」のように重複して読めるため、改行を保持して切り詰める。
  assert.equal(quick.includes("replace(/\\s+/g"), false, "formatPreview が改行を潰さない");
  // 効果本文を持つダイスは roll：本文 行に全数表示し、ロール一覧は本文を持たない
  // ダイスだけのフォールバックにする。先頭2件への切り詰めは実ダイス数との不一致を生む。
  assert.match(quick, /const bareRolls/);
  assert.equal(quick.includes(".slice(0, 2)"), false, "ロール列挙が先頭2件へ切り詰められない");
  assert.match(quick, /whiteSpace: "pre-wrap"/);
});
