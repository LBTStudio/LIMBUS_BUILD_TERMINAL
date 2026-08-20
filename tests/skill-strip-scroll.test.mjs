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

test("スキル一覧は短いクリックを選択へ通し、横ドラッグ自身のクリックだけを抑止する", () => {
  assert.match(skillDeck, /const DRAG_SCROLL_THRESHOLD = 8/);
  assert.match(skillDeck, /Math\.abs\(deltaX\) > DRAG_SCROLL_THRESHOLD/);
  assert.match(skillDeck, /suppressNextClick: false/);
  assert.match(skillDeck, /drag\.moved && event\.type === "pointerup"/);
  assert.match(skillDeck, /if \(!dragRef\.current\.suppressNextClick\) return;/);
  assert.doesNotMatch(skillDeck, /CLICK_SUPPRESS_MS|suppressClickUntil/);
  assert.match(skillDeck, /onClick: \(\) => \{ curSkillIdRef\.current = null; setCurIdx\(i\); \}/);
});

test("ドラッグ横スクロール中のスキル一覧はPC向けの視覚フィードバックを表示する", () => {
  assert.match(sectionsCss, /\.deck-thumbs\.is-drag-scroll/);
  assert.match(sectionsCss, /cursor: grabbing/);
});
