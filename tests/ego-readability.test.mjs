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

test("E.G.Oの詳細未選択時だけPC一覧を全幅化し、選択時の二列詳細を保つ", () => {
  assert.match(source, /ego-section\$\{selected \? " has-selection" : " is-catalog-only"\}/);
  assert.match(css, /@media \(min-width: 1281px\)/);
  assert.match(css, /\.ego-section\.is-catalog-only \.codex/);
  assert.match(css, /\.ego-section\.is-catalog-only \.codex-detail \{ display: none; \}/);
});
