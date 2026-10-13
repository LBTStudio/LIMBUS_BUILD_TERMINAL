import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* 記録セクション（旧 所持 / 通帳）の改修の回帰テスト。
 *
 * - 残高（LP・欠片）はどの画面でも見える必要がある。topbar に置くが、
 *   .topbar-actions の中に入れると ≤640px と横向きで display:none に
 *   なるため、.topbar の直接子として置くこと。
 * - 通帳タブは以前、早期 return でタブ帯ごと描画しなくなり、
 *   他タブへ移る手段が無くなった。ヘッダは全タブで描画すること。
 * - セクション名は 所持 → 記録、タブ名は 通帳 → リザルト。
 *   state キー `roster` と CSS クラス `.roster-*` は変えない。 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = read("../js/App.js");
const sections = read("../js/OtherSections.js");
const accounts = read("../js/accounts-ui.js");
const css = read("../assets/v66-accounts.css");
const workspaceCss = read("../assets/workspace.css");

test("セクション名は 記録 / CHARACTER RECORD", () => {
  assert.match(app, /\{ id: "roster", label: "記録", icon: "roster", title: "CHARACTER RECORD", subtitle: "所持品・リザルト・収支・取り込み"/);
});

test("残高チップは .topbar-actions より手前にあり、直接子として残る", () => {
  const chip = app.indexOf("React.createElement(BalanceChip");
  const actions = app.indexOf('React.createElement("div", { className: "topbar-actions" }');
  assert.ok(chip > 0, "BalanceChip が topbar に載っている");
  assert.ok(actions > 0, "topbar-actions が存在する");
  assert.ok(chip < actions, `BalanceChip は topbar-actions の外側（手前）にある（chip=${chip} actions=${actions}）`);
});

test("残高は LBT_computeLedgerBalance から取り、LP と欠片を出す", () => {
  assert.match(accounts, /const BalanceChip = \(\{ state, onClick \}\) =>/);
  assert.match(accounts, /window\.LBT_computeLedgerBalance/);
  assert.match(accounts, /"LP"\)\)/);
  assert.match(accounts, /"欠片"\)\)/);
  assert.match(accounts, /Object\.assign\(window, \{ AccountSwitcher, AccountChip, AccountSummary, BalanceChip,/);
});

test("残高チップからリザルトタブへ遷移できる", () => {
  assert.match(app, /ui: \{ currentSection: "roster", libraryTab: "ledger" \}/);
});

test("libraryTab は state.ui にあり、SET_UI で切り替わる", () => {
  /* リザルト確認が最頻の用途なので、記録を開いた既定もリザルト。 */
  assert.match(sections, /const libraryTab = state\.ui\?\.libraryTab \|\| "ledger";/);
  assert.match(sections, /const setLibraryTab = \(value\) => dispatch\(\{ type: "SET_UI", ui: \{ libraryTab: value \} \}\);/);
});

test("記録のタブはリザルトを先頭に置く", () => {
  const bar = sections.slice(sections.indexOf('role: "tablist", "aria-label": "記録セクションの種別"'), sections.indexOf("onLibrary && h("));
  assert.ok(bar.indexOf('"ledger"') < bar.indexOf('"personas"'), "リザルトが最初");
  assert.ok(bar.indexOf('"personas"') < bar.indexOf('"egos"'), "人格が次");
  assert.ok(bar.indexOf('"spirits"') < bar.indexOf('"inventory"'), "アイテムは最後");
});

test("リザルト／アイテムタブでもタブヘッダが描画される（ナビ死の回帰）", () => {
  assert.doesNotMatch(sections, /if \(libraryTab === "ledger"\) return h\(LedgerPanel/);
  assert.match(sections, /const onLibrary = !\["ledger", "inventory"\]\.includes\(libraryTab\);/);
  assert.match(sections, /libraryTab === "ledger" && h\(LedgerPanel, \{ state, dispatch \}\)/);
  assert.match(sections, /libraryTab === "inventory" && h\(InventoryPanel, \{ state, dispatch \}\)/);
  assert.match(sections, /onLibrary && h\("div", \{ className: "card-body stack-3" \}/);
});

test("タブ名と見出しは リザルト", () => {
  assert.match(sections, /setLibraryTab\("ledger"\) \}, "リザルト"\)/);
  assert.match(sections, /"RESULT \/ リザルト"/);
  const copy = [...sections.matchAll(/"([^"\n]*通帳[^"\n]*)"/g)].map((m) => m[1]);
  assert.deepEqual(copy, [], `通帳を含む表示コピーが残っている: ${copy.join(" / ")}`);
});

test("CSS: 残高チップは layer 内で、非表示ルールを持たない", () => {
  assert.match(css, /^@layer v66-accounts \{/);
  assert.match(css, /\.topbar-balance \{/);
  assert.match(css, /\.record-tabbar\.is-bodyless \.card-header \{ border-bottom-color: transparent; \}/);
  assert.doesNotMatch(css, /\.topbar-balance[^{]*\{[^}]*display:\s*none/);
});

test("残高サマリが [object Object] にならない（要素を文字列補間しない）", () => {
  /* stat() / bigNum() は h() を返す。テンプレート文字列へ埋めると
     "収入 [object Object] LP / ..." と描画される。 */
  const sources = ["../js/OtherSections.js", "../js/accounts-ui.js", "../js/App.js"];
  for (const path of sources) {
    const src = read(path);
    const bad = [...src.matchAll(/\$\{(stat|bigNum|h)\(/g)];
    assert.deepEqual(bad.map((m) => m[0]), [], `${path} で要素を文字列補間している`);
  }
  assert.match(sections, /h\("span", \{ className: "ledger-balance-sub" \},\s*"収入 ", stat\(balance\.incomeLp\)/);
});

test("通貨名は topbar と同じ 欠片（SHARD 表記を残さない）", () => {
  const labels = [...sections.matchAll(/ledger-(?:chip|pair)-label" \}, "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.includes("欠片"), `欠片 ラベルがある: ${labels.join(",")}`);
  assert.ok(!labels.includes("SHARD"), `ledger ラベルに SHARD が残っている: ${labels.join(",")}`);
  assert.doesNotMatch(sections, /ledger-card-spent" \}, `[^`]*SHARD/);
});

test("同じ残高を topbar と ledger で同じ書式（3桁区切り）で出す", () => {
  assert.match(accounts, /Number\(value \|\| 0\)\.toLocaleString\("ja-JP"\)/);
  assert.match(sections, /n\.toLocaleString\("ja-JP"\)/, "bigNum が 3桁区切り");
  assert.match(sections, /const stat = \(value\) => \{[\s\S]{0,160}toLocaleString\("ja-JP"\)/, "stat も同じ書式");
  assert.match(sections, /ledger-card-spent" \},\s*`支出 LP \$\{spent\.lp\.toLocaleString\("ja-JP"\)\}/);
});

test("記録に所持アイテムの総覧タブがある", () => {
  assert.match(sections, /setLibraryTab\("inventory"\) \}, "アイテム"\)/);
  assert.match(sections, /const InventoryPanel = \(\{ state, dispatch \}\) =>/);
  assert.match(sections, /"ITEM INVENTORY \/ 所持アイテム"/);
});

test("所持アイテムは 初期枠/購入 の由来を必ず見せる", () => {
  assert.match(sections, /entry\.origin === "initial"\s*\?\s*h\("span", \{ className: "badge inv-origin is-initial" \}, "初期枠"\)/);
  assert.match(sections, /h\("span", \{ className: "badge inv-origin" \}, "購入"\)/);
  /* 色だけに頼らない（文字で区別する）。 */
  assert.match(workspaceCss, /\.inv-origin\.is-initial \{ color: var\(--gold\); border-color: var\(--gold-line\); \}/);
});

test("初期枠の定義と取り込みが UI から投げられる", () => {
  assert.match(sections, /type: "SET_INITIAL_ITEMS", ids: next/);
  assert.match(sections, /type: "APPLY_INITIAL_ITEMS"/);
  assert.match(sections, /最初から持っているもの。取り込んでも支出は立ちません/);
});
