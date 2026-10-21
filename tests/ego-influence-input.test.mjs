import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const helperStart = source.indexOf("const getInfluenceRounds = ");
const helperEnd = source.indexOf("const getEgoVariantModel = ", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "影響ヘッダーの入出力ヘルパーが存在する");

const context = {};
vm.createContext(context);
vm.runInContext(
  source.slice(helperStart, helperEnd) +
    "\nglobalThis.influenceApi = { getInfluenceRounds, stripInfluenceHeader, makeInfluenceEffect };",
  context
);
const api = context.influenceApi;

test("影響E.G.Oの継続ラウンドは入力中の未完成値も維持する", () => {
  const body = "1R：開始時に保護1を得る\n2R：スキル威力+1  \n3R：終了時に解除する\n";
  for (const rounds of ["2", "2R", "12R"]) {
    const effect = api.makeInfluenceEffect(rounds, body);
    assert.equal(api.getInfluenceRounds(effect), rounds);
    assert.equal(api.stripInfluenceHeader(effect), body);
  }
});

test("影響E.G.Oのラウンド効果は先頭空白・末尾空白・空行を損なわない", () => {
  const body = "  1R：効果を付与する  \n\n2R：効果を解除する\n ";
  const effect = api.makeInfluenceEffect("2R", body);
  assert.equal(effect, "[影響] 2R：" + body);
  assert.equal(api.stripInfluenceHeader(effect), body);
});

test("ラウンド本文中の数字は継続ラウンドとして誤認せず、空欄も入力できる", () => {
  const body = "1R：効果A\n2R：効果B";
  const effect = api.makeInfluenceEffect("", body);
  assert.equal(effect, "[影響]：" + body);
  assert.equal(api.getInfluenceRounds(effect), "");
  assert.equal(api.stripInfluenceHeader(effect), body);
  assert.equal(api.makeInfluenceEffect("2R", ""), "[影響] 2R");
  assert.equal(api.getInfluenceRounds(api.makeInfluenceEffect("2R", "")), "2R");
  assert.equal(api.stripInfluenceHeader(api.makeInfluenceEffect("2R", "")), "");
});

test("影響E.G.Oの入力欄は raw value を往復し、trimで空白やEnterを落とさない", () => {
  const start = source.indexOf("const renderInfluence = ");
  const end = source.indexOf('return React.createElement("section", { className: "ego-slot-variant"', start);
  assert.ok(start >= 0 && end > start, "影響E.G.Oの編集UIが存在する");
  const block = source.slice(start, end);
  assert.match(block, /makeInfluenceEffect\(e\.target\.value, branch\.effect\)/);
  assert.match(block, /value: stripInfluenceHeader\(branch\.effect\)/);
  assert.doesNotMatch(block, /e\.target\.value\.trim\(\)/);
  assert.doesNotMatch(block, /stripInfluenceHeader\(branch\.effect\)[\s\S]{0,150}\.trim\(\)/);
});


test("新規E.G.Oは作成直後に対象ランクの解析画面を開き、影響入力へ到達できる", () => {
  const start = stateSource.indexOf('case "CREATE_CUSTOM_EGO":');
  const end = stateSource.indexOf('case "RESET_EGO_SLOT_TO_DB":', start);
  assert.ok(start >= 0 && end > start, "新規E.G.O生成のreducer処理が存在する");
  const block = stateSource.slice(start, end);
  assert.match(block, /egoManual:\s*true/);
  assert.match(block, /egoDetailSlot:\s*rank/);
  assert.match(source, /const renderInfluence = \(\) =>/);
  assert.match(source, /label: "ラウンド効果"/);
});


test("rounds 下書きはE.G.O効果本文とは独立して保持する", () => {
  assert.match(source, /rounds: String\(influence\.rounds \?\? getInfluenceRounds\(influence\.effect\)\)/);
  assert.match(source, /patchSkill\(\{ rounds: e\.target\.value, effect: makeInfluenceEffect\(e\.target\.value, branch\.effect\) \}\)/);
  assert.match(source, /const rounds = String\(branch\.rounds \?\? getInfluenceRounds\(branch\.effect\)\)/);
});
