import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemRecords = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const specialItemRecords = JSON.parse(readFileSync(new URL("../data/special-items.json", import.meta.url), "utf8"));
const shopSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");

test("ショップのアイテムタブとクイック検索に特殊資源を含める", () => {
  assert.match(shopSource, /const catalogItems = React\.useMemo\(\(\) => \[[\s\S]*?\.\.\.\(window\.DB\?\.specialItems \|\| \[\]\),/);
  assert.match(appSource, /\[\.\.\.\(DB\.items \|\| \[\]\), \.\.\.\(DB\.specialItems \|\| \[\]\), \.\.\.\(state\.customItems \|\| \[\]\)\]/);
});

test("ショップの価格表示は特殊資源の価格定義と通帳通貨パーサーを使う", () => {
  const context = { window: { DB: { items: itemRecords, specialItems: specialItemRecords } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/core.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), context);

  const start = shopSource.indexOf("function formatAcquireCost(");
  const end = shopSource.indexOf("const AcquireBar =", start);
  assert.ok(start >= 0 && end > start, "ショップ価格 resolver が見つかること");
  vm.runInContext(shopSource.slice(start, end), context);

  const shardCost = vm.runInContext(
    'resolveAcquireCost("item", "purchase", { name: "自我の欠片", id: "resource-ego-shard" })',
    context
  );
  assert.equal(shardCost.lp, 2);
  assert.equal(shardCost.shards, 0);
  assert.equal(shardCost.label, "LP 2");

  const glassShardCost = vm.runInContext(
    'resolveAcquireCost("item", "purchase", { name: "硝子の破片", id: "resource-glass-shard" })',
    context
  );
  assert.equal(glassShardCost.lp, 0);
  assert.equal(glassShardCost.label, "無料");
});
