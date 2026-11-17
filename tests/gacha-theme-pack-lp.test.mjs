import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const engineSource = read("../js/gacha.js");
const routesSource = read("../js/gacha-tickets.js");
const panelSource = read("../js/OtherSections.js");
const db = JSON.parse(read("../data/db.json"));
const themePacks = JSON.parse(read("../data/gacha-theme-packs.json"));

function loadDrawApi(balanceOverride) {
  const window = {
    DB: db,
    LBT_GACHA_PACKS: themePacks,
    LBT_computeLedgerBalance: () => balanceOverride
  };
  const context = { window, console };
  vm.createContext(context);
  vm.runInContext(engineSource, context);
  vm.runInContext(routesSource, context);
  return window.LBT_gachaDraw;
}

test("テーマパックのLP抽出: 選択中パックの掲載対象だけを抽選し、パック価格を各回計上する", () => {
  const pack = themePacks.packs.find((entry) => entry && Array.isArray(entry.entries) && entry.entries.length > 1);
  assert.ok(pack, "複数の抽選候補を持つテーマパックがある");
  const draw = loadDrawApi({ lp: pack.lp * 2, shards: 0 });
  const state = {
    roster: { personas: [], egos: [] },
    results: [],
    entries: []
  };

  const out = draw.drawN("pack", state, {
    pay: "paid",
    pack: pack.name,
    times: 2,
    seed: "theme-pack-lp-integration-test"
  });

  assert.equal(out.paidBy, "paid");
  assert.equal(out.ticketKind, "pack");
  assert.equal(out.ticketPack, pack.name);
  assert.equal(out.hits.length, 2);
  assert.ok(out.hits.every((hit) => hit.type === "themePack" && hit.pack === pack.name));
  const allowedNames = new Set(pack.entries.map((entry) => entry.name));
  assert.ok(out.hits.every((hit) => allowedNames.has(hit.name)), "選択したパックの掲載対象以外は出ない");
  assert.equal(out.cost.lp, pack.lp * 2, "LP表示はパック価格×抽選回数");
  assert.equal(out.engineOut.totalCost.lp, pack.lp * 2, "エンジンのLP請求もパック価格×抽選回数");
  assert.ok(out.engineOut.results.every((result) => result.cost.lp === pack.lp));
  assert.ok(out.engineOut.results.every((result) => result.cost.shards === 0));
});

test("テーマパックのLP抽出: 残高が1回分なら1回だけ引いてLP不足で止まる", () => {
  const pack = themePacks.packs[0];
  const draw = loadDrawApi({ lp: pack.lp, shards: 0 });
  const state = { roster: { personas: [], egos: [] }, results: [], entries: [] };

  const out = draw.drawN("pack", state, {
    pay: "paid",
    pack: pack.name,
    times: 3,
    seed: "theme-pack-lp-insufficient-test"
  });

  assert.equal(out.hits.length, 1);
  assert.equal(out.cost.lp, pack.lp);
  assert.equal(out.engineOut.stopped, "insufficientLP");
  assert.equal(out.engineOut.drawn, 1);
});

test("ガチャUI: テーマパックへ切り替えたらLP払いを選び、専用チケットなしのパック変更でもLPへ戻す", () => {
  assert.ok(panelSource.includes('if (r.id === "pack") setPay("paid");'), "テーマパック選択時にLP払いへ切り替える");
  assert.ok(
    panelSource.includes('if (pay === "ticket" && !(Number(ticketBalanceAll.pack?.[nextPack]) > 0)) setPay("paid");'),
    "専用チケットを持たないパックへの変更時はLP払いへ戻す"
  );
  assert.ok(panelSource.includes('route === "pack" ? "LPで抽出" : "通貨で払う"'), "パックルートではLP払いと明示する");
});
