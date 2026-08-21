import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadRosterDetailBuilder() {
  const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_buildRosterDetailPersona;
}

test("所持品の同期編集人格詳細は同期元DBより直近保存buildを優先する", () => {
  const buildRosterDetailPersona = loadRosterDetailBuilder();
  const official = {
    no: 17,
    name: "同期元の通常人格",
    hp: 100,
    san: 45,
    speed: "1d5",
    bullets: "×",
    res_slash: "普通",
    res_pierce: "抵抗",
    res_blunt: "弱点",
    passive_name: "同期元パッシブ",
    passive_cond: "憤怒x2",
    passive_always: "",
    passive_effect: "同期元効果",
    skills: [{ name: "同期元戦術" }],
    unique_buffs: [{ name: "同期元固有" }],
    keywords: ["同期元キーワード"]
  };
  const entry = {
    mode: "n",
    no: 17,
    build: {
      personaSrc: { name: "直近保存した同期編集人格", keywords: ["編集済みキーワード"] },
      hp: "177",
      san: "61",
      speed: "2d4+1",
      bullets: "9",
      resS: "耐性",
      resP: "普通",
      resB: "抵抗",
      pas: { name: "編集済みパッシブ", cond: "傲慢x3", always: "常時効果", effect: "編集済み効果" },
      skills: [{ rank: "スキル0-2", name: "編集済み派生戦術", type: "貫通反撃", sin: "嫉妬", dice: [{ roll: "2d9", effect: "編集済みダイス効果" }] }],
      uniqueBuffs: [{ name: "編集済み固有", type: "バフ", initial: 2, max: 7, desc: "編集済み固有説明" }]
    }
  };

  const detail = buildRosterDetailPersona(entry, official);

  assert.equal(detail.no, 17);
  assert.equal(detail.name, "直近保存した同期編集人格");
  assert.equal(detail.hp, "177");
  assert.equal(detail.speed, "2d4+1");
  assert.equal(detail.passive_name, "編集済みパッシブ");
  assert.equal(detail.skills[0].name, "編集済み派生戦術");
  assert.equal(detail.unique_buffs[0].name, "編集済み固有");
  assert.deepEqual(JSON.parse(JSON.stringify(detail.keywords)), ["編集済みキーワード"]);
});

test("保存済みbuildがない所持人格詳細は同期元DBをそのまま表示する", () => {
  const buildRosterDetailPersona = loadRosterDetailBuilder();
  const official = { no: 18, name: "同期元の通常人格", hp: 120, skills: [] };

  assert.strictEqual(buildRosterDetailPersona({ mode: "n", no: 18 }, official), official);
});
