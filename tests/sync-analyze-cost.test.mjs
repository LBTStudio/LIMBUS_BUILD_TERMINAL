import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 同期化・解析・そのMAXは自己の欠片を支払う（supplement P7 / P23）。
   フラグだけ立てて欠片を帳から消してはならない。 */

const provSource = readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8");
const provWindow = { DB: { egos: [] }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const provCtx = { window: provWindow, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
provCtx.globalThis = provCtx;
vm.createContext(provCtx);
vm.runInContext(provSource, provCtx, { filename: "ledger-provenance.js" });
const opCost = provCtx.window.LBT_operationCost;

test("同期化は自我の欠片50個（supplement P7）", () => {
  assert.deepEqual({ ...opCost("sync", { name: "黒雲会組員" }, {}) }, {
    lp: 0, shards: 50, source: "supplement P7 同期化（自我の欠片50個）", operation: "sync", label: "同期"
  });
});

test("同期MAXは同期化と同額（supplement P23「同じ個数」）", () => {
  assert.equal(opCost("syncMax", { name: "黒雲会組員" }, {}).shards, 50);
  assert.equal(opCost("syncMax", {}, {}).shards, opCost("sync", {}, {}).shards);
});

test("解析は危険度ランクで欠片数が変わる（supplement P7）", () => {
  const expected = { ZAYIN: 20, TETH: 40, HE: 60, WAW: 80, ALEPH: 100 };
  for (const [rank, shards] of Object.entries(expected)) {
    const c = opCost("analyze", { rank }, {});
    assert.equal(c.shards, shards, `${rank} は ${shards} 欠片`);
    assert.equal(c.lp, 0, "LP ではなく欠片");
  }
});

test("解析MAXは解析と同額", () => {
  for (const rank of ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"]) {
    assert.equal(opCost("analyzeMax", { rank }, {}).shards, opCost("analyze", { rank }, {}).shards, rank);
  }
});

test("未知のランクは作らない（0 欠片にしない）", () => {
  assert.equal(opCost("analyze", { rank: "UNKNOWN" }, {}), null);
  assert.equal(opCost("nope", { rank: "HE" }, {}), null);
});

test("所持した時の価格は同期・解析の値段ではない", () => {
  /* 人格は DB 価格が無い。旧実装は priceOf を使っていたため null になっていた。 */
  assert.equal(opCost("sync", { name: "黒雲会組員", kind: "persona" }, { normal_personas: [] }).shards, 50);
});