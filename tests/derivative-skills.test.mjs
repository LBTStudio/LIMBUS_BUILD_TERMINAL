import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

/* スキル番号の正式仕様（docs/derivative-skill-audit.md 参照）:
 * 原典PDFでは1つのスキル番号(バッジ)に複数のスキルブロックが割り当てられることがある。
 * それらは印刷順(上から)に N-1, N-2, … と割り振る。N-1 が基礎形態、
 * N-2 以降が派生形態で、派生は derived_from=スロット番号 と derived_index を持つ。
 * 形態が1つしかないスロットはplainな スキルN のままである。 */

function findPersona(collection, no) {
  const persona = (db[collection] || []).find((entry) => String(entry.no) === String(no));
  assert.ok(persona, `${collection} #${no} が存在する`);
  return persona;
}

function findSkill(persona, name) {
  const skill = (persona.skills || []).find((entry) => entry.name === name);
  assert.ok(skill, `${persona.name} の ${name} が存在する`);
  return skill;
}

function slotOf(rank) {
  return String(rank).replace(/-\d+$/, "");
}

test("東部親指カポIIIIの複数形態スロットは印刷順に1始まりの連番になる", () => {
  const persona = findPersona("tokui_personas", 14);
  assert.deepEqual(
    ["二連斬", "二連斬-【爆】", "三連撃", "三連撃-【爆】", "爆砕斬", "快刀亂麻", "超絶猛虎殺撃乱斬"].map((name) => {
      const skill = findSkill(persona, name);
      return [name, skill.rank, skill.derived_from, skill.derived_index, skill.derived_condition];
    }),
    [
      ["二連斬", "スキル1-1", undefined, undefined, undefined],
      ["二連斬-【爆】", "スキル1-2", "スキル1", 2, "自分の弾丸が猛虎標弾なら"],
      ["三連撃", "スキル2-1", undefined, undefined, undefined],
      ["三連撃-【爆】", "スキル2-2", "スキル2", 2, "自分の弾丸が猛虎標弾なら"],
      ["爆砕斬", "スキル3", undefined, undefined, undefined],
      ["快刀亂麻", "スキル4-1", undefined, undefined, undefined],
      ["超絶猛虎殺撃乱斬", "スキル4-2", "スキル4", 2, "自分の弾丸が猛虎標弾なら"]
    ]
  );
});

test("既知の正常化事例は原典どおりの番号を持つ", () => {
  const checks = [
    ["tokui_personas", 28, "フェイント", "スキル0"],
    ["tokui_personas", 28, "隙を突く", "スキル1-1"],
    ["tokui_personas", 28, "メルチェ", "スキル1-2"],
    ["tokui_personas", 28, "エクセキューション", "スキル4-1"],
    ["tokui_personas", 28, "夜の錐", "スキル4-2"],
    ["tokui_personas", 16, "肉斬", "スキル4-1"],
    ["tokui_personas", 16, "骨断", "スキル4-2"],
    ["tokui_personas", 53, "烙印", "スキル0-1"],
    ["tokui_personas", 53, "正午の解体", "スキル0-2"],
    ["tokui_personas", 53, "射出", "スキル4-1"],
    ["tokui_personas", 53, "射出-正午", "スキル4-2"],
    ["normal_personas", 137, "空間切断", "スキル4-1"],
    ["normal_personas", 137, "四次角歪曲時系列切断", "スキル4-2"],
    ["normal_personas", 137, "高速切断", "スキル3"],
    ["tokui_personas", 33, "目でも耳でも追えぬように。", "スキル4-1"],
    ["tokui_personas", 33, "黒獣 卯 奥義-雲解顕現", "スキル4-2"],
    ["tokui_personas", 33, "標刻", "スキル3"],
    ["tokui_personas", 36, "始末", "スキル4-1"],
    ["tokui_personas", 36, "処分", "スキル4-2"],
    ["tokui_personas", 36, "連続切断", "スキル3"],
    ["normal_personas", 133, "回避", "スキル0"],
    ["normal_personas", 133, "子守歌", "スキル1-1"],
    ["normal_personas", 133, "止まらない物語", "スキル1-2"],
    ["normal_personas", 143, "牙を避ける", "スキル0"],
    ["normal_personas", 143, "斧槍術", "スキル1-1"],
    ["normal_personas", 143, "刃を送る", "スキル1-2"],
    ["tokui_personas", 42, "大人しく潰されてください", "スキル4-1"],
    ["tokui_personas", 42, "代行： 抹殺", "スキル4-2"]
  ];
  for (const [collection, no, name, rank] of checks) {
    const persona = findPersona(collection, no);
    assert.equal(findSkill(persona, name).rank, rank, `${persona.name}: ${name}`);
  }
});

test("本文で明示されたスキル変更は同一スロットの派生先を持つ", () => {
  const checks = [
    ["normal_personas", 94, "シャインスピア", "レッドアックス"],
    ["tokui_personas", 9, "レクイエム", "死ぬまで走れ、デュラハンよ"],
    ["tokui_personas", 14, "二連斬", "二連斬-【爆】"],
    ["tokui_personas", 14, "三連撃", "三連撃-【爆】"],
    ["tokui_personas", 14, "快刀亂麻", "超絶猛虎殺撃乱斬"]
  ];
  for (const [collection, no, sourceName, targetName] of checks) {
    const persona = findPersona(collection, no);
    const source = findSkill(persona, sourceName);
    const target = findSkill(persona, targetName);
    assert.equal(slotOf(target.rank), slotOf(source.rank), `${persona.name}: ${targetName} のスロット`);
    assert.equal(target.derived_index, 2, `${persona.name}: ${targetName} の派生番号`);
    assert.equal(target.rank, `${slotOf(source.rank)}-2`, `${persona.name}: ${targetName} の表示番号`);
  }
});

test("派生スキルは実在するスロットだけを参照し、番号は導出式どおりである", () => {
  for (const collection of ["normal_personas", "tokui_personas"]) {
    for (const persona of db[collection] || []) {
      const slots = new Map();
      for (const skill of persona.skills || []) {
        const match = String(skill.rank || "").match(/^スキル(\d+)(?:-(\d+))?$/);
        assert.ok(match, `${persona.name}: ${skill.name} の異常なrank "${skill.rank}"`);
        const slot = match[1];
        if (!slots.has(slot)) slots.set(slot, []);
        slots.get(slot).push(skill);
      }
      for (const [slot, forms] of slots) {
        if (forms.length === 1) {
          assert.equal(forms[0].rank, `スキル${slot}`, `${persona.name}: スロット${slot} は単一形態なのでplainであること`);
          assert.equal(forms[0].derived_from, undefined, `${persona.name}: ${forms[0].name} は基礎なのでメタデータを持たない`);
        } else {
          const indexes = forms.map((form) => Number(String(form.rank).split("-")[1]));
          assert.deepEqual(indexes.sort(), Array.from({ length: forms.length }, (_, i) => i + 1), `${persona.name}: スロット${slot} は1..${forms.length}の連番であること`);
          for (const form of forms) {
            const index = Number(String(form.rank).split("-")[1]);
            if (index === 1) continue;
            assert.equal(form.derived_from, `スキル${slot}`, `${persona.name}: ${form.name} の参照スロット`);
            assert.equal(form.derived_index, index, `${persona.name}: ${form.name} の派生番号`);
            assert.equal(form.rank, `${form.derived_from}-${form.derived_index}`, `${persona.name}: ${form.name} の派生表示`);
          }
        }
      }
    }
  }
});
