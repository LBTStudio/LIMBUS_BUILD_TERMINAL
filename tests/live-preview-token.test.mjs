import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const preview = read("../js/LivePreview.js");
const generator = read("../js/generator.js");
const sections = read("../js/OtherSections.js");
const css = read("../assets/workspace.css");
const parityCss = read("../assets/b-type-ui-parity.css");
const app = read("../js/App.js");

test("駒画像URLは文字列・配列・旧式オブジェクトを共通形式へ正規化する", () => {
  const helper = generator.match(/function normalizeImageUrls\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, "shared image URL normalizer exists");
  const normalize = vm.runInNewContext("(" + helper.replace(/^function normalizeImageUrls\(value\)/, "function (value)") + ")");
  assert.deepEqual(Array.from(normalize(" https://img.example/main.png \r\nhttps://img.example/face.png ")), [
    "https://img.example/main.png", "https://img.example/face.png"
  ]);
  assert.deepEqual(Array.from(normalize("![face](<https://img.example/face.png?x=1&amp;y=2>)")), [
    "https://img.example/face.png?x=1&y=2"
  ]);
  assert.deepEqual(Array.from(normalize("<https://img.example/angle.png>")), [
    "https://img.example/angle.png"
  ]);
  assert.deepEqual(Array.from(normalize([
    "https://img.example/main.png",
    { iconUrl: "https://img.example/face-a.png" },
    { url: "https://img.example/face-b.png" },
    { src: "https://img.example/face-c.png" }
  ])), [
    "https://img.example/main.png", "https://img.example/face-a.png",
    "https://img.example/face-b.png", "https://img.example/face-c.png"
  ]);
  assert.deepEqual(Array.from(normalize(JSON.stringify({
    data: {
      iconUrl: "https://img.example/ccfolia-main.png",
      faces: [
        { iconUrl: "https://img.example/ccfolia-face-1.png" },
        { icon_url: "https://img.example/ccfolia-face-2.png" }
      ]
    }
  }))), [
    "https://img.example/ccfolia-main.png",
    "https://img.example/ccfolia-face-1.png",
    "https://img.example/ccfolia-face-2.png"
  ]);
  assert.deepEqual(Array.from(normalize({
    data: { image_url: "https://img.example/nested.png" },
    imageUrls: ["https://img.example/extra.png"]
  })), [
    "https://img.example/nested.png", "https://img.example/extra.png"
  ]);
  assert.ok(sections.includes("window.LBT_gen.normalizeImageUrls(state.imgUrls)"));
  assert.ok(sections.includes("value: imgUrlsText"));
  assert.ok(sections.includes("const markdownImage = raw.match(/^!?\\[[^\\]]*\\]\\((.+)\\)$/);"));
  assert.ok(sections.includes('raw = raw.replace(/&amp;/gi, "&")'));
  assert.ok(generator.includes("const imgs = normalizeImageUrls(p.imgUrls)"));
  assert.ok(sections.includes('loading: "eager"'));
  assert.ok(sections.includes('fetchPriority: index === selectedImageIndex ? "high" : "auto"'));
});

test("駒画像設定は選択した基本画像・差分を大きく表示し、差分ボタンで切り替える", () => {
  assert.match(sections, /const \[activeImageIndex, setActiveImageIndex\] = React\.useState\(0\)/);
  assert.match(sections, /setActiveImageIndex\(0\)/);
  assert.match(sections, /className: "piece-url-preview-featured"/);
  const visibleArtPanelIndex = sections.indexOf('className: "piece-panel piece-art-panel piece-image-settings"');
  const livePreviewIndex = sections.indexOf('className: "piece-url-preview"');
  const editorDisclosureIndex = sections.indexOf('className: "piece-image-details pc-edit"');
  assert.ok(visibleArtPanelIndex >= 0 && livePreviewIndex > visibleArtPanelIndex && livePreviewIndex < editorDisclosureIndex,
    "駒の画像と差分選択はURL編集の折りたたみを閉じていても画像設定カード内に表示する");
  assert.match(parityCss, /\.base-info-panel \.piece-art-preview-live\s*\{[^}]*margin-top: 12px/);
  assert.match(sections, /src: selectedImagePreviewUrl/);
  assert.ok(sections.includes('loading: "eager"') && sections.includes('fetchPriority: "high"'));
  assert.match(sections, /className: "piece-url-preview-list",[\s\S]*?role: "group"/);
  assert.match(sections, /className: "piece-url-preview-item"[\s\S]*?"aria-pressed": selectedImageIndex === index/);
  assert.match(sections, /onClick: \(\) => setActiveImageIndex\(index\)/);
  assert.match(sections, /imgList\.map\(\(src, index\) => \{/,
    "差分選択列は5枚目以降も含む全登録画像を表示する");
  assert.doesNotMatch(sections, /imgList\.slice\(0, 4\)/,
    "画像差分を4枚で打ち切らない");
  assert.match(sections, /setFailedImageUrls\(\(current\) => current\.includes\(selectedImageUrl\)/);
  assert.match(parityCss, /\.piece-url-preview-featured-frame > img\s*\{[^}]*object-fit: contain/);
  assert.match(parityCss, /\.piece-url-preview-item\.is-active\s*\{/);
  assert.match(parityCss, /\.piece-url-preview-frame > img\s*\{[^}]*object-fit: contain/);
});

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

test("CCFOLIA編集画面の立ち絵は親枠の高さを基準にcontain表示する", () => {
  const match = parityCss.match(/\.piece-ccfolia-editor-main-image img\s*\{[^}]*\}/);
  assert.ok(match, "character editor portrait rule exists");
  assert.match(match[0], /height:\s*100%/);
  assert.match(match[0], /max-width:\s*100%/);
  assert.match(match[0], /max-height:\s*100%/);
  assert.match(match[0], /object-fit:\s*contain/);
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
  assert.match(previewStyles, /max-width: 48px/);
  assert.match(previewStyles, /max-height: 48px/);
  assert.match(previewStyles, /width: auto/);
  assert.match(previewStyles, /height: auto/);
  assert.match(previewStyles, /object-fit: contain/);
  assert.doesNotMatch(previewStyles, /object-fit: cover/);
});

test("駒画像の大きなプレビューと差分サムネイルは画像全体を表示し、縦横比を保つ", () => {
  const featured = parityCss.match(/\.base-info-panel \.piece-url-preview-featured-frame > img\s*\{[^}]*\}/)?.[0] || "";
  const thumbnail = parityCss.match(/\.base-info-panel \.piece-url-preview-frame > img\s*\{[^}]*\}/)?.[0] || "";
  for (const rule of [featured, thumbnail]) {
    assert.match(rule, /width: auto/);
    assert.match(rule, /height: auto/);
    assert.match(rule, /max-width: 100%/);
    assert.match(rule, /max-height: 100%/);
    assert.match(rule, /object-fit: contain/);
  }
});
