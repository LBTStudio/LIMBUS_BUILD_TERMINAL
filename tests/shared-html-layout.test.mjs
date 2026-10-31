import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

const runtime = loadRuntime();

function sampleShareHtml() {
  const persona = runtime.db.normal_personas[0];
  let state = equipPersona(runtime, "n", persona);
  const ego = runtime.db.egos[0];
  state = runtime.reducer(state, { type: "SET_EGO_SLOT", rank: "ZAYIN", value: ego });
  const support = runtime.db.support_passives[0];
  state = runtime.reducer(state, { type: "ADD_ROSTER_SUPPORT", spp: support, purchase: false });
  state = runtime.reducer(state, { type: "ADD_SUPPORT", spp: support });
  return String(runtime.gen.buildShareSheetHTML(state));
}

test("共有HTMLの本文とダイス効果は読みやすい文字サイズ・行間を持つ", () => {
  const html = sampleShareHtml();
  assert.match(html, /\.eff\{font-size:13\.5px;color:var\(--tx2\);line-height:1\.8;margin-top:6px\}/);
  assert.match(html, /\.spp \.eff\{margin-top:4px;font-size:13\.5px;color:var\(--tx2\);line-height:1\.8\}/);
  assert.match(html, /\.dice-eff\{color:var\(--tx\);line-height:1\.7;min-width:0;word-break:break-word;font-size:13\.5px\}/);
  assert.match(html, /\.tim\{color:var\(--gold\);font-family:var\(--head\);font-size:12\.5px/);
});

test("共有HTMLの明るい大罪タグは暗い文字色で十分なコントラストを確保する", () => {
  const html = sampleShareHtml();
  assert.match(html, /\.sin-tag\[data-sin="色欲"\],\.sin-tag\[data-sin="怠惰"\],\.sin-tag\[data-sin="暴食"\],\.sin-tag\[data-sin="特殊"\]\{color:#17120d;text-shadow:none\}/);

  const luminance = (hex) => {
    const value = hex.replace(/^#/, "");
    const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (foreground, background) => {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  for (const [sin, background] of [["色欲", "#c96424"], ["怠惰", "#e29a20"], ["暴食", "#7a9b40"], ["特殊", "#9a989b"]]) {
    assert.ok(html.includes(`--sin-${sin}:${background}`), `unexpected background for ${sin}`);
    assert.ok(ratio("#17120d", background) >= 4.5, `contrast below 4.5:1 for ${sin} / ${background}`);
  }
});

test("折り畳みセクションに件数を表示し、印刷パレットは白地・濃色文字へ切り替わる", () => {
  const html = sampleShareHtml();
  assert.ok((html.match(/<span class="section-count">1件<\/span>/g) || []).length >= 2, "E.G.O とサポートパッシブの件数が表示される");
  assert.match(html, /font-size:10\.5px;letter-spacing:\.04em/);
  assert.match(html, /@media print\{[\s\S]*--tx2:#222[\s\S]*break-inside:avoid/);
  /* 閉じたdetailsの強制表示をCSSに書いても実機では機能しない。印刷時の本文は
     beforeprint/afterprint ハンドラで担保するため、このCSSは存在しないこと。 */
  assert.doesNotMatch(html, /details\.fold:not\(\[open\]\)>:\s*not\(summary\)\{display:block!important\}/);
});

test("印刷時は閉じた折り畳みも全て開き、印刷後に元の開閉状態へ戻す", () => {
  const html = sampleShareHtml();
  assert.match(html, /window\.addEventListener\("beforeprint", \(\) => \{/);
  assert.match(html, /window\.addEventListener\("afterprint", \(\) => \{/);
  assert.match(html, /printOpenStates = \[\.\.\.sheet\.querySelectorAll\("details"\)\]\.map\(\(d\) => \[d, d\.open\]\)/);
  assert.match(html, /printOpenStates\.forEach\(\(\[d, wasOpen\]\) => \{ d\.open = wasOpen; \}\)/);
});

test("長いPC名・人格名を含む場合もヘッダーは強制折り返しできる", () => {
  const html = sampleShareHtml();
  assert.match(html, /\.hd h1\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /\.hd-plpc span,\.hd \.persona-line \.val\{min-width:0;overflow-wrap:anywhere\}/);
});

test("共有HTML内検索は折り畳み内も検索し、標準検索を無効化しない", () => {
  const html = sampleShareHtml();
  assert.match(html, /id="share-search-input"/);
  assert.match(html, /id="share-search-results"/);
  /* ブラウザ標準のページ内検索（Ctrl+F / Cmd+F）は奪わない。 */
  assert.doesNotMatch(html, /window\.addEventListener\("keydown"/);
  assert.doesNotMatch(html, /stopImmediatePropagation/);
  assert.doesNotMatch(html, /preventDefault\(\)/);
  /* 検索対象はヘッダー（PC名・人格名）とフッタを含み、標準検索で見つかる主な本文を漏らさない。 */
  assert.match(html, /const searchableSelector = "\.hd,\.skl,\.ego,\.spp,\.share-unique,\.share-item,\.panel,\.stat,\.res,\.foot"/);
  assert.match(html, /閉じた項目も検索します。検索では自動展開せず、結果の「この項目を開く」で必要なものだけ展開できます。/);
  assert.match(html, /sheet\.querySelectorAll\(searchableSelector\)/);
  assert.match(html, /element\.textContent/);

  const renderStart = html.indexOf("const renderResults");
  const renderEnd = html.indexOf('input.addEventListener("input", renderResults)', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, "検索描画関数がある");
  assert.doesNotMatch(html.slice(renderStart, renderEnd), /\.open\s*=\s*true/, "検索の実行は折り畳みを開かない");
  assert.match(html, /open\.addEventListener\("click", \(\) => openOnRequest\(element\)\)/);
  assert.match(html, /parent\.open = true/, "利用者が「この項目を開く」を押した時だけ祖先のdetailsを開く");
  assert.match(html, /textContent = snippet\.slice\(pos, pos \+ query\.length\)/, "検索語を安全に文字列として表示する");
});


test("共有HTMLの個人メモはシート別に端末保存し、共有URLには含めない", () => {
  const html = sampleShareHtml();
  assert.match(html, /class="share-private-notes" data-storage-key="lbt-share-note-v1-[0-9a-f]+"/);
  assert.match(html, /id="share-private-notes-input" maxlength="5000"/);
  assert.match(html, /メモはこのブラウザ内にのみ保存され、共有URLや他の閲覧者には送信されません。/);
  assert.match(html, /localStorage\.getItem\(storageKey\)/);
  assert.match(html, /localStorage\.setItem\(storageKey, input\.value\)/);
  assert.match(html, /localStorage\.removeItem\(storageKey\)/);
  assert.match(html, /この端末のメモを消去/);
  assert.match(html, /const searchableSelector = "\.hd,\.skl,\.ego,\.spp,\.share-unique,\.share-item,\.panel,\.stat,\.res,\.foot"/);
});

test("共有HTMLの人格ヘッダーとOGP説明に所属を表示する", () => {
  const html = sampleShareHtml();
  const persona = runtime.db.normal_personas[0];
  assert.ok(persona.affiliation, "テスト人格に所属データがある");
  assert.ok(html.includes("affiliation-label"), "所属ラベルがヘッダーに出力される");
  assert.ok(html.includes(`所属 ${persona.affiliation}`), "所属名が表示される");
  assert.ok(html.includes(`所属：${persona.affiliation}`), "OGP説明にも所属名が含まれる");
});

test("所属がないカスタム人格には空の所属ラベルを出さない", () => {
  const persona = runtime.db.normal_personas[0];
  const state = equipPersona(runtime, "n", persona);
  state.personaSrc = { ...state.personaSrc, affiliation: "" };
  const html = String(runtime.gen.buildShareSheetHTML(state));
  assert.doesNotMatch(html, /class="lbl affiliation-label"/);
});
