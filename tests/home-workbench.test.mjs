import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = read("../js/App.js");
const accounts = read("../js/accounts-ui.js");
const accountsCss = read("../assets/v66-accounts.css");
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
  assert.match(nav, /id: "persona", label: "ビルド"/);
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

test("ホームは次に設定する項目を判定し、既存の編集画面へ直接移動する", () => {
  const start = app.indexOf("const HomeLauncher =");
  const end = app.indexOf("const ImportRouterDialog =", start);
  const home = app.slice(start, end);
  assert.match(home, /const steps = \[/);
  assert.match(home, /const nextStep = steps\.find/);
  assert.match(home, /ready: basicReady/);
  assert.match(home, /ready: personaReady/);
  assert.match(home, /ready: skillReady && passiveReady/);
  assert.match(home, /navigate\(skillReady \? "passive" : "skill"\)/);
  assert.match(home, /onClick: nextStep\.run/);
  assert.match(home, /次へ：/);
  assert.match(home, /プレビューを確認する/);
  for (const target of ["baseinfo", "persona", "skill", "roster", "shop", "settings", "help"]) {
    assert.ok(app.includes(`navigate("${target}"`), `ホームから ${target} へ移動できる`);
  }
  assert.match(home, /既存データを取り込む/);
  assert.match(home, /記録・所持品を管理/);
  assert.match(home, /その他の機能を探す/);
  assert.match(home, /aria-label": "その他の機能を検索"/);
  assert.match(app, /openPersonaDraftImport: true/);
  assert.match(app, /recordImportTarget: "text"/);
  assert.match(app, /recordImportTarget: "held"/);
});

test("ホームの取り込みショートカットは既存の取込フォームを使う", () => {
  assert.match(persona, /ui\.openPersonaDraftImport !== true/);
  assert.match(persona, /setDraftImportOpen\(true\)/);
  assert.match(persona, /openPersonaDraftImport: false/);
  assert.match(sections, /state\.ui\?\.recordImportTarget/);
  assert.match(sections, /switchResultTool\(requested\)/);
  assert.match(sections, /recordImportTarget: null/);
});

test("新ホームは狭い画面でも縦一列になり、キーボード操作を見失わない", () => {
  assert.match(bTypeCss, /\.btype-home-primary-action:focus-visible/);
  assert.match(bTypeCss, /\.btype-home-step:focus-visible/);
  assert.match(bTypeCss, /@media \(max-width: 600px\)[\s\S]*?\.btype-home-progress ol \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(bTypeCss, /@media \(max-width: 600px\)[\s\S]*?\.btype-home-start-grid,[\s\S]*?\.btype-home-utility-list \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(bTypeCss, /\.btype-home-primary \{[\s\S]*?grid-template-columns: minmax\(0,1fr\);/);
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

test("ビルドはB型の作業見出し・状態帯・タブ列・出力プレビューを表示する", () => {
  assert.match(sections, /className: "btype-page-heading"/);
  assert.match(sections, /className: "status-strip build-context-strip btype-build-status-strip"/);
  assert.match(sections, /h\("strong", null, "キャラクター"\)/);
  assert.match(sections, /h\("strong", null, "装備"\)/);
  assert.match(sections, /h\("strong", null, "保存"\)/);
  assert.match(bTypeCss, /\.btype-build-tabs\{[\s\S]*?overflow-x:auto/);
  assert.match(bTypeCss, /\.btype-build-tablist/);
  assert.match(bTypeCss, /\.btype-workbench-preview-panel/);
  assert.match(css, /\.rail-group \{[\s\S]*?flex-direction: column/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.import-router-options \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});;

test("プレビュー用キャプチャーは現行の「ビルド」表示を使う", () => {
  const capture = read("../tools/ui/capture-preview-control-regression.mjs");
  const nav = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  assert.match(nav, /id: "persona", label: "ビルド"/);
  assert.match(app, /LIMBUS BUILD TERMINAL/);
  assert.match(app, /次へ：/);
  assert.match(app, /ワークベンチ/);
  assert.match(capture, /\.rail-item\[title='ビルド'\]/);
  assert.match(capture, /\.rail-item\[title='ワークベンチ'\]/);
  assert.match(capture, /build-overview\.png/);
  assert.match(capture, /build-status-editor\.png/);
  assert.match(capture, /profiles\.length\*14/);
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

test("初回ホームは作成・取り込み・記録を主導線にし、その他は折りたたむ", () => {
  const start = app.indexOf("const HomeLauncher =");
  const end = app.indexOf("const ImportRouterDialog =", start);
  const home = app.slice(start, end);
  assert.match(home, /className: "btype-home-primary"/);
  assert.match(home, /className: "btype-home-progress"/);
  assert.match(home, /className: "btype-home-start-grid"/);
  assert.match(home, /className: "btype-home-more"/);
  assert.doesNotMatch(home, /btype-launcher-grid/);
  assert.match(bTypeCss, /\.btype-home-primary/);
  assert.match(bTypeCss, /@media \(max-width: 600px\)[\s\S]*?\.btype-home-start-grid,\s*\.btype-home-utility-list \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(bTypeCss, /\.btype-home-primary-action:focus-visible/);
});

test("初回キャラクター作成は名前だけで進め、用途タグとアイコンは任意設定へ畳む", () => {
  const gate = accounts.slice(accounts.indexOf("const AccountGate"));
  assert.match(gate, /最初のキャラクターを作る/);
  assert.match(gate, /名前だけで始められます/);
  assert.match(gate, /acct-first-run-note/);
  assert.match(gate, /className: "acct-optional-settings"/);
  assert.match(gate, /placeholder: "キャラクター名"/);
  assert.doesNotMatch(gate, /SINNER SELECT/);
  assert.match(accountsCss, /\.acct-first-run-note/);
  assert.match(accountsCss, /\.acct-optional-settings/);
  assert.match(accountsCss, /\.acct-gate-panel > \.acct-grid:has\(\.acct-card--add:only-child\)/);
});
