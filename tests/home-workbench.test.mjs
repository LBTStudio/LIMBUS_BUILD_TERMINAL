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
const bTypeCss = read("../assets/b-type-workbench.css");
const index = read("../index.html");

test("Bタイプはビルドを主作業面にし、ホームを補助入口として残す", () => {
  const nav = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  assert.match(nav, /id: "home", label: "ホーム", icon: "home"/);
  assert.match(ui, /const ICON_PATHS = \{[\s\S]*?\bhome:/);
  assert.match(nav, /id: "persona", label: "ワークベンチ"/);
  assert.doesNotMatch(nav, /id: "baseinfo"/);
  assert.match(app, /s\.id === "persona" \? "baseinfo" : s\.id/);
  assert.match(app, /const current = state\.ui\.currentSection \|\| "home"/);
  assert.match(state, /currentSection: "home"/);
  assert.match(state, /next\.ui\.layoutVersion !== "b-workbench-v2"/);
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
  assert.match(app, /const visibleActions = actions\.filter/);
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
  assert.match(bTypeCss, /\.btype-launcher-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0,1fr\)\)/);
  assert.match(bTypeCss, /@media \(max-width: 600px\)[\s\S]*?\.btype-launcher-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(bTypeCss, /\.btype-launcher-card:focus-visible/);
});

test("Bタイプのナビは制作・データ管理・補助を区別し、取り込み先を選べる", () => {
  for (const label of ["ワークスペース", "データ管理", "補助"]) assert.ok(app.includes(`label: "${label}"`));
  assert.match(app, /className: `rail-group rail-group-\$\{group\.id\}`/);
  assert.match(app, /const ImportRouterDialog =/);
  for (const route of ['"persona"', '"result"', '"garasumado"', '"owned"']) assert.ok(app.includes(`id: ${route}`), `取り込み経路 ${route}`);
  assert.match(app, /onOpenImportRouter: openImportRouter/);
  assert.match(app, /className: "import-router-options"/);
});

test("目的別取り込みダイアログはTabのフォーカスを内部に循環させ、Escで閉じる", () => {
  const start = app.indexOf("const ImportRouterDialog =");
  const end = app.indexOf("const App =", start);
  const dialog = app.slice(start, end);
  assert.match(dialog, /const dialogRef = React\.useRef\(null\)/);
  assert.match(dialog, /dialog\?\.querySelectorAll\(/);
  assert.match(dialog, /if \(event\.key !== "Tab"\) return/);
  assert.match(dialog, /!dialog\?\.contains\(document\.activeElement\)/);
  assert.match(dialog, /event\.shiftKey && document\.activeElement === first/);
  assert.match(dialog, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(dialog, /ref: dialogRef/);
  assert.match(dialog, /if \(event\.key === "Escape"\)/);
});

test("ビルドは作業対象と保存状態を常時表示し、タブ列を固定する", () => {
  assert.match(sections, /className: "build-context-strip"/);
  assert.match(sections, /className: "build-context-target"/);
  assert.match(sections, /className: `build-context-save is-\$\{saveStatus\?\.phase \|\| "saving"\}`/);
  assert.match(css, /\.build-tabs\.is-b-workbench \{[\s\S]*?position: sticky/);
  assert.match(css, /\.rail-group \{[\s\S]*?flex-direction: column/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.import-router-options \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test("プレビュー用キャプチャーは現行の「ビルド」表示を使う", () => {
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  const nav = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  assert.match(nav, /id: "persona", label: "ワークベンチ"/);
  assert.match(app, /HOME \/ MULTI-PURPOSE LAUNCHER/);
  assert.match(app, /ワークベンチを開く/);
  assert.match(app, /ワークベンチ/);
  assert.match(capture, /\.rail-item\[title='ビルド'\]/);
  assert.match(capture, /\.rail-item\[title='ワークベンチ'\]/);
  assert.match(capture, /build-overview\.png/);
  assert.match(capture, /build-status-editor\.png/);
  assert.match(capture, /profiles\.length\*6/);
});

test("ステータス一覧・編集・出力順はBタイプのビルド画面に一体化している", () => {
  assert.match(index, /id="b-type-production-rollout"/);
  assert.match(index, /B-type parity: status list, direct editing and emitted order/);
  assert.match(index, /\.settings-order-embedded \.status-order-scroll \{[\s\S]*?display: block/);
  assert.match(index, /\.settings-order-embedded \.status-order-row \+ \.status-order-row \{ margin-top: 6px; \}/);
  for (const selector of [
    ".settings-order-embedded",
    ".status-order-row:hover",
    ".status-order-name .input",
    ".status-order-number .input",
    ".status-order-row .reorder-btn",
    ".status-order-handle:focus-visible"
  ]) assert.ok(index.includes(selector), "BタイプのステータスUI用スタイルが必要: " + selector);
  assert.match(sections, /ステータス一覧・編集・出力順/);
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  assert.match(capture, /Build status list exposes editing and emitted-order controls/);
  assert.match(capture, /build-status-editor\.png/);
});
