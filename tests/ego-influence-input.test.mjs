import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/ego-slot-forms.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

function loadInfluenceText() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_EGO_INFLUENCE_TEXT;
}

test("継続ラウンドの編集中の数字を本文へ混ぜず、出力形式だけを正規化する", () => {
  const influence = loadInfluenceText();
  const body = "1R開始時、保護2を得る";
  assert.equal(influence.makeEffect("2", body), "[影響] 2R：" + body);
  assert.equal(influence.getRounds("[影響] 2R：" + body), "2R");
  assert.equal(influence.stripHeader("[影響] 2R：" + body), body);
  assert.equal(influence.makeEffect("2R", body), "[影響] 2R：" + body);
});

test("ラウンド効果の末尾スペースと改行はcontrolled inputの再描画で保持される", () => {
  const influence = loadInfluenceText();
  const body = "1R開始時、保護2を得る \n2R：ダメージ+1\n";
  const encoded = influence.makeEffect("2", body);
  assert.equal(influence.stripHeader(encoded), body);
});

test("影響の継続ラウンドは独立した下書きとして保持し、ラウンド本文をtrimしない", () => {
  assert.match(sections, /rounds: String\(influence\.rounds \?\? getInfluenceRounds\(influence\.effect\)\)/);
  assert.match(sections, /rounds: e\.target\.value, effect: makeInfluenceEffect\(e\.target\.value, branch\.effect\)/);
  assert.match(sections, /value: stripInfluenceHeader\(branch\.effect\), onChange: \(e\) => patchSkill\(\{ effect: makeInfluenceEffect\(rounds, e\.target\.value\) \}\)/);
  assert.doesNotMatch(sections, /onChange: \(e\) => patchSkill\(\{ effect: makeInfluenceEffect\(e\.target\.value\.trim\(\), branch\.effect\) \}\)/);
});
