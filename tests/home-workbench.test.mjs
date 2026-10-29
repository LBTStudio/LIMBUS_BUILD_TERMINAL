import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = read("../js/App.js");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const state = read("../js/state.js");
const css = read("../assets/workspace.css");

test("ホームが左レールの入口になり、ワークベンチ内に基本タブを置く", () => {
  const nav = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  assert.match(nav, /id: "home", label: "ホーム"/);
  assert.match(nav, /id: "persona", label: "ワークベンチ"/);
  assert.doesNotMatch(nav, /id: "baseinfo"/);
  assert.match(app, /s\.id === "persona" \? "baseinfo" : s\.id/);
  assert.match(app, /const current = state\.ui\.currentSection \|\| "home"/);
  assert.match(state, /currentSection: "home"/);
});

test("基本タブは既存の駒整形コンポーネントを再利用し、保存状態を移行しない", () => {
  assert.match(sections, /id: "baseinfo", label: "基本"/);
  assert.match(sections, /active\.id === "baseinfo"[\s\S]*?window\.LBT_BaseInfoWorkspace/);
  assert.match(persona, /window\.LBT_BaseInfoWorkspace = BaseInfoWorkspace/);
  assert.match(sections, /const panelProps = \["persona", "support", "ego", "spirit"\]/);
  const renderStart = app.indexOf("const renderSection = ()");
  const renderBlock = app.slice(renderStart, app.indexOf('case "roster":', renderStart));
  assert.match(renderBlock, /case "baseinfo":[\s\S]*?case "persona":[\s\S]*?BuildWorkspace/);
});

test("ホーム検索は目的語と関連語を探し、既存画面へ移動する", () => {
  assert.match(app, /const visibleGroups = groups\.map/);
  assert.match(app, /\[item\.title, item\.desc, item\.terms\]/);
  for (const target of ["baseinfo", "persona", "skill", "ego", "shop", "roster", "settings", "help"]) {
    assert.ok(app.includes(`navigate("${target}"`), `ホームから ${target} へ移動できる`);
  }
  assert.match(app, /openPersonaDraftImport: true/);
  assert.match(app, /recordImportTarget: "text"/);
  assert.match(app, /recordImportTarget: "held"/);
  assert.match(app, /onExportState/);
  assert.match(app, /onExportRoster/);
  assert.match(app, /onTogglePreview/);
  assert.match(app, /onCopyJson/);
});

test("ホームの取り込みショートカットは既存の取込フォームを使う", () => {
  assert.match(persona, /ui\.openPersonaDraftImport !== true/);
  assert.match(persona, /setDraftImportOpen\(true\)/);
  assert.match(persona, /openPersonaDraftImport: false/);
  assert.match(sections, /state\.ui\?\.recordImportTarget/);
  assert.match(sections, /switchResultTool\(requested\)/);
  assert.match(sections, /recordImportTarget: null/);
});

test("ホームランチャーは狭幅では1列になり、キーボードでも移動できる", () => {
  assert.match(css, /\.home-task-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.home-task-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.home-task:focus-visible/);
});
