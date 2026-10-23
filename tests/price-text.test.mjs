import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const window = {};
const context = { window, console, setTimeout, clearTimeout, URL, Blob, Date, Math };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);
const parsePriceText = window.LBT_parsePriceText;

test("価格: 桁区切り付き LP／欠片を切り捨てずに読む", () => {
  assert.deepEqual({ ...parsePriceText("1,200LP") }, { lp: 1200, shards: 0 });
  assert.deepEqual({ ...parsePriceText("LP1,200 SHARD2,500") }, { lp: 1200, shards: 2500 });
  assert.deepEqual({ ...parsePriceText("１，２００ＬＰ ２，５００欠片") }, { lp: 1200, shards: 2500 });
});

test("価格: 不正な桁区切りの途中から部分一致しない", () => {
  assert.deepEqual({ ...parsePriceText("1,20LP") }, { lp: 0, shards: 0 });
  assert.deepEqual({ ...parsePriceText("LP1,20") }, { lp: 0, shards: 0 });
});
