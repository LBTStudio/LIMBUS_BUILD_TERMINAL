import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   支援パッシブは購入/配布を区別して課帳する。

    Lama: パッシブは DB に価格（support_passives.lp / death_passives.shards）がある。
   実データでも「サポパ「○○」を購入したのでLP-25」と書いた人がいる一方、
   シナリオ報酬で得るものもある。区別せずに常に課すと帳が実際より膨らむ。
   人格の ADD_ROSTER と同じ契約にする（purchase が false なら明細を立てない）。
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadReducer() {
  const w = {
    DB: {
      support_passives: db.support_passives,
      death_passives: db.death_passives,
      spirits: db.spirits,
      normal_personas: db.normal_personas,
      tokui_personas: db.tokui_personas
    },
    LBT_PDF_KEYWORD_ORDER: []
  };
  const c = { window: w, console, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8"), c);
  vm.runInContext(readFileSync(new URL("../js/roster-resolver.js", import.meta.url), "utf8"), c);
  vm.runInContext(readFileSync(new URL("../js/state.js", import.meta.url), "utf8"), c);
  return c.window;
}

const w = loadReducer();
const reducer = w.appReducer;

const base = () => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
  entries: [],
  inventory: []
});

const PASSIVE = db.support_passives[0].name;

test("支援パッシブは購入なら明細が立つ", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE }, purchase: true });
  assert.equal(next.roster.supports.length, 1, "所持へ入る");
  assert.equal(next.entries.length, 1, "購入なら明細が1件");
  assert.equal(next.entries[0].kind, "support");
  assert.ok(Number(next.entries[0].cost.lp) > 0, "DB 価格が乗る");
});

test("支援パッシブは配布なら明細が立たない", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE }, purchase: false });
  assert.equal(next.roster.supports.length, 1, "所持には入る");
  assert.equal(next.entries.length, 0, "配布なら課金しない");
});

test("purchase を省略した従来経路は購入のまま（挙動不変）", () => {
  const next = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: PASSIVE } });
  assert.equal(next.entries.length, 1, "明示購入の画面は Traditional通り課帳される");
  assert.ok(Number(next.entries[0].cost.lp) > 0);
});


test("装備対象が所持一覧の先頭にあっても、通常スロットの置換では操作対象を装備状態に残す", () => {
  const target = { uid: "target", name: "対象パッシブ", slot: "normal", equipped: false, cond: "", effect: "", lp: "" };
  const old1 = { uid: "old-1", name: "既存パッシブ1", slot: "normal", equipped: true, cond: "", effect: "", lp: "" };
  const old2 = { uid: "old-2", name: "既存パッシブ2", slot: "normal", equipped: true, cond: "", effect: "", lp: "" };
  const initial = {
    ...base(),
    roster: { personas: [], egos: [], supports: [target, old1, old2], spirits: [] }
  };
  const next = reducer(initial, { type: "ADD_SUPPORT", spp: { name: target.name } });
  const equipped = next.roster.supports.filter((entry) => entry.equipped);
  assert.equal(next.roster.supports.find((entry) => entry.uid === target.uid).equipped, true);
  assert.equal(equipped.length, 2, "通常スロットの上限2枠を守る");
  assert.equal(next.supports.some((entry) => entry.name === target.name), true, "ビルドの投影にも対象が残る");
});

test("死亡後専用スロットも配列順に関係なく操作対象を装備状態に残す", () => {
  const target = { uid: "death-target", name: "対象死亡後パッシブ", slot: "death", equipped: false, cond: "", effect: "", lp: "" };
  const old = { uid: "death-old", name: "既存死亡後パッシブ", slot: "death", equipped: true, cond: "", effect: "", lp: "" };
  const initial = {
    ...base(),
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }],
    roster: { personas: [], egos: [], supports: [target, old], spirits: [] }
  };
  const next = reducer(initial, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: target.uid, equipped: true });
  assert.equal(next.roster.supports.find((entry) => entry.uid === target.uid).equipped, true);
  assert.equal(next.roster.supports.find((entry) => entry.uid === old.uid).equipped, false);
  assert.equal(next.deathSupport?.name, target.name, "死亡後専用スロットの投影も対象へ切り替わる");
});

test("死亡後専用パッシブは解除後の枠から装備できず、スロット移動も拒否する", () => {
  const death = { uid: "locked-death", name: "ロック中の死亡後パッシブ", slot: "death", equipped: false, cond: "", effect: "", lp: "" };
  const normal = { uid: "normal-to-death", name: "通常パッシブ", slot: "normal", equipped: false, cond: "", effect: "", lp: "" };
  const initial = { ...base(), roster: { personas: [], egos: [], supports: [death, normal], spirits: [] } };

  const directEquip = reducer(initial, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: death.uid, equipped: true });
  assert.equal(directEquip.roster.supports.find((entry) => entry.uid === death.uid).equipped, false);
  assert.equal(directEquip.deathSupport ?? null, null);

  const addSupport = reducer(initial, { type: "ADD_SUPPORT", spp: { name: death.name } });
  assert.equal(addSupport.roster.supports.find((entry) => entry.uid === death.uid).equipped, false);
  assert.equal(addSupport.deathSupport ?? null, null);

  const moveToDeath = reducer(initial, { type: "SET_ROSTER_SUPPORT_SLOT", uid: normal.uid, slot: "death" });
  assert.equal(moveToDeath.roster.supports.find((entry) => entry.uid === normal.uid).slot, "normal");
  assert.equal(moveToDeath.roster.supports.find((entry) => entry.uid === normal.uid).equipped, false);
});

test("旧セーブの死亡後パッシブはスロット分類だけ正規化し、装備状態は保持する", () => {
  const name = db.death_passives[0].name;
  for (const slot of ["normal", undefined]) {
    const entry = { uid: "legacy-death-" + String(slot), name, equipped: true, cond: "", effect: "", lp: "" };
    if (slot !== undefined) entry.slot = slot;
    const normalized = w.LBT_normalizeStateShape({
      ...base(),
      roster: { personas: [], egos: [], supports: [entry], spirits: [] }
    });
    const migrated = normalized.roster.supports.find((row) => row.uid === entry.uid);
    assert.equal(migrated.slot, "death");
    assert.equal(migrated.equipped, true, "旧ビルドの装備状態を無断で解除しない");
    assert.equal(normalized.deathSupport?.name, name, "装備済みの投影も保持する");
  }
});

test("取り外した最後の死亡後スロット強化は、装備中の死亡後パッシブも解除する", () => {
  const death = { uid: "equipped-death", name: "装備中の死亡後パッシブ", slot: "death", equipped: false, cond: "", effect: "", lp: "" };
  const initial = {
    ...base(),
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }],
    roster: { personas: [], egos: [], supports: [death], spirits: [] }
  };
  const equipped = reducer(initial, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: death.uid, equipped: true });
  assert.equal(equipped.deathSupport?.name, death.name);
  const locked = reducer(equipped, { type: "REMOVE_ENHANCEMENT", id: "death-unlock" });
  assert.equal(locked.roster.supports.find((entry) => entry.uid === death.uid).equipped, false);
  assert.equal(locked.deathSupport, null);
});

test("人格と同じ契約になっている", () => {
  const bought = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: db.normal_personas[0].no, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(bought.entries.length, 1);
  const given = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: db.normal_personas[0].no });
  assert.equal(given.entries.length, 0);
});

/* --- 取り込み側の配線 --- */

test("取り込みは source が buy のときだけ購入として課帳する", () => {
  const source = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");
  assert.match(source, /type: "ADD_ROSTER_SUPPORT",[\s\S]{0,200}?purchase: item\.source === "buy"/);
});