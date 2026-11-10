import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const preview = read("../js/LivePreview.js");
const generator = read("../js/generator.js");
const css = read("../assets/workspace.css");
const basicCss = read("../assets/b-type-ui-parity.css");
const basic = read("../js/OtherSections.js");
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
  assert.match(preview, /renderPreviewImage\(tokenImage, "pv-ccfolia-roster-avatar"/);
  assert.match(preview, /className: "pv-ccfolia-roster-statuses"/);
  assert.match(preview, /tokenStatus\.slice\(0, 8\)\.map\(renderRosterStatus\)/);
  assert.match(preview, /tokenData\.initiative \?\? 0/);
  assert.match(preview, /背景・配置・拡大率は、実際のルーム設定によって変わります/);
  assert.match(preview, /出力データから組み立てた表示例です。ルームの背景・座標・倍率は反映しません。/);
  assert.doesNotMatch(preview, /基本タブの画像・名前・行動順と、現在のステータス/);
  assert.match(preview, /pv-ccfolia-empty-media/);
  assert.match(preview, /onError: markFailed/);
  assert.match(preview, /if \(src === tokenImage\) setTokenImageFailed\(true\)/);
  assert.doesNotMatch(preview.slice(preview.indexOf("const renderTokenPreview"), preview.indexOf("const readiness =")),
    /pv-token-identity|pv-token-sheet-init|pv-ccfolia-roster-init|pv-ccfolia-roster-player/);
});

test("編集画面は名前・イニシアティブ・メモ・参照URLと、ST/パラメータ/パレットを表示する", () => {
  const render = preview.slice(preview.indexOf("const renderTokenPreview"), preview.indexOf("const readiness ="));
  for (const fragment of [
    "pv-ccfolia-editor", "pv-ccfolia-editor-main-image", "pv-ccfolia-face-strip",
    "キャラクター名", "プレイヤー", "イニシアティブ", "tokenData.memo", "tokenData.externalUrl",
    "サイズ", "座標 X / Y", "tokenStatus.map(renderEditorStatus)",
    "tokenParams.map(renderEditorParam)", "tokenData.commands",
    "チャットパレット（commands）"
  ]) assert.ok(render.includes(fragment), fragment);
  assert.match(render, /ルーム側の既定値（JSONで未指定）/);
  assert.match(render, /ルーム側の位置を使用（JSONで未指定）/);
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

test("基本タブの立ち絵枠と簡易カードは画像の実寸比を使い、全体を表示する", () => {
  assert.match(basic, /const \[portraitAspect, setPortraitAspect\] = React\.useState\(3 \/ 4\)/);
  assert.match(basic, /naturalWidth \/ image\.naturalHeight/);
  assert.match(basic, /--piece-portrait-ratio/);
  assert.match(basic, /className: "piece-token-avatar-image"/);
  assert.match(basicCss, /width:min\(100%,calc\(450px \* var\(--piece-portrait-ratio,\.75\)\)\)/);
  assert.match(basicCss, /aspect-ratio:var\(--piece-portrait-ratio,\.75\)/);
  assert.match(basicCss, /\.piece-token-avatar-image\{[^}]*max-width:100%;max-height:100%;object-fit:contain/);
  assert.doesNotMatch(basicCss, /\.piece-token-avatar\{[^}]*overflow:hidden/);
});

test("CCFOLIA盤面プレビューは48pxグリッド上の長辺4マス縮尺で立ち絵全体を表示する", () => {
  const marker = css.indexOf("/* ============================================================\n   CCFOLIA PREVIEW");
  assert.ok(marker >= 0, "preview styles have a stable section marker");
  const previewStyles = css.slice(marker);
  const mapToken = previewStyles.slice(previewStyles.indexOf(".pv-ccfolia-map-token"), previewStyles.indexOf(".pv-ccfolia-map-name"));
  assert.match(mapToken, /--pv-ccfolia-grid-cell:\s*48px/);
  assert.match(mapToken, /--pv-ccfolia-token-cells:\s*4/);
  assert.match(mapToken, /width:\s*calc\(var\(--pv-ccfolia-grid-cell\) \* var\(--pv-ccfolia-token-cells\)\)/);
  assert.match(mapToken, /max-width:\s*100%/);
  assert.match(mapToken, /max-height:\s*100%/);
  assert.match(mapToken, /object-fit:\s*contain/);
  assert.doesNotMatch(mapToken, /max-width:\s*48px|max-height:\s*48px|object-fit:\s*cover/);
  const editor = previewStyles.slice(previewStyles.indexOf(".pv-ccfolia-editor-main-image"), previewStyles.indexOf(".pv-ccfolia-face-strip"));
  assert.match(editor, /calc\(420px \* var\(--pv-preview-ratio, \.75\)\)/);
  assert.match(editor, /max-height:\s*100%/);
});

test("CCFOLIAプレビューの画像は読み込み後の自然な縦横比を親枠へ伝える", () => {
  assert.match(preview, /naturalWidth > 0 && image\.naturalHeight > 0/);
  assert.match(preview, /--pv-preview-ratio/);
  assert.match(preview, /縦横比を維持しています/);
});
