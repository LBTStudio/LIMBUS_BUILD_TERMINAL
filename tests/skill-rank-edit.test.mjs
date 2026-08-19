import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadStateReducer() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

test("既にスキル1-2があっても、スキル1-3を同じ派生番号へ変更できる", () => {
  const { reducer, initState } = loadStateReducer();
  const state = {
    ...initState,
    skills: [
      { id: "skill-1", rank: "スキル1", name: "基礎" },
      { id: "skill-1-2", rank: "スキル1-2", derived_from: "スキル1", derived_index: 2, name: "既存派生" },
      { id: "skill-1-3", rank: "スキル1-3", derived_from: "スキル1", derived_index: 3, name: "変更対象" }
    ]
  };

  const updated = reducer(state, { type: "PATCH_SKILL", id: "skill-1-3", patch: { rank: "スキル1-2" } });
  const target = updated.skills.find((skill) => skill.id === "skill-1-3");

  assert.equal(target.rank, "スキル1-2");
  assert.equal(target.derived_from, "スキル1");
  assert.equal(target.derived_index, 2);
  assert.equal(updated.skills.filter((skill) => skill.rank === "スキル1-2").length, 2);
});

test("オーダー欄は省略した1-2形式の入力をスキル1-2として確定できる", () => {
  const { reducer, initState } = loadStateReducer();
  const state = {
    ...initState,
    skills: [
      { id: "skill-1", rank: "スキル1", name: "基礎" },
      { id: "skill-1-3", rank: "スキル1-3", derived_from: "スキル1", derived_index: 3, name: "変更対象" }
    ]
  };

  const updated = reducer(state, { type: "PATCH_SKILL", id: "skill-1-3", patch: { rank: "1-2" } });
  const target = updated.skills.find((skill) => skill.id === "skill-1-3");

  assert.equal(target.rank, "スキル1-2");
  assert.equal(target.derived_from, "スキル1");
  assert.equal(target.derived_index, 2);
});
