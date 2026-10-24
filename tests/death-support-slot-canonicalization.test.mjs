import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `source range exists: ${startMarker}`);
  return source.slice(start, end);
}

const helpers = [
  between("function isDeathSupportPassiveRecord(s) {", "\nfunction cloneJSON(obj) {"),
  between("function deathSupportSlotUnlocked(state) {", "\nfunction supportSlotLimit(state, slot) {"),
  between("function supportSlotLimit(state, slot) {", "\nfunction trimSupportEquippedOverflow("),
  between("function trimSupportEquippedOverflow(", "\nfunction equipRosterSupport(state, uid) {"),
  between("function equipRosterSupport(state, uid) {", "\nfunction projectEquipmentFromRoster(roster) {"),
  between("function projectEquipmentFromRoster(roster) {", "\n/* サポート/精神の equipped"),
  between("function dbSupportCond(entry, field) {", "\n\n/* ブラウザー内の旧セーブ")
].join("\n\n");

function loadEquip({ unlocked = false } = {}) {
  const context = vm.createContext({
    window: {
      DB: {
        death_passives: [{ name: "死亡後専用", cond: "憂鬱×1", effect: "死亡時効果", lp: "5" }],
        support_passives: [{ name: "通常サポート", cond: "傲慢×1", effect: "通常効果", lp: "3" }],
        spirits: []
      },
      LBT_getActiveEnhancements: (state) => state.enhancements || []
    }
  });
  vm.runInContext(`${helpers}\nglobalThis.__equipRosterSupport = equipRosterSupport;`, context);
  return (state, uid) => context.__equipRosterSupport(state, uid);
}

function stateWith(support, enhancements = []) {
  return {
    enhancements,
    supports: [],
    deathSupport: null,
    roster: { supports: [support], spirits: [] }
  };
}

test("旧セーブで通常枠に偽装された公式死亡後パッシブは、未開放時に通常装備へ流れない", () => {
  const equip = loadEquip();
  const state = stateWith({
    uid: "death-1", name: "死亡後専用", slot: "normal", equipped: true,
    cond: "旧条件", effect: "旧効果", lp: "1"
  });
  const next = equip(state, "death-1");
  assert.equal(next.roster.supports[0].slot, "death");
  assert.equal(next.roster.supports[0].equipped, false);
  assert.deepEqual(JSON.parse(JSON.stringify(next.supports)), []);
  assert.equal(next.deathSupport, null);
});

test("旧ラベルの公式死亡後パッシブは、枠開放時に死亡後専用枠へ正規化して装備する", () => {
  const equip = loadEquip();
  const state = stateWith({
    uid: "death-1", name: "死亡後専用", slot: "normal", equipped: false,
    cond: "旧条件", effect: "旧効果", lp: "1"
  }, [{ name: "死亡後パッシブ追加" }]);
  const next = equip(state, "death-1");
  assert.equal(next.roster.supports[0].slot, "death");
  assert.equal(next.roster.supports[0].equipped, true);
  assert.deepEqual(JSON.parse(JSON.stringify(next.supports)), []);
  assert.equal(next.deathSupport.name, "死亡後専用");
  assert.equal(next.deathSupport.effect, "死亡時効果");
});

test("死亡後枠と誤ラベルされた通常サポートは通常枠へ正規化する", () => {
  const equip = loadEquip();
  const state = stateWith({
    uid: "normal-1", name: "通常サポート", slot: "death", equipped: false,
    cond: "旧条件", effect: "旧効果", lp: "1"
  });
  const next = equip(state, "normal-1");
  assert.equal(next.roster.supports[0].slot, "normal");
  assert.equal(next.roster.supports[0].equipped, true);
  assert.equal(next.supports.length, 1);
  assert.equal(next.supports[0].name, "通常サポート");
  assert.equal(next.deathSupport, null);
});
