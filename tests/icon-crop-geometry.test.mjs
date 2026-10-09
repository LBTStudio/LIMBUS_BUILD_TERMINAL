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
