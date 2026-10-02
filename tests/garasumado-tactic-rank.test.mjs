import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

/* 硝子窓（lbt-garasumado）取り込みで戦術番号がずれる件の回帰テスト。
 *
 * 硝子窓は派生があるとき 0-1, 0-2 と 1 始まりの連番で送る。
 * 公式データには -1 が 1 件も存在しない（base は スキル0〜4、派生は スキル4-2）。
 * draft テキスト取り込みも同じで、0-1 は スキル0-1 のまま保持される
 * （tests/persona-draft-import.test.mjs がそれを固定している）。
 *
 * したがって取り込みは rank をそのまま通すだけでよく、平行移動は不要。
 *
 * 二重化的だった経緯
 *   - 「-1 を含む base は全部 +1」する補正が state.js の IMPORT_PERSONA_DRAFT に
 *     あり、それが全戦術番号を 1 ずらしていた。
 *   - その補正を外しても、parseDerivedSkillRank の Math.max(2, ...) が 0-1 を
 *     index=2 に丸め、既存の 0-2 と衝突して「0-2 が二つ」になっていた。
 * 正しいのは補正を外し、派生番号の 1 を潰さないこと。 */

const ctx = { window: {}, console, URL, TextEncoder, TextDecoder };
vm.createContext(ctx);
for (const f of ["core.js", "state.js", "persona-draft-import.js"]) {
  vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8"), ctx);
}
const { appReducer, INIT_STATE } = ctx.window;
assert.ok(appReducer, "appReducer が読み込まれていない");

const mkSkill = (rank, name) => ({
  rank, name, type: "斬撃", sin: "憤怒", aoe: "", aoe_count: "", effect: "効果", dice: [],
});

const importSkills = (ranks) => {
  const persona = {
    __custom: true, name: "回帰人格", hp: "100", san: "50", speed: "2d3", bullets: "10",
    res_slash: "普通", res_pierce: "普通", res_blunt: "普通",
    passive_name: "", passive_cond: "", passive_always: "", passive_effect: "",
    skills: ranks.map((r, i) => mkSkill(r, `S${i}`)),
    unique_buffs: [],
  };
  return appReducer(JSON.parse(JSON.stringify(INIT_STATE)), {
    type: "IMPORT_PERSONA_DRAFT", persona,
    provided: { name: true, hp: true, san: true, speed: true, bullets: true, resistances: true, passives: true, skills: true, uniques: true },
  });
};

const srcRanks = (s) => (s.personaSrc?.skills || []).map((x) => x.rank);
const deckRanks = (s) => (s.skills || []).map((x) => x.rank);

test("硝子窓の 1 始まり派生はそのまま登録され、重複しない", () => {
  const state = importSkills(["スキル0-1", "スキル0-2"]);
  assert.deepEqual(srcRanks(state), ["スキル0-1", "スキル0-2"], "出典側の戦術番号が変わらないこと");
  const src = srcRanks(state);
  assert.equal(src.length, new Set(src).size, `0-2 が重複しないこと: ${JSON.stringify(src)}`);
});

test("取り込み後に 1 始まりの派生が潰されない", () => {
  const state = importSkills(["スキル0-1", "スキル0-2"]);
  const di = (state.skills || []).map((s) => s.derived_index);
  assert.deepEqual(di, [1, 2], "派生番号が 1 と 2 のまま保たれる");
});

test("公式データと同じ 2 始まりもそのまま通す", () => {
  const state = importSkills(["スキル4-2", "スキル3-2"]);
  assert.deepEqual(srcRanks(state), ["スキル4-2", "スキル3-2"]);
  assert.deepEqual((state.skills || []).map((s) => s.derived_index), [2, 2]);
});

test("出典と deck で戦術番号が一致し、各々に重複がない", () => {
  for (const ranks of [["スキル0-1", "スキル0-2"], ["スキル0-2", "スキル0-3"], ["スキル1-1", "スキル1-2", "スキル1-3"]]) {
    const state = importSkills(ranks);
    const src = srcRanks(state);
    const deck = deckRanks(state);
    assert.equal(src.length, new Set(src).size, `personaSrc に重複: ${JSON.stringify(src)}`);
    assert.equal(deck.length, new Set(deck).size, `deck に重複: ${JSON.stringify(deck)}`);
    assert.deepEqual(src, deck, `出典と deck が食い違う: ${JSON.stringify(src)} vs ${JSON.stringify(deck)}`);
  }
});

test("同じ base に 0-1 と 0-2 が来たとき 0-2 は一つだけ", () => {
  const state = importSkills(["スキル0-1", "スキル0-2"]);
  const all = deckRanks(state);
  assert.equal(all.filter((r) => r === "スキル0-2").length, 1, `0-2 が一つであること: ${JSON.stringify(all)}`);
  assert.equal(new Set(all).size, all.length, `重複なし: ${JSON.stringify(all)}`);
});