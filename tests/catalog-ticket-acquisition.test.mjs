import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DB = {
  normal_personas: [{ no: 1, name: "通常人格" }],
  tokui_personas: [{ no: 1, name: "特異人格" }],
  egos: [{ no: 1, rank: "HE", name: "検証E.G.O", shards: 15 }],
  normal_enhancements: [], special_enhancements: [], items: [], specialItems: [],
  support_passives: [], death_passives: [], spirits: []
};
const window = { DB, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
for (const file of ["js/ledger-provenance.js", "js/state.js"]) {
  vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
}
const reducer = context.window.appReducer;
const balance = (state) => context.window.LBT_computeTicketBalance(state.results, state.entries);
function stateWith({ personaTickets = 0, egoTickets = 0, shards = 0, personas = [], egos = [], resultId = "res-1", resultName = "第一夜" } = {}) {
  return {
    roster: { personas, egos, supports: [], spirits: [] },
    results: [{
      id: resultId, name: resultName, date: "2026-11-04",
      income: { lp: 0, shards, tickets: { persona: personaTickets, ego: egoTickets, choice: 0, pack: {} } }
    }],
    entries: [], inventory: [], enhancements: []
  };
}

test("人格の配布チケット取得はチケット1枚と所持追加を一度に確定する", () => {
  const initial = stateWith({ personaTickets: 1, resultId: "res-initial", resultName: "初期作成" });
  const next = reducer(initial, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "persona", mode: "n", no: 1 });
  assert.equal(next.roster.personas.length, 1);
  assert.equal(balance(next).persona, 0);
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].tickets.persona, 1);
  assert.equal(next.entries[0].ref.kind, "catalogAcquire");
  assert.equal(next.entries[0].resultId, "res-initial");
  assert.equal(next.entries.some((entry) => entry.ref?.kind === "initialPersonaTicket"), false,
    "配布チケット取得で初期人格チケットを二重消費しない");
});

test("人格チケットが無ければ所持も台帳も変更しない", () => {
  const before = stateWith({ personaTickets: 0 });
  const next = reducer(before, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "persona", mode: "n", no: 1 });
  assert.strictEqual(next, before);
  assert.equal(next.roster.personas.length, 0);
  assert.equal(next.entries.length, 0);
});

test("既所持人格の再取得はチケットを消費しない", () => {
  const before = stateWith({ personaTickets: 2, personas: [{ uid: "p1", mode: "n", no: 1 }] });
  const next = reducer(before, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "persona", mode: "n", no: 1 });
  assert.strictEqual(next, before);
  assert.equal(balance(next).persona, 2);
});

test("DBに存在しない人格はチケットを消費せず取得できない", () => {
  const before = stateWith({ personaTickets: 2 });
  const next = reducer(before, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "persona", mode: "n", no: 999 });
  assert.strictEqual(next, before);
});

test("E.G.Oの配布チケット取得も1枚消費と所持追加を原子的に行う", () => {
  const before = stateWith({ egoTickets: 1 });
  const next = reducer(before, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "ego", rank: "HE", no: 1 });
  assert.equal(next.roster.egos.length, 1);
  assert.equal(balance(next).ego, 0);
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].tickets.ego, 1);
  assert.equal(next.entries[0].ref.kind, "catalogAcquire");
});

test("チケット取得したE.G.Oを所持から外しても使用済みチケットは返還しない", () => {
  const before = stateWith({ egoTickets: 1 });
  const acquired = reducer(before, { type: "ACQUIRE_ROSTER_WITH_TICKET", kind: "ego", rank: "HE", no: 1 });
  const uid = acquired.roster.egos[0].uid;
  const removed = reducer(acquired, { type: "REMOVE_ROSTER_EGO", uid });
  assert.equal(removed.roster.egos.length, 0);
  assert.equal(removed.entries.length, 1, "抽出チケットの消費履歴は所持レコードから独立");
  assert.equal(balance(removed).ego, 0);
});

test("E.G.Oのランダム抽出は番号ごとの購入価格でなく100欠片を使う", () => {
  const poor = stateWith({ shards: 99 });
  const rejected = reducer(poor, {
    type: "ADD_ROSTER_EGO", rank: "HE", no: 1, purchase: true, acquisition: "gachaPaid"
  });
  assert.strictEqual(rejected, poor, "99欠片では100欠片の抽出を実行しない");
  const exact = stateWith({ shards: 100 });
  const acquired = reducer(exact, {
    type: "ADD_ROSTER_EGO", rank: "HE", no: 1, purchase: true, acquisition: "gachaPaid"
  });
  assert.equal(acquired.roster.egos.length, 1);
  assert.equal(acquired.entries.length, 1);
  assert.equal(acquired.entries[0].cost.shards, 100);
  assert.equal(context.window.LBT_computeLedgerBalance(acquired.results, acquired.entries).shards, 0);
});

test("E.G.Oの指定購入は従来どおりDB個別価格を請求する", () => {
  const before = stateWith({ shards: 15 });
  const acquired = reducer(before, { type: "ADD_ROSTER_EGO", rank: "HE", no: 1, purchase: true });
  assert.equal(acquired.roster.egos.length, 1);
  assert.equal(acquired.entries.length, 1);
  assert.equal(acquired.entries[0].cost.shards, 15);
});

test("図鑑UIは人格とE.G.Oの選択取得方法をチケット用actionへ渡す", () => {
  const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  const otherSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  assert.match(personaSource, /if \(acquireHow === "ticket"\)[\s\S]{0,500}ACQUIRE_ROSTER_WITH_TICKET/);
  assert.match(otherSource, /function acquireEgoFromCatalog\(state, dispatch, ego, how = "purchase"\)/);
  assert.match(otherSource, /if \(how === "ticket"\)[\s\S]{0,400}ACQUIRE_ROSTER_WITH_TICKET/);
  assert.match(otherSource, /onAcquire: \(\) => acquireEgoFromCatalog\(state, dispatch, selected, acquireHow\)/);
  assert.match(otherSource, /how === "gacha" \? \{ acquisition: "gachaPaid" \}/);
  assert.match(otherSource, /how === "ticket"[\s\S]{0,160}E\.G\.O抽出チケット 1枚/);
});
