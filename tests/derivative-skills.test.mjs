import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

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

test("東部親指カポIIIIの戦術スキルは1〜4の連番で、派生は同一番号として登録される", () => {
  const persona = findPersona("tokui_personas", 14);
  assert.deepEqual(
    ["二連斬", "二連斬-【爆】", "三連撃", "三連撃-【爆】", "爆砕斬", "快刀亂麻", "超絶猛虎殺撃乱斬"].map((name) => {
      const skill = findSkill(persona, name);
      return [name, skill.rank, skill.derived_from, skill.derived_index, skill.derived_condition];
    }),
    [
      ["二連斬", "スキル1", undefined, undefined, undefined],
      ["二連斬-【爆】", "スキル1-2", "スキル1", 2, "自分の弾丸が猛虎標弾なら"],
      ["三連撃", "スキル2", undefined, undefined, undefined],
      ["三連撃-【爆】", "スキル2-2", "スキル2", 2, "自分の弾丸が猛虎標弾なら"],
      ["爆砕斬", "スキル3", undefined, undefined, undefined],
      ["快刀亂麻", "スキル4", undefined, undefined, undefined],
      ["超絶猛虎殺撃乱斬", "スキル4-2", "スキル4", 2, "自分の弾丸が猛虎標弾なら"]
    ]
  );
});

test("本文で明示されたスキル変更は同一番号の派生先を持つ", () => {
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
    assert.equal(target.derived_from, source.rank, `${persona.name}: ${targetName} の派生元`);
    assert.equal(target.derived_index, 2, `${persona.name}: ${targetName} の派生番号`);
    assert.equal(target.rank, `${source.rank}-2`, `${persona.name}: ${targetName} の表示番号`);
  }
});

test("派生スキルは存在する基礎番号だけを参照する", () => {
  for (const collection of ["normal_personas", "tokui_personas"]) {
    for (const persona of db[collection] || []) {
      const ranks = new Set((persona.skills || []).map((skill) => skill.rank));
      for (const skill of persona.skills || []) {
        if (!skill.derived_from) continue;
        assert.ok(ranks.has(skill.derived_from), `${persona.name}: ${skill.name} の基礎番号 ${skill.derived_from}`);
        assert.equal(skill.rank, `${skill.derived_from}-${skill.derived_index}`, `${persona.name}: ${skill.name} の派生表示`);
      }
    }
  }
});
