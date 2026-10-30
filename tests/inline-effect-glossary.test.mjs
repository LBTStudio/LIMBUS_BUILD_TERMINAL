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
  const sourceText = record.normal_personas[0].passive_effect;
  const sourcePiece = api.tokenize(sourceText, record, "人格パッシブ:検証用人格").find((piece) => piece.term === "未知の固有処理");
  assert.ok(sourcePiece, "参照元の本文にある角括弧付きの語をホバー化する");
  assert.equal(sourcePiece.entries.length, 1, "参照元の人格の本文を1件だけ表示する");
  assert.ok(sourcePiece.entries[0].category === "本文中の参照" && sourcePiece.entries[0].source.includes("検証用人格") && sourcePiece.entries[0].description.includes("未知の固有処理"));
  const unrelated = api.tokenize("未知の固有処理", record, "人格パッシブ:別人格");
  assert.equal(unrelated.filter((piece) => piece.term === "未知の固有処理").length, 0,
    "別人格の本文に明示参照がない場合はホバー化しない");
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

test("desktop glossary popover stays near the mouse cursor and flips at viewport edges", () => {
  assert.ok(source.includes("const lastPointerPosition = React.useRef(null);"));
  assert.ok(source.includes("lastPointerPosition.current = { x: event.clientX, y: event.clientY };"));
  assert.ok(source.includes("onPointerMove: trackPointer"));
  assert.ok(source.includes('const pointer = lastPointerType.current === "mouse" ? lastPointerPosition.current : null;'));
  assert.ok(source.includes("let left = pointer.x + gap;"));
  assert.ok(source.includes("left = pointer.x - width - gap;"));
  assert.ok(source.includes("let top = pointer.y + gap;"));
  assert.ok(source.includes("top = pointer.y - estimatedHeight - gap;"));
  assert.ok(source.includes("Keyboard and touch users retain the predictable anchor-based placement."));
});

test("PC hover, keyboard access, tap and long press are available without adding unsafe HTML", () => {
  assert.match(source, /pointerType !== "mouse"/);
  assert.match(source, /pointerType !== "touch"/);
  assert.match(source, /480\)/);
  assert.ok(source.includes('onFocus: (event) => {'));
  assert.ok(source.includes('event.currentTarget.matches(":focus-visible")'));
  assert.ok(source.includes('lastPointerType.current = "keyboard";'));
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

test("表示元が不明な固有効果は別人格の説明を流用せず、ホバー候補にも残さない", () => {
  const fixture = { normal_personas: [
    { name: "オーナーA", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Aだけの効果文", max: 2 }], skills: [], keywords: [] },
    { name: "オーナーB", unique_buffs: [{ name: "固有印", type: "バフ", desc: "Bだけの別効果文", max: 5 }], skills: [], keywords: [] }
  ], tokui_personas: [], egos: [], support_passives: [], death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: [] };
  const pieces = loadGlossary().tokenize("固有印", fixture);
  assert.equal(pieces.filter((piece) => piece.term).length, 0, "所有元が不明な固有定義を他人格から流用しない");
  assert.equal(pieces.map((piece) => piece.text).join(""), "固有印", "元のテキストは保持する");
});
test("desktop click does not toggle closed a glossary popover already opened by hover", () => {
  assert.ok(source.includes('if (lastPointerType.current === "mouse") {'));
  assert.ok(source.includes('setOpen(true);\n        return;'));
  assert.ok(source.includes("Desktop hover may have opened the popover before the click lands"));
});

test("他人格への固有効果参照は角括弧で明示された場合だけ解決する", () => {
  const fixture = {
    normal_personas: [
      { name: "定義元人格", passive_name: "", passive_effect: "", unique_buffs: [
        { name: "深吸変換", type: "特殊処理", desc: "呼吸を別の呼吸状態へ変換する。", max: 1 }
      ], skills: [], keywords: [] },
      { name: "参照元人格", passive_name: "", passive_effect: "", unique_buffs: [],
        skills: [{ name: "参照スキル", effect: "自分の呼吸を[深吸変換]へ変更する。", dice: [] }], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const effect = "自分の呼吸を[深吸変換]へ変更する。";
  const fromPersona = api.tokenize(effect, fixture, "人格スキル:参照元人格").find((piece) => piece.term === "深吸変換");
  assert.ok(fromPersona);
  assert.equal(fromPersona.entries.length, 1);
  assert.equal(fromPersona.entries[0].source, "人格：定義元人格");
  assert.ok(fromPersona.entries[0].description.includes("呼吸を別の呼吸状態へ変換する"));

  const incidental = api.tokenize("深吸変換", fixture, "人格スキル:参照元人格");
  assert.equal(incidental.filter((piece) => piece.term).length, 0, "明示参照のない同語は別人格の説明を表示しない");
});
test("同名効果の明示参照は意味が曖昧なら参照元の本文を表示する", () => {
  const fixture = {
    normal_personas: [
      { name: "定義元A", passive_name: "", passive_effect: "", unique_buffs: [
        { name: "同名効果", type: "特殊処理", desc: "Aの意味", max: 1 }
      ], skills: [], keywords: [] },
      { name: "定義元B", passive_name: "", passive_effect: "", unique_buffs: [
        { name: "同名効果", type: "特殊処理", desc: "Bの意味", max: 2 }
      ], skills: [], keywords: [] },
      { name: "参照元人格", passive_name: "", passive_effect: "", unique_buffs: [],
        skills: [{ name: "参照スキル", effect: "同名効果を[同名効果]として扱う。", dice: [] }], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const effect = "同名効果を[同名効果]として扱う。";
  const result = loadGlossary().tokenize(effect, fixture, "人格スキル:参照元人格").find((piece) => piece.term === "同名効果");
  assert.ok(result);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].source, "人格スキル:参照元人格");
  assert.ok(result.entries[0].description.includes("同名効果を[同名効果]として扱う"));
  assert.ok(!result.entries[0].description.includes("Aの意味") && !result.entries[0].description.includes("Bの意味"));
});
test("サポートパッシブは辞書にも本文ホバーにも混入しない", () => {
  const fixture = {
    normal_personas: [], tokui_personas: [], egos: [],
    support_passives: [
      { name: "栄光", cond: "怠惰x2 共鳴", effect: "振動爆発時、次のRに混乱保護3を得る" },
      { name: "参照専用パッシブ", cond: "", effect: "自分を[サポート側だけの参照語]へ変える" }
    ],
    death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const glossary = api.buildGlossary(fixture);
  assert.equal(glossary.has("栄光"), false, "サポートパッシブ名を全体辞書に登録しない");
  assert.ok(db.support_passives.some((item) => item.name === "栄光"), "実DBにも栄光のサポートパッシブがある");
  const realGloryEntries = api.buildGlossary(db).get("栄光") || [];
  assert.equal(realGloryEntries.some((entry) => entry.category === "サポートパッシブ"), false, "実DBからもサポートパッシブの説明を採用しない");
  assert.equal(glossary.has("サポート側だけの参照語"), false, "サポートパッシブ本文の参照語も登録しない");
  const syncedText = api.tokenize("同期人格の名称：栄光を継ぐ者", fixture, "人格スキル:同期人格");
  assert.equal(syncedText.filter((piece) => piece.term === "栄光").length, 0, "同期人格の本文にサポート側の栄光を混ぜない");
  const supportText = api.tokenize("自分を[サポート側だけの参照語]へ変える", fixture, "サポートパッシブ:参照専用パッシブ");
  assert.equal(supportText.filter((piece) => piece.term).length, 0, "サポートパッシブの本文自体もホバー対象外");
  assert.equal(supportText.map((piece) => piece.text).join(""), "自分を[サポート側だけの参照語]へ変える");
});

test("「集中攻撃」の「集中」は終止符事務所代表のパッシブ説明へ誤接続しない", () => {
  const fixture = {
    normal_personas: [
      { name: "終止符事務所代表", passive_name: "集中", passive_effect: "舞台開始時、最初のRのスキル威力+3。",
        unique_buffs: [], skills: [], keywords: [] },
      { name: "西部センク協会3課フィクサー", passive_name: "クードロア",
        passive_effect: "通常スキルで攻撃的中時、集中攻撃-○○1を付与する。",
        unique_buffs: [], skills: [{ name: "連続攻撃", effect: "集中攻撃-○○を付与する。", dice: [] }], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const text = "集中攻撃-○○を付与する。";
  const scope = "人格スキル:西部センク協会3課フィクサー";
  const pieces = api.tokenize(text, fixture, scope);
  assert.equal(pieces.filter((piece) => piece.term === "集中").length, 0, "複合語の一部をパッシブ名として扱わない");
  assert.equal(pieces.map((piece) => piece.text).join(""), text);

  // 同じ本文内の別の場所に明示参照があっても、複合語の「集中」には適用しない。
  const mixed = api.tokenize("集中攻撃-○○を付与し、[集中]を別途参照する。", fixture, scope);
  const matchedConcentration = mixed.filter((piece) => piece.term === "集中");
  assert.equal(matchedConcentration.length, 1, "角括弧の内側にある参照だけをホバー化");
  assert.equal(matchedConcentration[0].entries[0].source, "人格：終止符事務所代表");
  assert.equal(mixed.map((piece) => piece.text).join(""), "集中攻撃-○○を付与し、[集中]を別途参照する。");

  const ownPassive = api.tokenize("集中", fixture, "人格パッシブ:終止符事務所代表").find((piece) => piece.term === "集中");
  assert.ok(ownPassive, "パッシブ名そのものは本人のスコープ内で引き続き解決できる");
  assert.equal(ownPassive.entries[0].source, "人格：終止符事務所代表");

  // リポジトリの実DBを用いた再現確認
  const realSenku = db.normal_personas.find((persona) => persona.name === "西部センク協会3課フィクサー");
  assert.ok(realSenku?.passive_effect.includes("集中攻撃"), "実DBにセンク系の集中攻撃パッシブがある");
  const realPieces = api.tokenize(realSenku.passive_effect, db, "人格パッシブ:" + realSenku.name);
  assert.equal(realPieces.filter((piece) => piece.term === "集中").length, 0, "実DBでも集中攻撃の部分一致から別人格パッシブを表示しない");
});

test("glossary terms have a visible underline and warmer contrast in effect prose", () => {
  const css = readFileSync(resolve(ROOT, "assets/inline-effect-glossary.css"), "utf8");
  assert.match(css, /border-bottom: 1px dotted rgba\(244, 213, 138, \.98\)/);
  assert.match(css, /text-decoration: none/);
  assert.match(css, /background: rgba\(214, 173, 83, \.17\)/);
  assert.match(css, /border-bottom-style: solid/);
  assert.match(css, /border-radius: 2px/);
});


test("bracketed terms from synced/custom effect text are hoverable even when absent from the DB", () => {
  const fixture = {
    normal_personas: [], tokui_personas: [], egos: [], support_passives: [],
    death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const text = "自分の状態を[同期専用の固有名詞]へ変換する。";
  const before = JSON.stringify(fixture);
  const pieces = api.tokenize(text, fixture, "人格スキル:同期人格");
  const termPiece = pieces.find((piece) => piece.term === "同期専用の固有名詞");
  assert.ok(termPiece, "同期人格のDB未登録・角括弧付き語が本文中で認識される");
  assert.equal(termPiece.entries.length, 1);
  assert.equal(termPiece.entries[0].source, "人格スキル:同期人格");
  assert.ok(termPiece.entries[0].description.includes("自分の状態を[同期専用の固有名詞]へ変換する"));
  assert.equal(api.buildGlossary(fixture).has("同期専用の固有名詞"), false, "一時的な参照でグローバル辞書を変更しない");
  assert.equal(JSON.stringify(fixture), before, "DBデータを変更しない");
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
