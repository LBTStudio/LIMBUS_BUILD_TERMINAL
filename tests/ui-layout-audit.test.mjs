import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("../assets/v76-interaction-audit.css");
const audit = read("../tools/ui/capture-ui-audit.mjs");
const sections = read("../js/OtherSections.js");

test("sticky build tabs stay above scrollable catalog content", () => {
  assert.match(css, /\.build-tabs\.is-b-workbench\s*\{[^}]*z-index:\s*24\s*;/s);
});

test("1280px support detail audit accepts header clearance while requiring the adjacent column", () => {
  assert.match(audit, /columnCount !== 2/);
  assert.match(audit, /breakpointLayout.detailLeft < breakpointLayout.mainRight - 2/);
  assert.match(audit, /breakpointLayout.detailTop - breakpointLayout.mainTop > 80/);
  assert.doesNotMatch(audit, /Math\.abs\(breakpointLayout\.detailTop - breakpointLayout.mainTop\) > 4/);
});

test("未分類ワークベンチの必須撮影説明は、実際の4状態のキャプションと一致する", () => {
  for (const note of [
    "リザルト一覧の途中から開いた未分類オブジェクトパネル",
    "割り当て済み明細から開いた全リザルト対象の移動先検索",
    "リザルトから解除した明細が未分類ドロワーへ戻った状態",
    "未分類ドロワーの検索から元のリザルトへ再割り当てした状態"
  ]) {
    assert.ok(audit.includes(note), "required capture caption is present: " + note);
  }
});

test("リザルトページャーのアクセシブル名は表示ラベルと一致する", () => {
  assert.match(sections, /"aria-label": "前へ"[\\s\\S]{0,220}\\}, "前へ"\\)/);
  assert.match(sections, /"aria-label": "次へ"[\\s\\S]{0,220}\\}, "次へ"\\)/);
  assert.doesNotMatch(sections, /"aria-label": "前のページ"|"aria-label": "次のページ"/);
});
