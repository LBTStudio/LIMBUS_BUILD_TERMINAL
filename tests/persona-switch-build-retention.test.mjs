import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

function loadState() {
  const context = { window: {}, console, setTimeout, clearTimeout, localStorage: { getItem() { return null; }, setItem() {} }, React: { createElement() {} } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return { reducer: context.window.appReducer, init: context.window.INIT_STATE };
}

function persona(no, name) {
  return {
    no, name, hp: 100, san: 45, speed: "1d5", res_slash: "普通", res_pierce: "普通", res_blunt: "普通",
    keywords: [], passive_name: "", passive_cond: "", passive_always: "", passive_effect: "", unique_buffs: [], skills: []
  };
}

test("人格Aから人格Bへ切り替えて戻ってもE.G.O・精神・強化・サポートが保持される", () => {
  const { reducer, init } = loadState();
  const a = persona(1, "人格A");
  const b = persona(2, "人格B");
  let state = reducer(init, { type: "EQUIP_PERSONA", mode: "n", no: 1, src: a });
  state = reducer(state, { type: "SET_FIELD", field: "egoSlots", value: { ZAYIN: { no: 101, name: "E.G.O-A" }, TETH: null, HE: null, WAW: null, ALEPH: null } });
  state = reducer(state, { type: "SET_FIELD", field: "spirit", value: "精神A" });
  state = reducer(state, { type: "SET_FIELD", field: "enhancements", value: [{ id: "enh-a", name: "強化A", effect: "" }] });
  state = reducer(state, { type: "SET_FIELD", field: "supports", value: [{ id: "support-a", name: "サポートA", effect: "" }] });
  state = reducer(state, { type: "EQUIP_PERSONA", mode: "n", no: 2, src: b });
  assert.equal(state.personaNo, 2);
  state = reducer(state, { type: "EQUIP_PERSONA", mode: "n", no: 1, src: a });
  assert.equal(state.personaNo, 1);
  assert.equal(state.egoSlots.ZAYIN.name, "E.G.O-A");
  assert.equal(state.spirit, "精神A");
  assert.equal(state.enhancements[0].name, "強化A");
  assert.equal(state.supports[0].name, "サポートA");
});
