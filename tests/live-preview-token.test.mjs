import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const preview = read("../js/LivePreview.js");
const generator = read("../js/generator.js");
const css = read("../assets/workspace.css");
const app = read("../js/App.js");

test("CCFOLIA駒プレビューは既存のJSON出力データを読み、別の出力経路を作らない", () => {
  assert.match(preview, /JSON\.parse\(json\)\?\.data/);
  assert.match(preview, /LBT_gen\.buildCcfoliaJSON\(previewData, \{ palette, memo \}\)/);
  assert.match(generator, /kind: "character"/);
  assert.match(generator, /name: charName,[\s\S]*?playerName: plName,[\s\S]*?color,[\s\S]*?initiative,[\s\S]*?status,[\s\S]*?params,/);
  assert.match(generator, /iconUrl: imgs\[0\]/);
});

test("プレビューは盤面・シート表示を切り替え、出力JSONタブと共存する", () => {
  assert.match(preview, /setTab\("memo"\)/);
  assert.match(preview, /setTab\("palette"\)/);
  assert.match(preview, /setTab\("json"\)/);
  assert.match(preview, /setTab\("token"\)/);
  assert.match(preview, /setTokenMode\("board"\)/);
  assert.match(preview, /setTokenMode\("sheet"\)/);
  assert.match(preview, /tab === "token" && renderTokenPreview\(\)/);
  assert.match(preview, /tokenStatus\.slice\(0, 8\)\.map\(renderTokenStatus\)/);
  assert.match(preview, /tokenParams\.slice\(0, 8\)/);
  assert.match(preview, /state\.ui\.previewTab \|\| "memo"/);
});

test("盤面表示は名前・色・行動順・HP/SANを表示し、画像がない場合にも破綻しない", () => {
  assert.match(preview, /className: "pv-token-board"/);
  assert.match(preview, /className: "pv-token-board-status-grid"/);
  assert.doesNotMatch(preview, /h\("span", \{ className: "pv-token-initiative"/);
  assert.match(preview, /renderTokenImage\("pv-token-board-avatar"/);
  assert.match(preview, /className: "pv-token-identity"[\s\S]*?h\("span", null, "行動順"\)[\s\S]*?String\(tokenData\.initiative \?\? 0\)/);
  assert.doesNotMatch(preview, /className: "pv-token-initiative"/);
  assert.match(preview, /tokenStatus\.filter\(\(entry\) => \["HP", "SAN"\]/);
  assert.match(preview, /pv-token-image-empty/);
  assert.match(preview, /onError: \(\) => setTokenImageFailed\(true\)/);
  assert.match(preview, /"--pv-token-color": tokenColor/);
});

test("駒プレビューはモバイル向けレイアウトと可視のフォーカス状態を持つ", () => {
  for (const selector of [
    ".pv-token-preview", ".pv-token-board", ".pv-token-sheet-layout",
    ".pv-token-status-grid", ".pv-token-param-grid", ".pv-token-mode-switch button:focus-visible"
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.pv-token-sheet-layout \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.pv-token-board-details \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(app, /id: "lbt-preview-edge-toggle"/);
});

test("プレビューのコピー操作を重複させず、表示切替は実際の操作グループとして扱う", () => {
  assert.match(preview, /\(tab === "memo" \|\| tab === "palette"\) &&/);
  assert.match(preview, /onClick: copyJson/);
  assert.match(preview, /role: "group", "aria-label": "駒プレビューの表示"/);
  assert.match(preview, /"aria-pressed": tokenMode === "board"/);
  assert.match(preview, /"aria-pressed": tokenMode === "sheet"/);
  assert.match(preview, /}, "見た目"\)/);
  assert.match(preview, /}, "項目一覧"\)/);
  assert.doesNotMatch(preview, /"盤面"\)/);
  assert.doesNotMatch(preview, /"シート"\)/);
});

test("駒の画像を正方形に切り抜かず、縦横比を維持して枠内に収める", () => {
  const boardImageStyles = css.slice(css.indexOf(".pv-token-board-avatar img,"), css.indexOf(".pv-token-board-avatar .pv-token-image-empty"));
  assert.match(boardImageStyles, /max-width: 100%/);
  assert.match(boardImageStyles, /max-height: 220px/);
  assert.match(boardImageStyles, /width: auto/);
  assert.match(boardImageStyles, /height: auto/);
  assert.match(boardImageStyles, /object-fit: contain/);
  assert.doesNotMatch(boardImageStyles, /object-fit: cover/);
  assert.match(css, /\.pv-token-board-avatar img \{[\s\S]*?max-height: 128px/);
});
