import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

const spiritDefinitions = [
  { name: "無料・数値", price: 0 },
  { name: "無料・文字列", price: "0" },
  { name: "有料", price: 10 },
  { name: "価格欠落" },
  { name: "価格null", price: null },
  { name: "価格空欄", price: "" },
  { name: "価格不正", price: "unknown" }
];

function loadReducer() {
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    get length() { return 0; }
  };
  const context = {
    window: { DB: { spirits: spiritDefinitions }, localStorage: storage },
    console,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    Date,
    Math
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return { reducer: context.window.appReducer, initial: context.window.INIT_STATE };
}

test("初期枠の選択は価格0が明示された精神だけに限定する", () => {
  const { reducer, initial } = loadReducer();
  const state = {
    ...JSON.parse(JSON.stringify(initial)),
    initialSpirits: [],
    roster: { ...(initial.roster || {}), spirits: [] }
  };

  const selected = reducer(state, {
    type: "SET_INITIAL_SPIRITS",
    names: ["無料・数値", "有料", "価格欠落", "無料・文字列", "価格不正"]
  });
  assert.deepEqual(Array.from(selected.initialSpirits), ["無料・数値", "無料・文字列"]);
});

test("古い保存値や直接dispatchでも有料・価格不明の精神は無料追加されない", () => {
  const { reducer, initial } = loadReducer();
  const state = {
    ...JSON.parse(JSON.stringify(initial)),
    initialSpirits: ["有料", "価格欠落", "価格null", "無料・数値"],
    roster: { ...(initial.roster || {}), spirits: [] }
  };

  const applied = reducer(state, { type: "APPLY_INITIAL_SPIRITS" });
  assert.deepEqual(
    Array.from(applied.roster.spirits, (spirit) => spirit.name),
    ["無料・数値"]
  );
});
