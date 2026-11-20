import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const otherSectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const filterStart = appSource.indexOf("function filterInventoryImportActions(actions, state) {");
const filterEnd = appSource.indexOf("\nfunction validateImportData(", filterStart);
assert.ok(filterStart >= 0 && filterEnd > filterStart, "App.js has an isolated shared-import filter");
const filterSource = appSource.slice(filterStart, filterEnd);

function loadFilter() {
  const window = {
    DB: {
      items: [
        { id: "low-cap", name: "少量アイテム" },
        { id: "normal", name: "通常アイテム" }
      ]
    },
    LBT_getItemMaxOwned: (_state, id) => id === "low-cap" ? 3 : 99
  };
  const context = { window };
  vm.createContext(context);
  vm.runInContext(filterSource + "\nglobalThis.__filterInventoryImportActions = filterInventoryImportActions;", context);
  return context.__filterInventoryImportActions;
}

test("既存所持数との合算が上限超過なら、アイテム単位で取り込みを止める", () => {
  const filter = loadFilter();
  const itemAction = { type: "ADD_ITEM_INVENTORY", itemId: "low-cap", quantity: 2 };
  const rosterAction = { type: "ADD_ROSTER", name: "人格A" };
  const result = filter([itemAction, rosterAction], {
    inventory: [{ uid: "owned-1", itemId: "low-cap", quantity: 2 }],
    customItems: []
  });

  assert.deepEqual(Array.from(result.actions), [rosterAction]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /少量アイテム/);
  assert.match(result.skipped[0].reason, /現在2個／追加2個/);
});

test("同じアイテムへの複数アクションを合算し、上限を超える組は全て除外する", () => {
  const filter = loadFilter();
  const tooManyA = { type: "ADD_ITEM_INVENTORY", itemId: "low-cap", quantity: 2 };
  const tooManyB = { type: "ADD_ITEM_INVENTORY", itemId: "low-cap", quantity: 2 };
  const allowed = { type: "ADD_ITEM_INVENTORY", itemId: "normal", quantity: 1 };
  const result = filter([tooManyA, tooManyB, allowed], {
    inventory: [{ uid: "owned-1", itemId: "low-cap", quantity: 0 }],
    customItems: []
  });

  assert.deepEqual(Array.from(result.actions), [allowed]);
  assert.equal(result.skipped.length, 1, "同一アイテムの上限超過は1件の理由で報告する");
  assert.match(result.skipped[0].reason, /追加4個/);
});

test("不正数量を明示的に除外し、数量未指定は互換性のため1個として検証する", () => {
  const filter = loadFilter();
  const invalid = { type: "ADD_ITEM_INVENTORY", itemId: "normal", quantity: "2abc" };
  const defaultOne = { type: "ADD_ITEM_INVENTORY", itemId: "low-cap" };
  const valid = { type: "ADD_RESULT", name: "結果B" };
  const result = filter([invalid, defaultOne, valid], {
    inventory: [{ uid: "owned-1", itemId: "low-cap", quantity: 2 }],
    customItems: []
  });

  assert.deepEqual(Array.from(result.actions), [defaultOne, valid]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /個数が正の整数ではありません/);
});

test("呼び出し元はフィルタ後の件数と除外理由を表示し、成功toastで上書きしない", () => {
  assert.match(appSource, /detail\.actions = filtered\.actions/);
  assert.match(appSource, /detail\.skipped = skipped/);
  assert.match(appSource, /filtered\.actions\.length \+ "件を取り込みました/);

  const garaStart = otherSectionsSource.indexOf("const applyGarasumadoImport = (applied) => {");
  const garaEnd = otherSectionsSource.indexOf("const IMPORT_TYPE_LABEL = {", garaStart);
  const garaBlock = otherSectionsSource.slice(garaStart, garaEnd);
  assert.match(garaBlock, /const accepted = Array\.isArray\(detail\.actions\) \? detail\.actions : \[\]/);
  assert.match(garaBlock, /skippedCount: skipped\.length/);
  assert.doesNotMatch(garaBlock, /toast\("取り込みました"\)/);

  const textStart = otherSectionsSource.indexOf("const applyTextImport = () => {");
  const textEnd = otherSectionsSource.indexOf("/* 手動支出・消耗の記録。", textStart);
  const textBlock = otherSectionsSource.slice(textStart, textEnd);
  assert.match(textBlock, /const accepted = Array\.isArray\(detail\.actions\) \? detail\.actions : \[\]/);
  assert.match(textBlock, /skippedCount: skipped\.length/);
  assert.doesNotMatch(textBlock, /toast\("取り込みました"\)/);
});
