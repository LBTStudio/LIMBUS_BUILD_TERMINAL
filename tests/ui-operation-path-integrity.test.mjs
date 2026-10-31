import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const sections = read("../js/OtherSections.js");
const state = read("../js/state.js");
const parityCss = read("../assets/b-type-ui-parity.css");
const captureAudit = read("../tools/ui/capture-ui-audit.mjs");

const supportStart = sections.indexOf("const SupportSection =");
const supportEnd = sections.indexOf("const EGO_RANKS =", supportStart);
const support = sections.slice(supportStart, supportEnd);
const spiritStart = sections.indexOf("const SpiritSection =");
const spiritEnd = sections.indexOf("const ShopSection =", spiritStart);
const spirit = sections.slice(spiritStart, spiritEnd);
const egoStart = sections.indexOf("const EgoSection =");
const egoEnd = sections.indexOf("const BuildWorkspace =", egoStart);
const ego = sections.slice(egoStart, egoEnd);
const buildItemsStart = sections.indexOf("const BuildItemsPanel =");
const buildItemsEnd = sections.indexOf("/* ショップ。所持の唯一の取得口。", buildItemsStart);
const buildItems = sections.slice(buildItemsStart, buildItemsEnd);

test("未所持サポートの取得は価格検証つき購入を通ってから装備する", () => {
  const tryEquipStart = support.indexOf("const tryEquip =");
  const tryEquipEnd = support.indexOf("const handleSupportItemClick", tryEquipStart);
  const tryEquip = support.slice(tryEquipStart, tryEquipEnd);
  assert.match(tryEquip, /LBT_purchaseCostOf/);
  assert.match(tryEquip, /LBT_purchaseAffordability/);
  assert.match(tryEquip, /type: "ADD_ROSTER_SUPPORT", spp: s, purchase: true/);
  assert.ok(tryEquip.indexOf("ADD_ROSTER_SUPPORT") < tryEquip.indexOf('type: "ADD_SUPPORT"'),
    "所持登録と購入明細を作ってから装備する");
  assert.match(support, /未所持です。購入する場合は詳細の「購入して装備」/);
  assert.match(support, /selectedOwned \? "通常スロットへ装備" : "購入して装備"/);
  assert.match(state, /case "ADD_SUPPORT":[\s\S]{0,700}addRosterSupport\(state, action\.spp\)/);
  assert.match(state, /case "SET_DEATH_SUPPORT":[\s\S]{0,1200}addRosterSupport\(state, \{ \.\.\.action\.spp, name: requestedName \}\)/);
  assert.match(support, /dispatch\(\{ type: "ADD_ROSTER_SUPPORT", spp: s, purchase: true \}\)/);
});

test("精神は購入・無料初期取得・装備を区別し、装備だけでは未所持を作らない", () => {
  assert.match(spirit, /const purchaseSpirit =/);
  assert.match(spirit, /type: "ADD_ROSTER_SPIRIT", spirit: sp, purchase: true/);
  assert.match(spirit, /type: "ADD_ROSTER_SPIRIT", spirit: sp, purchase: false/);
  assert.match(spirit, /const applySpirit =/);
  assert.match(spirit, /この精神は未所持です。先に「購入」してください/);
  assert.match(spirit, /onClick: \(\) => purchaseSpirit\(selected\)/);
  assert.match(spirit, /isExplicitlyFreeSpirit\(selected\)[\s\S]{0,180}初期選択して装備/);
  assert.match(state, /case "APPLY_SPIRIT":[\s\S]{0,700}spirits = \[\.\.\.spirits, \{/);
  assert.match(spirit, /isExplicitlyFreeSpirit\(sp\) \? "初期取得" : "購入"/);
});

test("E.G.O未所持カードのダブルクリックは詳細選択だけで、装備は所持済みに限る", () => {
  const gridStart = ego.indexOf("const egoGrid =");
  const gridEnd = ego.indexOf("\n  return h(", gridStart);
  const grid = ego.slice(gridStart, gridEnd);
  assert.match(grid, /onDoubleClick: \(\) => setSelected\(e\)/);
  assert.match(grid, /!isEquipped && ownedKeys\.has/);
  assert.match(grid, /未所持 · 詳細から購入／試着/);
  assert.match(ego, /onPreviewEquip/);
  assert.match(ego, /試着装備/);
  assert.match(ego, /width: 40, height: 40, minWidth: 40, minHeight: 40/);
});

test("クイック検索は特殊資源を含むアイテムをBuildの検索付き追加欄へ開く", () => {
  const paletteStart = app.indexOf("const itemHits =");
  const paletteEnd = app.indexOf("const cmdFiltered", paletteStart);
  const palette = app.slice(paletteStart, paletteEnd);
  assert.match(palette, /DB\.specialItems/);
  assert.match(palette, /searchAliases/);
  assert.match(palette, /currentSection: "items-build", itemSearchTarget:/);
  assert.doesNotMatch(palette, /currentSection: "items"/);
  assert.match(buildItems, /state\.ui\?\.itemSearchTarget\?\.id/);
  assert.match(buildItems, /setPickerOpen\(true\)/);
  assert.match(buildItems, /setPickerQuery\(String\(target\.name \|\| target\.id\)\)/);
  assert.match(buildItems, /所持品へ追加するアイテムを検索/);
  assert.match(buildItems, /searchAliases/);
});

test("リザルト収入は非負整数として検証し、報酬入力の後で一度だけ確定する", () => {
  const addStart = sections.indexOf("const addResult =");
  const addEnd = sections.indexOf("/* 硝子窓の読み込み結果", addStart);
  const add = sections.slice(addStart, addEnd);
  assert.match(add, /Number\.isSafeInteger\(parsed\)/);
  assert.match(add, /incomeLp === null \|\| incomeShards === null/);
  assert.match(add, /setNewResultError/);
  assert.match(add, /lp: incomeLp,[\s\S]{0,60}shards: incomeShards/);

  const formStart = sections.indexOf('"リザルトを記録"');
  const formEnd = sections.indexOf("importPanel && h", formStart);
  const form = sections.slice(formStart, formEnd);
  const saveAt = form.indexOf("onClick: addResult");
  assert.ok(saveAt > form.indexOf("報酬人格"), "報酬人格入力の後に確定ボタンを置く");
  assert.ok(saveAt > form.indexOf("報酬アイテム"), "報酬アイテム入力の後に確定ボタンを置く");
  assert.ok(saveAt > form.indexOf("抽出チケット"), "抽出チケット入力の後に確定ボタンを置く");
  assert.equal((form.match(/onClick: addResult/g) || []).length, 1, "新規リザルトの確定操作は1つ");
  assert.match(form, /type: "text", inputMode: "numeric"/);
  assert.match(form, /role: "alert".{0,100}newResultError/s);
});

test("リザルト検索は報酬・取得人格・消費アイテムも対象にする", () => {
  const start = sections.indexOf("const matchingResults =");
  const end = sections.indexOf("const sortedResults =", start);
  const search = sections.slice(start, end);
  assert.match(search, /rewardItems/);
  assert.match(search, /personaAcquisitions/);
  assert.match(search, /consumedItems/);
});

test("使い方の概要から直接検索でき、検索結果を選ぶと該当ガイドが開く", () => {
  const start = app.indexOf("if (helpView === \"overview\")");
  const end = app.indexOf("if (helpView === \"guide\")", start);
  const overview = app.slice(start, end);
  assert.match(overview, /使い方を直接検索/);
  assert.match(overview, /filteredItems\.slice\(0, 5\)/);
  assert.match(overview, /setExpandedKey\(key\); setHelpView\("guide"\)/);
});

test("UI監査は40px未満の操作対象を新規キャプチャで記録する", () => {
  assert.match(captureAudit, /rect\.width<40\|\|x\.rect\.height<40/);
  assert.match(parityCss, /\.ledger-result-income-row/);
  assert.match(parityCss, /\.ledger-error-note/);
});
