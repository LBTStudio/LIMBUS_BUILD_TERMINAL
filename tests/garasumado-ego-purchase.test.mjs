import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const dbWithItems = { ...db, items: JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8")) };

function load() {
  const w = { DB: dbWithItems, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  const c = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  for (const file of ["js/roster-resolver.js", "js/garasumado-memo-parse.js", "js/ledger-provenance.js", "js/garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), c, { filename: file });
  }
  return c.window;
}

const w = load();
const G = w.LBT_garasumado;
const index = w.LBT_buildNameIndex(dbWithItems, {});
const resolve = (name) => w.LBT_resolveCandidates(index, name)?.[0] || null;

const egoNames = [
  "魑魅魍魎：舌切り雀",
  "黄金の卵：ガチョウ",
  "低いなきごえ：泣きヒキガエル",
  "Changer MK3：なんでも変えて差し上げます",
  "喪失：欲張りなきこり",
  "まやかし：黄金色の林檎",
  "蝍蛆殺：百足の使徒",
  "響き：マンドレイクの棺",
  "ソーダ：蓋の空いたウェルチアース"
];

test("E.G.O指定購入は項目価格を欠片支出へ、9件のE.G.O獲得として正確に認識する", () => {
  for (const name of egoNames) {
    const row = db.egos.find((ego) => ego.name === name);
    assert.ok(row, "DBにE.G.Oが存在する: " + name);
    assert.equal(Number(row.shards), 50, "各項目は50欠片: " + name);
  }

  const memo = [
    "▼E.G.O指定購入",
    ...egoNames.map((name) => "・" + name + " 50欠片"),
    "消費欄：LP450"
  ].join("\n");

  const parsed = w.LBT_garaMemo.parseMemo(memo);
  assert.equal(parsed.income.lp, 0, "購入品の価格をLP収入として誤計上しない");
  assert.equal(parsed.income.shards, 0, "購入品の価格を欠片収入として誤計上しない");
  assert.equal(parsed.spends.length, 9, "項目別の9件だけを消費明細にする");
  assert.equal(parsed.spends.reduce((sum, row) => sum + Number(row.lp || 0), 0), 0, "LP消費は0");
  assert.equal(parsed.spends.reduce((sum, row) => sum + Number(row.shards || 0), 0), 450, "欠片消費は合計450");
  assert.equal(parsed.wins.length, 9, "購入したE.G.Oを獲得項目として全件検出");
  assert.deepEqual(
    [...parsed.wins].map((win) => win.name).sort(),
    [...egoNames].sort(),
    "品名を価格やランク表記と混ぜずに保持"
  );

  const doc = {
    currency: { lp: "100", fragment: "100" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "E.G.O指定購入テスト", memo }]
  };
  const manifest = G.buildManifest(doc, { resolve });
  const scenario = manifest.scenarios.find((row) => row.name === "E.G.O指定購入テスト");
  assert.equal(scenario.spends.reduce((sum, row) => sum + Number(row.shards || 0), 0), 450);
  assert.equal(
    scenario.wins.filter((win) => win.kinds.some((kind) => kind.kind === "ego" && kind.no != null && kind.rank)).length,
    9,
    "全9件がE.G.OのDB番号・ランクまで解決される"
  );

  const actions = G.toDispatchActions(manifest, [], {}).actions;
  assert.equal(actions.filter((action) => action.type === "ADD_ROSTER_EGO").length, 9,
    "獲得したE.G.Oを所持へ反映するアクションが9件作られる");
  assert.equal(
    actions.filter((action) => action.type === "ADD_ENTRY" && Number(action.cost?.shards || 0) > 0)
      .reduce((sum, action) => sum + Number(action.cost.shards || 0), 0),
    450,
    "購入明細も欠片450として反映される"
  );

  const balance = G.reconcileBalance(manifest, doc);
  assert.equal(balance.currencyDiscrepancies.length, 1, "残高が合っていても通貨ラベルの不一致を報告");
  assert.match(balance.currencyDiscrepancies[0].detail, /450欠片/);
  assert.match(balance.currencyDiscrepancies[0].detail, /450 LP/);
  assert.equal(balance.currencyDiscrepancies[0].code, "ego-purchase-summary-mismatch");
});
