import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");

function loadFilter() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_filterPreviewCopyOutput;
}

test("現在のタブのコピーはJSON出力から除外したカテゴリをMEMOから外す", () => {
  const filter = loadFilter();
  const memo = [
    "【PC】検証",
    "",
    "■ 特殊強化",
    "肉体強化X-1",
    "",
    "■ 所持品",
    "回復薬 ×1"
  ].join("\n");
  const copied = filter(memo, { "特殊強化": true });
  assert.match(copied, /【PC】検証/);
  assert.match(copied, /■ 所持品/);
  assert.match(copied, /回復薬 ×1/);
  assert.doesNotMatch(copied, /特殊強化|肉体強化X-1/);
});

test("現在のタブのコピーはPALETTEの見出し表記と改行を保ち、除外したカテゴリだけを外す", () => {
  const filter = loadFilter();
  const palette = [
    "### ■ 判定・速度",
    "1d100",
    "### ■ 追加コマンド",
    "チャット入力",
    "### ■ E.G.O",
    "E.G.O使用"
  ].join("\n");
  const copied = filter(palette, { "追加コマンド": true });
  assert.equal(copied, [
    "### ■ 判定・速度",
    "1d100",
    "### ■ E.G.O",
    "E.G.O使用"
  ].join("\n"));
});

test("除外したカテゴリが先頭にあっても、後続カテゴリを先頭から返す", () => {
  const filter = loadFilter();
  const palette = ["### ■ 人格情報", "人格：検証", "### ■ 判定・速度", "1d100"].join("\n");
  const copied = filter(palette, { "人格情報": true });
  assert.equal(copied, ["### ■ 判定・速度", "1d100"].join("\n"));
});

test("連続して除外したカテゴリの間の空行を残さない", () => {
  const filter = loadFilter();
  const palette = [
    "### ■ 人格情報",
    "人格：検証",
    "",
    "### ■ 判定・速度",
    "1d100",
    "",
    "### ■ 精神：XX",
    "精神【XX】",
    "",
    "### ■ E.G.O",
    "E.G.O使用"
  ].join("\n");
  const copied = filter(palette, { "人格情報": true, "判定・速度": true, "精神：XX": true });
  assert.equal(copied, ["### ■ E.G.O", "E.G.O使用"].join("\n"));
});

test("現在のタブのコピーはMEMO・PALETTEの両方へ除外フィルタを適用する", () => {
  assert.match(source, /filterPreviewCopyOutput\(memo, outputExclude\.memo\)/);
  assert.match(source, /filterPreviewCopyOutput\(palette, outputExclude\.palette\)/);
});

test("JSONタブのコピーはCCFOLIA JSON生成器をそのまま使う", () => {
  assert.match(source, /JSON\.stringify\(LBT_gen\.buildCcfoliaJSON\(state\)\)/);
});

test("出力除外はJSON生成器側でも引き続き反映される", () => {
  assert.match(generatorSource, /const excl = p\.outputExclude \|\| \{\}/, "JSON生成器が出力除外を読む");
  assert.match(generatorSource, /filterOutputSections\(opts\?\.palette \?\? buildPalette\(state\), excl\.palette\)/);
  assert.match(generatorSource, /filterOutputSections\(opts\?\.memo \?\? buildMemo\(state\), excl\.memo\)/);
});

test("表示側の除外（チェックのOFF）はプレビューの見た目だけを変える", () => {
  assert.match(source, /included: !\(outputExclude\[prefix\] \|\| \{\}\)\[s\.title\]/, "セクション表示が除外を読む");
});
