import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skillDeck = readFileSync(new URL("../js/SkillDeck.js", import.meta.url), "utf8");
const sectionsCss = readFileSync(new URL("../assets/sections.css", import.meta.url), "utf8");

test("スキル下部一覧はドラッグ横スクロールを持ち、並べ替えグリップを対象外にする", () => {
  assert.match(skillDeck, /const useHorizontalDragScroll = \(\) =>/);
  assert.match(skillDeck, /\.dnd-handle, \[draggable='true'\]/);
  assert.match(skillDeck, /thumbsScroll\.containerProps/);
  assert.match(skillDeck, /onClickCapture/);
});

test("ドラッグ横スクロール中のスキル一覧はPC向けの視覚フィードバックを表示する", () => {
  assert.match(sectionsCss, /\.deck-thumbs\.is-drag-scroll/);
  assert.match(sectionsCss, /cursor: grabbing/);
});
