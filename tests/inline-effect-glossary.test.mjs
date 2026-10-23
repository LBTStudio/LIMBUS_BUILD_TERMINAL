import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(readFileSync(resolve(ROOT, "data/db.json"), "utf8"));
const coreCorpus = readFileSync(resolve(ROOT, "data/provenance/core.paragraphs.txt"), "utf8");
const source = readFileSync(resolve(ROOT, "js/InlineEffectGlossary.js"), "utf8");

function loadGlossary() {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "js/InlineEffectGlossary.js" });
  return sandbox.window.LBTInlineEffectGlossary;
}

test("official status definitions expose their rulebook page and a useful explanation", () => {
  const glossary = loadGlossary().buildGlossary(db);
  const bleeding = glossary.get("出血") || [];
  const smoke = glossary.get("煙") || [];
  const barrier = glossary.get("バリア") || [];

  assert.ok(bleeding.some((entry) => entry.source === "基本ルール p.307" && entry.description.includes("ダイスロール")));
  assert.ok(smoke.some((entry) => entry.source === "基本ルール p.311" && entry.description.includes("与えるダメージ")));
  assert.ok(barrier.some((entry) => entry.source === "基本ルール p.311" && entry.description.includes("被ダメージ")));
  for (const [term, scope, page] of [
    ["出血", "人格スキル:黒雲会若衆", "基本ルール p.307"],
    ["煙", "アイテム効果:試験品", "基本ルール p.311"],
    ["バリア", "E.G.O効果:試験EGO", "基本ルール p.311"]
  ]) {
    const piece = loadGlossary().tokenize(term, db, scope).find((part) => part.term === term);
    assert.equal(piece.entries.length, 1, term + " は共通定義1件だけ");
    assert.equal(piece.entries[0].source, page, term + " はPDF共通定義を使う");
  }
});

test("E.G.O named unique effects open with the recorded description and source", () => {
  const ego = db.egos.find((entry) => String(entry.unique_buff || "").includes("[百足の毒]"));
  assert.ok(ego, "reference E.G.O exists");
  const entries = loadGlossary().buildGlossary(db).get("百足の毒") || [];
  assert.ok(entries.some((entry) => entry.category === "E.G.O固有効果" && entry.source.includes(ego.name) && entry.description.includes("R終了時")));
});

test("persona unique buffs include owner/max metadata when the DB has no separate description", () => {
  const persona = db.normal_personas.find((entry) => (entry.unique_buffs || []).some((buff) => buff.name === "出血保護"));
  assert.ok(persona, "reference identity exists");
  const entries = loadGlossary().buildGlossary(db).get("出血保護") || [];
  assert.ok(entries.some((entry) => entry.category === "固有バフ" && entry.source.includes(persona.name) && entry.description.includes("最大値")));
});

test("bracketed custom references show their source text and never mutate the source DB", () => {
  const record = {
    normal_personas: [{
      name: "検証用人格",
      passive_name: "試験パッシブ",
      passive_effect: "対象に[未知の固有処理]を付与する",
      passive_cond: "",
      passive_always: "",
      unique_buffs: [],
      skills: [],
      keywords: []
    }],
    tokui_personas: [],
    egos: [],
    support_passives: [],
    death_passives: [],
    normal_enhancements: [],
    special_enhancements: [],
    spirits: [],
    items: []
  };
  const before = JSON.stringify(record);
  const api = loadGlossary();
  const entries = api.tokenize("未知の固有処理", record, "人格パッシブ:検証用人格").find((piece) => piece.term === "未知の固有処理").entries;
  assert.equal(entries.length, 1, "参照元の人格の本文を1件だけ表示する");
  assert.ok(entries[0].category === "本文中の参照" && entries[0].source.includes("検証用人格") && entries[0].description.includes("未知の固有処理"));
  assert.equal(api.tokenize("未知の固有処理", record, "人格パッシブ:別人格").find((piece) => piece.term === "未知の固有処理").entries.length, 0,
    "別人格の参照本文を代わりに表示しない");
  assert.equal(JSON.stringify(record), before, "glossary indexing must not mutate data");
});

test("tokenization prefers the longest known phrase without dropping surrounding text", () => {
  const api = loadGlossary();
  const pieces = api.tokenize("出血保護3を得る。対象の出血が4以上", db);
  const terms = pieces.filter((piece) => piece.term).map((piece) => piece.term);
  assert.equal(terms[0], "出血保護");
  assert.ok(terms.includes("出血"));
  assert.equal(pieces.map((piece) => piece.text).join(""), "出血保護3を得る。対象の出血が4以上");
});

test("same-named persona unique buffs use only the active owner's explanation", () => {
  const fixture = {
    normal_personas: [
      { name: "人格A", unique_buffs: [{ name: "試験固有", type: "固有バフ", desc: "人格Aだけの説明", max: 4 }], skills: [], keywords: [] },
      { name: "人格B", unique_buffs: [{ name: "試験固有", type: "固有バフ", desc: "人格Bだけの説明", max: 9 }], skills: [], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const a = api.tokenize("試験固有", fixture, "人格固有バフ:人格A").find((piece) => piece.term === "試験固有").entries;
  const b = api.tokenize("試験固有", fixture, "人格固有バフ:人格B").find((piece) => piece.term === "試験固有").entries;
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.ok(a[0].description.includes("人格Aだけの説明"));
  assert.ok(b[0].description.includes("人格Bだけの説明"));
  assert.ok(!a[0].source.includes("人格B") && !b[0].source.includes("人格A"));
});

test("PDF-defined named statuses have canonical page references and related-effect samples are absent", () => {
  const glossary = loadGlossary().buildGlossary(db);
  for (const [term, page] of [
    ["武装", "基本ルール p.306"], ["共振", "基本ルール p.306"],
    ["属性威力減少", "基本ルール p.308"], ["振動-灼熱", "基本ルール p.309"],
    ["弾丸-猛虎標弾", "基本ルール p.312"]
  ]) {
    assert.ok(glossary.get(term)?.some((entry) => entry.isRulebook && entry.source === page), term);
  }
  for (const entries of glossary.values()) assert.ok(entries.every((entry) => entry.category !== "関連効果の例"));
  assert.doesNotMatch(source, /下の関連効果|関連効果の例|ほか .* 件の参照があります/);
});

test("mobile contextmenu does not let its follow-up synthetic click close the glossary", () => {
  assert.ok(source.includes("const lastPointerType = React.useRef(null);"));
  assert.ok(source.includes("lastPointerType.current = event.pointerType || null;"));
  assert.ok(source.includes('if (lastPointerType.current === "touch") suppressClick.current = true;'));
  assert.ok(source.includes("if (suppressClick.current) {"));
  assert.ok(source.includes("event.preventDefault();"));
  assert.ok(source.includes("event.stopPropagation();"));
});

test("glossary unmount and cancelled touch gestures clear pending timers and click suppression", () => {
  assert.ok(source.includes("React.useEffect(() => () => {"));
  assert.ok(source.includes("clearTimer(hoverTimer);"));
  assert.ok(source.includes("clearTimer(closeTimer);"));
  assert.ok(source.includes("clearTimer(longPressTimer);"));
  assert.ok(source.includes("const onPointerCancel = () => {"));
  assert.ok(source.includes("suppressClick.current = false;"));
  assert.ok(source.includes("onPointerUp, onPointerCancel,"));
});

test("PC hover, keyboard access, tap and long press are available without adding unsafe HTML", () => {
  assert.match(source, /pointerType !== "mouse"/);
  assert.match(source, /pointerType !== "touch"/);
  assert.match(source, /480\)/);
  assert.match(source, /onFocus: \(event\) => \{ if \(event\.currentTarget\.matches\(":focus-visible"\)\) setOpen\(true\); \}/);
  assert.match(source, /React\.createElement\("p", null, entry\.description/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("persona, E.G.O, support and item renderers pass the active owner as glossary scope", () => {
  const persona = readFileSync(resolve(ROOT, "js/PersonaCodex.js"), "utf8");
  const sections = readFileSync(resolve(ROOT, "js/OtherSections.js"), "utf8");
  const items = readFileSync(resolve(ROOT, "js/ItemCodex.js"), "utf8");
  assert.match(persona, /LBT_GLOSSARY_TEXT\(p\.passive_effect, "人格パッシブ:" \+ p\.name\)/);
  assert.match(persona, /LBT_GLOSSARY_TEXT\(d\.effect, "人格ダイス:" \+ p\.name\)/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(ego\.unique_buff, "E\.G\.O固有効果:" \+ ego\.name\)/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(spp\.effect, "サポートパッシブ:" \+ spp\.name\)/);
  assert.match(items, /LBT_GLOSSARY_TEXT\(selected\.effect, "アイテム効果:" \+ selected\.name\)/);
});

test("the same reusable renderer is connected to persona, E.G.O, support, item and custom-skill effects", () => {
  const persona = readFileSync(resolve(ROOT, "js/PersonaCodex.js"), "utf8");
  const sections = readFileSync(resolve(ROOT, "js/OtherSections.js"), "utf8");
  const items = readFileSync(resolve(ROOT, "js/ItemCodex.js"), "utf8");
  const skills = readFileSync(resolve(ROOT, "js/SkillDeck.js"), "utf8");
  assert.match(persona, /LBT_GLOSSARY_TEXT\(p\.passive_effect/);
  assert.match(persona, /LBT_GLOSSARY_TEXT\(d\.effect/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(ego\.unique_buff/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(spp\.effect/);
  assert.match(items, /LBT_GLOSSARY_TEXT\(selected\.effect/);
  assert.match(skills, /LBT_GLOSSARY_TEXT\(skill\.effect/);
});

test("表示元が不明な固有効果は別人格の説明を流用しない", () => {
  const fixture = { normal_personas: [
    { name: "オーナーA", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Aだけの効果文", max: 2 }], skills: [], keywords: [] },
    { name: "オーナーB", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Bだけの別効果文", max: 5 }], skills: [], keywords: [] }
  ], tokui_personas: [], egos: [], support_passives: [], death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: [] };
  const piece = loadGlossary().tokenize("固有印", fixture).find(p => p.term);
  assert.ok(piece, "未知の表示元でも語の候補を検出する");
  assert.equal(piece.entries.length, 0, "所有元が分からない固有定義を他人格から流用しない");
});

test("共通用語の出典はPDF抽出ページの実在内容に対応する", () => {
  const pageText = (n) => { const s = coreCorpus.indexOf("===== PAGE " + n + " ====="); if (s < 0) return ""; const e = coreCorpus.indexOf("===== PAGE ", s + 5); return coreCorpus.slice(s, e < 0 ? coreCorpus.length : e); };
  const p306 = pageText(306), p311 = pageText(311), glossary = loadGlossary().buildGlossary(db);
  for (const term of ["武装", "あなたの盾", "充電力場", "時間貸与", "狂信", "共振", "振動同化", "紅硬", "知識鍛錬"]) {
    assert.ok(p306.includes(term), term);
    const entry = (glossary.get(term) || []).find((row) => row.isRulebook);
    assert.ok(entry, term); assert.equal(entry.source, "基本ルール p.306", term);
  }
  assert.ok(p311.includes("挑発値") && p311.includes("血餐") && p311.includes("自己共振回路"));
  assert.ok((glossary.get("血餐") || []).some(e => e.isRulebook && e.source === "基本ルール p.311"));
});
