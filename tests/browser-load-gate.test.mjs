import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   ブラウザと同じ「スクリプトモード」で構文を見る。

   node --check は .js を CommonJS として読むため、顶层の return を許してしま���
   （実際のブラウザでは Illegal return statement で全体が落ちる）。
   ここはその穴を塞ぐゲート。全画面 JS はスクリプトとして読めなければならない。
   --------------------------------------------------------------------------- */

const FILES = [
  "js/App.js",
  "js/state.js",
  "js/OtherSections.js",
  "js/PersonaCodex.js",
  "js/garasumado-export.js",
  "js/garasumado-import-ui.js",
  "js/garasumado-roster-import.js",
  "js/persona-draft-import.js",
  "js/roster-resolver.js",
  "js/ledger-provenance.js",
  "js/ledger-import-reconcile.js",
  "js/result-log-parser.js",
  "js/ui.js",
  "js/accounts-ui.js",
  "js/generator.js"
];

test("全画面の JS はブラウザのスクリプトモードで読める", () => {
  const broken = [];
  for (const file of FILES) {
    let src;
    try {
      src = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    } catch {
      continue;
    }
    try {
      new vm.Script(src, { filename: file });
    } catch (error) {
      broken.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(broken, [], "スクリプトとして読めないファイルがある");
});

test("React フックは React. 名前空間経由で呼んでいる（ компонンスコープに無い）", () => {
  /* vm.Script は構文しか見ないので、useMemo を素で呼んでも通ってしまう。
     実機はここで RosterSection が落ちて所持一覧ごと消えた。
     各コンポーネントは `const h = React.createElement` の形だけ社会保险なので、
     素のフック呼び出しが残っていないかソースで探す。 */
  const offenders = [];
  for (const file of FILES) {
    let src;
    try {
      src = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    } catch {
      continue;
    }
    src.split("\n").forEach((line, i) => {
      /* 定義行（const useState = ... 等）は除外する。 */
      if (/\bconst\s+(use[A-Z]\w*)\s*=/.test(line)) return;
      /* React. が付いている正しい形は通過させる。 */
      if (/React\.use[A-Z]\w*\s*\(/.test(line)) return;
      if (/\buse(State|Memo|Effect|Ref|Callback|Reducer|LayoutEffect)\s*\(/.test(line)) {
        offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "素のフック呼び出しがある（React. を付けて読む）");
});

test("全画面の JS に不正な文字（U+FFFD）が混ざっていない", () => {
  const dirty = [];
  for (const file of FILES) {
    let src;
    try {
      src = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    } catch {
      continue;
    }
    const at = src.indexOf("\uFFFD");
    if (at >= 0) dirty.push(`${file} (${at})`);
  }
  assert.deepEqual(dirty, []);
});

test("カード内の价格・資源・ランクは行ごとに固定枠で揃える", () => {
  const css = readFileSync(new URL("../assets/v67-persona-redesign.css", import.meta.url), "utf8");
  /* 実測: カード幅251・名前35px・資源 y=93/x=13 は全カードで一致していた。
     ずれていたのは价格の x だけで、名前の長さで流れ込むため
     10 枚に 10 通りの位置（129 / 143 / 144 / 148 / 160 / 172 ...）になっていた。 */
  assert.match(css, /\.shop-card-head \{\s*grid-template-columns: minmax\(0, 1fr\) auto 66px;/);
  assert.match(css, /\.shop-card-head \.shop-card-cost \{\s*grid-column: 3;\s*justify-self: stretch;/);
  /* 名前は2行に収める。3行になると下の行がずれる。 */
  assert.match(css, /\.shop-card-name \{[\s\S]{0,160}?-webkit-line-clamp: 2;/);
  assert.match(css, /\.shop-card-name \{[\s\S]{0,220}?min-block-size: calc\(2 \* 1em \* 1\.45\);/);
  /* ランク名（ZAYIN/WAW/HE/ALEPH）でバッジ幅が変わらない。 */
  assert.match(css, /\.shop-card-top \.badge \{[\s\S]{0,80}?min-inline-size: 5\.2em;/);
  /* SAN・欠片の段は2枠固定。チップが0〜2個でも高さが変わらない。 */
  assert.match(css, /\.shop-card-kw-row \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  /* 桁を揃える。 */
  assert.match(css, /\.shop-card-cost,\s*\.shop-card-kw-row \.p-kw:last-child \{\s*font-variant-numeric: tabular-nums;/);
  /* 購入ボタンは常にカード最下部。 */
  assert.match(css, /\.shop-card-acti \{\s*margin-block-start: auto;/);
});

test("ショップの検索窓はトップバー直下に空きなく並ぶ（固定はしない）", () => {
  const css = readFileSync(new URL("../assets/v67-persona-redesign.css", import.meta.url), "utf8");
  /* 実測で topbar 48 → 検索 205（157px の空白）だった。
     内訳は main.focus の padding 12px と .section-title-row（55px + mb 24px）。 */
  assert.match(css, /\.focus:has\(\.shop-workspace\) \{\s*padding-top: 0;/);
  assert.match(css, /\.shop-workspace > \.section-title-row \{[\s\S]{0,200}?clip-path: inset\(50%\);/);
  /* 見出しはDOMに残る（スクリーンリーダーの見出し構造を壊さない）。 */
  assert.doesNotMatch(css, /\.shop-workspace > \.section-title-row \{\s*display: none;/);
  /* タブ帯と検索の間の余白も消す。 */
  assert.match(css, /\.shop-workspace > \.shop-tabs-sticky \{\s*margin-bottom: 0;/);
  assert.match(css, /\.shop-workspace > \.shop-tabs-sticky \+ \.shop-filters \{\s*margin-top: 0;/);
  /* 固定はしない。スクロールで持っていかれるのはタブ帯だけ。 */
  assert.match(css, /\.shop-workspace \.shop-filters \{ position: static !important; \}/);
});

test("境界色は、実際に描かれる面に対して見える値になっている", () => {
  const src = readFileSync(new URL("../assets/design-system.css", import.meta.url), "utf8");
  const m = src.match(/--line-dim:(#[0-9a-f]{6});\s*--line:(#[0-9a-f]{6});\s*--line-strong:(#[0-9a-f]{6});/);
  assert.ok(m, "境界色の定義が見つかる");
  const [, dim, line, strong] = m;

  const lum = (hex) => {
    const n = hex.replace("#", "");
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(parseInt(n.slice(0, 2), 16)) + 0.7152 * f(parseInt(n.slice(2, 4), 16)) + 0.0722 * f(parseInt(n.slice(4, 6), 16));
  };
  const ct = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  /* surface-2（カード面の典型）。旧値はここで 1.10 で、枠が背景と同色になっていた
     （実測: 駒整形 49 / ショップ 21 / 記録 54 箇所が 1.4 未満だった）。 */
  const S2 = "#211d1a";
  assert.ok(ct(dim, S2) >= 1.45, `--line-dim が surface-2 で見えない（${ct(dim, S2).toFixed(2)}）`);
  assert.ok(ct(line, S2) >= 1.85, `--line が surface-2 で弱い（${ct(line, S2).toFixed(2)}）`);
  /* 入力欄は操作可能性の合図なので WCAG 1.4.11 の 3:1 を満たす。 */
  assert.ok(ct(strong, S2) >= 3.0, `--line-strong が surface-2 で 3:1 に届かない（${ct(strong, S2).toFixed(2)}）`);
  /* 階層の順序が崩れると「強い / 弱い」の意味が入れ替わる。 */
  assert.ok(lum(dim) < lum(line) && lum(line) < lum(strong), "dim < line < strong の順序");
});

test("操作標的は縦 24px 以上（WCAG 2.2 Target Size）", () => {
  const css = readFileSync(new URL("../assets/v67-persona-redesign.css", import.meta.url), "utf8");
  /* 監査で縦 24px を下回っていた操作。 */
  for (const sel of [".pv-sec-head", ".preview-readiness-jump", ".pv-sec-tbtn", ".ledger-row-release", ".ledger-row-trash", ".ledger-row-move"]) {
    const i = css.indexOf(sel + ",");
    const last = css.indexOf(sel + " {");
    const at = i >= 0 ? i : last;
    assert.ok(at >= 0, `${sel} に標的サイズの指定がある`);
    const block = css.slice(at, css.indexOf("}", at));
    assert.match(block, /min-block-size:\s*24px;/, `${sel} が 24px を確保している`);
  }
  /* チェックボックスは見た目のまま、当たり判定だけを広げる。 */
  assert.match(css, /label:has\(> input\[type="checkbox"\]\) \{[\s\S]{0,120}?min-block-size: 24px;/);
});

test("検索とフィルタは追従しない（詳細パネルとタブ帯だけが追従する）", () => {
  const shopCss = readFileSync(new URL("../assets/v67-persona-redesign.css", import.meta.url), "utf8");
  /* 旧 workspace.css が .shop-filters を sticky にしているが、
     最終レイヤで static に上書きして実目を隠さない。 */
  assert.match(shopCss, /\.shop-workspace \.shop-filters \{\s*position: static !important;\s*\}/);

  /* 追従してよいのはタブ帯と詳細パネルのみ。 */
  const allowed = /tabs-sticky|shop-tabs|\.codex-detail\b|sticky footer/;
  const offenders = [];
  for (const file of ["assets/workspace.css", "assets/v67-persona-redesign.css", "assets/persona-codex.css"]) {
    const lines = readFileSync(new URL("../" + file, import.meta.url), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/position:\s*sticky;/.test(line)) return;
      if (/!important/.test(line)) return;
      const block = lines.slice(Math.max(0, i - 8), i).join("\n");
      const selector = block.split("{").pop().trim().split(/[,\n]/).pop().trim();
      if (!allowed.test(selector + " " + block.slice(-120))) offenders.push(`${file}:${i + 1} ${selector}`);
    });
  }
  assert.deepEqual(offenders, [], `追従させてはいけない要素がある: ${offenders.join(" / ")}`);
});