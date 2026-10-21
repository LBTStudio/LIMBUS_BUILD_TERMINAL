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
