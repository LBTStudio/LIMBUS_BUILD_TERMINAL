import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../assets/v68-interaction-a11y.css");
const index = read("../index.html");

function luminance(hex) {
  const value = hex.replace("#", "");
  const channel = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channel.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("インタラクション修正CSSは既存スタイルの後に読み込まれる", () => {
  assert.match(index, /v67-persona-redesign/);
  assert.match(index, /assets\/v68-interaction-a11y\.css\?v=[0-9a-f]{8}/);
  assert.match(index, /v67-persona-redesign,\s*v68-interaction-a11y/);
});

test("後段UIが参照する色・寸法トークンを定義している", () => {
  for (const token of [
    "--text-strong", "--tx-main", "--tx-sub", "--text-muted", "--line-mid",
    "--accent-dim", "--focus", "--fs-1", "--f-disp", "--r-1", "--r-2",
    "--r-3", "--r-md"
  ]) {
    assert.match(css, new RegExp(token.replace(/-/g, "\\-") + "\\s*:"));
  }
});

test("ALEPHランクの文字色はカード面で4.5:1以上", () => {
  assert.match(css, /\.badge\[data-rank="ALEPH"\][\s\S]*?color:\s*#f07a70;/);
  assert.ok(contrast("#f07a70", "#292420") >= 4.5);
});

test("展開・折り畳み操作は案内文字と開いた状態を示す", () => {
  assert.match(css, /details\.pw-subsec\s*>\s*summary::after\s*\{[^}]*font-size:\s*var\(--fs-12\)/s);
  assert.match(css, /details\.pw-subsec\[open\]\s*>\s*summary\s*\{/);
  assert.match(css, /\.pc-edit\[open\]\s*>\s*\.pc-edit-summary/);
});

test("主要操作に最低タップ領域と明示的フォーカス表示を持たせる", () => {
  assert.match(css, /\.ledger-row-release,[\s\S]*?min-inline-size:\s*36px/);
  assert.match(css, /\.ledger-card-edit-btn\s*\{[^}]*min-block-size:\s*36px/);
  assert.match(css, /\.ledger-import-menu\s*\.btn\s*\{\s*min-block-size:\s*40px;/);
  assert.match(css, /\.ledger-card-edit-btn:focus-visible,[\s\S]*?outline:\s*2px solid var\(--gold-hi\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});

test("固有効果テキストは2行で切らずに全文と改行を表示する", () => {
  const rule = css.match(/\.ubc-desc\s*\{([^}]*)\}/);
  assert.ok(rule, ".ubc-desc の上書きルールが存在する");
  assert.match(rule[1], /display:\s*block/);
  assert.match(rule[1], /overflow:\s*visible/);
  assert.match(rule[1], /max-block-size:\s*none/);
  assert.match(rule[1], /-webkit-line-clamp:\s*unset/);
  assert.match(rule[1], /line-clamp:\s*none/);
  assert.match(rule[1], /white-space:\s*pre-wrap/);
  assert.match(rule[1], /overflow-wrap:\s*anywhere/);
});


test("スマートフォンのプレビュー操作は見出しの上に重ならず、狭幅時の代替経路も案内する", () => {
  const refinement = css.slice(css.indexOf("/* UI audit refinements: mobile overlay, tabs, navigation and account cards. */"));
  assert.match(refinement, /#lbt-preview-edge-toggle\\s*\\{[^}]*top:\\s*6px;[^}]*right:\\s*116px;/s);
  assert.match(refinement, /@media \\(max-width: 360px\\)\\s*\\{[^}]*#lbt-preview-edge-toggle \\{ display: none; \\}/s);
  assert.match(refinement, /\\.section-title-row \\{ padding-right: 0; \\}/);
  assert.match(appSource, /幅が狭い端末では「操作・保存」内の「プレビューを開く／閉じる」を使います。/);
});

test("スマートフォンの8つのビルドタブは4列2行で同時に見え、メインナビは4+3配置", () => {
  const refinement = css.slice(css.indexOf("/* UI audit refinements: mobile overlay, tabs, navigation and account cards. */"));
  assert.match(refinement, /\\.build-tabs \\.segmented \\{[^}]*display: grid;[^}]*grid-template-columns: repeat\\(4, minmax\\(0, 1fr\\)\\);[^}]*overflow: visible;/s);
  assert.match(refinement, /\\.rail \\{\\s*grid-template-columns: repeat\\(4, minmax\\(0, 1fr\\)\\);\\s*grid-template-rows: repeat\\(2, 52px\\);/s);
});

test("スマートフォンのアカウント編集操作は更新日時と重ならず、ガイド分類は一度に参照できる", () => {
  const refinement = css.slice(css.indexOf("/* UI audit refinements: mobile overlay, tabs, navigation and account cards. */"));
  assert.match(refinement, /\\.acct-card-actions \\{[^}]*position: relative;[^}]*margin-top: auto;[^}]*justify-content: center;/s);
  assert.match(refinement, /\\.guide-filter-row \\{[^}]*grid-template-columns: repeat\\(5, minmax\\(0, 1fr\\)\\);[^}]*overflow: visible;/s);
});
