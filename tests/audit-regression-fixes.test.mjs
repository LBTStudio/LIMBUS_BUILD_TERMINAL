import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

/* 監査で検出した本体バグの回帰テスト。
   いずれも「実際の装備 → 出力生成」経路そのもので検証する。 */

test("旧保存の死亡後パッシブ移行はDB名簿と一致するレコードだけを対象にする", () => {
  const rt = loadRuntime();
  // 本文に死亡系の語を含むだけの通常サポート（旧ロジックでは誤移動した）と、
  // DBの死亡後パッシブ名簿と同名のレコード（旧版の混入パターン）を並べる。
  const legacy = { ...rt.initialState, supports: [
    rt.db.support_passives.find((s) => s.name === "墓守"),
    rt.db.death_passives.find((s) => s.name === "覚悟")
  ], deathSupport: null };
  const next = rt.reducer(rt.initialState, { type: "HYDRATE", state: JSON.parse(JSON.stringify(legacy)) });

  assert.equal(next.deathSupport?.name, "覚悟");
  assert.equal(next.supports.length, 1);
  assert.equal(next.supports[0]?.name, "墓守");
});

test("共有シートの士気低下ラベルは本文で描画され、エスケープ済みリテラルを含まない", () => {
  const rt = loadRuntime();
  const html = rt.gen.buildShareSheetHTML({ ...rt.initialState, san: "50", hp: "100" });

  assert.ok(html.includes("士気低下"));
  assert.equal(html.includes("\\u58EB"), false);
});

test("全角数字で書かれた強化本文もHP/SANボーナスへ反映される", () => {
  const rt = loadRuntime();
  // 精神強化A-1〜A-5 は原典本文が「人格のSANを５上昇させる。」（全角５）。
  const enh = rt.db.normal_enhancements.find((e) => e.name === "精神強化A-1");
  assert.equal(enh.effect.includes("５"), true);
  assert.equal(rt.context.window.computeEnhancementBonuses({ enhancements: [enh] }).san, 5);
});

test("先頭が連結「：」のダイス効果はロール表記と二重に付かない", () => {
  const rt = loadRuntime();
  const state = equipPersona(rt, "n", rt.db.normal_personas.find((x) => x.name === "南部リウ協会5課フィクサー"));
  const palette = rt.gen.buildPalette(state);

  assert.equal(palette.includes("：："), false);
  assert.ok(palette.includes("8d2：的中時"));

  let violations = 0;
  for (const persona of [...rt.db.normal_personas, ...rt.db.tokui_personas]) {
    if (rt.gen.buildPalette(equipPersona(rt, "n", persona)).includes("：：")) violations++;
  }
  assert.equal(violations, 0);
});

test("同化型E.G.Oのスロット形態は原典の全8種を過不足なく定義する", () => {
  const rt = loadRuntime();
  // 本番では index.html が generator/state とは別に js/ego-slot-forms.js を読む。
  vm.runInContext(readFileSync(new URL("../js/ego-slot-forms.js", import.meta.url), "utf8"), rt.context, { filename: "js/ego-slot-forms.js" });
  const forms = rt.context.window.LBT_EGO_SLOT_FORMS;
  const expectedForm = (skill) => {
    const text = String(skill?.effect || "");
    if (text.includes("[同化]")) return "assimilation";
    if (text.includes("[影響]")) return "influence";
    return "skill";
  };
  const assimilated = rt.db.egos.filter((e) => (e.sub_skills || []).length > 0);

  assert.equal(assimilated.length, 8);
  assert.equal(Object.keys(forms).length, 8);
  for (const ego of assimilated) {
    const form = forms[`${ego.rank}:${ego.no}`];
    assert.ok(form, `${ego.name} にスロット形態が定義されていない`);
    assert.equal(form.kakusei, expectedForm(ego.kakusei), `${ego.name} の覚醒形態`);
    assert.equal(form.shinshoku, expectedForm(ego.shinshoku), `${ego.name} の侵蝕形態`);
  }

  // 定義どおり覚醒同化型の sub_skills が覚醒側の同化へ載り、侵蝕は通常スキルのまま保つ。
  const ego = rt.db.egos.find((e) => e.rank === "TETH" && e.no === 20);
  const st = rt.reducer(rt.initialState, { type: "SET_EGO_SLOT", rank: "TETH", value: JSON.parse(JSON.stringify(ego)) });
  const kakusei = st.egoSlots?.TETH?.slotVariants?.kakusei;
  assert.equal(kakusei?.active, "assimilation");
  assert.equal((kakusei?.branches?.assimilation?.skills || []).length, ego.sub_skills.length);
  assert.equal(st.egoSlots?.TETH?.slotVariants?.shinshoku?.active, "skill");
});

test("LPを持たない死亡後パッシブはメモ出力で浮いた「LP」を残さない", () => {
  const rt = loadRuntime();
  // 原典の死亡後パッシブ（DBの death_passives）はLP（精神コスト）を持たない。
  const ds = rt.db.death_passives.find((s) => s.name === "覚悟");
  assert.equal(ds.lp, undefined);

  const memo = rt.gen.buildMemo({ ...rt.initialState, deathSupport: { ...ds, id: "test" } });
  const line = memo.split("\n").find((l) => l.includes("覚悟"));
  assert.ok(line, "死亡後パッシブの行がメモに存在する");
  assert.equal(/LP/.test(line), false, `浮いたLP: ${line}`);

  // LPを持つ自作レコードは従来どおり LP 表示を維持する。
  const memo2 = rt.gen.buildMemo({ ...rt.initialState, deathSupport: { id: "test2", name: "自作死亡後", cond: "-", effect: "-", lp: "99" } });
  const line2 = memo2.split("\n").find((l) => l.includes("自作死亡後"));
  assert.ok(/LP99/.test(line2), `LP99 が表示される: ${line2}`);
});