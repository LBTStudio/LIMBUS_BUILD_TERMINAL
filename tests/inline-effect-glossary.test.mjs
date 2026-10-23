import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(readFileSync(resolve(ROOT, "data/db.json"), "utf8"));
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
  assert.match(persona, /LBT_GLOSSARY_TEXT\(p\.passive_effect, \{ ownerType: "persona", ownerName: p\.name \}\)/);
  assert.match(persona, /LBT_GLOSSARY_TEXT\(d\.effect/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(ego\.unique_buff, \{ ownerType: "ego", ownerName: ego\.name/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(spp\.effect, \{ ownerType: "support", ownerName: spp\.name \}\)/);
  assert.match(items, /LBT_GLOSSARY_TEXT\(selected\.effect, \{ ownerType: "item", ownerName: selected\.name \}\)/);
  assert.match(skills, /LBT_GLOSSARY_TEXT\(skill\.effect, \{ ownerType: "customSkill", ownerName: skill\.name \}\)/);
});


test("same-named persona unique buffs resolve to the owner in the active persona context", () => {
  const personas = [...db.normal_personas, ...db.tokui_personas];
  const byName = new Map();
  let pair = null;
  for (const p of personas) for (const buff of p.unique_buffs || []) {
    if (!byName.has(buff.name)) byName.set(buff.name, []);
    byName.get(buff.name).push({ persona: p, buff });
  }
  for (const [name, owners] of byName) {
    if (owners.length > 1 && owners[0].persona.name !== owners[1].persona.name) {
      pair = { name, first: owners[0], second: owners[1] }; break;
    }
  }
  assert.ok(pair, "DBには同名の人格固有バフが存在する");
  const api = loadGlossary();
  for (const selected of [pair.first, pair.second]) {
    const piece = api.tokenize(selected.buff.name, db, { ownerType: "persona", ownerName: selected.persona.name })
      .find((part) => part.term === selected.buff.name);
    assert.ok(piece);
    assert.equal(piece.entries.length, 1);
    assert.equal(piece.entries[0].ownerName, selected.persona.name);
    assert.ok(piece.entries[0].description.includes(selected.buff.desc));
  }
});

test("generic buffs and debuffs show one PDF-backed rules definition, not identity examples", () => {
  const api = loadGlossary();
  const core = readFileSync(resolve(ROOT, "data/provenance/core.txt"), "utf8");
  const ctx = { ownerType: "persona", ownerName: "検証用の人格" };
  for (const item of [
    { term: "パワー", page: 304, needle: "攻撃スキル威力" },
    { term: "出血", page: 307, needle: "ダイスロール時" },
    { term: "煙", page: 311, needle: "与えるダメージ" },
    { term: "弾丸", page: 312, needle: "特定戦術の能力が向上" }
  ]) {
    const piece = api.tokenize(item.term, db, ctx).find((part) => part.term === item.term);
    assert.ok(piece, item.term);
    assert.equal(piece.entries.length, 1, item.term);
    assert.equal(piece.entries[0].source, "基本ルール p." + item.page, item.term);
    assert.ok(piece.entries[0].description.includes(item.needle), item.term);
    const heading = "===== PAGE " + item.page + " =====";
    const start = core.indexOf(heading), end = core.indexOf("===== PAGE ", start + heading.length);
    assert.ok(start >= 0 && core.slice(start, end >= 0 ? end : core.length).includes(item.term),
      item.term + " is in the PDF-derived source corpus");
  }
});

test("glossary resolution never emits related-effect example lists", () => {
  const api = loadGlossary();
  const glossary = api.buildGlossary(db);
  for (const entries of glossary.values()) assert.equal(entries.some((entry) => entry.category === "関連効果の例"), false);
  assert.doesNotMatch(source, /entries\.slice\(0, 5\)|ほか .*件の参照があります/);
  assert.equal(api.tokenize("パワー", db)[0].entries.length, 1);
});
