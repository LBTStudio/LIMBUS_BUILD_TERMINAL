import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skillDeck = readFileSync(new URL("../js/SkillDeck.js", import.meta.url), "utf8");
const sectionsCss = readFileSync(new URL("../assets/sections.css", import.meta.url), "utf8");

test("スキル下部一覧はドラッグ横スクロールを持ち、並べ替えグリップを対象外にする", () => {
  assert.match(skillDeck, /const useHorizontalDragScroll = \(onCardPress\) =>/);
  assert.match(skillDeck, /\.dnd-handle, \[draggable='true'\]/);
  assert.match(skillDeck, /thumbsScroll\.containerProps/);
  assert.match(skillDeck, /data-skill-index/);
});

test("スキル一覧は短い押下で選択し、横ドラッグ時だけ選択を行わない", () => {
  assert.match(skillDeck, /const DRAG_SCROLL_THRESHOLD = 8/);
  assert.match(skillDeck, /Math\.abs\(deltaX\) > DRAG_SCROLL_THRESHOLD/);
  assert.match(skillDeck, /!drag\.moved && event\.type === "pointerup" && Number\.isInteger\(drag\.cardIndex\)\) onCardPress\?\.\(drag\.cardIndex\)/);
  assert.match(skillDeck, /const card = event\.target\?\.closest\?\.\("\.deck-thumb\[data-skill-index\]"\)/);
  assert.match(skillDeck, /onKeyDown: \(event\) =>[\s\S]*?event\.key === "Enter" \|\| event\.key === " "/);
  assert.doesNotMatch(skillDeck, /suppressNextClick|onClickCapture|suppressClickUntil/);
});

test("ドラッグ横スクロール中のスキル一覧はPC向けの視覚フィードバックを表示する", () => {
  assert.match(sectionsCss, /\.deck-thumbs\.is-drag-scroll/);
  assert.match(sectionsCss, /cursor: grabbing/);
});

test("矢印キー移動案内はプレビュー展開時にも背景から分離した高視認性スタイルを持つ", () => {
  assert.match(sectionsCss, /\.deck-nav-info > span:last-child \{[\s\S]*?border: 1px solid var\(--gold-line\);[\s\S]*?background: color-mix\(in oklab, var\(--gold\) 10%, var\(--surface-3\)\);[\s\S]*?color: var\(--gold-hi\) !important;/);
  assert.match(sectionsCss, /@media \(max-width: 640px\) \{[\s\S]*?\.deck-nav-info > span:last-child/);
});
