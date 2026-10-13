import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");

function loadSplit() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

test("現在のタブのコピーは出力除外の影響を受けない（卓中のコピペは全文）", () => {
  /* 除外のチェックは「JSON出力への反映」と「プレビューの見た目」だけが受け持つ。
     コピーはいま必要な全文をそのまま持ち出す操作なので、
     項目の出し入れを挟むと、意図しない内容を貼り付けてしまう。 */
  assert.doesNotMatch(source, /filterPreviewCopyOutput\(memo, outputExclude\.memo\)/, "MEMOのコピーは全文を渡す");
  assert.doesNotMatch(source, /filterPreviewCopyOutput\(palette, outputExclude\.palette\)/, "PALETTEのコピーは全文を渡す");
  assert.match(source, /const t = tab === "memo"\s*\r?\n\s*\? memo/, "コピーは生成済みの全文をそのまま使う");
});

test("JSONタブのコピーはCCFOLIA JSON生成器をそのまま使う", () => {
  assert.match(source, /JSON\.stringify\(LBT_gen\.buildCcfoliaJSON\(state\)\)/);
});

test("出力除外はJSON生成器側の責務として残る", () => {
  /* コピーを全文にしたことで除外そのものが消えていないこと。
     CCFOLIA JSON の組み立てで outputExclude を読んでいることを固定する。 */
  assert.match(generatorSource, /const excl = p\.outputExclude \|\| \{\}/, "JSON生成器が出力除外を読む");
});

test("除外フィルタ関数自体は他で使わないまま残す（互換のための保持）", () => {
  const w = loadSplit();
  assert.equal(typeof w.LBT_filterPreviewCopyOutput, "function", "関数は公開されたまま");
});

test("表示側の除外（チェックのOFF）はプレビューの見た目だけを変える", () => {
  assert.match(source, /included: !\(outputExclude\[prefix\] \|\| \{\}\)\[s\.title\]/, "セクション表示が除外を読む");
});