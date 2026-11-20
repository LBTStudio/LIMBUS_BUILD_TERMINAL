import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const dbEgo = {
  rank: "TETH", no: 17, name: "公式E.G.O", resources: "", san_cost: 0, shards: 0,
  passive_name: "公式パッシブ", passive_cond: "", passive_effect: "原典効果",
  kakusei: { attr: "斬撃", sin: "憤怒", effect: "原典", dice: [] },
  shinshoku: { attr: "斬撃", sin: "憤怒", effect: "原典", dice: [] },
  sub_skills: []
};

function loadState() {
  const context = {
    window: { DB: { normal_personas: [], tokui_personas: [], egos: [dbEgo] } },
    console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
    React: { createElement() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  context.window.DB = { normal_personas: [], tokui_personas: [], egos: [dbEgo] };
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, init: context.window.INIT_STATE };
}

function stateWithMixedIds(init, slotNo = "17", entryNo = 17) {
  const slot = {
    __custom: true, rank: "TETH", no: slotNo, name: "編集済み創作E.G.O",
    resources: "", san_cost: 0, shards: 0,
    kakusei: { attr: "斬撃", sin: "憤怒", effect: "編集効果", dice: [] },
    shinshoku: { attr: "斬撃", sin: "憤怒", effect: "編集効果", dice: [] },
    sub_skills: []
  };
  return {
    ...init,
    egoSlots: { ...init.egoSlots, TETH: slot },
    roster: {
      ...init.roster,
      egos: [{
        uid: "er-17", rank: "TETH", no: entryNo, analyzed: true, analyzeMax: false,
        notes: "", build: { ...slot, savedAt: 10 }
      }]
    }
  };
}

test("E.G.O編集を同期してもNo型違いで所持行を重複作成しない", () => {
  const { reducer, init } = loadState();
  const original = stateWithMixedIds(init);
  const next = reducer(original, { type: "PATCH_EGO_SLOT", rank: "TETH", patch: { name: "更新後の創作E.G.O" } });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].uid, "er-17");
  assert.equal(next.roster.egos[0].name, undefined);
  assert.equal(next.roster.egos[0].build.name, "更新後の創作E.G.O");
});

test("解析ビルド保存時もNo型違いで所持E.G.Oを増殖させない", () => {
  const { reducer, init } = loadState();
  const original = stateWithMixedIds(init, "17", 17);
  const next = reducer(original, { type: "SAVE_EGO_BUILD", rank: "TETH" });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].uid, "er-17");
  assert.equal(next.roster.egos[0].build.no, "17");
});

test("再装備はNo型違いでも既存の保存カスタムビルドを復元する", () => {
  const { reducer, init } = loadState();
  const original = {
    ...init,
    egoSlots: { ...init.egoSlots, TETH: null },
    roster: {
      ...init.roster,
      egos: [{
        uid: "er-17", rank: "TETH", no: 17, analyzed: true, analyzeMax: false,
        notes: "", build: { __custom: true, rank: "TETH", no: 17, name: "保存済み創作E.G.O", kakusei: {}, shinshoku: {}, sub_skills: [] }
      }]
    }
  };
  const next = reducer(original, { type: "SET_EGO_SLOT", rank: "TETH", value: { rank: "TETH", no: "17", name: "DBプレビュー", kakusei: {}, shinshoku: {}, sub_skills: [] } });
  assert.equal(next.egoSlots.TETH.name, "保存済み創作E.G.O");
  assert.equal(next.roster.egos.length, 1);
});

test("DB原典へ戻す時はNo型違いでも保存ビルドを解除する", () => {
  const { reducer, init } = loadState();
  const original = stateWithMixedIds(init, "17", 17);
  const next = reducer(original, { type: "RESET_EGO_SLOT_TO_DB", rank: "TETH" });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(next.roster.egos[0].uid, "er-17");
  assert.equal(next.roster.egos[0].build, null);
  assert.equal(next.egoSlots.TETH.name, "公式E.G.O");
});
