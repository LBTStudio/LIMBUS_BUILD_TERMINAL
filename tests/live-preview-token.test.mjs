import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const preview = read("../js/LivePreview.js");
const generator = read("../js/generator.js");
const css = read("../assets/workspace.css");
const app = read("../js/App.js");

test("CCFOLIAプレビューは実際のJSON出力を唯一のデータ源として使う", () => {
  assert.match(preview, /JSON\.parse\(json\)\?\.data/);
  assert.match(preview, /LBT_gen\.buildCcfoliaJSON\(previewData, \{ palette, memo \}\)/);
  assert.match(generator, /kind: "character"/);
  assert.match(generator, /name: charName,[\s\S]*?playerName: plName,[\s\S]*?color,[\s\S]*?initiative,[\s\S]*?status,[\s\S]*?params,[\s\S]*?commands,[\s\S]*?memo,/);
  assert.match(generator, /iconUrl: imgs\[0\]/);
  assert.match(preview, /tokenData\.externalUrl/);
  assert.match(preview, /tokenData\.commands/);
});

test("盤面と編集画面を切り替え、既存のMEMO・PALETTE・JSON出力を維持する", () => {
  assert.match(preview, /setTab\("memo"\)/);
  assert.match(preview, /setTab\("palette"\)/);
  assert.match(preview, /setTab\("json"\)/);
  assert.match(preview, /setTab\("token"\)/);
  assert.match(preview, /setTokenMode\("board"\)/);
  assert.match(preview, /setTokenMode\("sheet"\)/);
  assert.match(preview, /tab === "token" && renderTokenPreview\(\)/);
  assert.match(preview, /}, "盤面"\)/);
  assert.match(preview, /}, "編集画面"\)/);
  assert.doesNotMatch(preview, /}, "見た目"\)/);
  assert.doesNotMatch(preview, /}, "項目一覧"\)/);
});

test("盤面はマップ上の駒と、分離したキャラクター一覧として描画する", () => {
  assert.match(preview, /className: "pv-ccfolia-map"/);
  assert.match(preview, /className: "pv-ccfolia-map-token"/);
  assert.match(preview, /className: "pv-ccfolia-roster"/);
  assert.match(preview, /className: "pv-ccfolia-roster-avatar"/);
  assert.match(preview, /className: "pv-ccfolia-roster-statuses"/);
  assert.match(preview, /tokenStatus\.slice\(0, 8\)\.map\(renderRosterStatus\)/);
  assert.match(preview, /tokenData\.initiative \?\? 0/);
  assert.match(preview, /背景・配置・拡大率は、実際のルーム設定によって変わります/);
  assert.match(preview, /pv-ccfolia-empty-media/);
  assert.match(preview, /onError: \(\) => setTokenImageFailed\(true\)/);
  assert.doesNotMatch(preview.slice(preview.indexOf("const renderTokenPreview"), preview.indexOf("const readiness =")),
    /pv-token-identity|pv-token-sheet-init/);
});

test("編集画面は名前・イニシアティブ・メモ・参照URLと、ST/パラメータ/パレットを表示する", () => {
  const render = preview.slice(preview.indexOf("const renderTokenPreview"), preview.indexOf("const readiness ="));
  for (const fragment of [
    "pv-ccfolia-editor", "pv-ccfolia-editor-main-image", "pv-ccfolia-face-strip",
    "キャラクター名", "イニシアティブ", "tokenData.memo", "tokenData.externalUrl",
    "サイズ", "座標 X / Y", "tokenStatus.map(renderEditorStatus)",
    "tokenParams.map(renderEditorParam)", "tokenData.commands",
    "チャットパレット（commands）"
  ]) assert.ok(render.includes(fragment), fragment);
  assert.match(render, /ルーム側の既定値（JSONで未指定）/);
  assert.match(render, /ルーム側の位置を使用（JSONで未指定）/);
  assert.match(render, /data:|item/); // Rendering stays data-oriented, not a second export path.
});

test("CCFOLIAらしい無彩色UIとレスポンシブ構成を持つ", () => {
  for (const selector of [
    ".pv-ccfolia-preview", ".pv-ccfolia-map", ".pv-ccfolia-roster",
    ".pv-ccfolia-edit-status-row", ".pv-ccfolia-edit-param-row",
    ".pv-ccfolia-editor-main-image", ".pv-ccfolia-commands-text"
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /background: #25292e/);
  assert.match(css, /@container \(max-width: 560px\)[\s\S]*?\.pv-ccfolia-board-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.pv-ccfolia-editor-top \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(app, /id: "lbt-preview-edge-toggle"/);
});

test("プレビューのJSONコピーは重複せず、切替ボタンは明示的な押下状態を持つ", () => {
  assert.match(preview, /\(tab === "memo" \|\| tab === "palette"\) &&/);
  assert.match(preview, /onClick: copyJson/);
  assert.match(preview, /role: "group", "aria-label": "CCFOLIAプレビュー表示"/);
  assert.match(preview, /"aria-pressed": tokenMode === "board"/);
  assert.match(preview, /"aria-pressed": tokenMode === "sheet"/);
});

test("駒の画像は正方形に切り抜かず、縦横比を維持して枠内へ収める", () => {
  const marker = css.indexOf("/* ============================================================\n   CCFOLIA PREVIEW");
  assert.ok(marker >= 0, "preview styles have a stable section marker");
  const previewStyles = css.slice(marker);
  assert.match(previewStyles, /max-width: 94px/);
  assert.match(previewStyles, /max-height: 94px/);
  assert.match(previewStyles, /width: auto/);
  assert.match(previewStyles, /height: auto/);
  assert.match(previewStyles, /object-fit: contain/);
  assert.doesNotMatch(previewStyles, /object-fit: cover/);
});
