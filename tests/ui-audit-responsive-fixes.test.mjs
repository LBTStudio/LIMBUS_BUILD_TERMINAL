import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../js/App.js");
const css = read("../assets/v69-ui-audit-fixes.css");

test("監査修正CSSは実際のアプリにハッシュ付きで読み込まれ、UI後段に適用される", () => {
  assert.match(index, /assets\/v69-ui-audit-fixes\.css\?v=[0-9a-f]{8}/);
  assert.ok(index.indexOf("assets/v68-interaction-a11y.css") < index.indexOf("assets/v69-ui-audit-fixes.css"));
  assert.match(index, /js\/App\.js\?v=[0-9a-f]{8}/);
});

test("プレビュー格納時に旧PREVIEWタブを表示せず、操作を1か所に統一する", () => {
  assert.match(app, /className: "preview-reopen", onClick: togglePreview/);
  assert.match(css, /\.app\.preview-collapsed \.preview-reopen\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.preview-edge-toggle\s*\{[\s\S]*?z-index:/);
});

test("スマホのプレビュー操作は縦長の本文上ではなく下部の安全領域に横長で表示する", () => {
  const block = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf("/* Desktop keeps"));
  assert.match(block, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(122px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?writing-mode:\s*horizontal-tb;/);
  assert.match(block, /\.section-title-row\s*\{\s*padding-right:\s*0;\s*\}/);
});

test("ビルド8タブは4×2に収まり、横スクロールと右端の重なりを避ける", () => {
  assert.match(css, /\.build-tabs \.segmented\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.build-tabs \.segmented > button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?white-space:\s*normal;/);
});


test("スマホのショップ6分類は3×2に収まり、ガチャを右端に隠さない", () => {
  assert.match(css, /\.shop-tabs\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.shop-tabs\s*>\s*button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?white-space:\s*normal;/);
});

test("スマホ下部ナビは7項目を4列×2段に並べ、その他だけの孤立段をなくす", () => {
  assert.match(css, /\.rail\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
  const refinements = read("../assets/v56-refinements.css");
  assert.match(refinements, /grid-template-rows:\s*repeat\(2, 52px\)/);
});

test("セーブデータ読み込み確認はダイアログ意味付け・フォーカストラップ・Esc終了を持つ", () => {
  assert.match(app, /className: "card import-scope-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "import-scope-title", "aria-describedby": "import-scope-intro"/);
  assert.match(app, /const importDialogRef = React\.useRef\(null\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]{0,140}setImportData\(null\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
});

test("読み込み項目はデータのあるカテゴリを先に出し、空カテゴリは開いたときだけ見せる", () => {
  assert.match(app, /const importGroupsWithData = importData \? IMPORT_GROUPS\.filter\(\(g\) => g\.fields\.some\(\(f\) => f in importData\)\) : \[\];/);
  assert.match(app, /importGroupsWithData\.map\(\(g\) => renderImportGroup\(g, true\)\)/);
  assert.match(app, /className: "import-scope-empty-categories"/);
  assert.match(app, /データのないカテゴリも表示/);
  assert.match(app, /className: \`import-scope-option\$\{hasData \? "" : " is-empty"\}\`/);
  assert.match(app, /className: "import-scope-actions"/);
  assert.match(css, /\.import-scope-dialog\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?max-height:\s*min\(88dvh, 820px\)/);
  assert.match(css, /\.import-scope-options\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.import-scope-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});


test("初回SINNER SELECTの作成フォームはアクションまで表示できる幅を確保する", () => {
  assert.match(css, /\.acct-gate-panel\s*>\s*\.acct-grid\s*\{[\s\S]*?align-content:\s*start;[\s\S]*?grid-auto-rows:\s*max-content;/);
  assert.match(css, /\.acct-gate-panel\s*>\s*\.acct-grid\s*>\s*\.acct-card--form\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?min-height:\s*max-content;/);
});
