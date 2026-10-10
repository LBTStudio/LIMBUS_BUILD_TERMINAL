import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

/* ---------------------------------------------------------------------------
   アイコン切り抜きの幾何（js/icon-cropper.js）を検証する。

   守るべき性質:
     - 枠（単位正方形）を画像が常に覆う。倍率を上げてもパンをしても
       枠の外に空白が露出しない（画面の端に余白が出ると「抜けた」ように見える）
     - パンは枠内へクランプされる
     - 切り抜き rect は必ず画像内に収まる
     - 丸い枠で見えている部分が、実際に保存される部分と一致する
--------------------------------------------------------------------------- */

const source = readFileSync(new URL("../js/icon-cropper.js", import.meta.url), "utf8");

function load() {
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    /* UI部品は幾何とは無関係なので、createElement のスタブだけで読み込む。 */
    React: { createElement: () => null, useState: (v) => [v, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn },
    Image: class {},
    URL: { createObjectURL: () => "blob:x" }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_iconCrop;
}
const crop = load();

test("枠を覆う最小倍率は、短い辺ではなく長い辺で決まる", () => {
  /* 横長 1200x630 を正方形枠に入れると、幅に合わせるまで拡大が必要。
     cover = max(1/1200, 1/630) = 1/630 → これが倍率1の状態。 */
  assert.ok(Math.abs(crop.computeCoverScale(1200, 630) - 1 / 630) < 1e-12);
  assert.ok(Math.abs(crop.computeCoverScale(630, 1200) - 1 / 630) < 1e-12);
  assert.ok(Math.abs(crop.computeCoverScale(800, 800) - 1 / 800) < 1e-12);
});

test("パンは枠を画像が覆う範囲にクランプされる", () => {
  /* 倍率1（cover）では画像は枠ちょうどを覆うので、動かす余地はない。 */
  assert.equal(crop.clampPan(0, 0), 0, "余地が無いときは中央");
  assert.equal(crop.clampPan(-0.5, 0), 0, "余地が無いときはどんな値でも0");
  /* 拡大時: x は [-(w*scale-1), 0] に収まる。 */
  const extent = -0.5;
  assert.equal(crop.clampPan(0.9, extent), 0, "右へ振り切らない");
  assert.equal(crop.clampPan(-0.9, extent), extent, "左へ振り切らない");
  assert.equal(crop.clampPan(-0.2, extent), -0.2, "範囲内はそのまま");
});

test("切り抜き rect は常に画像内に収まる", () => {
  const cases = [
    { imageWidth: 1200, imageHeight: 630, zoom: 1, x: 0, y: 0 },
    { imageWidth: 630, imageHeight: 1200, zoom: 1, x: 0, y: 0 },
    { imageWidth: 1200, imageHeight: 630, zoom: 4, x: -0.9, y: 0.9 },
    { imageWidth: 100, imageHeight: 100, zoom: 1, x: -1, y: 1 },
    { imageWidth: 33, imageHeight: 47, zoom: 2.75, x: -3, y: 3 }
  ];
  for (const c of cases) {
    const r = crop.computeCropRect(c);
    assert.ok(r.sx >= 0, `sx>=0 (${JSON.stringify(c)} → ${JSON.stringify(r)})`);
    assert.ok(r.sy >= 0, `sy>=0 (${JSON.stringify(c)} → ${JSON.stringify(r)})`);
    assert.ok(r.sx + r.sw <= c.imageWidth + 1e-9, `右端が画像内 (${JSON.stringify(c)} → ${JSON.stringify(r)})`);
    assert.ok(r.sy + r.sh <= c.imageHeight + 1e-9, `下端が画像内 (${JSON.stringify(c)} → ${JSON.stringify(r)})`);
    assert.ok(r.sw > 0 && r.sh > 0, "辺の長さが正");
    assert.ok(Math.abs(r.sw - r.sh) < 1e-9, "正方形であること（丸い枠の内接円と一致）");
  }
});

test("倍率1の既定は中央であり、枠を覆う", () => {
  /* 横長 1200x600 を倍率1で見るなら、枠は中央の600x600。 */
  const size = { w: 1200, h: 600 };
  const centered = crop.centerPan(size.w, size.h, 1);
  const r = crop.computeCropRect({ imageWidth: size.w, imageHeight: size.h, zoom: 1, x: centered.x, y: centered.y });
  assert.equal(r.sx, 300, "横は中央");
  assert.equal(r.sy, 0, "縦は全体（短い辺が枠を満たす）");
  assert.equal(r.sw, 600);
  assert.equal(r.sh, 600);
});

test("既定が左上原点だと画像の左上隅しか見えない（中央寄せの根拠）", () => {
  const naive = crop.computeCropRect({ imageWidth: 1200, imageHeight: 600, zoom: 1, x: 0, y: 0 });
  assert.equal(naive.sx, 0, "左上原点なら左端");
  assert.equal(naive.sy, 0, "左上原点なら上端");
  const centered = crop.centerPan(1200, 600, 1);
  assert.ok(centered.x < 0, "中央寄せでは画像を左へずらす");
  assert.equal(centered.y, 0, "縦は既に枠ちょうど");
});

test("ズームすると選ぶ範囲が狭くなり、パン位置が効く", () => {
  const wide = crop.computeCropRect({ imageWidth: 1200, imageHeight: 1200, zoom: 1, x: 0, y: 0 });
  const near = crop.computeCropRect({ imageWidth: 1200, imageHeight: 1200, zoom: 2, x: 0, y: 0 });
  assert.equal(near.sw, wide.sw / 2, "2倍で範囲は半分");
  /* 1200x600 を倍率1で見る場合、パンは x ∈ [1-2, 0] = [-1, 0]。
     画像を左へ動かす（x が小さい）と、見えるのは画像の右側。 */
  const leftPart = crop.computeCropRect({ imageWidth: 1200, imageHeight: 600, zoom: 1, x: -0.1, y: 0 });
  const rightPart = crop.computeCropRect({ imageWidth: 1200, imageHeight: 600, zoom: 1, x: -0.9, y: 0 });
  assert.ok(leftPart.sx < rightPart.sx, "パンが小さいほど画像の左側が見える");
  assert.ok(rightPart.sx > 300, "中央より右へ動かすと右側が出る");
});

test("枠を覆う最小倍率では、少なくとも一辺が枠を満たす", () => {
  for (const [w, hh] of [[1200, 800], [800, 1200], [800, 800], [1200, 630]]) {
    const scale = crop.computeCoverScale(w, hh);
    const minFill = Math.min(w * scale, hh * scale);
    assert.ok(minFill >= 1 - 1e-12, `${w}x${hh}: 枠を覆う (min=${minFill})`);
    assert.ok(Math.abs(minFill - 1) < 1e-12, `${w}x${hh}: 小さい方が枠ちょうど（無駄な拡大がない）`);
  }
});

test("読み込み時に圧縮しない（検証とobjectURLだけ）", () => {
  const src = readFileSync(new URL("../js/icon-cropper.js", import.meta.url), "utf8");
  assert.match(src, /function loadIconSource\(file, onError\) \{/, "アップロードは loadIconSource 経由");
  assert.match(src, /URL\.createObjectURL\(file\)/, "原本をそのまま指す（dataURI化しない）");
  const body = src.slice(src.indexOf("function loadIconSource"), src.indexOf("/* 決定後の切り抜き"));
  assert.doesNotMatch(body, /toBlob|canvas/, "選択時点では Canvas を使ってはいけない");
  assert.doesNotMatch(body, /readAsDataURL/, "選択時点ではファイル全体を読み込まない");
});

/* ---------------------------------------------------------------------------
   実サイズ・プレビューの体裁

   「この大きさで保存されます」というラベルを上に置き、丸をその下に置く形では
   丸の右側が空白になり、注記はフォーム側のグリッド用 class を流用したことで
   幅が詰まって3行に折り返していた。表示自体は本番と同じサイズを実物大で見せる
   意味があるので、1行に束ねて用途を明記する形に改めた。
--------------------------------------------------------------------------- */
const css = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");

test("実サイズ・プレビューは1行で組む（ラベルを上に置くと丸の右が空白になる）", () => {
  const block = css.slice(css.indexOf(".acct-crop-preview {"), css.indexOf(".acct-crop-thumb {"));
  assert.match(block, /flex-direction:\s*row/, "丸と説明を横一列に並べる");
  assert.doesNotMatch(block, /flex-direction:\s*column/, "縦積みに戻さない");
  /* 上に浮かせたラベル専用の class は持たない。 */
  assert.equal(css.includes(".acct-crop-preview-label"), false, "縦積み用のラベル style が残っている");
  assert.equal(css.includes(".acct-crop-preview-row"), false, "縦積み用の行 style が残っている");
});

test("プレビューの説明は本番の表示サイズを宣言する", () => {
  const src = readFileSync(new URL("../js/icon-cropper.js", import.meta.url), "utf8");
  assert.match(src, /acct-crop-preview-cap/, "説明を同じ行へ置く要素がある");
  assert.match(src, /表示サイズ（20px \/ 44px）/, "どのサイズかを書く（何のためかが分からない）");
});

test("プレビューの2サイズは本番の表示サイズと一致する", () => {
  /* 「保存後の表示サイズ」を謳うので、本番が実際に使う寸法と
     食い違ってはいけない。片方を変えたらここで落ちる。 */
  const sizeOf = (selector) => {
    const at = css.indexOf(selector + " {");
    assert.ok(at >= 0, `${selector} が CSS に無い`);
    const width = css.slice(at, at + 200).match(/width:\s*(\d+)px/);
    assert.ok(width, `${selector} の width が読めない`);
    return Number(width[1]);
  };
  assert.equal(sizeOf(".acct-chip-mark"), 20, "一覧のチップは20px");
  assert.equal(sizeOf(".acct-mark"), 44, "名前の横の mark は44px");
  assert.equal(sizeOf(".acct-crop-thumb--sm"), 20, "小さい見本は一覧と同じ20px");
  assert.equal(sizeOf(".acct-crop-thumb--md"), 44, "大きい見本は mark と同じ44px");
});

test("切替パネルの注記はフォーム側のグリッド用 class を流用しない", () => {
  /* .acct-icon-row-note は grid-column: 1 / -1 を持つフォームの行専用。
     フレックスコンテキストでは無意味で、幅も詰まって3行に折れていた。 */
  const src = readFileSync(new URL("../js/icon-cropper.js", import.meta.url), "utf8");
  assert.equal(src.includes("acct-icon-row-note"), false, "グリッド用 class を流用しない");
  assert.match(src, /acct-crop-note/, "パネル専用の注記 class を使う");
  assert.match(css, /\.acct-crop-note\s*\{[^}]*\}/, "専用 class の style がある");
  /* 1行で収まる長さに詰める（本番の表示サイズは上で宣言済み）。 */
  assert.match(src, /決定後、256px・最大24KBへ圧縮して保存します。/, "重複する説明を短くする");
});
