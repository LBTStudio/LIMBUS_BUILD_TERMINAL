import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function load() {
  const window = {
    DB: {
      normal_personas: db.normal_personas,
      tokui_personas: db.tokui_personas,
      egos: db.egos,
      support_passives: db.support_passives,
      death_passives: db.death_passives,
      spirits: db.spirits
    },
    LBT_PDF_KEYWORD_ORDER: []
  };
  const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["js/ledger-provenance.js", "js/roster-resolver.js"]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  vm.runInContext(
    stateSource
      + "\nglobalThis.__normalizePersonaRows = normalizeCustomPersonaRosterIdentity;"
      + "\nglobalThis.__reduce = window.appReducer;",
    context,
    { filename: "js/state.js" }
  );
  return context;
}

function row(mode, no, uid, extra = {}) {
  return { mode, no, uid, syncRank: null, syncMax: false, ...extra };
}

test("legacy normal/special rows get distinct stable UIDs while custom shared-no identities remain unique", () => {
  const context = load();
  const rows = [
    row("n", db.normal_personas[0].no, "shared-uid"),
    row("t", db.tokui_personas[0].no, "shared-uid"),
    row("n", db.normal_personas[1].no, ""),
    row("t", db.tokui_personas[1].no, undefined),
    row("custom", "999", "custom-shared", { src: { name: "自作A" } }),
    row("custom", "999", "custom-shared", { src: { name: "自作B" } })
  ];
  const normalized = context.__normalizePersonaRows(rows);
  const ids = Array.from(normalized, (entry) => String(entry.uid));
  assert.equal(new Set(ids).size, rows.length, "すべての所持人格に異なるUIDがある");
  assert.equal(normalized[0].uid, "shared-uid", "既存UIDの最初の所有者は変えない");
  assert.notEqual(normalized[1].uid, "shared-uid", "衝突した特異人格は別UIDになる");
  assert.ok(normalized[2].uid && normalized[3].uid, "UID欠落行へIDを付与");
  assert.equal(normalized[4].no, normalized[4].uid, "創作人格のnoはUIDへ正規化");
  assert.equal(normalized[5].no, normalized[5].uid, "衝突した創作人格もUIDを分離");
  const normalizedAgain = context.__normalizePersonaRows(normalized);
  assert.deepEqual(Array.from(normalizedAgain, (entry) => entry.uid), ids, "再読込しても修復済みUIDは変わらない");
});

test("重複UIDまたは欠落UIDを指定した同期操作は一括更新せず、安全に停止する", () => {
  const context = load();
  const shared = "colliding-uid";
  const state = {
    roster: {
      personas: [
        row("n", db.normal_personas[0].no, shared),
        row("t", db.tokui_personas[0].no, shared)
      ],
      egos: [], supports: [], spirits: []
    },
    results: [{ id: "result-1", name: "同期テスト", income: { lp: 0, shards: 1000 } }],
    entries: [],
    inventory: []
  };
  const next = context.__reduce(state, { type: "APPLY_PERSONA_SYNC", uid: shared, syncRank: "00" });
  assert.strictEqual(next, state, "対象を一意に確定できない場合は状態を変更しない");
  assert.equal(next.roster.personas[0].syncRank, null);
  assert.equal(next.roster.personas[1].syncRank, null);

  const missingUidState = {
    ...state,
    roster: { ...state.roster, personas: [row("n", db.normal_personas[0].no, undefined), row("t", db.tokui_personas[0].no, undefined)] }
  };
  assert.strictEqual(
    context.__reduce(missingUidState, { type: "APPLY_PERSONA_SYNC", uid: undefined, syncRank: "00" }),
    missingUidState,
    "UIDが無い操作も行を誤選択しない"
  );
});


test("historical persona purchase imports bypass current balance but still record the purchase", () => {
  const context = load();
  const persona = db.normal_personas[0];
  const uid = "existing-owned-persona";
  const state = {
    roster: { personas: [row("n", persona.no, uid)], egos: [], supports: [], spirits: [] },
    results: [{ id: "result-low", name: "低残高の過去記録", income: { lp: 0, shards: 0 } }],
    entries: [], inventory: []
  };
  const imported = context.__reduce(state, {
    type: "ADD_ROSTER", mode: "n", no: persona.no, purchase: true,
    cost: { lp: 20, shards: 0 }, historicalImport: true, resultId: "result-low"
  });
  assert.equal(imported.roster.personas.length, 1, "既存の所持人格は重複追加しない");
  assert.equal(imported.entries.length, 1, "不足していた購入明細を補完する");
  assert.equal(imported.entries[0].kind, "persona");
  assert.equal(imported.entries[0].cost.lp, 20);
  assert.equal(imported.entries[0].ref.uid, uid);
  const repeated = context.__reduce(imported, {
    type: "ADD_ROSTER", mode: "n", no: persona.no, purchase: true,
    cost: { lp: 20, shards: 0 }, historicalImport: true, resultId: "result-low"
  });
  assert.strictEqual(repeated, imported, "再取り込みで二重に課金しない");
});

test("an old zero-cost persona purchase entry is repaired instead of duplicated", () => {
  const context = load();
  const persona = db.normal_personas[0];
  const uid = "legacy-owned-persona";
  const state = {
    roster: { personas: [row("n", persona.no, uid)], egos: [], supports: [], spirits: [] },
    results: [{ id: "result-old", name: "旧購入記録", income: { lp: 0, shards: 0 } }],
    entries: [{
      id: "legacy-entry", kind: "persona", name: persona.name,
      cost: { lp: 0, shards: 0 }, resultId: "result-old",
      ref: { kind: "rosterPersona", uid }
    }],
    inventory: []
  };
  const repaired = context.__reduce(state, {
    type: "ADD_ROSTER", mode: "n", no: persona.no, purchase: true,
    cost: { lp: 20, shards: 0 }, historicalImport: true, resultId: "result-old"
  });
  assert.equal(repaired.entries.length, 1, "古い明細を二重化しない");
  assert.equal(repaired.entries[0].cost.lp, 20, "0円の明細を正しい購入費に修復");
});

test("non-historical persona purchase still respects the current balance gate", () => {
  const context = load();
  const persona = db.normal_personas[0];
  const state = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "result-poor", name: "残高不足", income: { lp: 0, shards: 0 } }],
    entries: [], inventory: []
  };
  const rejected = context.__reduce(state, {
    type: "ADD_ROSTER", mode: "n", no: persona.no, purchase: true,
    cost: { lp: 20, shards: 0 }
  });
  assert.strictEqual(rejected, state, "ショップの新規購入は残高不足なら拒否");
});

test("UID修復後の同期操作は指定した人格だけを変更する", () => {
  const context = load();
  const rows = context.__normalizePersonaRows([
    row("n", db.normal_personas[0].no, "colliding-uid"),
    row("t", db.tokui_personas[0].no, "colliding-uid"),
    row("n", db.normal_personas[1].no, "")
  ]);
  const targetUid = rows[1].uid;
  const state = {
    roster: { personas: rows, egos: [], supports: [], spirits: [] },
    results: [{ id: "result-1", name: "同期テスト", income: { lp: 0, shards: 1000 } }],
    entries: [],
    inventory: []
  };
  const next = context.__reduce(state, { type: "APPLY_PERSONA_SYNC", uid: targetUid, syncRank: "00" });
  assert.equal(next.roster.personas[0].syncRank, null, "先行する通常人格は未変更");
  assert.equal(next.roster.personas[1].syncRank, "00", "指定UIDの特異人格だけ同期する");
  assert.equal(next.roster.personas[2].syncRank, null, "UID欠落から復旧した別人格も未変更");
});
