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

test("死亡後サポートの手動編集は所持ライブラリへ同期し、再投影後も保持する", () => {
  const initial = {
    ...base(),
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }],
    deathSupport: {
      id: "custom-death",
      name: "手動追加サポート",
      cond: "旧条件",
      effect: "旧効果",
      lp: "1"
    },
    roster: {
      personas: [], egos: [],
      supports: [
        {
          uid: "custom-death",
          name: "手動追加サポート",
          cond: "旧条件",
          effect: "旧効果",
          lp: "1",
          slot: "death",
          equipped: true,
          resultId: null,
          addedAt: 1,
          notes: ""
        },
        {
          uid: "normal-support",
          name: "通常サポート",
          cond: "",
          effect: "",
          lp: "3",
          slot: "normal",
          equipped: false,
          resultId: null,
          addedAt: 2,
          notes: ""
        }
      ],
      spirits: []
    }
  };

  const edited = reducer(initial, {
    type: "PATCH_DEATH_SUPPORT",
    patch: {
      name: "編集後サポート",
      cond: "新条件",
      effect: "新効果",
      lp: "7",
      slot: "normal",
      equipped: false,
      uid: "forged-uid",
      resultId: "forged-result"
    }
  });
  const row = edited.roster.supports.find((entry) => entry.uid === "custom-death");
  assert.equal(row.name, "編集後サポート");
  assert.equal(row.cond, "新条件");
  assert.equal(row.effect, "新効果");
  assert.equal(row.lp, "7");
  assert.equal(row.slot, "death", "手動編集で通常枠へ降格できない");
  assert.equal(row.equipped, true);
  assert.equal(row.uid, "custom-death");
  assert.equal(row.resultId, null);

  assert.equal(row.deathSlotManual, true, "カタログ外の手動割当であることを明示");
  const reprojected = reducer(edited, { type: "ADD_SUPPORT", spp: { name: "通常サポート" } });
  assert.equal(reprojected.deathSupport?.name, "編集後サポート");
  assert.equal(reprojected.deathSupport?.cond, "新条件");
  assert.equal(reprojected.deathSupport?.effect, "新効果");
  assert.equal(reprojected.deathSupport?.lp, "7");
  assert.equal(reprojected.roster.supports.find((entry) => entry.uid === "custom-death").slot, "death");
});

test("死亡後サポートの手動追加は空の編集フォームから所持へ同期する", () => {
  const initial = {
    ...base(),
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }]
  };
  const draft = reducer(initial, {
    type: "SET_DEATH_SUPPORT",
    spp: { name: "", cond: "", effect: "", lp: "" }
  });
  assert.ok(draft.deathSupport, "手動追加から空の編集フォームを開始できる");
  assert.equal(draft.deathSupport.name, "");
  assert.equal(draft.roster.supports.length, 0);

  const named = reducer(draft, {
    type: "PATCH_DEATH_SUPPORT",
    patch: { name: "任意の死亡後サポート" }
  });
  assert.equal(named.deathSupport.name, "任意の死亡後サポート");
  assert.equal(named.roster.supports.length, 1);
  assert.equal(named.roster.supports[0].slot, "death");
  assert.equal(named.roster.supports[0].equipped, true);
  assert.equal(named.roster.supports[0].uid, named.deathSupport.id);
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
  const death = { uid: "locked-death", name: db.death_passives[0].name, slot: "death", equipped: false, cond: "", effect: "", lp: "" };
  const normal = { uid: "normal-to-death", name: "通常パッシブ", slot: "normal", equipped: false, cond: "", effect: "", lp: "" };
  const initial = { ...base(), roster: { personas: [], egos: [], supports: [death, normal], spirits: [] } };

  const directEquip = reducer(initial, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: death.uid, equipped: true });
  assert.equal(directEquip.roster.supports.find((entry) => entry.uid === death.uid).equipped, false);
  assert.equal(directEquip.deathSupport ?? null, null);

  const directDeathEquip = reducer(initial, { type: "SET_DEATH_SUPPORT", spp: { name: death.name } });
  assert.equal(directDeathEquip.roster.supports.length, initial.roster.supports.length, "ロック中の直接装備は所持追加もしない");
  assert.equal(directDeathEquip.entries.length, initial.entries.length, "ロック中は支出明細も作らない");

  const addSupport = reducer(initial, { type: "ADD_SUPPORT", spp: { name: death.name } });
  assert.equal(addSupport.roster.supports.find((entry) => entry.uid === death.uid).equipped, false);
  assert.equal(addSupport.deathSupport ?? null, null);

  const moveToDeath = reducer(initial, { type: "SET_ROSTER_SUPPORT_SLOT", uid: normal.uid, slot: "death" });
  assert.equal(moveToDeath.roster.supports.find((entry) => entry.uid === normal.uid).slot, "normal");
  assert.equal(moveToDeath.roster.supports.find((entry) => entry.uid === normal.uid).equipped, false);
});

test("死亡後専用パッシブは通常枠へ降格できず、古いslotラベルでも通常枠経由の装備を拒否する", () => {
  const name = db.death_passives[0].name;
  const death = { uid: "canonical-death", name, slot: "death", equipped: false, cond: "", effect: "", lp: "" };
  const normalRoster = { personas: [], egos: [], supports: [death], spirits: [] };
  const locked = { ...base(), roster: normalRoster };

  const demote = reducer(locked, { type: "SET_ROSTER_SUPPORT_SLOT", uid: death.uid, slot: "normal" });
  assert.equal(demote.roster.supports[0].slot, "death", "死亡後専用パッシブは通常枠へ移せない");
  assert.equal(demote.roster.supports[0].equipped, false);

  // Simulate a malformed/imported row whose slot field incorrectly says normal.
  const stale = {
    ...locked,
    roster: { ...locked.roster, supports: [{ ...death, slot: "normal" }] }
  };
  const lockedEquip = reducer(stale, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: death.uid, equipped: true });
  assert.equal(lockedEquip.roster.supports[0].equipped, false, "ロック中は誤ったslotラベルでも装備できない");
  assert.equal(lockedEquip.deathSupport ?? null, null);

  const unlocked = {
    ...stale,
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }]
  };
  const equipped = reducer(unlocked, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: death.uid, equipped: true });
  assert.equal(equipped.roster.supports[0].slot, "death", "解放済みなら装備時に正規の死亡後枠へ戻す");
  assert.equal(equipped.roster.supports[0].equipped, true);
  assert.equal(equipped.deathSupport?.name, name);
});

test("サポート編集は装備・分類フィールドの偽装を拒否し、カタログ分類を保つ", () => {
  const normal = db.support_passives[0];
  const death = db.death_passives[0];
  const lockedBase = {
    ...base(),
    roster: {
      personas: [], egos: [],
      supports: [{
        uid: "editable-support",
        name: normal.name, slot: "normal", equipped: true,
        cond: "", effect: "normal", lp: "10"
      }],
      spirits: []
    }
  };

  const lockedAttempt = reducer(lockedBase, {
    type: "PATCH_SUPPORT",
    id: "editable-support",
    patch: { name: death.name, slot: "normal", equipped: true }
  });
  assert.equal(lockedAttempt.roster.supports[0].name, normal.name, "未開放の死亡後名称は通常枠へ持ち込めない");

  const unlocked = {
    ...lockedBase,
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加", group: "test", shards: 0 }]
  };
  const converted = reducer(unlocked, {
    type: "PATCH_SUPPORT",
    id: "editable-support",
    patch: {
      name: death.name, slot: "normal", equipped: true,
      uid: "forged-uid", resultId: "forged-result"
    }
  });
  const convertedEntry = converted.roster.supports.find((entry) => entry.uid === "editable-support");
  assert.equal(convertedEntry.slot, "death", "公式カタログを正にして死亡後枠へ再分類");
  assert.equal(convertedEntry.equipped, true);
  assert.equal(convertedEntry.uid, "editable-support", "所持IDはパッチで置き換えられない");
  assert.equal(convertedEntry.resultId, undefined, "帰属先はパッチで注入できない");
  assert.equal(converted.supports.some((entry) => entry.name === death.name), false, "通常枠の投影に漏れない");
  assert.equal(converted.deathSupport?.name, death.name);

  const deathAlreadyEquipped = {
    ...unlocked,
    roster: {
      personas: [], egos: [],
      supports: [{
        uid: "owned-death", name: death.name, slot: "death", equipped: true,
        cond: "", effect: "death", lp: ""
      }],
      spirits: []
    }
  };
  const demoted = reducer(deathAlreadyEquipped, {
    type: "PATCH_SUPPORT",
    id: "owned-death",
    patch: { name: normal.name, slot: "normal", equipped: true }
  });
  assert.equal(demoted.roster.supports[0].slot, "death", "死亡後枠にある所持は名称変更でも通常枠へ降格しない");
  assert.equal(demoted.supports.some((entry) => entry.name === normal.name), false);
  assert.equal(demoted.deathSupport?.name, normal.name);
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

test("人格別保存ビルド内の死亡後専用パッシブを通常枠から移行する", () => {
  const persona = db.normal_personas[0];
  const normal = db.support_passives[0];
  const death = db.death_passives[0];
  const build = {
    supports: [
      { id: "normal-snapshot", name: normal.name, cond: "", effect: "normal", lp: "10" },
      { id: "death-snapshot", name: death.name, cond: "", effect: "death", lp: "" }
    ],
    deathSupport: null,
    enhancements: [{ id: "death-unlock", name: "死亡後パッシブ追加" }],
    equipmentRefs: { supportUids: ["normal-snapshot", "death-snapshot"], spiritUid: null }
  };
  const initial = {
    ...base(),
    personaMode: "n",
    personaNo: persona.no,
    personaSrc: persona,
    supports: [
      { id: "normal-snapshot", name: normal.name, cond: "", effect: "normal", lp: "10" },
      { id: "death-snapshot", name: death.name, cond: "", effect: "death", lp: "" }
    ],
    roster: {
      personas: [{ uid: "active-persona", no: persona.no, mode: "n", equipped: true, build }],
      egos: [],
      supports: [
        { uid: "normal-snapshot", name: normal.name, slot: "normal", equipped: true, cond: "", effect: "normal", lp: "10" },
        { uid: "death-snapshot", name: death.name, slot: "normal", equipped: true, cond: "", effect: "death", lp: "" }
      ],
      spirits: []
    }
  };

  const normalized = w.LBT_normalizeStateShape(initial);
  const savedBuild = normalized.roster.personas[0].build;
  assert.equal(savedBuild.supports.length, 1, "保存ビルドの通常スロットから死亡後専用候補を除外");
  assert.equal(savedBuild.supports[0].name, normal.name);
  assert.equal(savedBuild.deathSupport?.name, death.name, "旧装備を死亡後専用枠へ移行");
  assert.ok(savedBuild.equipmentRefs.supportUids.includes("death-snapshot"), "選択中の所持参照は保持");
  assert.equal(normalized.supports.length, 1, "実際に復元された通常枠も正規化");
  assert.equal(normalized.supports[0].name, normal.name);
  assert.equal(normalized.deathSupport?.name, death.name);
  const ownedDeath = normalized.roster.supports.find((entry) => entry.uid === "death-snapshot");
  assert.equal(ownedDeath.slot, "death", "所持記録は消さず、専用枠の分類を維持");
});

test("非アクティブ人格の古いビルドも一度の正規化で修復される", () => {
  const persona = db.normal_personas[1];
  const normal = db.support_passives[0];
  const death = db.death_passives[0];
  const initial = {
    ...base(),
    roster: {
      personas: [{
        uid: "dormant-persona",
        no: persona.no,
        mode: "n",
        equipped: false,
        build: {
          supports: [
            { id: "dormant-normal", name: normal.name },
            { id: "dormant-death", name: death.name }
          ],
          deathSupport: null,
          equipmentRefs: { supportUids: ["dormant-normal", "dormant-death"], spiritUid: null }
        }
      }],
      egos: [],
      supports: [
        { uid: "dormant-normal", name: normal.name, slot: "normal", equipped: false },
        { uid: "dormant-death", name: death.name, slot: "normal", equipped: false }
      ],
      spirits: []
    }
  };

  const normalized = w.LBT_normalizeStateShape(initial);
  const savedBuild = normalized.roster.personas[0].build;
  assert.equal(savedBuild.supports.length, 1);
  assert.equal(savedBuild.supports[0].name, normal.name);
  assert.equal(savedBuild.deathSupport?.name, death.name);
  assert.ok(savedBuild.equipmentRefs.supportUids.includes("dormant-death"));
  assert.equal(normalized.roster.supports.find((entry) => entry.uid === "dormant-death").slot, "death");
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