import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const helperStart = appSource.indexOf("function validateImportedInventoryCaps(data, fields, currentState) {");
const helperEnd = appSource.indexOf("\nfunction validateImportData(data) {", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "App.js has an isolated inventory-cap validator");
const helperSource = appSource.slice(helperStart, helperEnd);

function loadValidator() {
  const window = {
    DB: {
      items: [
        { id: "official-low", name: "公式アイテム", maxOwned: 2 },
        { id: "official-default", name: "通常アイテム" }
      ]
    }
  };
  window.LBT_getItemMaxOwned = (state, itemId) => {
    const official = window.DB.items.find((item) => item?.id === itemId);
    const custom = (state?.customItems || []).find((item) => item?.id === itemId);
    const definition = official || custom;
    const raw = definition?.maxOwned;
    const max = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
    return Number.isSafeInteger(max) && max > 0 ? Math.min(99, max) : 99;
  };
  const context = { window };
  vm.createContext(context);
  vm.runInContext(helperSource + "\nglobalThis.__validateImportedInventoryCaps = validateImportedInventoryCaps;", context);
  return context.__validateImportedInventoryCaps;
}

test("インポートで所持上限を超える数量は、状態適用前にエラーにする", () => {
  const validate = loadValidator();
  const error = validate({
    inventory: [{ uid: "inv-1", itemId: "custom-kit", quantity: 4 }],
    customItems: [{ id: "custom-kit", name: "手製キット", maxOwned: 3 }]
  }, ["inventory", "customItems"], { customItems: [] });

  assert.match(error, /手製キット/);
  assert.match(error, /所持上限 3 個/);
});

test("定義カテゴリを選んでいない部分ロードでは、現在の定義を使う", () => {
  const validate = loadValidator();
  const data = {
    inventory: [{ uid: "inv-1", itemId: "custom-kit", quantity: 4 }],
    customItems: [{ id: "custom-kit", name: "ファイル内だけの定義", maxOwned: 2 }]
  };

  assert.equal(
    validate(data, ["inventory"], { customItems: [{ id: "custom-kit", name: "現行のキット", maxOwned: 5 }] }),
    null,
    "未選択の定義を根拠に誤って拒否しない"
  );
  assert.match(
    validate(data, ["inventory"], { customItems: [{ id: "custom-kit", name: "現行のキット", maxOwned: 3 }] }),
    /所持上限 3 個/,
    "現在の定義の上限を超える数量は拒否する"
  );
});

test("公式定義の上限を優先し、通常上限99と数量未指定の互換性を維持する", () => {
  const validate = loadValidator();
  const overOfficial = validate({
    inventory: [{ uid: "inv-1", itemId: "official-low", quantity: 3 }],
    customItems: [{ id: "official-low", name: "競合するオリジナル定義", maxOwned: 8 }]
  }, ["inventory", "customItems"], { customItems: [] });
  assert.match(overOfficial, /所持上限 2 個/);

  assert.equal(validate({
    inventory: [
      { uid: "inv-2", itemId: "official-default", quantity: 99 },
      { uid: "inv-3", itemId: "missing-optional-quantity" }
    ]
  }, ["inventory"], { customItems: [] }), null);
  assert.match(validate({
    inventory: [{ uid: "inv-4", itemId: "official-default", quantity: 100 }]
  }, ["inventory"], { customItems: [] }), /所持上限 99 個/);
});

test("App の APPLY_PARTIAL 適用前に実際のカテゴリ選択で上限を検証する", () => {
  assert.match(
    appSource,
    /validateImportedInventoryCaps\(importData, fields, state\)/,
    "部分ロードで選択した項目と現在のstateを使って適用前に検証する"
  );
});
