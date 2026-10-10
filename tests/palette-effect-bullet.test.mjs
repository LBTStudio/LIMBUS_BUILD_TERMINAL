import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

/* パレットの効果段落に付く▶︎（U+25B6 U+FE0E）の表示設定。
 *
 * ▶︎は効果段落の装飾であり、段落の切れ目でも内容でもない。卓では箇条書きに見えるため
 * 切れるようにする。表示設定は本文・段落・見出しを一切変えない。 */
const ARROW = "\u25B6\uFE0E";

function personaWithMultiParagraphSkill(rt) {
  return rt.db.normal_personas.find((persona) => (persona.skills || []).some((skill) => String(skill.effect || "").includes("\n")));
}

test("▶︎は既定で付く（設定を触らなければ従来どおり）", () => {
  const rt = loadRuntime();
  const state = equipPersona(rt, "n", personaWithMultiParagraphSkill(rt));
  assert.equal(rt.gen.buildPalette(state).includes(ARROW), true);
});

test("paletteOptions.effectBullet を false にすると▶︎が外れ、本文は変わらない", () => {
  const rt = loadRuntime();
  const base = equipPersona(rt, "n", personaWithMultiParagraphSkill(rt));
  const withBullet = rt.gen.buildPalette(base);
  const withoutBullet = rt.gen.buildPalette({ ...base, paletteOptions: { effectBullet: false } });

  assert.equal(withBullet.includes(ARROW), true, "既定では▶︎が付く");
  assert.equal(withoutBullet.includes(ARROW), false, "OFFなら▶︎が付かない");
  /* 記号だけを取り除いて一致するなら、本文・段落・見出しは一切変わっていない。 */
  const strip = (text) => text.split(ARROW).join("");
  assert.equal(strip(withoutBullet), strip(withBullet), "▶︎以外の出力は同一");
});

test("▶︎を外しても段落の切れ目は保たれる", () => {
  const rt = loadRuntime();
  const persona = personaWithMultiParagraphSkill(rt);
  const paragraphs = String(persona.skills.find((s) => String(s.effect || "").includes("\n")).effect).split("\n").filter(Boolean);
  assert.ok(paragraphs.length >= 2, "検証には複数段落的人格が要る");

  const withoutBullet = rt.gen.buildPalette({
    ...equipPersona(rt, "n", persona),
    paletteOptions: { effectBullet: false }
  });
  for (const paragraph of paragraphs) {
    assert.ok(withoutBullet.includes(paragraph), `段落が失われた: ${paragraph.slice(0, 30)}`);
  }
});

test("固有バフの散文ブロック（buildProseBlock）も設定に従う", () => {
  const rt = loadRuntime();
  const base = equipPersona(rt, "n", rt.db.normal_personas.find((persona) => (persona.unique_buffs || []).length > 0));
  const withBullet = rt.gen.buildPalette(base);
  const withoutBullet = rt.gen.buildPalette({ ...base, paletteOptions: { effectBullet: false } });
  assert.equal(withoutBullet.includes(ARROW), false);
  assert.equal(withBullet.split(ARROW).join(""), withoutBullet.split(ARROW).join(""));
});

test("旧保存データでも既定値へ補完され、OFFの設定は保持される", () => {
  const rt = loadRuntime();
  const legacy = JSON.parse(JSON.stringify({ ...rt.initialState }));
  delete legacy.paletteOptions;

  const migrated = rt.reducer(rt.initialState, { type: "HYDRATE", state: legacy });
  assert.equal(migrated.paletteOptions?.effectBullet, true);

  const disabled = rt.reducer(rt.initialState, { type: "HYDRATE", state: { ...legacy, paletteOptions: { effectBullet: false } } });
  assert.equal(disabled.paletteOptions?.effectBullet, false, "OFFの設定は保持される");
});

test("表示設定は端末ごとのもので、共有リンクの許可キーには載せない", () => {
  const shareLink = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
  const allowed = shareLink.match(/const SHARE_KEYS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(allowed, "SHARE_KEYS が見つからない");
  assert.equal(/paletteOptions/.test(allowed[1]), false, "共有リンクへ持ち込まない");
});

test("PALETTEプレビューのツールバーに切替を露出する（出力のそばに置く）", () => {
  /* 設定の中にしか無いと「どこを操作すればよいか」が分からない。
     ▶︎はPALETTEのプレビューを見ながら切り替えたい。よって同じ切替をプレビューツールバーに出す。 */
  const preview = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
  assert.ok(preview.includes("pv-sec-bullet-toggle"), "プレビューツールバーに切替の要素が無い");
  assert.ok(preview.includes("effectBullet"), "プレビュー側の切替が state を参照していない");
  /* MEMO/JSONタブには出さず、PALETTEタブだけの操作にする。 */
  assert.ok(preview.includes('prefix === "palette"'), "PALETTEタブ以外にも出る条件になっていない");
});

test("切替のスタイルが定義されている（トグルが素のまま出ない）", () => {
  const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
  assert.ok(/\.pv-sec-bullet-toggle\b/.test(css), "pv-sec-bullet-toggle のスタイルが無い");
});