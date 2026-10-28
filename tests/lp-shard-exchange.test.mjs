import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const legacyExchange = {
  id: "res-legacy-exchange",
  name: "旧変換記録",
  date: "2026-01-02",
  income: { lp: 100, shards: 2 },
  exchange: { lp: 10, shards: 5 },
  note: "既存キャンペーン報酬",
};

function loadState() {
  const context = {
    window: {
      DB: {
        items: [],
        specialItems: [
          { id: "resource-ego-shard", name: "自我の欠片", specialResource: true, ledgerResource: "shards", price: "2LP" },
          { id: "resource-glass-shard", name: "硝子の破片", specialResource: true }
        ],
        support_passives: [], death_passives: [], spirits: [],
        normal_enhancements: [], special_enhancements: []
      }
    },
    console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);
  return context.window;
}

const state = loadState();

test("旧LP→自我の欠片変換は読み込み時に収入とLP支出明細へ一度だけ移行する", () => {
  const normalize = state.LBT_normalizeStateShape;
  const balance = state.LBT_computeLedgerBalance;
  const source = {
    results: [legacyExchange],
    entries: [],
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    supports: [], deathSupport: null, spirit: "",
    inventory: [], customItems: [], draws: [], historyRecent: [], favorites: [], ui: {}
  };
  const migrated = normalize(source);
  const result = migrated.results.find((entry) => entry.id === legacyExchange.id);
  assert.ok(result);
  assert.equal(result.exchange, undefined, "旧フィールドを消して再移行を防ぐ");
  assert.equal(result.income.shards, 7, "元の収入2と旧変換5を合算する");
  assert.match(result.note, /旧LP換算を移行済み/);
  const expense = migrated.entries.find((entry) => entry.name === "旧記録：LPから自我の欠片を交換");
  assert.ok(expense);
  assert.equal(expense.kind, "expense");
  assert.equal(expense.cost.lp, 10);
  assert.equal(expense.resultId, legacyExchange.id);
  const total = balance(migrated.results, migrated.entries);
  assert.equal(total.lp, 120, "初期支給30 + 収入100 − 旧変換支出10");
  assert.equal(total.shards, 17, "初期作成の欠片10 + 元の収入2 + 旧変換5");
});

test("再読込しても旧変換の獲得欠片・支出明細を二重に計上しない", () => {
  const normalize = state.LBT_normalizeStateShape;
  const first = normalize({
    results: [legacyExchange], entries: [],
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    supports: [], deathSupport: null, spirit: "",
    inventory: [], customItems: [], draws: [], historyRecent: [], favorites: [], ui: {}
  });
  const second = normalize(first);
  const result = second.results.find((entry) => entry.id === legacyExchange.id);
  assert.equal(result.income.shards, 7);
  assert.equal(second.entries.filter((entry) => entry.name === "旧記録：LPから自我の欠片を交換").length, 1);
});

test("LP→欠片の旧入力APIは撤去され、通常のアイテム購入経路を使う", () => {
  assert.equal(state.LBT_shardExchange, undefined);
  assert.equal(state.LBT_provenance.LP_TO_SHARD, undefined);
  const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  assert.doesNotMatch(sections, /ExchangeInputs|LP→欠片換算/);
});
