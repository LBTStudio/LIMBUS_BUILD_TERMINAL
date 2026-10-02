import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

/* 硝子窓（lbt-garasumado）取り込みで戦術番号がずれる件の回帰テスト。
 *
 * 硝子窓は派生 있을 때 0-1, 0-2 と 1 始まりの連番で送る。
 * このプロジェクトでは派生番号は 2 始まり（LBT 準拠）で、
 * parseDerivedSkillRank は Math.max(2, ...) で 1 を 2 に丸める。
 *
 * したがって取り込み時に「-1 がある base は全部 +1」する補正が要る。
 * かつその補正は state.skills だけでなく personaSrc.skills にも掛ける必要がある。
 *
 * unea曾 Aperture bug: 補正が personaSrc に無かったため、personaSrc に 0-1 が
 * 残ったまま後段の migrateLegacyDerivedSkills で index=2 に丸められ、
 * 同じ base の 0-2 と衝突して「0-2 が二つ」になっていた。 */

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
  const next = appReducer(JSON.parse(JSON.stringify(INIT_STATE)), {
    type: "IMPORT_PERSONA_DRAFT", persona,
    provided: { name: true, hp: true, san: true, speed: true, bullets: true, resistances: true, passives: true, skills: true, uniques: true },
  });
  return next;
};

const srcRanks = (state) => (state.personaSrc?.skills || []).map((s) => s.rank);

test("硝子窓の 1 始まり派生を 2 始まりへ移し、重複を作らない", () => {
  const state = importSkills(["スキル0-1", "スキル0-2"]);
  assert.deepEqual(srcRanks(state), ["スキル0-2", "スキル0-3"]);
  const seen = srcRanks(state);
  assert.equal(seen.length, new Set(seen).size, "0-2 が重複しないこと");
});

test("取り込み済みの派生番号がすべて 2 以上になる（-1 が残らない）", () => {
  for (const ranks of [["スキル0-1", "スキル0-2"], ["スキル0-1", "スキル0-3"], ["スキル1-1", "スキル1-2"]]) {
    const state = importSkills(ranks);
    for (const r of srcRanks(state)) {
      const m = r.match(/^スキル\d+-(\d+)$/);
      if (m) assert.ok(Number(m[1]) >= 2, `${ranks.join(",")} → ${r} の派生番号が 2 以上`);
    }
  }
});

test("既に 2 始まりの人格は何も動かさない", () => {
  const state = importSkills(["スキル0-2", "スキル0-3"]);
  assert.deepEqual(srcRanks(state), ["スキル0-2", "スキル0-3"]);
});

test("-1 を持つ base だけが補正され、他 base は据え置く", () => {
  const state = importSkills(["スキル0-1", "スキル1-2", "スキル1-3"]);
  assert.deepEqual(srcRanks(state), ["スキル0-2", "スキル1-2", "スキル1-3"]);
});

test("飛び番号も順序を保って平行移動される", () => {
  const state = importSkills(["スキル0-1", "スキル0-3"]);
  assert.deepEqual(srcRanks(state), ["スキル0-2", "スキル0-4"]);
});

test("取り込み後は deck と出典で戦術番号が一致し、各々に重複がない", () => {
  const state = importSkills(["スキル0-1", "スキル0-2"]);
  const src = srcRanks(state);
  const deck = (state.skills || []).map((s) => s.rank);
  // personaSrc と state.skills は同じ戦術の2つのビューなので、
  // 両者を連結して重複を測ってはいけない。各々に一意であることと、
  // 両者が食い違っていないことを見る。
  assert.equal(src.length, new Set(src).size, `personaSrc に重複がある: ${JSON.stringify(src)}`);
  assert.equal(deck.length, new Set(deck).size, `deck に重複がある: ${JSON.stringify(deck)}`);
  assert.deepEqual(src, deck, "personaSrc と deck の戦術番号が一致すること");
});