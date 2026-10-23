import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const start = source.indexOf("function buildEquippedDetailPersona(state) {");
const end = source.indexOf("const SyncMaxControl", start);
assert.ok(start >= 0 && end > start, "PersonaCodex exposes isolated roster view helpers");

function loadResolver() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + "\nglobalThis.__resolve = resolvePersonaCodexEntry;", context);
  return context.__resolve;
}

test("人格一覧は装備中の同期データを優先し名前・属性・パッシブ・スキルを揃える", () => {
  const resolve = loadResolver();
  const state = {
    personaMode: "n", personaNo: 17,
    personaSrc: { no: 17, name: "同期側の名前", hp: 100, san: 30, speed: "1d3", res_slash: "普通", passive_name: "DB側パッシブ", skills: [] },
    hp: "222", san: "55", speed: "1d5+2", bullets: "×",
    resS: "耐性", resP: "脆弱", resB: "弱点",
    pas: { name: "同期側パッシブ", cond: "条件A", always: "常時B", effect: "効果C" },
    skills: [{ rank: "スキル0", name: "同期側スキル名", type: "斬撃", sin: "憤怒", effect: "同期側の効果", dice: [{ roll: "2d8", effect: "命中時" }] }],
    extraPassives: [{ name: "追加パッシブ", cond: "条件D", always: "常時E", effect: "効果F" }],
    uniqueBuffs: [{ name: "同期側固有", type: "バフ", initial: 1, max: 9, desc: "固有説明" }]
  };
  const entry = { mode: "n", no: 17, displayName: "古い表示名",
    build: { personaSrc: { name: "前のビルド名" }, hp: "100", san: "30", resS: "普通",
      pas: { name: "前のパッシブ", cond: "", always: "", effect: "" },
      skills: [{ rank: "スキル0", name: "前のスキル" }],
      uniqueBuffs: [{ name: "前の固有" }], extraPassives: [] } };
  const view = resolve(entry, { no: 17, name: "DBの名前", skills: [] }, state);
  assert.equal(view.name, "同期側の名前");
  assert.equal(view.hp, "222"); assert.equal(view.san, "55");
  assert.equal(view.res_slash, "耐性"); assert.equal(view.res_pierce, "脆弱"); assert.equal(view.res_blunt, "弱点");
  assert.equal(view.passive_name, "同期側パッシブ"); assert.equal(view.passive_cond, "条件A");
  assert.equal(view.skills[0].name, "同期側スキル名"); assert.equal(view.skills[0].effect, "同期側の効果");
  assert.equal(view.unique_buffs[0].name, "同期側固有"); assert.equal(view.extra_passives[0].name, "追加パッシブ");
});

test("非装備人格は保存ビルド内容と最新の同期名を併せて表示する", () => {
  const resolve = loadResolver();
  const view = resolve({ mode: "n", no: 17, displayName: "最新の同期名",
    build: { personaSrc: { name: "古い保存名" }, hp: "240", san: "65", resS: "弱点",
      pas: { name: "保存パッシブ", cond: "条件", always: "", effect: "保存効果" },
      skills: [{ rank: "スキル0", name: "保存スキル" }],
      uniqueBuffs: [{ name: "保存固有" }], extraPassives: [{ name: "保存追加パッシブ" }] }
  }, { no: 17, name: "DB名", hp: 100 }, { personaMode: null, personaNo: null, personaSrc: null });
  assert.equal(view.name, "最新の同期名"); assert.equal(view.hp, "240");
  assert.equal(view.passive_name, "保存パッシブ"); assert.equal(view.skills[0].name, "保存スキル");
  assert.equal(view.unique_buffs[0].name, "保存固有"); assert.equal(view.extra_passives[0].name, "保存追加パッシブ");
});

test("アカウント移行で古いdisplayNameと新しい保存buildが共存したら新しいbuild名を優先する", () => {
  const resolve = loadResolver();
  const view = resolve({
    mode: "n", no: 17,
    displayName: "旧アカウントの名前",
    updatedAt: 100,
    build: {
      savedAt: 200,
      personaSrc: { name: "最新ビルド側の同期名", hp: 210 },
      hp: "210", san: "55",
      pas: { name: "最新パッシブ", cond: "", always: "", effect: "" },
      skills: [{ rank: "スキル0", name: "最新スキル" }],
      uniqueBuffs: []
    }
  }, { no: 17, name: "DBの名前" }, { personaMode: null, personaNo: null, personaSrc: null });
  assert.equal(view.name, "最新ビルド側の同期名");
  assert.equal(view.skills[0].name, "最新スキル");
});

test("保存ビルドがなくても同期名をDB人格の表示へ適用する", () => {
  const view = loadResolver()({ mode: "n", no: 17, displayName: "手動変更名" }, { no: 17, name: "DB名" }, null);
  assert.equal(view.name, "手動変更名");
});
