import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemRecords = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const specialItemRecords = JSON.parse(readFileSync(new URL("../data/special-items.json", import.meta.url), "utf8"));
const otherSectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const coreSource = readFileSync(new URL("../js/core.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function loadAcquireCostResolver() {
  const context = { window: { DB: { items: itemRecords, specialItems: specialItemRecords } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(coreSource, context);
  vm.runInContext(stateSource, context);
  const start = otherSectionsSource.indexOf("function formatAcquireCost(lp, shards) {");
  const end = otherSectionsSource.indexOf("const AcquireBar =", start);
  assert.ok(start >= 0 && end > start, "取得価格解決関数が OtherSections.js にある");
  vm.runInContext(otherSectionsSource.slice(start, end), context);
  return { resolve: context.window.LBT_resolveAcquireCost, parse: context.window.LBT_parsePriceText };
}

test("ショップは消耗品カタログを所持状態から独立させ、購入後の再購入導線を残す", () => {
  const catalog = otherSectionsSource.match(/const catalogItems = React\.useMemo\(\(\) => \[(.*?)\], \[state\.customItems\]\);/s);
  assert.ok(catalog, "ショップのアイテムカタログが存在する");
  assert.match(catalog[1], /window\.DB\?\.items/);
  assert.match(catalog[1], /window\.DB\?\.specialItems\s*\|\|\s*\[\]/);
  assert.doesNotMatch(catalog[1], /filter\(\(item\) => item\?\.ledgerResource === "shards"\)/);
  assert.match(catalog[1], /state\.customItems/);
  assert.equal(itemRecords.some((item) => ["自我の欠片", "硝子の破片"].includes(item.name)), false);
  assert.deepEqual(specialItemRecords.map((item) => item.id), ["resource-ego-shard", "resource-glass-shard"]);
  const glassShard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  assert.equal(glassShard?.ledgerResource, undefined);
  assert.equal(glassShard?.price, "20LP");
  assert.equal(specialItemRecords.find((item) => item.id === "resource-ego-shard")?.ledgerResource, "shards");

  const itemFilter = otherSectionsSource.match(/const items = shopView === "catalog" && tab === "item"\s*\?\s*catalogItems\.filter\(\(item\) =>([\s\S]*?)\n\s*: \[\];/);
  assert.ok(itemFilter, "ショップの商品一覧フィルターが存在する");
  assert.doesNotMatch(itemFilter[1], /unownedOnly|ownedItemIds/);
  assert.match(otherSectionsSource, /const canRepurchaseItem = \(item\) => item\?\.ledgerResource !== "shards" && hasConfiguredPrice\(item\)/);
  assert.match(otherSectionsSource, /購入済みでも商品は一覧に残ります/);
  assert.match(otherSectionsSource, /disabled: capped/);
  assert.match(otherSectionsSource, /tab !== "item" \? h\(Button/);
  const shopItemBuilder = otherSectionsSource.match(/item: \(entries\) => entries\.map\(\(item\) => \{([\s\S]*?)\n\s*\}\)/);
  assert.ok(shopItemBuilder, "ショップのアイテムカード生成部が存在する");
  assert.match(shopItemBuilder[1], /!hasConfiguredPrice\(item\)/);
  assert.match(shopItemBuilder[1], /dispatch\(\{ type: "ADD_ITEM", itemId: item\.id, purchase: true \}\)/);
  assert.match(otherSectionsSource, /const repeatPurchase = canRepurchaseItem\(item\)/);
  assert.match(shopItemBuilder[1], /repeatPurchase && ownedEntry/);
  assert.match(shopItemBuilder[1], /ownedItemIds\.has\(item\.id\) && !repeatPurchase/);
  assert.match(shopItemBuilder[1], /"価格未設定"/);
  assert.match(shopItemBuilder[1], /"所持欄へ追加"/);
});

test("ショップ価格は公式・特殊・ユーザー定義アイテムで共通パーサーを使う", () => {
  const { resolve, parse } = loadAcquireCostResolver();
  const official = itemRecords[0];
  const officialCost = resolve("item", "purchase", { id: official.id, name: official.name });
  const officialParsed = parse(official.price);
  assert.equal(officialCost.lp, officialParsed.lp);
  assert.equal(officialCost.shards, officialParsed.shards);

  const glassShard = specialItemRecords.find((item) => item.id === "resource-glass-shard");
  const glassCost = resolve("item", "purchase", { id: glassShard.id, name: glassShard.name });
  assert.equal(glassCost.lp, 20);
  assert.equal(glassCost.shards, 0);
  assert.equal(glassCost.label, "LP 20");

  const egoShard = specialItemRecords.find((item) => item.id === "resource-ego-shard");
  const specialCost = resolve("item", "purchase", { id: egoShard.id, name: egoShard.name });
  assert.equal(specialCost.lp, 2);
  assert.equal(specialCost.shards, 0);
  assert.equal(specialCost.label, "LP 2");

  const custom = { id: "custom-priced-tonic", name: "試製トニック", price: "10LP 20欠片" };
  const customCost = resolve("item", "purchase", { id: custom.id, name: custom.name, customItems: [custom] });
  assert.equal(customCost.lp, 10);
  assert.equal(customCost.shards, 20);
  assert.equal(customCost.label, "LP 10 欠片 20");
});
