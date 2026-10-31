import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   取り込みは 1 手で終わらせる（APPLY_IMPORT_BATCH）。

   守るべき性質:
     - ADD_RESULT の直後の ADD_ENTRY はそのリザルトに帰属する
     - 所持の action は via（シナリオ名）から該当リザルトへ帰属し、
       引けない・曖昧なときは未分類のまま（勝手に決めない）
     - 購入履歴の金額が resultId 付きで入る（未分類のままにならない）
     - UNDO 1 回で全部戻る（state は 1 回の遷移）
     - 壊れた子 action があっても全体が落ちない
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadState() {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: {
      DB: {
        support_passives: db.support_passives,
        death_passives: db.death_passives,
        spirits: db.spirits,
        normal_enhancements: db.normal_enhancements,
        special_enhancements: db.special_enhancements
      }
    },
    console, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

const w = loadState();
const reducer = w.appReducer;
/* UNDO は React 側の履歴で、dispatch 1 回＝履歴 1 個。
   だから「1 回の reducer 呼び出しで全部入る」ことを以て確認する。 */
function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [],
    entries: [],
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

test("ADD_RESULT の直後の ADD_ENTRY はそのリザルトに帰属する", () => {
  const before = baseState();
  const after = reducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "第1回", income: { lp: 100, shards: 10 } },
      { type: "ADD_ENTRY", kind: "support", name: "ルサンチマン", cost: { lp: 7, shards: 0 } },
      { type: "ADD_RESULT", name: "第2回", income: { lp: 50, shards: 5 } },
      { type: "ADD_ENTRY", kind: "spirit", name: "憎悪", cost: { lp: 0, shards: 100 } }
    ]
  });
  assert.equal(after.results.length, 2, "リザルトが 2 件");
  assert.equal(after.entries.length, 2, "明細が 2 件");
  assert.equal(after.entries[0].resultId, after.results[0].id, "1件目は第1回に帰属");
  assert.equal(after.entries[1].resultId, after.results[1].id, "2件目は第2回に帰属");
});

test("明示した resultId は上書きしない", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "A", income: { lp: 10, shards: 0 } },
      { type: "ADD_RESULT", name: "B", income: { lp: 10, shards: 0 } },
      { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 }, resultId: "指定したID" }
    ]
  });
  assert.equal(after.entries[0].resultId, "指定したID");
});

test("明示した未分類（null）は直近リザルトへ倒さない", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "A", income: { lp: 10, shards: 0 } },
      { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 }, resultId: null }
    ]
  });
  assert.equal(after.entries[0].resultId, null);
});

test("UNDO 1 回で全部戻る（1 回の reducer 呼び出しで全部入る）", () => {
  const before = baseState();
  const actions = [
    { type: "ADD_ROSTER", no: "00101", mode: "n" },
    { type: "ADD_RESULT", name: "X", income: { lp: 5, shards: 5 } },
    { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 } }
  ];
  const after = reducer(before, { type: "APPLY_IMPORT_BATCH", actions });
  assert.ok(after.roster.personas.length > before.roster.personas.length, "人格が増えている");
  assert.ok(after.results.length > before.results.length, "リザルトが増えている");
  assert.ok(after.entries.length > before.entries.length, "明細が増えている");
  assert.equal(after.entries[after.entries.length - 1].resultId, after.results[after.results.length - 1].id,
    "明細はリザルトに帰属");
  /* React 側の履歴は dispatch 1 回につき 1 個。batch は dispatch 1 回なので
     UNDO 1 回で before に戻る。 */
});

test("壊れた子 action があっても全体が落ちない", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "A", income: { lp: 10, shards: 0 } },
      null,
      { type: "NOTHING_KNOWN" },
      { type: "ADD_ENTRY", kind: "support", name: "剃刀", cost: { lp: 10 } }
    ]
  });
  assert.equal(after.results.length, 1);
  assert.equal(after.entries.length, 1);
  assert.equal(after.entries[0].resultId, after.results[0].id);
});

test("空の batch は何もしない", () => {
  const before = baseState();
  const after = reducer(before, { type: "APPLY_IMPORT_BATCH", actions: [] });
  assert.equal(after, before, "同じ state");
});

test("所持の action は via のシナリオ名から正しいリザルトへ帰属する（リザルトより先に並んでも）", () => {
  const sppName = db.support_passives.find((s) => s && s.name).name;
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_ROSTER_SUPPORT", spp: { name: sppName }, via: ["闇鍋"] },
      { type: "ADD_RESULT", name: "闇鍋", income: { lp: 100, shards: 0 } },
      { type: "ADD_RESULT", name: "別の夜", income: { lp: 100, shards: 0 } }
    ]
  });
  const nakamiId = after.results[0].id;
  assert.equal(after.roster.supports.length, 1, "所持に入る");
  assert.equal(after.roster.supports[0].resultId, nakamiId, "所持は via の闇鍋へ帰属");
  assert.equal(after.entries.length, 1, "サポートの明細が出る");
  assert.equal(after.entries[0].resultId, nakamiId, "明細も同じリザルトへ");
});

test("via が同名複数のリザルトにまたがるなら勝手に決めない（未分類）", () => {
  const sppName = db.support_passives.find((s) => s && s.name).name;
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "闇鍋", income: { lp: 100, shards: 0 } },
      { type: "ADD_RESULT", name: "闇鍋", income: { lp: 100, shards: 0 } },
      { type: "ADD_ROSTER_SUPPORT", spp: { name: sppName }, via: ["闇鍋"] }
    ]
  });
  assert.equal(after.roster.supports[0].resultId, null, "同名 2 件は未分類");
  assert.equal(after.entries[0].resultId, null, "明細も未分類");
});

test("取り込んだチケット消費は対応するリザルトに帰属する", () => {
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "チケット獲得", income: { lp: 0, shards: 0, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } } },
      { type: "SPEND_TICKET", kind: "persona", count: -1, ref: { kind: "textImportTicketUse" } }
    ]
  });
  assert.equal(after.results.length, 1);
  assert.equal(after.entries.length, 1);
  assert.equal(after.entries[0].kind, "ticket");
  assert.equal(after.entries[0].resultId, after.results[0].id);
  assert.equal(after.entries[0].tickets.persona, 1);
});

test("取り込んだアイテム消費は対応するリザルトに保存され、在庫を減らす", () => {
  const before = {
    ...baseState(),
    inventory: [{ uid: "it-1", itemId: "enh-whetstone", quantity: 3, memo: true, palette: true }],
    results: [],
    entries: []
  };
  const after = reducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "報酬記録", income: { lp: 0, shards: 0 } },
      { type: "CONSUME_ITEM", itemId: "enh-whetstone", quantity: 1, reason: "consumption", operationId: "import-use-1" },
      { type: "ADD_RESULT", name: "使用記録", income: { lp: 0, shards: 0 } },
      { type: "CONSUME_ITEM", itemId: "enh-whetstone", quantity: 1, reason: "consumption", operationId: "import-use-2" }
    ]
  });
  assert.equal(after.inventory[0].quantity, 1);
  assert.equal(after.results.length, 2);
  assert.equal(after.results[0].consumedItems.length, 1);
  assert.equal(after.results[1].consumedItems.length, 1);
  assert.equal(after.results[0].consumedItems[0].operationId, "import-use-1");
  assert.equal(after.results[1].consumedItems[0].operationId, "import-use-2");
});

test("via がバッチ内のリザルトに一致しなければ未分類（直前へ倒さない）", () => {
  const sppName = db.support_passives.find((s) => s && s.name).name;
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "夜A", income: { lp: 100, shards: 0 } },
      { type: "ADD_ROSTER_SUPPORT", spp: { name: sppName }, via: ["選択しなかった夜"] }
    ]
  });
  assert.equal(after.roster.supports[0].resultId, null, "不一致は未分類");
});

test("シナリオの獲得一覧（via 無し）の所持は直前のリザルトへ帰属する", () => {
  const spiritName = db.spirits.find((s) => s && s.name).name;
  const after = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "獲得上の夜", income: { lp: 0, shards: 1000 } },
      { type: "ADD_ROSTER_SPIRIT", spirit: { name: spiritName } }
    ]
  });
  assert.equal(after.roster.spirits[0].resultId, after.results[0].id, "直前のリザルトへ");
  assert.equal(after.entries[0].resultId, after.results[0].id);
});

test("同じ硝子窓ソースの再取込は既存リザルトと取り込み明細だけを更新し、手入力明細を残す", () => {
  const before = baseState();
  const sourceKey = "gara1:share123:undated:夜の卓:1";
  const first = reducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "夜の卓", income: { lp: 100, shards: 20 }, consumedItems: [], personaAcquisitions: [{ mode: "n", no: "00101", name: "旧人格", source: "garasumado" }], importSourceKey: sourceKey },
      { type: "ADD_ENTRY", kind: "other", name: "解析済み支出", cost: { lp: 25, shards: 0 } }
    ]
  });
  const originalResult = first.results[0];
  assert.equal(first.entries.length, 1);
  assert.equal(first.entries[0].importResultKey, sourceKey);

  const withManual = reducer(first, {
    type: "ADD_ENTRY", kind: "other", name: "手入力の支出", cost: { lp: 5, shards: 0 }, resultId: originalResult.id
  });
  const updated = reducer(withManual, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_RESULT", name: "夜の卓", income: { lp: 150, shards: 30 }, consumedItems: [{ itemId: "glass-shard", itemName: "硝子の破片", quantity: 1, reason: "consumption" }], personaAcquisitions: [{ mode: "n", no: "00102", name: "新人格", source: "garasumado" }], importSourceKey: sourceKey },
      { type: "ADD_ENTRY", kind: "other", name: "解析済み支出（修正）", cost: { lp: 40, shards: 0 } }
    ]
  });

  assert.equal(updated.results.length, 1, "同じソースのリザルトを増殖させない");
  assert.equal(updated.results[0].id, originalResult.id, "既存のIDを維持する");
  assert.equal(updated.results[0].income.lp, 150, "再解析後の収入へ更新");
  assert.equal(updated.results[0].income.shards, 30);
  assert.equal(updated.results[0].consumedItems.length, 1, "消費記録も最新データへ更新");
  assert.deepEqual(JSON.parse(JSON.stringify(updated.results[0].personaAcquisitions)), [{ mode: "n", no: "00102", name: "新人格", source: "garasumado" }],
    "再解析で修正された獲得人格を古い取得履歴のまま残さない");
  const cleared = reducer(updated, {
    type: "APPLY_IMPORT_BATCH",
    actions: [{ type: "ADD_RESULT", name: "夜の卓", income: { lp: 150, shards: 30 }, consumedItems: [], personaAcquisitions: [], importSourceKey: sourceKey }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(cleared.results[0].personaAcquisitions)), [],
    "元履歴から取得人格が削除された場合も、再取込で古い取得履歴を消す");
  assert.equal(updated.entries.length, 2, "古い取込明細だけ置換し、手入力明細を維持");
  assert.ok(updated.entries.some((entry) => entry.name === "手入力の支出" && entry.cost.lp === 5));
  assert.ok(updated.entries.some((entry) => entry.name === "解析済み支出（修正）" && entry.cost.lp === 40));
  assert.ok(updated.entries.every((entry) => entry.resultId === originalResult.id));
});

test("旧形式リザルトは明示指定時だけ更新し、対象の紐づく明細を入れ替える", () => {
  const added = reducer(baseState(), { type: "ADD_RESULT", name: "旧形式", income: { lp: 10, shards: 1 } });
  const oldResult = added.results[0];
  const oldEntryState = reducer(added, {
    type: "ADD_ENTRY", name: "以前の取込明細", cost: { lp: 3, shards: 0 }, resultId: oldResult.id
  });
  const updated = reducer(oldEntryState, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      {
        type: "ADD_RESULT", name: "旧形式", income: { lp: 20, shards: 2 }, consumedItems: [],
        importSourceKey: "gara1:share123:undated:旧形式:1", legacyResultId: oldResult.id, replaceLegacyEntries: true
      },
      { type: "ADD_ENTRY", name: "最新の取込明細", cost: { lp: 4, shards: 0 } }
    ]
  });
  assert.equal(updated.results.length, 1);
  assert.equal(updated.results[0].id, oldResult.id);
  assert.equal(updated.results[0].importSourceKey, "gara1:share123:undated:旧形式:1");
  assert.equal(updated.results[0].income.lp, 20);
  assert.deepEqual([...updated.entries.map((entry) => entry.name)], ["最新の取込明細"]);
  assert.equal(updated.entries[0].resultId, oldResult.id);
  assert.equal(updated.entries[0].importResultKey, updated.results[0].importSourceKey);
});


test("自由メモ購入の再取込は未分類のまま同一共有元だけを置換し、削除行も残さない", () => {
  const sourceId = "share123";
  const firstKey = "gara-free:share123:人生一発:1";
  const otherKey = "gara-free:other456:人生一発:1";
  const sourceNote = "硝子窓の自由メモ由来。日時・シナリオ未特定";
  const first = reducer(baseState(), {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "REFRESH_GARASUMADO_FREE_NOTES", sourceId },
      { type: "ADD_ENTRY", kind: "support", name: "人生一発", cost: { lp: 20, shards: 0 },
        resultId: null, importResultKey: firstKey, note: sourceNote },
      { type: "ADD_ENTRY", kind: "support", name: "別URLの人生一発", cost: { lp: 12, shards: 0 },
        resultId: null, importResultKey: otherKey, note: sourceNote },
      { type: "ADD_ENTRY", kind: "other", name: "ユーザー手入力", cost: { lp: 3, shards: 0 },
        resultId: null, note: "manual" }
    ]
  });
  assert.equal(first.results.length, 0, "自由メモ購入のための架空リザルトを作らない");
  assert.equal(first.entries.length, 3);
  assert.equal(first.entries.find((entry) => entry.importResultKey === firstKey).resultId, null);

  const updated = reducer(first, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "REFRESH_GARASUMADO_FREE_NOTES", sourceId },
      { type: "ADD_ENTRY", kind: "support", name: "人生一発", cost: { lp: 30, shards: 0 },
        resultId: null, importResultKey: firstKey, note: sourceNote }
    ]
  });
  assert.equal(updated.entries.length, 3, "同じURLの行だけ1件置換される");
  assert.equal(updated.entries.find((entry) => entry.importResultKey === firstKey).cost.lp, 30);
  assert.equal(updated.entries.find((entry) => entry.importResultKey === firstKey).resultId, null);
  assert.ok(updated.entries.some((entry) => entry.importResultKey === otherKey), "別URLの購入記録は保持");
  assert.ok(updated.entries.some((entry) => entry.note === "manual"), "手入力記録は保持");

  const removed = reducer(updated, {
    type: "APPLY_IMPORT_BATCH",
    actions: [{ type: "REFRESH_GARASUMADO_FREE_NOTES", sourceId }]
  });
  assert.equal(removed.entries.length, 2, "自由メモから購入が削除されたら旧取込行も消える");
  assert.ok(!removed.entries.some((entry) => entry.importResultKey === firstKey));
  assert.ok(removed.entries.some((entry) => entry.importResultKey === otherKey));
  assert.ok(removed.entries.some((entry) => entry.note === "manual"));
});
