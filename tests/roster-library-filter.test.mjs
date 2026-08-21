import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadRosterLibrary() {
  const context = {
    window: { LBT_PDF_KEYWORD_ORDER: [] },
    React: {},
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8"), context);
  return context.window.LBT_rosterLibrary;
}

test("所持人格は同期ランクまたは同期MAXがあれば同期済みとして判定する", () => {
  const { isRosterPersonaSynced, rosterPersonaMatchesSyncFilters } = loadRosterLibrary();
  assert.equal(isRosterPersonaSynced({ syncRank: "00" }), true);
  assert.equal(isRosterPersonaSynced({ syncMax: true }), true);
  assert.equal(isRosterPersonaSynced({ syncRank: null, syncMax: false }), false);
  assert.equal(rosterPersonaMatchesSyncFilters({ syncRank: "0" }, "synced", "0"), true);
  assert.equal(rosterPersonaMatchesSyncFilters({ syncRank: "00" }, "synced", "0"), false);
  assert.equal(rosterPersonaMatchesSyncFilters({ syncMax: true }, "synced", "max"), true);
  assert.equal(rosterPersonaMatchesSyncFilters({ syncRank: null }, "unsynced", "all"), true);
});

test("所持ライブラリは追加順・名前順・番号順・同期順へ並べ替えられる", () => {
  const { sortRosterLibraryItems } = loadRosterLibrary();
  const rows = [
    { name: "ベータ", addedIndex: 0, synced: false, entry: { mode: "n", no: 20, syncRank: null } },
    { name: "アルファ", addedIndex: 1, synced: true, entry: { mode: "n", no: 10, syncRank: "00" } },
  ];
  const names = (sort) => Array.from(sortRosterLibraryItems(rows, sort, "personas"), (row) => row.name).join("|");
  assert.equal(names("added"), "ベータ|アルファ");
  assert.equal(names("name"), "アルファ|ベータ");
  assert.equal(names("number"), "アルファ|ベータ");
  assert.equal(names("sync"), "アルファ|ベータ");
});

test("所持一覧は不要な規定値カテゴリを表示せず、同期状態・同期ランク別フィルタを持つ", () => {
  const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\["draft", "既定値"\]/);
  assert.doesNotMatch(source, /\["all", "同期すべて"\]/);
  assert.match(source, /\["all", "同期・MAXすべて"\]/);
  assert.match(source, /aria-label": "同期・MAXフィルタ"/);
  assert.match(source, /\["synced", "同期済み"\]/);
  assert.match(source, /\["unsynced", "未同期"\]/);
  assert.match(source, /\["0", "同期0"\]/);
  assert.match(source, /\["00", "同期00"\]/);
  assert.match(source, /\["000", "同期000"\]/);
  assert.match(source, /\["max", "同期MAX"\]/);
});

test("所持画面の同期編集人格はDB同期元より保存済みbuildのスキル・固有・パッシブを優先する", () => {
  const { resolveRosterPersonaSource } = loadRosterLibrary();
  const dbSource = {
    no: 17,
    name: "同期元人格",
    hp: 100,
    passive_name: "同期元パッシブ",
    skills: [{ name: "同期元スキル" }],
    unique_buffs: [{ name: "同期元固有" }]
  };
  const entry = {
    mode: "n",
    no: 17,
    build: {
      personaSrc: { name: "同期編集人格" },
      hp: "177",
      pas: { name: "編集済みパッシブ", cond: "傲慢x3", always: "常時効果", effect: "編集済み効果" },
      skills: [{ name: "編集済みスキル", rank: "スキル0-2", dice: [{ roll: "2d9", effect: "編集済みダイス効果" }] }],
      uniqueBuffs: [{ name: "編集済み固有", desc: "編集済み固有説明" }]
    }
  };
  const detail = resolveRosterPersonaSource(entry, dbSource);
  assert.equal(detail.name, "同期編集人格");
  assert.equal(detail.hp, "177");
  assert.equal(detail.passive_name, "編集済みパッシブ");
  assert.equal(detail.skills[0].name, "編集済みスキル");
  assert.equal(detail.skills[0].dice[0].effect, "編集済みダイス効果");
  assert.equal(detail.unique_buffs[0].name, "編集済み固有");
});
