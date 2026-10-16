import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   支援パッシブは購入/配布を区別して課帳する。

    Lama: パッシブは DB に価格（support_passives.lp / death_passives.shards）がある。
   実データでも「サポパ「○○」を購入したのでLP-25」と書く用户在Taxする一方、
   シナリオ報酬で得るものもある。区別せずに常に課すと帳が実際より膨らむ。
   人格の ADD_ROSTER と同じ契約にする（purchase が false なら明細を立てない）。
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadReducer() {
  const w = {
    DB: {
      support_passives: db.support_passives,
      death_passives: db.death_passives,
      spirits: db.spirits,
      normal_personas: db.normal_personas,
      tokui_personas: db.tokui_personas
    },
    LBT_PDF_KEYWORD_ORDER: []
  };
  const c = { window: w, console, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8"), c);
  vm.runInContext(readFileSync(new URL("../js/roster-resolver.js", import.meta.url), "utf8"), c);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), c);
  return c.window;
}

const w = loadReducer();
const reducer = w.appReducer;

const base = () => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
  entries: [],
  inventory: []
});

const PASSIVE = db.support_passives[0].name;

test("支援パッシブは購入なら明細が立つ", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE }, purchase: true });
  assert.equal(next.roster.supports.length, 1, "所持へ入る");
  assert.equal(next.entries.length, 1, "購入なら明細が1件");
  assert.equal(next.entries[0].kind, "support");
  assert.ok(Number(next.entries[0].cost.lp) > 0, "DB 価格が乗る");
});

test("支援パッシブは配布なら明細が立たない", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE }, purchase: false });
  assert.equal(next.roster.supports.length, 1, "所持には入る");
  assert.equal(next.entries.length, 0, "配布なら課金しない");
});

test("purchase を省略した従来経路は購入のまま（挙動不変）", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE } });
  assert.equal(next.entries.length, 1, "明示購入の画面は Traditional通り課帳される");
  assert.ok(Number(next.entries[0].cost.lp) > 0);
});

test("人格と同じ契約になっている", () => {
  const bought = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: db.normal_personas[0].no, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(bought.entries.length, 1);
  const given = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: db.normal_personas[0].no });
  assert.equal(given.entries.length, 0);
});

/* --- 取り込み側の配線 --- */

test("取り込みは source が buy のときだけ購入として課帳する", () => {
  const source = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");
  assert.match(source, /type: "ADD_ROSTER_SUPPORT",[\s\S]{0,200}?purchase: item\.source === "buy"/);
});