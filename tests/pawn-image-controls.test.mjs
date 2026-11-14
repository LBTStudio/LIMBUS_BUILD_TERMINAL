import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const other = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/pawn-image-controls.css", import.meta.url), "utf8");
const audit = readFileSync(new URL("../tools/ui/capture-ui-audit.mjs", import.meta.url), "utf8");

test("駒画像はホイール拡大後にポインタードラッグで位置を移動できる", () => {
  assert.match(other, /const handleImagePointerDown =/);
  assert.match(other, /const handleImagePointerMove =/);
  assert.match(other, /setPointerCapture\(event\.pointerId\)/);
  assert.match(other, /onPointerDown: handleImagePointerDown/);
  assert.match(other, /onPointerMove: handleImagePointerMove/);
  assert.match(other, /translate3d\(" \+ imagePan\.x/);
  assert.match(other, /data-zoomed/);
  assert.match(other, /draggable: false/);
});

test("駒画像プレビューを隠して作業領域を確保し、元へ戻せる", () => {
  assert.match(other, /imagePreviewOpen, setImagePreviewOpen/);
  assert.match(other, /piece-art-preview-toggle/);
  assert.match(other, /aria-expanded": imagePreviewOpen/);
  assert.match(other, /imagePreviewOpen && React\.createElement\("div", \{ id: "piece-art-preview-live"/);
  assert.match(audit, /basic-image-preview-collapsed-by-user/);
});

test("画像の全身表示は維持しつつ、プレビュー枠と差分サムネイルを縮小する", () => {
  assert.match(other, /objectFit: "contain"/);
  assert.match(css, /height: clamp\(180px, 27vh, 290px\) !important/);
  assert.match(css, /height: clamp\(145px, 22vh, 195px\) !important/);
  assert.match(css, /min-height: 72px !important/);
});

test("ブラウザー監査は拡大・ドラッグ移動・全体表示リセットを検証する", () => {
  assert.match(audit, /basic-image-preview-dragged/);
  assert.match(audit, /transformAfterDrag/);
  assert.match(audit, /立ち絵を拡大し、ドラッグで表示位置を調整した状態/);
});
