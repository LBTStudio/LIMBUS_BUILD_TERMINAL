import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../assets/v56-refinements.css', import.meta.url), 'utf8');
const skillDeck = readFileSync(new URL('../js/SkillDeck.js', import.meta.url), 'utf8');

test('スキル編集の範囲フィールドはメタ帯の一部として定義される', () => {
  assert.match(skillDeck, /className: "skill-meta-field"[\s\S]*?"範囲"/);
  assert.match(skillDeck, /className: "select", value: skill\.aoe \|\| ""/);
});

test('プレビュー展開で狭くなるスキルカードでは、メタ帯を実幅に応じて2列・1列へ縮める', () => {
  assert.match(css, /\.deck-focus\s*\{\s*container-type: inline-size;/);
  assert.match(css, /\.skill-meta-band\s*\{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /@container \(max-width: 560px\)\s*\{\s*\.skill-meta-band \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@container \(max-width: 360px\)\s*\{\s*\.skill-meta-band \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.skill-meta-band \.select,[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
});
