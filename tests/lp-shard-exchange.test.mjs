import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   LP を自我の欠片に換える取引（core P317「購入時、自我の欠片1を得る 2LP」）。

   守るべき性質:
     - 欠片1個あたりの LP は規則どおり 2 で、利用者が自由に代入できない
     - 換えていない（空/0/負/文字列）は「換えていない」で 0/0 になる
     - 残高は「収入 − 支出 − 払った LP」で欠片が増える（明細に混ぜない）
     - リザルトを編集すると換算額も一緒に直る（明細の孤児が残らない）
   --------------------------------------------------------------------------- */

function loadProvenance() {
  const source = readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8");
  const ctx = { window: { DB: { egos: [] } }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "ledger-provenance.js" });
  return ctx.window;
}

function loadState() {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: {
      DB: { support_passives: [], death_passives: [], spirits: [], normal_enhancements: [], special_enhancements: [] }
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

const win = loadProvenance();
const exchange = win.LBT_shardExchange;
const state = loadState();
const reducer = state.appReducer;
const balance = state.LBT_computeLedgerBalance;
const normalize = state.LBT_normalizeStateShape;

function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [],
    entries: [],
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

/* --- 規則 --------------------------------------------------------------- */

test("欠片1個あたりの LP は core:317 のとおり 2", () => {
  assert.equal(win.LBT_provenance.LP_TO_SHARD.lp, 2);
  assert.equal(win.LBT_provenance.LP_TO_SHARD.shards, 1);
  assert.equal(win.LBT_provenance.LP_TO_SHARD.item, "自我の欠片");
});

test("換算した個数から LP と欠片が同時に決まる", () => {
  assert.deepEqual({ ...exchange(5) }, {
    lp: 10, shards: 5, label: "LP→欠片換算",
    source: "core:317 特殊アイテム 自我の欠片（購入時、自我の欠片1を得る 2LP）"
  });
  /* 文字列でも同じ。type=number の入力欄は空文字を返すので、0 に落とさない。 */
  assert.equal(exchange("7").lp, 14);
});

test("出典が core の条文を指している", () => {
  assert.match(exchange(1).source, /core:\d+/);
  assert.match(exchange(1).source, /自我の欠片/);
});

test("換えていない入力は null を返す（0/0 を作らない）", () => {
  for (const input of [0, "", null, undefined, -3, "abc", NaN]) {
    assert.equal(exchange(input), null, `${String(input)} は換算ではない`);
  }
});

/* --- 通帳への計上 -------------------------------------------------------- */

test("登録すると LP を払い、欠片が同時に増える", () => {
  let s = reducer(baseState(), {
    type: "ADD_RESULT",
    name: "第12回",
    income: { lp: 1200, shards: 15 },
    exchange: exchange(5)
  });
  assert.equal(s.results[0].exchange.lp, 10);
  assert.equal(s.results[0].exchange.shards, 5);
  const b = balance(s.results, s.entries);
  assert.equal(b.lp, 1190, "10 LP を払っている");
  assert.equal(b.shards, 20, "配給15に換算5が乗る");
  assert.equal(b.exchangeLp, 10);
  assert.equal(b.exchangeShards, 5);
});

test("換算は明細（支出）ではなく、集計を汚さない", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 1000, shards: 0 }, exchange: exchange(10) });
  const b = balance(s.results, s.entries);
  assert.equal(b.spentLp, 0, "支出明細ではない");
  assert.equal(b.spentShards, 0);
  assert.equal(b.incomeShards, 0, "収入でもない");
  assert.equal(b.lp, 980);
  assert.equal(b.shards, 10);
  assert.equal(b.unclassified, 0, "未分類でもない");
});

test("欠片を使った明細と併用しても両方が正しく効く", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 1000, shards: 0 }, exchange: exchange(10) });
  s = reducer(s, { type: "ADD_ENTRY", kind: "spirit", name: "精神", cost: { shards: 30 }, resultId: s.results[0].id });
  const b = balance(s.results, s.entries);
  assert.equal(b.lp, 980, "明細は LP を引かない");
  assert.equal(b.shards, -20, "30 使い、10 得た");
  assert.equal(b.unclassified, 0, "歸属済みなので未分類に増えない");
});

/* --- 編集 --------------------------------------------------------------- */

test("リザルトを編集すると換算額も一緒に直る（明細の孤児が残らない）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 500 }, exchange: exchange(10) });
  const id = s.results[0].id;
  s = reducer(s, { type: "UPDATE_RESULT", id, name: "A", income: { lp: 500 }, exchange: exchange(3) });
  assert.equal(s.results[0].exchange.lp, 6);
  assert.equal(s.results[0].exchange.shards, 3);
  assert.equal(balance(s.results, s.entries).lp, 494);
  assert.equal(s.entries.length, 0, "明細は増えない");
});

test("換算を消せば払った LP が戻る", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 500 }, exchange: exchange(4) });
  const id = s.results[0].id;
  s = reducer(s, { type: "PATCH_RESULT", id, patch: { exchange: { lp: 0, shards: 0 } } });
  assert.equal(s.results[0].exchange.shards, 0);
  assert.equal(balance(s.results, s.entries).lp, 500);
});

test("換算額に触れない更新では据え置きになる", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 500 }, exchange: exchange(4) });
  s = reducer(s, { type: "UPDATE_RESULT", id: s.results[0].id, name: "B" });
  assert.equal(s.results[0].exchange.shards, 4, "触ってないので消えない");
  assert.equal(balance(s.results, s.entries).lp, 492);
});

test("PATCH_RESULT でも換算額を書き換えられる", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 100 }, exchange: { lp: 0, shards: 0 } });
  s = reducer(s, { type: "PATCH_RESULT", id: s.results[0].id, patch: { exchange: exchange(2) } });
  assert.equal(s.results[0].exchange.lp, 4);
  assert.equal(balance(s.results, s.entries).shards, 2);
});

/* --- 保存データの正規化 -------------------------------------------------- */

test("壊れた換算額は 0 に寄せて計算が壊れない", () => {
  const s = normalize({
    ...baseState(),
    results: [
      { id: "r-1", name: "A", income: { lp: 300, shards: 5 }, exchange: { lp: "12", shards: "-4", junk: 1 } },
      { id: "r-2", name: "B", income: { lp: 100 } },
      { id: "r-3", name: "C", income: { lp: 100 }, exchange: "壊れた" }
    ]
  });
  /* 初期作成のリザルトが先頭に足されるので、id で引く（添字は動かない）。 */
  const byName = (s, name) => s.results.find((r) => r.name === name);
  /* 通貨の丸めは明細と同じ規則：数字だけ読めるものは読み、負は 0。 */
  assert.deepEqual({ ...byName(s, "A").exchange }, { lp: 12, shards: 0 }, "負の欠片は 0、\"12\" は 12");
  assert.deepEqual({ ...byName(s, "B").exchange }, { lp: 0, shards: 0 }, "無ければ 0");
  assert.deepEqual({ ...byName(s, "C").exchange }, { lp: 0, shards: 0 }, "文字列でも 0");
  assert.equal(balance(s.results, s.entries).lp, 518, "初期作成30 + 300 + 100 + 100 − 換算12");
});

test("換算はリザルト単位なので、消しても他のリザルトの収支は変わらない", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 100 }, exchange: exchange(1) });
  const aId = s.results[0].id;
  s = reducer(s, { type: "ADD_RESULT", name: "B", income: { lp: 200 } });
  s = reducer(s, { type: "REMOVE_RESULT", id: aId });
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].name, "B");
  assert.equal(balance(s.results, s.entries).lp, 200, "B だけが残る");
});
