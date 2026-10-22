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
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (foreground, background) => {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  for (const background of ["#c96424", "#e29a20", "#7a9b40", "#9a989b"]) {
    assert.ok(ratio("#17120d", background) >= 4.5, `contrast below 4.5:1 for ${background}`);
  }
});

test("折り畳みセクションに件数を表示し、印刷時は本文を表示する", () => {
  const html = sampleShareHtml();
  assert.ok((html.match(/<span class="section-count">1件<\\/span>/g) || []).length >= 2, "E.G.O とサポートパッシブの件数が表示される");
  assert.match(html, /font-size:10\.5px;letter-spacing:\.04em/);
  assert.match(html, /@media print\{[\s\S]*--tx2:#222[\s\S]*details\.fold:not\(\[open\]\)>:\s*not\(summary\)[\s\S]*display:block!important/);
});

test("長いPC名・人格名を含む場合もヘッダーは強制折り返しできる", () => {
  const html = sampleShareHtml();
  assert.match(html, /\.hd h1\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /\.hd-plpc span,\.hd \.persona-line \.val\{min-width:0;overflow-wrap:anywhere\}/);
});
