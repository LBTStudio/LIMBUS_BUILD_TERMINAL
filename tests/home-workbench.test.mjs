import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = read("../js/App.js");
const ui = read("../js/ui.js");
const sections = read("../js/OtherSections.js");
const persona = read("../js/PersonaCodex.js");
const state = read("../js/state.js");
const css = read("../assets/workspace.css");

test("Bタイプはビルドを主作業面にし、ホームを補助入口として残す", () => {
  const nav = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  assert.match(nav, /id: "home", label: "ホーム", icon: "home"/);
  assert.match(ui, /const ICON_PATHS = \{[\s\S]*?\bhome:/);
  assert.match(nav, /id: "persona", label: "ビルド"/);
  assert.doesNotMatch(nav, /id: "baseinfo"/);
  assert.match(app, /s\.id === "persona" \? "baseinfo" : s\.id/);
  assert.match(app, /const current = state\.ui\.currentSection \|\| "baseinfo"/);
  assert.match(state, /currentSection: "baseinfo"/);
  assert.match(state, /next\.ui\.layoutVersion !== "b-workbench-v1"/);
  assert.match(state, /layoutVersion: ui\.layoutVersion/);
});

test("基本タブは既存の駒整形コンポーネントを再利用し、キャラクター状態を二重管理しない", () => {
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

test("Bタイプのナビは制作・データ管理・補助を区別し、取り込み先を選べる", () => {
  for (const label of ["制作", "データ管理", "補助"]) assert.ok(app.includes(`label: "${label}"`));
  assert.match(app, /className: `rail-group rail-group-\$\{group\.id\}`/);
  assert.match(app, /const ImportRouterDialog =/);
  for (const route of ['"persona"', '"result"', '"garasumado"', '"owned"']) assert.ok(app.includes(`id: ${route}`), `取り込み経路 ${route}`);
  assert.match(app, /onOpenImportRouter: openImportRouter/);
  assert.match(app, /className: "import-router-options"/);
});

test("ビルドは作業対象と保存状態を常時表示し、タブ列を固定する", () => {
  assert.match(sections, /className: "build-context-strip"/);
  assert.match(sections, /className: "build-context-target"/);
  assert.match(sections, /className: `build-context-save is-\$\{saveStatus\?\.phase \|\| "saving"\}`/);
  assert.match(css, /\.build-tabs\.is-b-workbench \{[\s\S]*?position: sticky/);
  assert.match(css, /\.rail-group \{[\s\S]*?flex-direction: column/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.import-router-options \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
