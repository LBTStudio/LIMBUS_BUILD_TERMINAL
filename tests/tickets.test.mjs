import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 抽出権利（ローカルルール）の在庫は、加算と減算の両方で効く必要がある。
   減算を 0 で潰すと「1枚使う」が無効になり、在庫が減らない。 */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const window = { DB: { normal_personas: [], tokui_personas: [], egos: [], items: [], support_passives: [] }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "state.js" });

const reducer = context.window.appReducer;
const base = {
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  tickets: { persona: 5, ego: 2, choice: 1 },
  results: [],
  entries: [],
  inventory: []
};

test("抽出権利は3種が独立した在庫を持つ", () => {
  const next = reducer(base, { type: "GRANT_TICKET", kind: "ego", count: 3 });
  assert.equal(next.tickets.ego, 5, "E.G.Oだけ増える");
  assert.equal(next.tickets.persona, 5, "人格は変わらない");
  assert.equal(next.tickets.choice, 1, "選択は変わらない");
});

test("抽出権利は減算できる（使う=消費）", () => {
  const next = reducer(base, { type: "GRANT_TICKET", kind: "persona", count: -1 });
  assert.equal(next.tickets.persona, 4, "1枚使ったら減る");
});

test("在庫は0未満にならない", () => {
  const next = reducer(base, { type: "GRANT_TICKET", kind: "persona", count: -99 });
  assert.equal(next.tickets.persona, 0, "0で留まる");
});

test("未知の種別と0は state を変えない", () => {
  assert.equal(reducer(base, { type: "GRANT_TICKET", kind: "nope", count: 5 }), base);
  assert.equal(reducer(base, { type: "GRANT_TICKET", kind: "persona", count: 0 }), base);
  assert.equal(reducer(base, { type: "SET_TICKET_COUNT", kind: "nope", count: 1 }), base);
});

test("SET_TICKET_COUNT で直接設定できる", () => {
  const next = reducer(base, { type: "SET_TICKET_COUNT", kind: "choice", count: 9 });
  assert.equal(next.tickets.choice, 9);
});

test("旧保存データに tickets が無くても 0 で補完される", () => {
  const legacy = { ...base };
  delete legacy.tickets;
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.deepEqual(
    { ...next.tickets },
    { persona: 0, ego: 0, choice: 0 },
    "旧データを開いても在庫が壊れない"
  );
});