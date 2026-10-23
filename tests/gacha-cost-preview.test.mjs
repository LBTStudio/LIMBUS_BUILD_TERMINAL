import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DB = {
  normal_personas: [{ no: 1, name: "人格A" }, { no: 2, name: "人格B" }],
  tokui_personas: [{ no: 1, name: "特異人格A" }],
  egos: [{ rank: "ZAYIN", no: 1, name: "E.G.O A" }],
  items: []
};
const packs = {
  packs: [
    { name: "テストパック", lp: 25, entries: [{ no: 1, name: "パック品", book: "test", page: 1 }] }
  ]
};

function loadEstimator() {
  const context = { window: { DB, LBT_GACHA_PACKS: packs }, console };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["js/gacha.js", "js/gacha-tickets.js"]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  return context.window.LBT_gachaDraw;
}

const stateWithPersonaCount = (count) => ({
  roster: {
    personas: Array.from({ length: count }, (_, i) => ({ uid: "p" + i, mode: i === 0 ? "t" : "n", no: i + 1 })),
    egos: [], supports: [], spirits: []
  }
});

test("未所持の人格抽出は初回だけ無料。複数回費用は逐次累積する", () => {
  const draw = loadEstimator();
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(0), "", 1))), { lp: 0, shards: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(0), "", 2))), { lp: 100, shards: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(0), "", 3))), { lp: 200, shards: 0 });
});

test("既所持人格がある場合は全回に所持後価格が適用される", () => {
  const draw = loadEstimator();
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(1), "", 3))), { lp: 300, shards: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(2), "", 2))), { lp: 200, shards: 0 });
});

test("E.G.O とテーマパックは既存の単価から希望回数分を積算する", () => {
  const draw = loadEstimator();
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("ego", stateWithPersonaCount(0), "", 3))), { lp: 0, shards: 300 });
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("pack", stateWithPersonaCount(0), "テストパック", 3))), { lp: 75, shards: 0 });
});

test("回数の異常値は安全な表示範囲に制限する", () => {
  const draw = loadEstimator();
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(0), "", 1000))), { lp: 9800, shards: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(draw.estimateTotalCost("persona", stateWithPersonaCount(0), "", "3x"))), { lp: 0, shards: 0 });
});

test("残高不足は必要な通貨だけを判定する", () => {
  const draw = loadEstimator();
  const lpOnlyWithNegativeShards = draw.paymentShortfall({ lp: 200, shards: -50 }, { lp: 200, shards: 0 });
  assert.equal(lpOnlyWithNegativeShards.insufficient, false, "欠片残高が負でもLPだけの抽選は止めない");
  assert.equal(lpOnlyWithNegativeShards.shardsShort, false);

  const shardsOnlyWithNegativeLp = draw.paymentShortfall({ lp: -20, shards: 100 }, { lp: 0, shards: 100 });
  assert.equal(shardsOnlyWithNegativeLp.insufficient, false, "LP残高が負でも欠片だけの抽選は止めない");
  assert.equal(shardsOnlyWithNegativeLp.lpShort, false);

  const realLpShortage = draw.paymentShortfall({ lp: 99, shards: -500 }, { lp: 100, shards: 0 });
  assert.equal(realLpShortage.insufficient, true);
  assert.equal(realLpShortage.lpShort, true);
  assert.equal(realLpShortage.shardsShort, false);

  const realShardShortage = draw.paymentShortfall({ lp: -500, shards: 99 }, { lp: 0, shards: 100 });
  assert.equal(realShardShortage.insufficient, true);
  assert.equal(realShardShortage.lpShort, false);
  assert.equal(realShardShortage.shardsShort, true);
});

test("抽選確認UIはエンジンの合計費用見積もりを使う", () => {
  const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  assert.match(source, /G\?\.estimateTotalCost\?\.\(route, state, activePack, times\)/);
  assert.doesNotMatch(source, /Math\.max\(0, times - 1\) \* \(\(Number\(perDraw\.lp\) \|\| 0\)\)/);
  assert.match(source, /G\?\.paymentShortfall\?\.\(balance, totalCost\)/);
});
