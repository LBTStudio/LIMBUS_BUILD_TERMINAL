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



test("操作導線: 未装備でも創作人格とテキスト流し込みを開け、編集開始は明示される", () => {
  const persona = read("../js/PersonaCodex.js");
  const other = read("../js/OtherSections.js");
  const actionStart = persona.indexOf('className: "pw-list-actions"');
  const listStart = persona.indexOf('className: "pw-listbar"');
  assert.ok(actionStart >= 0 && actionStart < listStart, "常時表示の操作帯が折りたたみ可能な一覧ヘッダーより前にある");
  const actions = persona.slice(actionStart, listStart);
  assert.match(actions, /persona-custom-trigger/);
  assert.match(actions, /persona-draft-import-trigger/);
  assert.match(actions, /role: "group", "aria-label": "人格作成・流し込み"/);
  assert.match(persona, /className: "persona-manual-edit-trigger"/);
  assert.match(persona, /"aria-pressed": isSynced/);
  assert.match(css, /\.pw-list-actions \{/);
  assert.match(css, /\.pc-persona \.persona-manual-edit-trigger:not\(\.btn--primary\)/);
  assert.match(other, /同期ランクの変更は追加費用なし/);
});

test("選択中のタブとフィルタは色だけに頼らず強い境界を持つ", () => {
  assert.match(css, /\.segmented > button\[aria-selected="true"\]/);
  assert.match(css, /\.segmented > button\[aria-checked="true"\]/);
  assert.match(css, /border-color: var\(--gold\);/);
});


test("E.G.O解析は開始前に費用を表示し、確定時の残高不足も黙って処理しない", () => {
  const other = read("../js/OtherSections.js");
  assert.match(other, /const getEgoAnalysisInfo = \(rank, slot\) =>/);
  assert.match(other, /初回解析の確定時に自我の欠片/);
  assert.match(other, /残高不足の場合、編集内容は保存されますが解析済み扱い・費用記録は付きません/);
  assert.match(other, /if \(info\.cost && info\.balance && Number\(info\.balance\.shards\) < Number\(info\.cost\.shards\)\)/);
  assert.match(other, /analysisInfo\.alreadyAnalyzed/);
  assert.match(css, /\.ego-analysis-cost-note\.is-short/);
});
