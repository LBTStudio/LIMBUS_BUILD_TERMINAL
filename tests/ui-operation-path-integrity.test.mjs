import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../js/App.js");
const skillDeck = read("../js/SkillDeck.js");
const accountsUI = read("../js/accounts-ui.js");
const sections = read("../js/OtherSections.js");
const state = read("../js/state.js");
const parityCss = read("../assets/b-type-ui-parity.css");
const captureAudit = read("../tools/ui/capture-ui-audit.mjs");
const uiHarness = read("../tools/ui/harness.mjs");
const sharedUi = read("../js/ui.js");
const workbenchCss = read("../assets/b-type-workbench.css");
const index = read("../index.html");
const sharePage = read("../share.html");
const mobilePreviewPage = read("../mobile-preview.html");
const uiAuditWorkflow = read("../.github/workflows/ui-audit-screenshot-capture.yml");
const axeDetail = read("../tools/ui/axe-detail.mjs");
const axeShareView = read("../tools/ui/axe-share-view.mjs");
const personaCodex = read("../js/PersonaCodex.js");
const personaCss = read("../assets/persona-codex.css");
const garasumadoImportUI = read("../js/garasumado-import-ui.js");
const mobileAuditCss = read("../assets/v69-mobile-ui-audit.css");
const overlayCss = read("../assets/v52-overlay.css");

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
  assert.match(state, /case "ADD_SUPPORT":[\s\S]{0,700}if \(name\) return state/);
  const deathActionStart = state.indexOf('case "SET_DEATH_SUPPORT":');
  const deathActionEnd = state.indexOf('case "PATCH_DEATH_SUPPORT":', deathActionStart);
  const deathAction = state.slice(deathActionStart, deathActionEnd);
  assert.match(deathAction, /findOwnedSupport\(state, requestedName\)/);
  assert.match(deathAction, /Equipment cannot create an owned passive/);
  assert.match(deathAction, /return state/);
  assert.doesNotMatch(deathAction, /addRosterSupport\(/);
  assert.match(state, /case "ADD_ROSTER_SUPPORT":[\s\S]{0,700}purchaseCostOf\(state,[\s\S]{0,180}purchaseAffordability\(state, cost\)\.ok/);
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
  assert.match(state, /case "APPLY_SPIRIT":[\s\S]{0,900}Number\(rawPrice\) !== 0\) return state/);
  assert.match(state, /case "ADD_ROSTER_SPIRIT":[\s\S]{0,700}purchaseCostOf\(state,[\s\S]{0,180}purchaseAffordability\(state, cost\)\.ok/);
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


test("モバイルの主要操作対象を40x40px以上にし、監査CIで未達を失敗にする", () => {
  const indexHtml = read("../index.html");
  const touchStyles = indexHtml.slice(indexHtml.indexOf('<style id="lbt-mobile-touch-targets">'));
  assert.ok(touchStyles.includes(".topbar-search"));
  for (const selector of [
    "button.btn-sm", "button.btn", "button.secondary", "button[type=\"submit\"]", ".share-private-notes-clear", ".btype-back-link",
    ".btype-record-hub .btype-page-heading > button.primary",
    ".piece-art-actions > button", ".piece-tab", ".piece-preview-tab",
    ".acct-gate-edit-btn", ".acct-upload-btn", ".pw-listbar-toggle",
    ".lbt-glossary-term", ".lbt-glossary-popover-close", "button.rm", ".es-kw-add",
    'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"])'
  ]) assert.ok(touchStyles.includes(selector), "モバイル操作・入力対象の高さを40pxへ: " + selector);
  assert.ok(touchStyles.includes(".topbar-balance"), "残高チップもタップ可能な画面遷移ボタンとして扱う");
  assert.ok(touchStyles.includes(".preview-mobile-toggle"));
  assert.ok(touchStyles.includes(".acct-close"));
  assert.ok(touchStyles.includes(".import-router-close"));
  assert.ok(touchStyles.includes(".persona-draft-dialog button.btn-icon"));
  assert.ok(touchStyles.includes(".ledger-reward-item-chip button"));
  assert.ok(touchStyles.includes(".reorder-btn"));
  assert.ok(touchStyles.includes(".ledger-row-move-action"));
  assert.ok(touchStyles.includes("min-width: 40px"));
  assert.ok(touchStyles.includes("min-height: 40px"));
  assert.ok(touchStyles.includes(".ledger-card .ledger-row-move-action"));
  assert.ok(touchStyles.includes(".ledger-card .ledger-row-release"));
  assert.ok(touchStyles.includes("height: 40px !important"));
  assert.ok(touchStyles.includes("grid-template-columns: repeat(5, minmax(0, 1fr))"),
    "9つのビルドタブをスマホで5列2段にし、幅を押し潰さない");
  assert.ok(touchStyles.includes('<style id="lbt-mobile-build-tab-grid-final">'),
    "最後のCSSとして強制横スクロール規則を上書きする");
  assert.ok(touchStyles.includes("display: grid !important"));
  assert.ok(touchStyles.includes("grid-template-columns: repeat(5, minmax(0, 1fr)) !important"));
  assert.ok(touchStyles.includes('.btype-build-tablist[role="tablist"][aria-label="ビルドセクション"] > button[role="tab"]'));

  assert.match(captureAudit, /const touchTargetViolations/);
  assert.match(captureAudit, /".topbar-balance"/);
  for (const selector of [
    "button.btn-sm", ".btype-back-link", ".piece-art-actions > button",
    ".piece-tab", ".piece-preview-tab", ".acct-gate-edit-btn",
    ".acct-upload-btn", ".pw-listbar-toggle", ".lbt-glossary-term", ".lbt-glossary-popover-close",
    "button.rm", ".es-kw-add", '"select", "textarea"'
  ]) assert.ok(captureAudit.includes(selector), "監査で操作寸法を確認する: " + selector);
  assert.match(captureAudit, /smallActionableTargets/);
  assert.ok(captureAudit.includes("page.addInitScript({ content: fs.readFileSync"), "axeは起動時ダイアログを描画する前に注入する");
  assert.match(captureAudit, /accessibilityScans/);
  assert.match(captureAudit, /m\.dialogs/);
  assert.match(captureAudit, /overlayAccessibilityViolationNodeCount/);
  assert.match(captureAudit, /minimum: "40x40 CSS px"/);
  assert.match(captureAudit, /type: "touch-target-too-small"/);
  assert.match(captureAudit, /"touch-target-too-small","build-tabs-not-reflowed"\].includes\(item\.type\)/);
  assert.match(captureAudit, /criticalLayoutWarnings\.length/);
  assert.match(captureAudit, /const buildTablistMetrics/);
  assert.match(captureAudit, /type: "build-tabs-not-reflowed"/);
});

test("画面・サブ画面の切替時は中央スクロールを先頭へ戻し、同一画面の編集では保持する", () => {
  assert.match(app, /const mainScrollRouteKey = \[[\s\S]*?current,[\s\S]*?libraryTab[\s\S]*?shopView[\s\S]*?settingsView[\s\S]*?basicFormatTab/);
  assert.match(app, /React\.useLayoutEffect\(\(\) => \{[\s\S]*?previousMainScrollRouteKeyRef\.current = mainScrollRouteKey[\s\S]*?main\.scrollTop = 0/);
  assert.match(captureAudit, /section-navigation-scroll-reset/);
  assert.match(captureAudit, /ホームのスクロール位置が残っています/);
});

test("モバイルのアカウント編集・削除と人格お気に入りは40x40px以上のタップ領域を持つ", () => {
  const mobileOverrides = index.slice(index.indexOf('<style id="lbt-mobile-build-tab-grid-final">'));
  assert.match(mobileOverrides, /\.acct-card-actions \.acct-icon-btn[\s\S]*?width: 40px !important[\s\S]*?height: 40px !important/);
  assert.match(mobileOverrides, /\.acct-card-actions \.acct-edit-btn[\s\S]*?min-height: 40px !important/);
  assert.match(mobileOverrides, /\.p-card \.p-fav[\s\S]*?width: 40px !important[\s\S]*?height: 40px !important/);
  assert.match(captureAudit, /\.acct-card-actions \.acct-icon-btn/);
  assert.match(captureAudit, /\.p-fav/);
});

test("UI監査はSINNER SELECTの初期画面を含むダイアログをaxe診断する", () => {
  assert.ok(uiAuditWorkflow.includes("Install axe-core for accessibility diagnostics"));
  assert.ok(uiAuditWorkflow.includes("node tools/ui/axe-detail.mjs"));
  assert.ok(uiAuditWorkflow.includes("axe-detail.json"));
  assert.ok(uiAuditWorkflow.includes("server_pid=$!"));
  assert.ok(uiAuditWorkflow.includes("trap "));
  assert.ok(uiAuditWorkflow.includes("BASE_URL=http://127.0.0.1:8099/"));
  assert.ok(captureAudit.indexOf("await page.addInitScript") < captureAudit.indexOf("await boot()"), "axe-coreはSINNER SELECTを描画する前に注入する");
  assert.ok(captureAudit.includes("page.addInitScript({ content: fs.readFileSync"));
  assert.ok(captureAudit.includes(".acct-gate") && captureAudit.includes(".acct-card--add"));
  assert.ok(captureAudit.includes("作成して開く"));
  assert.ok(captureAudit.includes('if (!window.axe) throw new Error("axe-core'));
  assert.ok(captureAudit.includes("overlayAccessibilityUnavailableCount"));
  assert.ok(axeDetail.includes("walkSections"));
  assert.ok(axeDetail.includes("window.axe.run"));
});

test("320px設定画面の標準式入力はラベル・操作と分離し、入力欄を全幅で確保する", () => {
  assert.ok(sections.includes("settings-builtin-formula-row"));
  assert.ok(sections.includes("settings-builtin-formula-expression"));
  assert.ok(mobileAuditCss.includes("@media (max-width: 400px)"));
  assert.ok(mobileAuditCss.includes('"expression expression"'));
  assert.ok(mobileAuditCss.includes("settings-builtin-formula-expression"));
});

test("スマホの検索・プレビュー操作は最低40pxのタップ幅を確保する", () => {
  const narrow = mobileAuditCss.slice(mobileAuditCss.indexOf("@media (max-width: 360px)"));
  assert.ok(narrow.includes(".topbar > .topbar-search"));
  assert.ok(narrow.includes(".topbar > .preview-mobile-toggle"));
  assert.ok(narrow.includes("flex: 0 0 40px;"));
  assert.ok(narrow.includes("min-width: 40px;"));
});

test("アカウント切替モーダルはバナーランドマークを重複させず、ZIP取込見出しを一段ずつ下げる", () => {
  const modalStart = accountsUI.indexOf('h("section", { ref: panelRef, className: "acct-panel"');
  const modalEnd = accountsUI.indexOf('total === 0', modalStart);
  const modal = accountsUI.slice(modalStart, modalEnd);
  assert.ok(modal.includes('h("div", { className: "acct-panel-head" }'));
  assert.ok(!modal.includes('h("header", { className: "acct-panel-head" }'));
  assert.ok(garasumadoImportUI.includes('h("h3", { className: "gara-group-title" }, "ZIP / JSON ファイルから一括読み込み")'));
});

test("320px幅で上部ツールバーの全操作を表示領域内に収める", () => {
  assert.ok(app.includes('className: "utility-trigger", "aria-label": "操作・保存"'));
  assert.ok(mobileAuditCss.includes("@media (max-width: 360px)"));
  assert.ok(mobileAuditCss.includes(".topbar > .utility-trigger"));
  assert.ok(captureAudit.includes("topbar-content-clipped"));
});

test("プレビューを閉じている間は未存在のpreview-panelをaria-controlsで参照しない", () => {
  const target = '"aria-controls": previewOpen ? "preview-panel" : void 0';
  assert.equal(app.split(target).length - 1, 2);
  assert.equal(sections.split(target).length - 1, 1);
});

test("人格編集フォームに明示ラベルを付け、硝子窓URL取込見出しの階層を整える", () => {
  assert.ok(personaCodex.includes('"aria-label": label + "（編集モード）"'));
  assert.ok(personaCodex.includes('"aria-label": "既存キーワードから選択して追加"'));
  assert.ok(garasumadoImportUI.includes('h("h2", { className: "gara-title" }, "硝子窓の共有URLから取り込む")'));
});


test("スマートフォンUI監査はマウスクリックではなくタッチ操作経路を通る", () => {
  const clickHelper = captureAudit.slice(captureAudit.indexOf("async function click("), captureAudit.indexOf("function mainNavigation("));
  assert.match(clickHelper, /view\.startsWith\("mobile"\)[\s\S]*?\.tap\(/);
  assert.match(captureAudit, /if \(view\.startsWith\("mobile"\)\) await target\.tap\(/);
  assert.doesNotMatch(captureAudit, /summary\.click\(/, "設定・履歴開閉も共通のタッチ対応操作ヘルパーを通す");
});


test("SINNER SELECTの実アカウント選択を迂回するイベント発火フォールバックを禁止する", () => {
  const selectionStart = captureAudit.indexOf("const card=page.locator(\".acct-card--gate\")");
  const selectionEnd = captureAudit.indexOf("await mainNavigation().first().waitFor", selectionStart);
  assert.ok(selectionStart >= 0 && selectionEnd > selectionStart);
  const selection = captureAudit.slice(selectionStart, selectionEnd);
  assert.match(selection, /if\(!\(await visible\(hit\)\)\) throw new Error/);
  assert.match(selection, /await click\(hit\)/);
  assert.match(selection, /if\(await visible\(gate\)\) throw new Error/);
  assert.doesNotMatch(selection, /lbt:accounts-entered/, "UI選択に失敗した際にアプリ内部イベントで迂回しない");
  assert.doesNotMatch(selection, /catch\(\(\)=>\{\}\)/, "タップ失敗を握り潰さない");
});


test("ダイアログ状態のaxe診断が実行エラーになった場合はUI監査を失敗させる", () => {
  assert.match(captureAudit, /audit\.accessibilityErrors\.push/);
  assert.ok(captureAudit.includes("audit.accessibilityErrors.length || audit.overlayAccessibilityUnavailableCount) process.exitCode=1"));
  assert.match(captureAudit, /audit\.overlayAccessibilityScanCount = audit\.accessibilityScans\.length/);
  assert.match(captureAudit, /audit\.overlayAccessibilityViolationNodeCount/);
});


test("SINNER SELECTの新規作成をAPI直呼びで迂回せずフォーム送信の結果で判定する", () => {
  const start = captureAudit.indexOf('const add=page.locator(".acct-card--add")');
  const end = captureAudit.indexOf("await mainNavigation().first().waitFor", start);
  assert.ok(start >= 0 && end > start);
  const creation = captureAudit.slice(start, end);
  assert.match(creation, /await click\(add\)/);
  assert.match(creation, /await name\.fill\("UI監査用キャラクター"\)/);
  assert.match(creation, /await click\(create\)/);
  assert.match(creation, /if\(!\(await visible\(mainNavigation\(\)\.first\(\)\)\)\)[\s\S]*?throw new Error/);
  assert.doesNotMatch(creation, /LBT_accounts[\s\S]*?\.create\(/, "アカウント作成APIを直接呼び出して画面操作を代替しない");
  assert.doesNotMatch(creation, /lbt:accounts-entered/, "画面遷移イベントを直接発火しない");
  assert.doesNotMatch(creation, /accountCreateFallback/);
});


test("UI操作監査は320pxの狭幅でも全主要操作シナリオを巡回する", () => {
  assert.match(captureAudit, /mode\.startsWith\("mobile"\)/);
  assert.match(captureAudit, /mode==="mobile-narrow"\?\{width:320,height:640\}/);
  assert.match(captureAudit, /\["desktop","tablet","mobile","mobile-narrow"\]/);
  assert.match(captureAudit, /for \(const mode of \["desktop","tablet","mobile","mobile-narrow"\]\)/);
});


test("ブラウザ監査ハーネスは現在の画面構造と内部タブを巡回し、古い左レール12件前提を使わない", () => {
  assert.match(uiHarness, /export const UI_VIEWS = \[/);
  assert.match(uiHarness, /kind: "build-tab"/);
  assert.match(uiHarness, /kind: "shop-category"/);
  assert.match(uiHarness, /kind: "record-tab"/);
  assert.match(uiHarness, /btype-shop-category-card\[data-category=/);
  assert.match(uiHarness, /記録セクションの種別/);
  assert.match(uiHarness, /for \(let i = 0; i < UI_VIEWS\.length; i\+\+\)/);
  assert.doesNotMatch(uiHarness, /\.rail-item"\)\.nth\(i\)/, "旧画面数を左ナビのボタン数として扱わない");
  assert.match(uiHarness, /enterAuditWorkspace/);
});

test("ショップと記録の内部タブを巡回するときは、カテゴリ／ライブラリの入口へ戻ってから次を開く", () => {
  assert.match(uiHarness, /async function openShopHub/);
  assert.match(uiHarness, /async function openRecordHub/);
  assert.match(uiHarness, /btype-shop-catalog \.btype-back-link/);
  assert.match(uiHarness, /btype-record-detail \.btype-back-link/);
});


test("320pxの共通UI巡回は下部ナビ／その他シートをタッチ操作し、hasTouchを有効にする", () => {
  assert.match(uiHarness, /width <= 640 \? \{ hasTouch: true \} : \{\}/);
  assert.match(uiHarness, /async function activateAuditTarget/);
  assert.match(uiHarness, /locator\.tap\(/);
  assert.match(uiHarness, /btype-mobile-bottom-nav/);
  assert.match(uiHarness, /utility-section-grid/);
  assert.match(uiHarness, /const directLabels =/); // mobile build/record/import routes remain explicit
});

test("全画面axe診断は26ビューを4 viewportで走査し、重大・深刻な違反があればCIを失敗させる", () => {
  assert.ok(axeDetail.includes("UI_VIEWS.length * VIEWPORTS.length"));
  for (const width of ["1440", "1024", "390", "320"]) assert.match(axeDetail, new RegExp("width: " + width));
  assert.match(axeDetail, /item\.impact === "critical" \|\| item\.impact === "serious"/);
  assert.match(axeDetail, /blockingNodeCount > 0/);
  assert.match(axeDetail, /scannedViews !== expectedViewScans/);
  assert.match(axeDetail, /manifest\.fullViewAccessibility/);
  assert.ok(uiAuditWorkflow.includes("axe_status=$?"));
  assert.ok(uiAuditWorkflow.includes('exit "$axe_status"'));
  assert.ok(uiAuditWorkflow.includes("cp tmp/axe-detail.json artifacts/ui-audit-screenshots/axe-detail.json"));
  assert.ok(uiAuditWorkflow.includes("tools/ui/axe-detail.mjs"));
  assert.ok(uiAuditWorkflow.includes("tools/ui/harness.mjs"));
});

test("スキル未登録状態の追加操作は実ボタンになり、旧横スクロール領域を残さない", () => {
  assert.ok(skillDeck.includes('className: "deck deck-empty"'));
  assert.ok(skillDeck.includes('type: "button"'));
  assert.ok(skillDeck.includes('className: "deck-empty-cell"'));
  assert.ok(skillDeck.includes("onClick: editable ? addSkill : undefined"));
  assert.ok(skillDeck.includes("disabled: !editable"));
  assert.ok(index.includes(".deck.deck-empty"));
  assert.ok(index.includes("overflow: visible"));
  assert.ok(index.includes(".deck-empty-cell:focus-visible"));
});

test("罪属性チップと混乱タグは通常文字4.5:1を満たす明度の文字色を使う", () => {
  assert.ok(index.includes('.cond-chip.is-sin[data-sin="憤怒"] { color: #ef786d; }'));
  assert.ok(index.includes('.cond-chip.is-sin[data-sin="傲慢"] { color: #aaaaff; }'));
  assert.ok(index.includes('.ego-resource-chip[data-sin="憤怒"] .ego-resource-chip-count { color: #ef786d; }'));
  assert.ok(index.includes('.ego-resource-chip[data-sin="傲慢"] .ego-resource-chip-count { color: #aaaaff; }'));
  assert.ok(index.includes('.spirit-item-tag[data-tag="confuse"] { color: #f18c83; }'));
});

test("ダイアログ・シートのaxe集計と全画面axe集計を別フィールドで保存する", () => {
  assert.ok(captureAudit.includes("overlayAccessibilityScope"));
  assert.ok(captureAudit.includes("overlayAccessibilityScanCount"));
  assert.ok(captureAudit.includes("overlayAccessibilityViolationNodeCount"));
  assert.ok(!captureAudit.includes("audit.accessibilityViolationNodeCount"));
  assert.ok(axeDetail.includes("manifest.fullViewAccessibility"));
  assert.ok(axeDetail.includes('item.id === "page-has-heading-one"'));
  assert.ok(axeDetail.includes("missingPrimaryHeadingNodeCount > 0"));
});

test("320px幅の人格取得照合の開閉見出しは40pxのタップ領域を持ち、監査ゲートに含まれる", () => {
  assert.ok(mobileAuditCss.includes(".ledger-persona-audit-disclosure > summary"));
  assert.match(mobileAuditCss, /\.ledger-persona-audit-disclosure > summary\s*\{[\s\S]*?min-height:\s*40px/);
  assert.ok(captureAudit.includes(".ledger-persona-audit-disclosure > summary"));
});

test("入口ページは専用ファビコンを指定し、監査ハーネスはHTTPエラーのURLを記録する", () => {
  assert.ok(index.includes('rel="icon" type="image/svg+xml"'));
  assert.ok(sharePage.includes('rel="icon" type="image/svg+xml"'));
  assert.ok(mobilePreviewPage.includes('rel="icon" type="image/svg+xml"'));
  assert.match(uiHarness, /page\.on\("response", \(response\) => \{[\s\S]*?response\.status\(\) >= 400[\s\S]*?response\.url\(\)/);
});


test("UI監査ハーネスは幅に応じて左レールまたはモバイル下部ナビの表示を待つ", () => {
  assert.ok(uiHarness.includes("await page.waitForFunction(() => {"));
  assert.ok(uiHarness.includes('document.querySelector(".rail-item[title=\'ホーム\']")'));
  assert.ok(uiHarness.includes('document.querySelector(".btype-mobile-bottom-nav")'));
  assert.ok(!uiHarness.includes('await page.waitForSelector(".rail-item[title=\'ホーム\']"'),
    "スマートフォンで常に非表示のデスクトップナビを待たない");
});


test("Cloudflare Web Analytics のローカル送信先404はローカル監査だけで抑制し、公開URLでは検出する", () => {
  assert.ok(uiHarness.includes('const auditHost = new URL(url).hostname;'));
  assert.ok(uiHarness.includes('auditHost === "localhost" || auditHost === "127.0.0.1"'));
  assert.ok(uiHarness.includes('page.route("**/cdn-cgi/rum**"'));
  assert.ok(uiHarness.includes('status: 204'));
  assert.ok(uiHarness.includes('headers: { "cache-control": "no-store" }'));
  assert.ok(uiHarness.indexOf("auditHost ===") < uiHarness.indexOf('page.route("**/cdn-cgi/rum**"'));
  assert.ok(uiHarness.includes("公開URLでは決して隠さない"));
});

test("各画面の主見出しを本文領域のH1として定義する", () => {
  assert.ok(app.includes('h("h1", { id: "home-launcher-title" }, "何から始めますか？")'));
  assert.ok(sharedUi.includes('level = 2'));
  assert.ok(sharedUi.includes('level === 1 ? "h1" : "h2"'));
  assert.ok(sections.includes('level: 1'));
  assert.ok(sections.includes('tab === "inventory" ? "アイテム"'));
  assert.ok(sections.includes('level: 1, title: "SHOP / ショップ"'));
  assert.ok(workbenchCss.includes(".btype-command-hero :is(h1, h2)"));
});


test("記録ハブの取り込み入口は共通プライマリボタンとして描画する", () => {
  assert.ok(sections.includes('className: "btn btn-primary record-import-launch"'),
    "primary 単独では共通ボタンの視覚スタイルが適用されない");
  assert.ok(captureAudit.includes('".record-import-launch"'),
    "取り込み入口をモバイルのタップ領域監査へ含める");
});

test("SINNER SELECT編集とサポート枠解除は40px以上のモバイル操作領域と個別ラベルを持つ", () => {
  assert.ok(mobileAuditCss.includes(".acct-gate-edit-btn {") && mobileAuditCss.includes("min-width: 72px;") && mobileAuditCss.includes("min-height: 40px;"));
  assert.ok(mobileAuditCss.includes(".spp-slot .rm {") && mobileAuditCss.includes("width: 40px;") && mobileAuditCss.includes("height: 40px;"));
  assert.ok(mobileAuditCss.includes(".spp-slot .reorder-btns { margin-right: 44px; }"));
  assert.ok(sections.includes('サポート「${spp.name || "未設定"}」を枠から外す'));
  assert.ok(sections.includes('死亡後サポート「${deathSupport.name || "未設定"}」を枠から外す'));
  assert.ok(captureAudit.includes('".acct-gate-edit-btn"'));
  assert.ok(captureAudit.includes('".spp-slot .rm"'));
});


test("操作ボタンのアクセシブル名は表示文言を含み、カテゴリカードは可視テキストを使う", () => {
  assert.ok(app.includes("⌘K") && app.includes("Ctrl+K"), "Mac/PC双方の表示キーをOS判定で切り替える");
  assert.ok(app.includes('React.createElement("kbd", null, QUICK_SEARCH_SHORTCUT)'), "ヘッダーにOS別のショートカットを表示する");
  assert.ok(app.includes('JSON出力。CCFOLIA用JSONをコピー'), "JSONボタンの表示文言をアクセシブル名の先頭に含める");
  assert.ok(!sections.includes('"aria-label": category.label + "カテゴリを開く"'), "ショップカードはカテゴリ見出しなどの可視テキストから名前を構成する");
});


test("共有ビューアは空の入口と実生成シートを4幅・5操作状態でaxe診断する", () => {
  for (const width of [1440, 1024, 390, 320]) assert.ok(axeShareView.includes("width: " + width));
  for (const state of ["empty-share-entry", "generated-share-sheet", "all-folds-expanded", "share-search-results", "private-notes"]) {
    assert.ok(axeShareView.includes('"' + state + '"') || axeShareView.includes('"' + state + '",'), "共有UIの状態を診断する: " + state);
  }
  assert.ok(axeShareView.includes("buildShareSheetHTML(state)"));
  assert.ok(axeShareView.includes("window.axe.run(document"));
  assert.ok(axeShareView.includes("horizontalOverflow"));
  assert.ok(uiAuditWorkflow.includes("Audit empty share entry and generated share sheet at four responsive widths"));
  assert.ok(uiAuditWorkflow.includes("node tools/ui/axe-share-view.mjs"));
});


test("Playwrightの所持人格画面は旧同期名と新しい保存buildを持つ人格の詳細を実測する", () => {
  assert.match(captureAudit, /const syncedPersonaFixture = \(\(\) => \{/);
  assert.match(captureAudit, /entry\.displayName = "同期UI監査・旧表示名"/);
  assert.match(captureAudit, /entry\.build = \{[\s\S]*?savedAt: now,[\s\S]*?personaSrc,[\s\S]*?skills,/);
  assert.match(captureAudit, /await attempt\("persona-synced-roster-details"/);
  assert.match(captureAudit, /persona-synced-latest-roster-name/);
  assert.match(captureAudit, /persona-synced-build-detail/);
  assert.match(captureAudit, /fixture\.passiveName[\s\S]*?fixture\.skillNames[\s\S]*?fixture\.uniqueName[\s\S]*?fixture\.speed[\s\S]*?fixture\.resSlash/);
});

test("所持人格詳細は所有状態と速度・耐性を優先し、HP/SAN/弾丸を表示しない", () => {
  const start = personaCodex.indexOf("const PersonaDetail =");
  const end = personaCodex.indexOf("function stablePersonaDiffValue", start);
  const detail = personaCodex.slice(start, end);
  assert.ok(detail.includes("detail-ownership"));
  assert.ok(detail.includes("isEquipped ?"));
  assert.ok(detail.includes("isInRoster ?"));
  assert.ok(detail.includes("\\u901F\\u5EA6"));
  assert.doesNotMatch(detail, /detail-stat-label.*?"HP"/);
  assert.doesNotMatch(detail, /detail-stat-label.*?"SAN"/);
  assert.doesNotMatch(detail, /detail-stat-label.*?弾丸/);
  assert.ok(personaCss.includes("grid-template-columns: minmax(120px, 180px)"));
  assert.match(captureAudit, /detail\.locator\("\.detail-stat-label"\)/);
  assert.match(captureAudit, /detail\.locator\("\.detail-ownership"\)/);
});



test("所持人格一覧は20件の通常・特異混在データを実ブラウザへ描画して確認する", () => {
  assert.match(captureAudit, /sameModeCandidates\.slice\(0, 17\)/);
  assert.match(captureAudit, /otherModeCandidates\.slice\(0, 3\)/);
  assert.match(captureAudit, /\.slice\(0, 20\)\.map/);
  assert.match(captureAudit, /rosterCardCount !== 20/);
  assert.match(captureAudit, /rosterModes\.length !== 2/);
  assert.ok(captureAudit.includes("if (await visible(rosterMode)) await click(rosterMode);"),
    "所持限定モードではタブが非表示になるため、表示時だけ切り替える");
  assert.match(captureAudit, /personaRosterCapacity/);
});

test("共有シートは読みやすい耐性ラベルコントラストとmain/footerランドマークを持つ", () => {
  const generator = read("../js/generator.js");
  assert.ok(generator.includes('.res .attr{font-size:16px;font-weight:700;opacity:1;'),
    "耐性カテゴリ名は色の不透明度を下げない");
  assert.ok(generator.includes("background:#a06430;color:#fff;"),
    "弱点色は白文字との4.5:1以上のコントラストを確保する");
  assert.ok(generator.includes("background:#7a7060;color:#fff;"));
  assert.ok(generator.includes("background:#4e7a52;color:#fff;"));
  assert.ok(generator.includes('<main id="share-main">'));
  assert.ok(generator.includes('</main>\n  <footer class="foot">'));
});



test("320px幅のサポート装備枠は一列に縦積みし、枠名の縦折り返しを回帰監査する", () => {
  assert.ok(mobileAuditCss.includes("@media (max-width: 360px)"));
  assert.ok(mobileAuditCss.includes(".spp-slots"));
  assert.ok(mobileAuditCss.includes("grid-template-columns: minmax(0, 1fr) !important"));
  assert.ok(captureAudit.includes("support-slots-narrow-layout"));
  assert.ok(captureAudit.includes("narrowLayout.columns!==1"));
  assert.ok(captureAudit.includes("slot.labelHeight>26"));
});

test("SINNER SELECTのアカウント編集時はオンライン保全パネルを退避し、編集フォーム領域を確保する", () => {
  assert.ok(mobileAuditCss.includes(".acct-panel:has(> .acct-grid.is-editing) > .lbt-cloud-panel"));
  assert.ok(captureAudit.includes("backupPanelHidden"));
  assert.ok(captureAudit.includes("!editorMetrics.backupPanelHidden"));
  assert.ok(captureAudit.includes(".acct-grid.is-editing > .acct-card--form, .acct-grid.is-editing > .acct-card--editing"));
  assert.ok(captureAudit.includes("account-edit-actions-visible"));
  assert.ok(captureAudit.includes("account-edit-cancel-restores-list"));
  assert.ok(captureAudit.includes('actions.getByRole("button",{name:"キャンセル",exact:true})'));
  assert.ok(captureAudit.includes("restore.backupVisible") && captureAudit.includes("restore.formRemaining"));
});


test("共有方法の推奨バッジは320px幅でも文字単位に分断されない", () => {
  const start = overlayCss.indexOf(".share-opt.is-recommended .share-opt-title::after{");
  const end = overlayCss.indexOf("\n}", start);
  const rule = overlayCss.slice(start, end);
  assert.ok(rule.includes("display: inline-block"));
  assert.ok(rule.includes("white-space: nowrap"));
  assert.ok(rule.includes("content: '推奨'"));
});
