import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const persona = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const filterCss = readFileSync(new URL("../assets/persona-filter-refinement.css", import.meta.url), "utf8");

test("所属は検索式の候補選択になり、選択済みを個別解除できる", () => {
  assert.match(persona, /affiliationFilterQuery, setAffiliationFilterQuery/);
  assert.match(persona, /type: "search"[\s\S]*?aria-label": "所属で絞り込み"/);
  assert.match(persona, /affiliationCandidates = React\.useMemo/);
  assert.match(persona, /visibleAffiliationCandidates\.map/);
  assert.match(persona, /選択中の所属/);
  assert.match(persona, /選択を解除/);
  assert.doesNotMatch(persona, /affiliations\.map\(\(aff\) => React\.createElement\(Chip/);
});

test("所属検索は部分一致・複数語一致を使い、候補を最大12件に制限する", () => {
  assert.match(persona, /terms\.every\(\(term\) => normalized\.includes\(term\)\)/);
  assert.match(persona, /affiliationCandidates\.slice\(0, 12\)/);
  assert.match(persona, /さらに文字を入力してください/);
});

test("大罪は固有色の塗りを維持し、チェックと選択状態を示す", () => {
  assert.match(persona, /ariaPressed: ui\.filterSins\.includes\(s\)/);
  assert.match(ui, /"aria-pressed": ariaPressed === void 0 \? void 0 : !!ariaPressed/);
  assert.match(filterCss, /\.codex-filter-row \.chip\[data-sin\]\.is-active/);
  assert.match(filterCss, /background: var\(--sin-color\) !important/);
  assert.match(filterCss, /content: "✓"/);
});

test("キーワードボタンの表示はキーワード名のみで件数を含めない", () => {
  assert.match(persona, /allKws\.map\(\(keyword\) =>[\s\S]*?\}, keyword\)\)/);
  assert.doesNotMatch(persona, /countKeywordInPool|keyword \+ " · "/);
  assert.doesNotMatch(persona, /このタグを持つ人格:/);
});

test("絞り込み条件と AND/OR の選択方式を変更せず維持する", () => {
  assert.match(persona, /if \(ui\.filterSins\.length\)[\s\S]*?sinSet\.has/);
  assert.match(persona, /if \(ui\.filterKws\.length\)[\s\S]*?matchedKeywords/);
  assert.match(persona, /if \(ui\.filterAffs\.length && !ui\.filterAffs\.includes\(decoratePersona\(p\).__aff\)\) return false/);
  assert.match(persona, /filterMatch/);
});
