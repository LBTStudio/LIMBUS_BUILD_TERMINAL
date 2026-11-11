import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sections = read("../js/OtherSections.js");
const accountCss = read("../assets/v66-accounts.css");
const mobileCss = read("../assets/v69-mobile-ui-audit.css");
const index = read("../index.html");

test("新規リザルトの基本入力は表示ラベルつきのlabelで構成する", () => {
  const start = sections.indexOf('className: "ledger-result-entry-section"');
  const end = sections.indexOf('className: "ledger-result-entry-ticket-section"', start);
  assert.ok(start >= 0 && end > start, "基本情報セクションを分離する");
  const form = sections.slice(start, end);
  for (const label of ["リザルト名", "プレイした日付", "獲得LP", "獲得欠片"]) {
    assert.ok(form.includes('h("span", null, "' + label + '")'), label + " は入力欄の上に表示する");
  }
  assert.equal((form.match(/className: "ledger-result-input-field/g) || []).length, 4, "4項目を同じ入力コンポーネントへ揃える");
  assert.match(form, /className: "ledger-add-row ledger-result-income-row"/, "既存のフォーム識別子を維持する");
});

test("チケットと任意報酬を独立セクションに分け、保存操作を最後に置く", () => {
  assert.match(sections, /className: "ledger-result-entry-ticket-section", "aria-label": "卓の報酬チケット"/);
  assert.match(sections, /className: "ledger-result-reward-disclosure"/);
  assert.match(sections, /className: "ledger-result-entry-footer"/);
  assert.match(sections, /className: "ledger-result-submit"/);
  assert.match(sections, /入力した内容をまとめて記録/);
  assert.match(sections, /報酬を追加（人格 /);
});

test("モバイルの新規リザルト入力は2列以内で、入力・追加操作に44px以上の高さを確保する", () => {
  assert.match(mobileCss, /\.ledger-result-entry-section\.ledger-result-income-row/);
  assert.match(mobileCss, /\.ledger-result-entry-section \.ledger-result-income-row\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(mobileCss, /\.ledger-result-input-field--name \{ grid-column: 1 \/ -1; \}/);
  assert.match(mobileCss, /\.ledger-result-input-field \.ledger-input\s*\{[^}]*min-height: 44px/s);
  assert.match(mobileCss, /\.ledger-result-entry-ticket-section \.ledger-ticket-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(mobileCss, /\.ledger-result-entry-footer \.ledger-result-submit \.btn\s*\{[^}]*min-height: 50px/s);
});

test("既存リザルト編集もスマホでは見出し・収入・チケット入力をタッチ向けに展開する", () => {
  assert.match(mobileCss, /\.ledger-card-wrap\.is-editing \.ledger-card \.card-header\.is-editing\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(mobileCss, /\.ledger-card-wrap\.is-editing \.ledger-card-edit-head-field \.ledger-input\s*\{[^}]*min-height: 44px/s);
  assert.match(mobileCss, /\.ledger-card-wrap\.is-editing \.ledger-card-edit-income\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(mobileCss, /\.ledger-card-wrap\.is-editing \.ledger-card-edit-ticket-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
});

test("スマホのSINNER SELECTは安全領域内に収まり、カード一覧を単独スクロールする", () => {
  assert.match(mobileCss, /main\.acct-gate\s*\{[^}]*env\(safe-area-inset-top\)/s);
  assert.match(mobileCss, /\.acct-gate-panel\s*\{[^}]*max-height: calc\(100dvh/s);
  assert.match(mobileCss, /\.acct-gate-panel\s*\{[^}]*overflow: hidden/s);
  assert.match(mobileCss, /\.acct-gate-panel > \.acct-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(mobileCss, /\.acct-gate-panel > \.acct-grid\s*\{[^}]*overflow-y: auto/s);
  assert.match(mobileCss, /\.acct-gate-panel \.acct-card--gate \.acct-card-body\s*\{[^}]*grid-template-columns: 44px minmax\(0, 1fr\)/s);
  assert.match(accountCss, /\.acct-gate-panel > \.acct-grid\s*\{[^}]*overflow-y: auto/s);
});

test("変更したモバイルスタイルはメインHTMLから読み込まれる", () => {
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
});
