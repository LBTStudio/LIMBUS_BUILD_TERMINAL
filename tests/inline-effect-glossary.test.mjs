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

test("common rule glossary includes buffs, neutral statuses, accumulations and special terms without bracket notation", () => {
  const api = loadGlossary();
  const text = "バリアと煙。挑発値、電圧、血餐、自己共振回路、弾丸、爆発。";
  const pieces = api.tokenize(text, db, "人格スキル:検証用人格");
  const terms = pieces.filter((piece) => piece.term);
  for (const term of ["バリア", "煙", "挑発値", "電圧", "血餐", "自己共振回路", "弾丸", "爆発"]) {
    assert.ok(terms.some((piece) => piece.term === term), term + " は角括弧なしで共通辞典から解決する");
  }
  for (const piece of terms) assert.equal(piece.entries.length, 1, piece.term + " は共通定義を1件だけ表示");
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

test("角括弧の有無にかかわらず、未登録の任意語を外部定義へ結び付けない", () => {
  const record = {
    name: "同期人格",
    passive_name: "同期専用パッシブ",
    passive_effect: "同期専用の未知語を得る",
    passive_cond: "",
    passive_always: "",
    unique_buffs: [],
    skills: [],
    extra_passives: []
  };
  const api = loadGlossary();
  const plain = api.tokenize("同期専用の未知語", db, "人格パッシブ:同期人格", record);
  const bracketed = api.tokenize("[同期専用の未知語]", db, "人格パッシブ:同期人格", record);
  assert.equal(plain.filter((piece) => piece.term).length, 0, "定義のない語は角括弧なしでもホバー対象にしない");
  assert.equal(bracketed.filter((piece) => piece.term).length, 0, "角括弧を付けても他の定義を探しに行かない");
  assert.equal(plain.map((piece) => piece.text).join(""), "同期専用の未知語");
  assert.equal(bracketed.map((piece) => piece.text).join(""), "[同期専用の未知語]");
});
test("tokenization prefers the longest term belonging to the active persona", () => {
  const api = loadGlossary();
  const persona = db.normal_personas.find((entry) => (entry.unique_buffs || []).some((buff) => buff.name === "出血保護"));
  assert.ok(persona);
  const text = "出血保護3を得る。対象の出血が4以上";
  const pieces = api.tokenize(text, db, "人格スキル:" + persona.name, persona);
  const terms = pieces.filter((piece) => piece.term).map((piece) => piece.term);
  assert.equal(terms[0], "出血保護");
  assert.ok(terms.includes("出血"));
  assert.equal(pieces.map((piece) => piece.text).join(""), text);
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

test("persona, E.G.O and item renderers pass their active owner; support passive renderers do not use the glossary", () => {
  const persona = readFileSync(resolve(ROOT, "js/PersonaCodex.js"), "utf8");
  const sections = readFileSync(resolve(ROOT, "js/OtherSections.js"), "utf8");
  const items = readFileSync(resolve(ROOT, "js/ItemCodex.js"), "utf8");
  assert.match(persona, /LBT_GLOSSARY_TEXT\(p\.passive_effect, "人格パッシブ:" \+ p\.name, p\)/);
  assert.match(persona, /LBT_GLOSSARY_TEXT\(d\.effect, "人格ダイス:" \+ p\.name, p\)/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(ego\.unique_buff/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(t, \(scope \|\| "E\.G\.O効果"\) \+ ":" \+ ego\.name, ego\)/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(pas\.effect, scope \|\| "人格パッシブ", owner\)/);
  assert.doesNotMatch(sections, /LBT_GLOSSARY_TEXT\(spp\.effect/);
  assert.doesNotMatch(sections, /LBT_GLOSSARY_TEXT\(selected\.effect, \(selectedIsDeath/);
  assert.match(items, /LBT_GLOSSARY_TEXT\(selected\.effect, "アイテム効果:" \+ selected\.name, selected\)/);
});
test("the reusable renderer is connected to persona, E.G.O, item and custom-skill effects but not support passives", () => {
  const persona = readFileSync(resolve(ROOT, "js/PersonaCodex.js"), "utf8");
  const sections = readFileSync(resolve(ROOT, "js/OtherSections.js"), "utf8");
  const items = readFileSync(resolve(ROOT, "js/ItemCodex.js"), "utf8");
  const skills = readFileSync(resolve(ROOT, "js/SkillDeck.js"), "utf8");
  assert.match(persona, /LBT_GLOSSARY_TEXT\(p\.passive_effect/);
  assert.match(persona, /LBT_GLOSSARY_TEXT\(d\.effect/);
  assert.match(sections, /LBT_GLOSSARY_TEXT\(ego\.unique_buff/);
  assert.doesNotMatch(sections, /LBT_GLOSSARY_TEXT\(spp\.effect/);
  assert.doesNotMatch(sections, /LBT_GLOSSARY_TEXT\(selected\.effect, \(selectedIsDeath/);
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

test("別人格の固有効果は角括弧付きでも参照せず、同期後の同一人格データは平文で解決する", () => {
  const fixture = {
    normal_personas: [
      { name: "定義元人格", passive_name: "", passive_effect: "", unique_buffs: [
        { name: "深吸変換", type: "特殊処理", desc: "定義元人格だけの説明", max: 1 }
      ], skills: [], keywords: [] },
      { name: "同期前の人格", passive_name: "", passive_effect: "", unique_buffs: [],
        skills: [], keywords: [] },
      { name: "同期後の人格名", passive_name: "旧パッシブ名", passive_effect: "旧DBの説明", unique_buffs: [
        { name: "旧固有名詞", type: "固有バフ", desc: "同期前に登録されていた説明", max: 1 }
      ], skills: [], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const syncedRecord = {
    name: "同期後の人格名",
    passive_name: "同期専用パッシブ",
    passive_effect: "同期専用の固有名詞を得る",
    passive_cond: "",
    passive_always: "",
    unique_buffs: [
      { name: "同期専用の固有名詞", type: "固有バフ", desc: "同期データ側で登録された定義", max: 3 }
    ],
    skills: [],
    extra_passives: []
  };

  const foreignPlain = api.tokenize("深吸変換", fixture, "人格スキル:同期後の人格名", syncedRecord);
  const foreignBracketed = api.tokenize("[深吸変換]", fixture, "人格スキル:同期後の人格名", syncedRecord);
  assert.equal(foreignPlain.filter((piece) => piece.term).length, 0, "他人格の定義は平文でも流用しない");
  assert.equal(foreignBracketed.filter((piece) => piece.term).length, 0, "他人格の定義は角括弧があっても流用しない");

  const own = api.tokenize("同期専用の固有名詞を得る", fixture, "人格スキル:同期後の人格名", syncedRecord)
    .find((piece) => piece.term === "同期専用の固有名詞");
  assert.ok(own, "同期後の人格自身が持つ定義は平文から認識する");
  assert.equal(own.entries.length, 1);
  assert.equal(own.entries[0].source, "人格：同期後の人格名");
  assert.ok(own.entries[0].description.includes("同期データ側で登録された定義"));
  const stale = api.tokenize("旧パッシブ名と旧固有名詞", fixture, "人格スキル:同期後の人格名", syncedRecord);
  assert.equal(stale.filter((piece) => piece.term).length, 0, "同期後レコードを渡した場合、古いDB名・説明へ戻らない");
});
test("同名固有効果は表示中の人格自身の定義だけを使う", () => {
  const fixture = {
    normal_personas: [
      { name: "人格A", unique_buffs: [{ name: "同名効果", type: "特殊処理", desc: "Aの意味", max: 1 }], skills: [], keywords: [] },
      { name: "人格B", unique_buffs: [{ name: "同名効果", type: "特殊処理", desc: "Bの意味", max: 2 }], skills: [], keywords: [] }
    ],
    tokui_personas: [], egos: [], support_passives: [], death_passives: [],
    normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const api = loadGlossary();
  const a = api.tokenize("同名効果を得る", fixture, "人格スキル:人格A", fixture.normal_personas[0])
    .find((piece) => piece.term === "同名効果");
  const b = api.tokenize("同名効果を得る", fixture, "人格スキル:人格B", fixture.normal_personas[1])
    .find((piece) => piece.term === "同名効果");
  assert.ok(a && b);
  assert.equal(a.entries.length, 1);
  assert.equal(b.entries.length, 1);
  assert.ok(a.entries[0].description.includes("Aの意味"));
  assert.ok(b.entries[0].description.includes("Bの意味"));
  assert.ok(!a.entries[0].description.includes("Bの意味") && !b.entries[0].description.includes("Aの意味"));

  const noOwner = api.tokenize("同名効果", fixture, "人格スキル:別人格");
  assert.equal(noOwner.filter((piece) => piece.term).length, 0, "所有者が一致しなければ同名定義を出さない");
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


test("DB未登録の同期専用固有名詞は、同期人格内のデータ定義から平文でホバーできる", () => {
  const fixture = {
    normal_personas: [], tokui_personas: [], egos: [], support_passives: [],
    death_passives: [], normal_enhancements: [], special_enhancements: [], spirits: [], items: []
  };
  const record = {
    name: "同期人格",
    passive_name: "同期パッシブ",
    passive_effect: "同期専用の固有名詞を得る。",
    unique_buffs: [{ name: "同期専用の固有名詞", type: "固有バフ", desc: "同期人格にのみ存在する効果", max: 4 }],
    skills: [],
    extra_passives: []
  };
  const api = loadGlossary();
  const text = "自分の状態を同期専用の固有名詞へ変換する。";
  const before = JSON.stringify(record);
  const pieces = api.tokenize(text, fixture, "人格スキル:同期人格", record);
  const termPiece = pieces.find((piece) => piece.term === "同期専用の固有名詞");
  assert.ok(termPiece, "角括弧のない同期固有名詞を現在人格の定義から認識する");
  assert.equal(termPiece.entries.length, 1);
  assert.equal(termPiece.entries[0].source, "人格：同期人格");
  assert.ok(termPiece.entries[0].description.includes("同期人格にのみ存在する効果"));
  assert.equal(api.buildGlossary(fixture).has("同期専用の固有名詞"), false, "同期用定義で共有DBを変更しない");
  assert.equal(JSON.stringify(record), before, "同期データを変更しない");
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
