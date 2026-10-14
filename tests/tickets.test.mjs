import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 抽取権利は分類付き在庫（配列）。パック別チケットは1パック1行で数え、
   残数は LP/欠片と同じ「数」として持つ。0 の行は残さない。 */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const window = { DB: { normal_personas: [], tokui_personas: [], egos: [], items: [], support_passives: [] }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "state.js" });

const reducer = context.window.appReducer;
const countOf = context.window.LBT_ticketCount;
const base = { roster: { personas: [], egos: [], supports: [], spirits: [] }, tickets: [], results: [], entries: [], inventory: [] };

test("分類ごとに独立した在庫を持つ", () => {
  let s = reducer(base, { type: "GRANT_TICKET", kind: "persona", count: 3 });
  s = reducer(s, { type: "GRANT_TICKET", kind: "ego", count: 2 });
  assert.equal(countOf(s.tickets, "persona"), 3);
  assert.equal(countOf(s.tickets, "ego"), 2);
  assert.equal(countOf(s.tickets, "choice"), 0);
});

test("パック別チケットは 1 パック 1 行で数える", () => {
  let s = reducer(base, { type: "GRANT_TICKET", kind: "pack", pack: "ロボトミーコーポレーション", count: 2 });
  s = reducer(s, { type: "GRANT_TICKET", kind: "pack", pack: "肉斬骨断", count: 5 });
  s = reducer(s, { type: "GRANT_TICKET", kind: "pack", pack: "肉斬骨断", count: 1 });
  assert.equal(s.tickets.filter((t) => t.kind === "pack").length, 2, "同じパックは行を足さない");
  assert.equal(countOf(s.tickets, "pack", "肉斬骨断"), 6, "同パックは合算");
  assert.equal(countOf(s.tickets, "pack", "ロボトミーコーポレーション"), 2, "別パックは別");
});

test("パック指定が無い pack チケットは作らない", () => {
  const s = reducer(base, { type: "GRANT_TICKET", kind: "pack", count: 1 });
  assert.equal(s.tickets.length, 0);
});

test("使う = 減算され、残数 0 の行は消える", () => {
  let s = reducer(base, { type: "GRANT_TICKET", kind: "ego", count: 1 });
  s = reducer(s, { type: "GRANT_TICKET", kind: "ego", count: -1 });
  assert.equal(countOf(s.tickets, "ego"), 0);
  assert.equal(s.tickets.filter((t) => t.kind === "ego").length, 0, "0 の行は残さない");
});

test("在庫は 0 未満にならない", () => {
  const s = reducer(base, { type: "GRANT_TICKET", kind: "persona", count: -99 });
  assert.equal(countOf(s.tickets, "persona"), 0);
});

test("未知の種別と 0 は何も変えない", () => {
  assert.equal(reducer(base, { type: "GRANT_TICKET", kind: "nope", count: 5 }), base);
  assert.equal(reducer(base, { type: "GRANT_TICKET", kind: "persona", count: 0 }), base);
  assert.equal(reducer(base, { type: "SET_TICKET_COUNT", kind: "nope", count: 1 }), base);
});

test("SET_TICKET_COUNT で残数を直接指定できる", () => {
  const s = reducer(base, { type: "SET_TICKET_COUNT", kind: "choice", count: 9 });
  assert.equal(countOf(s.tickets, "choice"), 9);
  const cleared = reducer(s, { type: "SET_TICKET_COUNT", kind: "choice", count: 0 });
  assert.equal(cleared.tickets.length, 0, "0 にすると行が消える");
});

test("旧セーブの {persona:3} 形式は配列へ読み替わる", () => {
  const legacy = { ...base, tickets: { persona: 3, ego: 1 } };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.ok(Array.isArray(next.tickets), "配列になる");
  assert.equal(countOf(next.tickets, "persona"), 3);
  assert.equal(countOf(next.tickets, "ego"), 1);
});

test("tickets が無い旧セーブは空配列になる", () => {
  const legacy = { ...base };
  delete legacy.tickets;
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.deepEqual([...next.tickets], []);
});

test("パック別チケットは『〈パック名〉抽出チケット』と表記される", () => {
  const label = context.window.LBT_ticketLabel;
  assert.equal(label("persona"), "人格抽出チケット");
  assert.equal(label("ego"), "E.G.O抽出チケット");
  /* 卓では「そのパックなら引ける」という名前で配られることが多い。 */
  assert.equal(label("pack", "肉斬骨断"), "〈肉斬骨断〉抽出チケット");
  assert.equal(label("pack", null), "特定抽出パック", "パック未指定なら総称");
});

test("リザルトが空なら『初期作成』を作り、キャラ作成時の30LPを収入に置く", () => {
  const fresh = { ...base, results: [], entries: [] };
  const next = context.window.LBT_normalizeStateShape(fresh);
  assert.equal(next.results.length, 1, "初期作成が1件できる");
  const initial = next.results[0];
  assert.equal(initial.name, "初期作成");
  assert.equal(initial.income.lp, 30, "core:344 キャラ作成時30LP");
  assert.equal(initial.income.shards, 0);
  /* 最初に選んだ人格などの支出は、この1件しかないためここに帰属する。 */
  assert.equal(context.window.LBT_latestResultId(next), initial.id);
});

test("既にリザルトのあるアカウントには初期作成を足さない（二重計上を避ける）", () => {
  const played = {
    ...base,
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "500" } }],
    entries: []
  };
  const next = context.window.LBT_normalizeStateShape(played);
  assert.equal(next.results.length, 1, "増えない");
  assert.equal(next.results[0].name, "第一夜");
});