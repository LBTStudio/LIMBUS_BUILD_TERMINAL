import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/gacha-extraction.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/gacha-extraction.css", import.meta.url), "utf8");

/* js/gacha-extraction.js は window だけに依存する（play は document を使うが plan は使わない）。 */
function load(windowOverride) {
  const context = { window: Object.assign({}, windowOverride), console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_gachaExtraction;
}

test("plan: 特異が無ければ決して金色にしない（偽の煽り禁止）", () => {
  const api = load({});
  const none = api.plan([{ type: "persona", mode: "n" }, { type: "ego" }, { type: "themePack" }]);
  assert.equal(none.gold, false);
  assert.equal(none.startsGold, false);
  assert.equal(none.turnsGold, false);
  assert.equal(none.specialAt, -1);
  const empty = api.plan([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.gold, false);
  assert.equal(empty.specialAt, -1);
});

test("plan: 特異が先頭なら startsGold、後半なら turnsGold", () => {
  const api = load({});
  const first = api.plan([{ branch: "special", type: "persona", mode: "t" }, { type: "persona", mode: "n" }]);
  assert.equal(first.gold, true);
  assert.equal(first.startsGold, true);
  assert.equal(first.turnsGold, false);

  const later = api.plan([{ type: "persona", mode: "n" }, { branch: "special", type: "persona", mode: "t" }]);
  assert.equal(later.gold, true);
  assert.equal(later.startsGold, false);
  assert.equal(later.turnsGold, true);
  assert.equal(later.specialAt, 1);
});

test("isSpecial: branch=special と persona mode=t を特異とみなす", () => {
  const api = load({});
  assert.equal(api.isSpecial({ branch: "special" }), true);
  assert.equal(api.isSpecial({ type: "persona", mode: "t" }), true);
  assert.equal(api.isSpecial({ type: "persona", mode: "n" }), false);
  assert.equal(api.isSpecial({ type: "ego" }), false);
  assert.equal(api.isSpecial(null), false);
});

test("plan.theme: プール毎の主題色（特異 > E.G.O > パック > 標準）", () => {
  const api = load({});
  assert.equal(api.plan([{ type: "persona", mode: "n" }]).theme, "normal");
  assert.equal(api.plan([{ type: "ego" }]).theme, "ego");
  assert.equal(api.plan([{ type: "themePack", pack: "x" }]).theme, "pack");
  const mixed = api.plan([{ type: "persona", mode: "n" }, { type: "persona", mode: "t", branch: "special" }]);
  assert.equal(mixed.theme, "special");
  assert.equal(mixed.gold, true);
  assert.equal(api.plan([{ type: "ego" }, { type: "persona", mode: "t", branch: "special" }]).theme, "special");
});

test("label: 色に頼らず種別を文字で返す", () => {
  const api = load({});
  assert.equal(api.label({ branch: "special" }), "特異人格");
  assert.equal(api.label({ type: "ego" }), "E.G.O");
  assert.equal(api.label({ type: "themePack" }), "特定抽出パック");
  assert.equal(api.label({ type: "persona", mode: "n" }), "人格");
});

test("frameColor: 特異=金・E.G.O=紫・パック=緑・標準=骨董箱", () => {
  const api = load({});
  assert.equal(api.frameColor({ branch: "special" }), "#e9c46a");
  assert.equal(api.frameColor({ type: "ego" }), "#b872d9");
  assert.equal(api.frameColor({ type: "themePack" }), "#8fbf6a");
  assert.match(api.frameColor({ type: "persona", mode: "n" }), /^#/);
});

test("尺は CSS 変数を正本とし、JS は CSS 語彙の --gx-* を読む", () => {
  /* 参照モーションの構成要素が CSS に存在する: 点火・振り子・10鎖・白フラッシュ進退・
     引用・スプラッシュ・グリッド間隔・settling。 */
  for (const token of ["--gx-ignite", "--gx-swing", "--gx-spider", "--gx-condense", "--gx-flash-in",
    "--gx-card-hold", "--gx-flash-out", "--gx-gold-turn", "--gx-quote-hold", "--gx-splash",
    "--gx-grid-stagger", "--gx-settle", "--gx-skip-at"]) {
    assert.ok(css.includes(token), token + " が CSS にある");
  }
  /* JS 側は生の秒数リテラルで尺を作らない（num() の初期値は CSS 消失時のフォールバックのみ）。 */
  assert.doesNotMatch(source, /\b\d+000\s*\*\s*(?!num)/);
  assert.match(source, /num\(cs\(\), "--gx-skip-at"/);
});

test("reduced-motion: 即時 reveal の経路を持つ（JS・CSS 両方）", () => {
  const api = load({ matchMedia: () => ({ matches: true }) });
  assert.equal(api.reduceMotion(), true);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-motion/);
  const off = load({});
  assert.equal(off.reduceMotion(), false);
});

test("CSS は加算レイヤ gacha-extraction で、テーマと等級色を持つ", () => {
  assert.match(css, /@layer\s+gacha-extraction\s*\{/);
  assert.match(css, /--gx-c-spec\s*:/);
  assert.match(css, /--gx-c-ego\s*:/);
  assert.match(css, /--gx-c-pack\s*:/);
  assert.match(css, /\.lbt-gx__frame--is-special/);
  assert.match(css, /\.lbt-gx__tile--is-ego/);
  assert.match(css, /\.lbt-gx\.is-grid/);
});

test("カードは暗色の板＋金環（金グラデ層が板を覆わない順序）", () => {
  /* 背景の第1層が上に描かれる。金 linear-gradient を先頭に戻すと板が明るい金一色に戻る
     （参照 stdz_17_3 の暗い遺物板と不一致になる）ので、padding-box 層が先であることを固定する。 */
  const block = css.match(/\.lbt-gx__card-frame\s*\{[\s\S]*?\}/);
  assert.ok(block, ".lbt-gx__card-frame の規則がある");
  const body = block[0];
  assert.ok(body.indexOf("padding-box") < body.indexOf("border-box"),
    "暗色 radial(padding-box) が金 linear(border-box) より先にある");
  assert.match(body, /animation: gx-card-in/);
});

test("カードの遺物エンブレム・光スイープ・虹彩は JS と CSS の両方にある", () => {
  /* 固有イラストが無い排出物は汎用オブジェクト（時計環の遺物）で見せる。 */
  assert.match(source, /lbt-gx__card-emblem/);
  assert.match(source, /em-ticks/);
  assert.match(source, /lbt-gx__card-shine/);
  assert.match(source, /lbt-gx__card-prism/);
  assert.match(source, /isSpecial\(hit\)[\s\S]{0,200}lbt-gx__card-prism/,
    "虹彩は特異のみに付く");
  for (const key of ["gx-card-in", "gx-shine", "gx-prism-spin", "gx-em-advance", "gx-em-spin", "gx-type-in"]) {
    assert.ok(css.includes("@keyframes " + key), key + " の keyframes がある");
  }
});

test("時計針は連数に合わせて進む（針位置=引いた順/総数）", () => {
  assert.match(source, /--em-from/);
  assert.match(source, /--em-turn/);
  assert.match(source, /String\(i \/ total\)/);
  assert.match(source, /String\(\(i \+ 1\) \/ total\)/);
  assert.match(css, /@keyframes gx-em-advance/);
  assert.match(css, /rotate\(calc\(var\(--em-turn, 0\) \* 1turn\)\)/);
  assert.match(source, /lbt-gx__card-count/);
  assert.match(source, /paintCard\(list\[i\], i\)/);
});

test("特異の二段目は遺物顕現＋赤の引用、三段目は破光リングと文字顕現", () => {
  assert.match(source, /lbt-gx__relic/);
  assert.match(source, /function staggerLine/);
  assert.match(source, /staggerLine\(q,/);
  assert.match(source, /staggerLine\(nm,/);
  assert.match(css, /\.lbt-gx__splash > span/, "種別行の span 指定は名前の文字 span を巻き込まない");
  assert.match(source, /lbt-gx__ring/);
  assert.match(css, /\.lbt-gx__relic/);
  assert.match(css, /@keyframes gx-ch-in/);
  assert.match(css, /@keyframes gx-relic-float/);
  assert.match(css, /@keyframes gx-ring-burst/);
  assert.match(css, /@keyframes gx-turn-charge/, "転換（is-turn）に実体がある");
  assert.match(css, /\.lbt-gx\.is-turn \.lbt-gx__card-frame/);
});

test("演出の光は canvas 側に集約する（神光線・衝撃波リング・紙吹雪・ズームパンチ）", () => {
  assert.match(source, /function drawRays/);
  assert.match(source, /function spawnRing/);
  assert.match(source, /function drawRings/);
  assert.match(source, /function seedConfetti/);
  assert.match(source, /function stepConfetti/);
  assert.match(source, /zoom = Math\.max\(0, zoom - dtSec/);
  assert.match(source, /spawnRing\(W \/ 2, H \/ 2, Math\.max\(W, H\) \* 0\.62/, "フラッシュでリングが走る");
});

test("DOM 配線: モーションの皮相を canvas+DOM フレームで組み立てる", () => {
  /* スイング→10鎖の放射 stage は canvas で描く（CSS では表現できない炎の星星雲 fluid）。 */
  assert.match(source, /lbt-gx__canvas/, "canvas に炎星星雲・鎖の球・バーストを描く");
  assert.match(source, /lbt-gx__card-frame/, "八角形の金縁カード");
  assert.match(source, /lbt-gx__quote/, "3★赤の引用（暗転）");
  assert.match(source, /lbt-gx__splash/, "3★青のスプラッシュ");
  assert.match(source, /lbt-gx__flash/, "白フラッシュ");
  assert.match(source, /lbt-gx__tile-badge/, "結果グリッドの六角バッジ");
  assert.match(source, /aria-label="演出をスキップ"/, "スキップには読み上げ可能な名前がある");
  assert.match(source, /" is-" \+ state\.theme/, "pool の主題色クラスを root に付ける");
  assert.match(source, /isSpecial\(hit\)/, "金演出は hits の特異に由来する");
  assert.doesNotMatch(css, /\.lbt-gx__beam/, "旧 v1 の横光帯を残さない");
  assert.doesNotMatch(source, /onSkip\s*&&\s*\(\s*skipped/);
});

test("公開契約", () => {
  const api = load({});
  assert.equal(typeof api.play, "function");
  assert.equal(typeof api.plan, "function");
  assert.equal(typeof api.reduceMotion, "function");
  assert.equal(typeof api.isSpecial, "function");
  assert.equal(typeof api.label, "function");
  assert.equal(typeof api.frameColor, "function");
});
