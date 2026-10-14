import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 抽出チケットは卓で報酬として受け渡されるため、リザルトの収入として管理する。
   所持の残数は「全リザルトの収入 − 全明細の消費」で求める。 */

const DB = { normal_personas: [{ no: 1, name: "黒雲会組員" }], tokui_personas: [], egos: [], items: [] };
const window = { DB, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
for (const f of ["js/ledger-provenance.js", "js/state.js"]) {
  vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), context, { filename: f });
}

const reducer = context.window.appReducer;
const balanceOf = (s) => context.window.LBT_computeTicketBalance(s.results, s.entries);
const withResult = (tickets, extra) => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "0", shards: "0", tickets }, entries: [] }],
  entries: [],
  inventory: [],
  ...extra
});

test("収入は種別別に数える", () => {
  const s = withResult({ persona: 2, ego: 1, choice: 0, pack: { "肉斬骨断": 3 } });
  const b = balanceOf(s);
  assert.equal(b.persona, 2);
  assert.equal(b.ego, 1);
  assert.equal(b.pack["肉斬骨断"], 3);
});

test("パック別はパックごとに独立して数える", () => {
  const s = withResult({ pack: { "肉斬骨断": 2, "ロボトミーコーポレーション": 1 } });
  const b = balanceOf(s);
  assert.equal(b.pack["肉斬骨断"], 2);
  assert.equal(b.pack["ロボトミーコーポレーション"], 1);
  assert.equal(b.pack["向き合わない"], undefined, "未 Cue のパックは 0");
});

test("GRANT_TICKET は直近リザルトの収入に積む", () => {
  const s = reducer(withResult({}), { type: "GRANT_TICKET", kind: "ego", count: 2 });
  assert.equal(balanceOf(s).ego, 2);
  assert.equal(s.results[0].income.tickets.ego, 2, "リザルトの収入に入る");
  /* 独立した在庫は持たない。残数は収支から求める。 */
  assert.ok(!Array.isArray(s.tickets) || s.tickets.length === 0, "旧在庫は空のまま");
});

test("パック別の付与はパック名を収入に刻む", () => {
  const s = reducer(withResult({}), { type: "GRANT_TICKET", kind: "pack", pack: "肉斬骨断", count: 4 });
  assert.equal(balanceOf(s).pack["肉斬骨断"], 4);
});

test("SPEND_TICKET は消費として明細に残る", () => {
  const granted = reducer(withResult({ persona: 3 }), {});
  const spent = reducer(granted, { type: "SPEND_TICKET", kind: "persona", ref: { kind: "gacha", no: 1 } });
  assert.equal(balanceOf(spent).persona, 2, "収入 − 消費");
  assert.equal(spent.entries.length, 1, "明細が1件増える");
  assert.equal(spent.entries[0].kind, "ticket");
  assert.equal(spent.entries[0].tickets.persona, 1);
  /* 消費は直近リザルトに帰属し、そこで支出として見える。 */
  assert.equal(spent.entries[0].resultId, "res-1");
});

test("残数 0 のときに SPEND_TICKET は何も起こさない", () => {
  const s = withResult({});
  const spent = reducer(s, { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(spent.entries.length, 0);
});

test("SET_TICKET_COUNT は残数の目標値に合わせる", () => {
  const s = reducer(withResult({ persona: 2 }), { type: "SET_TICKET_COUNT", kind: "persona", count: 5 });
  assert.equal(balanceOf(s).persona, 5);
  const down = reducer(s, { type: "SET_TICKET_COUNT", kind: "persona", count: 1 });
  assert.equal(balanceOf(down).persona, 1);
});

test("旧セーブの state.tickets はリザルト収入へ移行する", () => {
  const legacy = {
    ...withResult({}),
    tickets: [
      { kind: "persona", pack: null, count: 2 },
      { kind: "pack", pack: "肉斬骨断", count: 1 }
    ]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  const b = balanceOf(next);
  assert.equal(b.persona, 2, "所持が収入へ移る");
  assert.equal(b.pack["肉斬骨断"], 1, "パック名も移る");
  assert.deepEqual([...next.tickets], [], "旧在庫は空になる");
  assert.ok(next.results.some((r) => r.name === "抽出チケットの受領"), "受領リザルトができる");
});

test("同じ内容が既に収入にある場合は移行しない（二重計上を避ける）", () => {
  const legacy = {
    ...withResult({ persona: 2 }),
    tickets: [{ kind: "persona", pack: null, count: 2 }]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(balanceOf(next).persona, 2, "増えない");
  assert.equal(next.results.filter((r) => r.name === "抽出チケットの受領").length, 0);
});

test("パック別チケットは『〈パック名〉抽出チケット』と表記される", () => {
  const label = context.window.LBT_ticketLabel;
  assert.equal(label("persona"), "人格抽出チケット");
  assert.equal(label("ego"), "E.G.O抽出チケット");
  assert.equal(label("pack", "肉斬骨断"), "〈肉斬骨断〉抽出チケット");
  assert.equal(label("pack", null), "特定抽出パック");
});

test("リザルトが空なら『初期作成』を作り、キャラ作成時の30LPを収入に置く", () => {
  const fresh = { roster: { personas: [], egos: [], supports: [], spirits: [] }, results: [], entries: [], inventory: [] };
  const next = context.window.LBT_normalizeStateShape(fresh);
  assert.equal(next.results.length, 1);
  assert.equal(next.results[0].name, "初期作成");
  assert.equal(next.results[0].income.lp, 30);
  assert.equal(context.window.LBT_latestResultId(next), next.results[0].id);
});

test("継承アカウント: 直近リザルトが初期支給(30LP)と一致するなら足さない", () => {
  const already = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "30", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = context.window.LBT_normalizeStateShape(already);
  assert.equal(next.results.length, 1);
  assert.equal(next.results[0].name, "第一夜");
});

test("継承アカウント: 支給が一致しなければ先頭に初期作成を置く", () => {
  const legacy = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "500" } }],
    entries: [], inventory: []
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(next.results.length, 2);
  assert.equal(next.results[0].id, "res-initial");
  assert.equal(next.results[1].name, "第一夜");
});

test("初期作成の30LPから人格購入が差し引かれる", () => {
  const fresh = context.window.LBT_normalizeStateShape({
    roster: { personas: [], egos: [], supports: [], spirits: [] }, results: [], entries: [], inventory: []
  });
  const before = context.window.LBT_computeLedgerBalance(fresh.results, fresh.entries).lp;
  assert.equal(before, 30);
  const next = reducer(fresh, { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(context.window.LBT_computeLedgerBalance(next.results, next.entries).lp, 10);
  assert.equal(next.entries[0].resultId, "res-initial");
});