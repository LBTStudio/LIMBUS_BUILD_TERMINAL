import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const state = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const items = readFileSync(new URL("../js/ItemCodex.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("端末内自動保存は成功と失敗を区別し、保存不能時に状態を握り潰さない", () => {
  assert.match(state, /const \[saveStatus, setSaveStatus\] = React\.useState/);
  assert.match(state, /phase: "saved", savedAt: Date\.now\(\), error: ""/);
  assert.match(state, /phase: "error", savedAt: null, error:/);
  assert.match(state, /saveStatus/);
  assert.match(app, /const saveStateLabel = saveStatus\.phase/);
  assert.match(app, /backup\.textContent = "\\u4F5C\\u696D\\u72B6\\u614B\\u3092\\u4FDD\\u5B58"/);
  assert.match(app, /anchor\.dataset\.autosave = saveStateLabel/);
  assert.match(app, /anchor\.dataset\.autosaveState = saveStatus\.phase/);
  assert.match(app, /anchor\.setAttribute\("aria-label", `\\u30AF\\u30A4\\u30C3\\u30AF\\u691C\\u7D22\\u3002\$\{saveStateLabel\}`\)/);
  assert.ok(app.indexOf("const saveStateLabel") < app.indexOf("window.App = App;"), "自動保存状態の副作用はAppコンポーネント内に置く");
  assert.match(app, /return \(\) => indicator\.remove\(\);/);
});

test("保存導線の用語を統一し、部分復元前に適用範囲を要約する", () => {
  assert.match(app, /label: "\\u73FE\\u5728\\u306E\\u4F5C\\u696D\\u72B6\\u614B\\u3092\\u4FDD\\u5B58"/);
  assert.match(app, /keywords: \["\\u72B6\\u614B\\u3092\\u30A8\\u30AF\\u30B9\\u30DD\\u30FC\\u30C8"/);
  assert.match(app, /\(c\.keywords \|\| \[\]\)\.some\(\(keyword\) => keyword\.toLowerCase\(\)\.includes\(ql\)\)/);
  assert.match(app, /const selectedImportGroups = importData/);
  assert.match(app, /const selectedImportLabel = selectedImportGroups\.length/);
  assert.match(app, /className: "import-apply-summary"/);
  assert.match(app, /\\u4ECA\\u56DE\\u306E\\u9069\\u7528\\u7BC4\\u56F2\\uFF1A", selectedImportLabel/);
  assert.match(app, /disabled: selectedImportGroups\.length === 0/);
});

test("クイック検索のE.G.O・アイテム候補は詳細画面へ移動するだけで装備・導入しない", () => {
  assert.match(app, /E\.G\.O：\$\{ego\.name\}/);
  assert.match(app, /アイテム：\$\{item\.name\}/);
  assert.match(app, /currentSection: "ego", egoSearchTarget:/);
  assert.match(app, /currentSection: "items", itemSearchTarget:/);
  assert.doesNotMatch(app.slice(app.indexOf("const egoHits"), app.indexOf("const cmdFiltered")), /SET_EGO_SLOT|ADD_ITEM/);
  assert.match(items, /const searchTargetId = state\.ui\?\.itemSearchTarget\?\.id/);
  assert.match(items, /setSelectedId\(searchTargetId\)/);
  assert.match(sections, /const searchTarget = state\.ui\?\.egoSearchTarget/);
  assert.match(sections, /setSelected\(target\)/);
});
