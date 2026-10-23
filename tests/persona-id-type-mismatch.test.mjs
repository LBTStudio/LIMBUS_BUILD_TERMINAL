import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const official = {
  no: 17, name: "公式人格", hp: 111, san: 45, speed: "1d5", bullets: "×",
  res_slash: "普通", res_pierce: "抵抗", res_blunt: "弱点",
  passive_name: "公式パッシブ", passive_cond: "", passive_always: "", passive_effect: "最新の原典本文",
  keywords: [], skills: [], unique_buffs: []
};

function loadState() {
  const context = {
    window: { DB: { normal_personas: [official], tokui_personas: [] } },
    console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
    React: { createElement() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  context.window.DB = { normal_personas: [official], tokui_personas: [] };
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, init: context.window.INIT_STATE };
}

function stateWithPersona(init, personaNo, rosterNo, personaSrc) {
  return {
    ...init,
    personaMode: "n",
    personaNo,
    personaSrc,
    roster: {
      ...init.roster,
      personas: [{ uid: "pr-17", mode: "n", no: rosterNo, equipped: true, displayName: personaSrc.name, updatedAt: 1 }]
    }
  };
}

test("PATCH_PERSONA_META updates roster displayName even when account restore mixed numeric and string No", () => {
  const { reducer, init } = loadState();
  const original = stateWithPersona(init, 17, "17", { no: 17, name: "旧同期名" });
  const next = reducer(original, { type: "PATCH_PERSONA_META", patch: { src: { name: "新同期名" } } });
  assert.equal(next.personaSrc.name, "新同期名");
  assert.equal(next.roster.personas[0].displayName, "新同期名");
  assert.ok(next.roster.personas[0].updatedAt > 1);
});

test("removing the active persona with a string No resets its build to the DB source", () => {
  const { reducer, init } = loadState();
  const original = stateWithPersona(init, 17, "17", { no: "17", name: "編集済み人格", hp: "80" });
  const next = reducer(original, { type: "REMOVE_ROSTER", uid: "pr-17" });
  assert.equal(next.personaSrc.name, "公式人格");
  assert.equal(next.personaSrc.passive_effect, "最新の原典本文");
  assert.equal(next.hp, "111");
  assert.equal(next.roster.personas.length, 0);
});

test("HYDRATE refreshes DB-backed persona text when saved personaNo is a string", () => {
  const { reducer, init } = loadState();
  const next = reducer(init, {
    type: "HYDRATE",
    state: {
      personaMode: "n",
      personaNo: "17",
      personaSrc: { no: "17", name: "公式人格", hp: 111, passive_effect: "古い保存本文", unique_buffs: [], skills: [], keywords: [] },
      roster: { ...init.roster, personas: [] }
    }
  });
  assert.equal(next.personaSrc.passive_effect, "最新の原典本文");
});
