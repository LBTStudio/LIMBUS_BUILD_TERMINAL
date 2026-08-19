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
  assert.match(app, /端末内に自動保存済み/);
  assert.match(app, /端末内保存不可/);
  assert.match(app, /ファイル保存/);
  assert.match(app, /search\.dataset\.autosave = saveStateLabel/);
  assert.match(app, /search\.setAttribute\("aria-label", `クイック検索。\$\{saveStateLabel\}`\)/);
  assert.match(app, /data-autosave-state/);
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
