import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const persona = db.normal_personas.find((p) => p?.no === 44 && p?.name === '炎拳事務所フィクサー');
const s3 = persona?.skills?.find((s) => s?.rank === 'スキル3' && s?.name === '焼き尽くす');
const expectedDiceEffect = '的中時、火傷1を付与。12区産燃料を10消費し火傷が最も少ない敵2名へ火傷3を付与';

test('炎拳事務所フィクサーS3のダイス効果は途中で切断されていない', () => {
  assert.ok(persona, '炎拳事務所フィクサーが存在する');
  assert.ok(s3, 'S3「焼き尽くす」が存在する');
  assert.equal(s3.dice.length, 2);
  assert.deepEqual(s3.dice.map((dice) => dice.effect), [expectedDiceEffect, expectedDiceEffect]);
  assert.equal(JSON.stringify(s3).includes('火傷が最も少"'), false);
});

test('DB内に既知の途中切断文「火傷が最も少」が残っていない', () => {
  assert.equal(JSON.stringify(db).includes('火傷が最も少"'), false);
});
