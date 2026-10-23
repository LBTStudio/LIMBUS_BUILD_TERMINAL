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
  const api = loadGlossary();
  const entries = api.buildGlossary(db).get("百足の毒") || [];
  assert.ok(entries.some((entry) => entry.category === "E.G.O固有効果" && entry.source.includes(ego.name) && entry.description.includes("R終了時")));
  const scoped = api.tokenize("百足の毒", db, { ownerType: "ego", ownerName: ego.name });
  assert.equal(scoped[0].term, "百足の毒");
  assert.ok(scoped[0].entries.every((entry) => entry.ownerName === ego.name));
  assert.equal(api.tokenize("百足の毒", db, { ownerType: "ego", ownerName: "別E.G.O" })[0].term, null);
});

test("identity-unique buff definitions are scoped to the active persona", () => {
  const persona = db.normal_personas.find((entry) => (entry.unique_buffs || []).some((buff) => buff.name === "出血保護"));
  assert.ok(persona, "reference identity exists");
  const api = loadGlossary();
  const entries = api.buildGlossary(db).get("出血保護") || [];
  assert.ok(entries.some((entry) => entry.source.includes(persona.name) && entry.description.includes("最大値")));
  const scoped = api.tokenize("出血保護", db, { ownerType: "persona", ownerName: persona.name });
  assert.equal(scoped[0].term, "出血保護");
  assert.ok(scoped[0].entries.every((entry) => entry.source.includes(persona.name)));
  assert.equal(api.tokenize("出血保護", db, { ownerType: "persona", ownerName: "別人格" })[0].term, null);
});

test("official common definitions take precedence over identity copies; examples are absent", () => {
  const api = loadGlossary();
  const weapon = api.tokenize("武装を得る", db, { ownerType: "persona", ownerName: "N社握る者" });
  const entry = weapon.find((part) => part.term);
  assert.equal(entry?.term, "武装");
  assert.equal(entry?.entries.length, 1);
  assert.equal(entry?.entries[0].source, "基本ルール p.306");
  assert.equal(entry?.entries[0].official, true);
  const bleeding = api.tokenize("出血を付与", db, { ownerType: "persona", ownerName: "任意の人格" }).find((part) => part.term);
  assert.equal(bleeding?.entries[0].source, "基本ルール p.307");
  assert.doesNotMatch(source, /関連効果の例/);
  assert.doesNotMatch(source, /entries\.length > 5/);
});

test("unknown bracketed text is not promoted to a glossary definition", () => {
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
  assert.equal(api.buildGlossary(record).has("未知の固有処理"), false);
  assert.equal(api.tokenize("未知の固有処理", record, { ownerType: "persona", ownerName: "検証用人格" })[0].term, null);
  assert.equal(JSON.stringify(record), before);
});

test("tokenization prefers the longest known phrase without dropping surrounding text", () => {
  const api = loadGlossary();
  const persona = db.normal_personas.find((entry) => (entry.unique_buffs || []).some((buff) => buff.name === "出血保護"));
  const pieces = api.tokenize("出血保護3を得る。対象の出血が4以上", db, { ownerType: "persona", ownerName: persona.name });
  const terms = pieces.filter((piece) => piece.term).map((piece) => piece.term);
  assert.equal(terms[0], "出血保護");
  assert.ok(terms.includes("出血"));
  assert.equal(pieces.map((piece) => piece.text).join(""), "出血保護3を得る。対象の出血が4以上");
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
