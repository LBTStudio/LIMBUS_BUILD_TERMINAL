import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(readFileSync(resolve(ROOT, "data/db.json"), "utf8"));
const source = readFileSync(resolve(ROOT, "js/InlineEffectGlossary.js"), "utf8");
const coreCorpus = readFileSync(resolve(ROOT, "data/provenance/core.paragraphs.txt"), "utf8");

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

test("PDF用語集の共有固有バフは原典定義を一件だけ表示する", () => {
  const api = loadGlossary();
  const piece = api.tokenize("自分のあなたの盾を増やす", db, { scope: "人格固有バフ", owner: "南部ツヴァイ協会6課フィクサー" }).find((entry) => entry.term === "あなたの盾");
  assert.ok(piece);
  assert.equal(piece.entries.length, 1);
  assert.equal(piece.entries[0].source, "基本ルール p.306");
  assert.equal(piece.entries[0].category, "バフ／用語集");
  assert.ok(piece.entries[0].description.includes("R終了時"));
  assert.equal(piece.entries.some((entry) => entry.category === "関連効果の例"), false);
});
test("同名固有効果は表示元人格の説明だけを表示する", () => {
  const fixture = { normal_personas: [
    { name: "オーナーA", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Aだけの効果文", max: 2 }], skills: [], keywords: [] },
    { name: "オーナーB", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Bだけの別効果文", max: 5 }], skills: [], keywords: [] }
  ], tokui_personas: [], egos: [], support_passives: [], death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: [] };
  const api = loadGlossary();
  const A = api.tokenize("固有印", fixture, { scope: "人格固有バフ", owner: "オーナーA" }).find(p => p.term);
  const B = api.tokenize("固有印", fixture, { scope: "人格固有バフ", owner: "オーナーB" }).find(p => p.term);
  assert.equal(A.entries.length, 1); assert.equal(A.entries[0].source, "人格：オーナーA");
  assert.ok(A.entries[0].description.includes("Aだけの効果文"));
  assert.equal(B.entries.length, 1); assert.equal(B.entries[0].source, "人格：オーナーB");
  assert.ok(B.entries[0].description.includes("Bだけの別効果文"));
});
test("表示元が不明な固有効果は別人格の説明を流用しない", () => {
  const fixture = { normal_personas: [
    { name: "オーナーA", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Aだけの効果文", max: 2 }], skills: [], keywords: [] },
    { name: "オーナーB", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Bだけの別効果文", max: 5 }], skills: [], keywords: [] }
  ], tokui_personas: [], egos: [], support_passives: [], death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: [] };
  const piece = loadGlossary().tokenize("固有印", fixture).find(p => p.term);
  assert.equal(piece.entries.length, 1);
  assert.equal(piece.entries[0].source, "表示元に対応する定義なし");
  assert.equal(piece.entries[0].description.includes("Aだけの効果文"), false);
  assert.equal(piece.entries[0].description.includes("Bだけの別効果文"), false);
});
test("共通バフ出典はPDF抽出ページに存在する", () => {
  const pageText = (n) => { const s = coreCorpus.indexOf("===== PAGE " + n + " ====="); if (s < 0) return ""; const e = coreCorpus.indexOf("===== PAGE ", s + 5); return coreCorpus.slice(s, e < 0 ? coreCorpus.length : e); };
  const p306 = pageText(306), p311 = pageText(311), glossary = loadGlossary().buildGlossary(db);
  for (const term of ["武装", "あなたの盾", "充電力場", "時間貸与", "狂信", "共振", "振動同化", "紅硬", "知識鍛錬"]) {
    assert.ok(p306.includes(term), term);
    const entry = (glossary.get(term) || []).find((row) => row.canonical);
    assert.ok(entry, term); assert.equal(entry.source, "基本ルール p.306", term);
  }
  assert.ok(p311.includes("挑発値") && p311.includes("血餐") && p311.includes("自己共振回路"));
  assert.ok((glossary.get("血餐") || []).some(e => e.canonical && e.source === "基本ルール p.311"));
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
  const entries = api.buildGlossary(record).get("未知の固有処理") || [];
  assert.ok(entries.some((entry) => entry.category === "本文中の参照" && entry.source.includes("検証用人格") && entry.description.includes("未知の固有処理")));
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
