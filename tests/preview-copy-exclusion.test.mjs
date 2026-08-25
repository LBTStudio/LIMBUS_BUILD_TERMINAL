import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");

function loadCopyFilter() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_filterPreviewCopyOutput;
}

test("現在のタブをコピーする内容から、MEMOでJSON除外したカテゴリだけを外す", () => {
  const filter = loadCopyFilter();
  const memo = [
    "■ 基本情報",
    "名前：検証PC",
    "ーーーーーー",
    "■ 特殊強化",
    "肉体強化X-1",
    "ーーーーーー",
    "■ 所持品",
    "回復薬 ×1"
  ].join("\n");

  const copied = filter(memo, { "特殊強化": true });
  assert.match(copied, /■ 基本情報/);
  assert.match(copied, /名前：検証PC/);
  assert.match(copied, /■ 所持品/);
  assert.match(copied, /回復薬 ×1/);
  assert.doesNotMatch(copied, /特殊強化|肉体強化X-1/);
});

test("現在のタブをコピーする内容はPALETTEの見出し形式を保ち、除外していないカテゴリを残す", () => {
  const filter = loadCopyFilter();
  const palette = [
    "### ■ 基本式",
    "1d100",
    "### ■ 追加コマンド",
    "チャット入力",
    "### ■ E.G.O",
    "E.G.O使用"
  ].join("\n");

  const copied = filter(palette, { "追加コマンド": true });
  assert.match(copied, /### ■ 基本式/);
  assert.match(copied, /1d100/);
  assert.match(copied, /### ■ E\.G\.O/);
  assert.match(copied, /E\.G\.O使用/);
  assert.doesNotMatch(copied, /追加コマンド|チャット入力/);
});

test("JSONタブのコピーはCCFOLIA JSON生成器をそのまま使い、MEMO・PALETTEだけへ除外フィルターを適用する", () => {
  assert.match(source, /filterPreviewCopyOutput\(memo, outputExclude\.memo\)/);
  assert.match(source, /filterPreviewCopyOutput\(palette, outputExclude\.palette\)/);
  assert.match(source, /JSON\.stringify\(LBT_gen\.buildCcfoliaJSON\(state\)\)/);
});
