import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadRuntime } from "../tools/provenance/pipeline-harness.mjs";

/* 抽出チケットは卓で報酬として受け渡されるため、リザルトの収入として管理する。
   所持の残数は「全リザルトの収入 − 全明細の消費」で求める。 */

const DB = { normal_personas: [{ no: 1, name: "黒雲会組員" }], tokui_personas: [], egos: [], items: [] };
const window = { DB, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
const context = { window, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
for (const f of ["js/ledger-provenance.js", "js/state.js"]) {
  vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), context, { filename: f });
}

const reducer = context.window.appReducer;
const balanceOf = (s) => context.window.LBT_computeTicketBalance(s.results, s.entries);
const withResult = (tickets, extra) => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "0", shards: "0", tickets }, entries: [] }],
  entries: [],
  inventory: [],
  ...extra
});

test("収入は種別別に数える", () => {
  const s = withResult({ persona: 2, ego: 1, choice: 0, pack: { "肉斬骨断": 3 } });
  const b = balanceOf(s);
  assert.equal(b.persona, 2);
  assert.equal(b.ego, 1);
  assert.equal(b.pack["肉斬骨断"], 3);
});

test("パック別はパックごとに独立して数える", () => {
  const s = withResult({ pack: { "肉斬骨断": 2, "ロボトミーコーポレーション": 1 } });
  const b = balanceOf(s);
  assert.equal(b.pack["肉斬骨断"], 2);
  assert.equal(b.pack["ロボトミーコーポレーション"], 1);
  assert.equal(b.pack["向き合わない"], undefined, "未 Cue のパックは 0");
});

test("チケット収入が安全整数上限を超える加算は既存残数を壊さず拒否する", () => {
  const state = withResult({ persona: Number.MAX_SAFE_INTEGER });
  const overflowPersona = reducer(state, { type: "GRANT_TICKET", kind: "persona", count: 1 });
  assert.strictEqual(overflowPersona, state, "人格チケットの安全整数超過を拒否");
  assert.equal(balanceOf(overflowPersona).persona, Number.MAX_SAFE_INTEGER,
    "既存の最大残数を0へ正規化して失わない");

  const packState = withResult({ pack: { "検証パック": Number.MAX_SAFE_INTEGER } });
  const overflowPack = reducer(packState, {
    type: "GRANT_TICKET", kind: "pack", pack: "検証パック", count: 1
  });
  assert.strictEqual(overflowPack, packState, "パック別チケットの安全整数超過を拒否");
  assert.equal(balanceOf(overflowPack).pack["検証パック"], Number.MAX_SAFE_INTEGER,
    "既存のパック別残数を維持する");
});

test("GRANT_TICKET は直近リザルトの収入に積む", () => {
  const s = reducer(withResult({}), { type: "GRANT_TICKET", kind: "ego", count: 2 });
  assert.equal(balanceOf(s).ego, 2);
  assert.equal(s.results[0].income.tickets.ego, 2, "リザルトの収入に入る");
  /* 独立した在庫は持たない。残数は収支から求める。 */
  assert.ok(!Array.isArray(s.tickets) || s.tickets.length === 0, "旧在庫は空のまま");
});

test("パック別の付与はパック名を収入に刻む", () => {
  const s = reducer(withResult({}), { type: "GRANT_TICKET", kind: "pack", pack: "肉斬骨断", count: 4 });
  assert.equal(balanceOf(s).pack["肉斬骨断"], 4);
});

test("SPEND_TICKET は消費として明細に残る", () => {
  const granted = reducer(withResult({ persona: 3 }), {});
  const spent = reducer(granted, { type: "SPEND_TICKET", kind: "persona", ref: { kind: "gacha", no: 1 } });
  assert.equal(balanceOf(spent).persona, 2, "収入 − 消費");
  assert.equal(spent.entries.length, 1, "明細が1件増える");
  assert.equal(spent.entries[0].kind, "ticket");
  assert.equal(spent.entries[0].tickets.persona, 1);
  /* 消費は直近リザルトに帰属し、そこで支出として見える。 */
  assert.equal(spent.entries[0].resultId, "res-1");
});

test("未確定チケット候補は種別・枚数・方向を明示確定できる", () => {
  const base = withResult({ persona: 3, ego: 0, choice: 0, pack: {} });
  base.results[0].financialReviews = [{
    key: "review-ticket-1", line: "人格抽出チケット×2.5消費", lineIndex: 1,
    category: "ticket", ticketKind: "", ticketPack: "", ticketCount: null,
    ticketDirection: "", status: "pending", sourceKey: "gara-source-row"
  }];
  const spent = reducer(base, {
    type: "RESOLVE_FINANCIAL_REVIEW",
    category: "ticket",
    resultId: "res-1",
    candidateKey: "review-ticket-1",
    ticketKind: "persona",
    ticketCount: "2",
    ticketDirection: "spend"
  });
  assert.equal(balanceOf(spent).persona, 1);
  assert.equal(spent.entries.length, 1);
  assert.equal(spent.entries[0].tickets.persona, 2);
  assert.equal(spent.entries[0].ref.kind, "financialReview");
  assert.equal(spent.entries[0].ref.uid, "review-ticket-1");
  assert.equal(spent.entries[0].importResultKey, "gara-source-row");
  assert.equal(spent.results[0].financialReviews[0].status, "confirmed");
  assert.equal(spent.results[0].financialReviews[0].ticketCount, 2);
  const repeat = reducer(spent, {
    type: "RESOLVE_FINANCIAL_REVIEW",
    category: "ticket", resultId: "res-1", candidateKey: "review-ticket-1",
    ticketKind: "persona", ticketCount: "2", ticketDirection: "spend"
  });
  assert.strictEqual(repeat, spent, "確定済みチケットは二重確定できない");
  const removed = reducer(spent, { type: "PURGE_ENTRY", id: spent.entries[0].id });
  assert.equal(balanceOf(removed).persona, 3, "明細削除でチケット残数を戻す");
  assert.equal(removed.results[0].financialReviews[0].status, "pending",
    "削除した支出のレビュー候補を再確認できる");
  assert.equal(removed.results[0].financialReviews[0].ticketCount, null);
});

test("チケット確認済み支出は同じ履歴の再取込で維持し、解析確定後は通常消費へ置換する", () => {
  const sourceKey = "gara-source-row-reimport";
  const reviewKey = "review-ticket-reimport";
  const candidate = {
    key: reviewKey, line: "人格抽出チケット×2.5消費", lineIndex: 1,
    category: "ticket", status: "pending", sourceKey
  };
  const base = withResult({ persona: 3, ego: 0, choice: 0, pack: {} });
  base.results[0].importSourceKey = sourceKey;
  base.results[0].financialReviews = [candidate];
  const confirmed = reducer(base, {
    type: "RESOLVE_FINANCIAL_REVIEW", category: "ticket",
    resultId: "res-1", candidateKey: reviewKey,
    ticketKind: "persona", ticketCount: "2", ticketDirection: "spend"
  });
  assert.equal(balanceOf(confirmed).persona, 1);
  assert.equal(confirmed.entries[0].importResultKey, sourceKey);

  const reviewReimported = reducer(confirmed, {
    type: "APPLY_IMPORT_BATCH",
    actions: [{
      type: "ADD_RESULT", name: "第一夜", importSourceKey: sourceKey,
      income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } },
      financialReviews: [candidate]
    }]
  });
  assert.equal(reviewReimported.results.length, 1, "同じ出典リザルトを更新する");
  assert.equal(reviewReimported.entries.length, 1, "確認済みチケット支出を維持する");
  assert.equal(balanceOf(reviewReimported).persona, 1);
  assert.equal(reviewReimported.results[0].financialReviews[0].status, "confirmed");

  const parserResolved = reducer(reviewReimported, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      {
        type: "ADD_RESULT", name: "第一夜", importSourceKey: sourceKey,
        income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } },
        financialReviews: []
      },
      {
        type: "ADD_ENTRY",
        kind: "other",
        name: "履歴上の使用：人格抽出チケット ×2",
        cost: { lp: 0, shards: 0 },
        tickets: { persona: 2, ego: 0, choice: 0, pack: {} }
      }
    ]
  });
  assert.equal(parserResolved.entries.length, 1, "旧review支出を除き、通常解析済み消費に置き換える");
  assert.equal(parserResolved.entries[0].importResultKey, sourceKey);
  assert.equal(parserResolved.entries[0].tickets.persona, 2);
  assert.equal(balanceOf(parserResolved).persona, 1);
});

test("チケット確認候補で所持枚数を超える消費を確定できない", () => {
  const base = withResult({ persona: 1 });
  base.results[0].financialReviews = [{
    key: "review-ticket-overdraw", line: "人格抽出チケット×9", lineIndex: 1,
    category: "ticket", status: "pending"
  }];
  const rejected = reducer(base, {
    type: "RESOLVE_FINANCIAL_REVIEW", category: "ticket",
    resultId: "res-1", candidateKey: "review-ticket-overdraw",
    ticketKind: "persona", ticketCount: "9", ticketDirection: "spend"
  });
  assert.strictEqual(rejected, base, "在庫不足は状態変更なし");
  assert.equal(balanceOf(rejected).persona, 1);
});

test("未確定チケットの受領を確定すると再取込後も枚数を保持する", () => {
  const base = withResult({ persona: 0, ego: 0, choice: 0, pack: {} });
  base.results[0].financialReviews = [{
    key: "review-ticket-income", line: "人格抽出チケット獲得枚数未確定", lineIndex: 1,
    category: "ticket", status: "pending"
  }];
  const granted = reducer(base, {
    type: "RESOLVE_FINANCIAL_REVIEW",
    category: "ticket", resultId: "res-1", candidateKey: "review-ticket-income",
    ticketKind: "persona", ticketCount: "3", ticketDirection: "income"
  });
  assert.equal(balanceOf(granted).persona, 3);
  const reimported = reducer(granted, {
    type: "UPDATE_RESULT", id: "res-1",
    income: { lp: 0, shards: 0, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } },
    financialReviews: [{ ...granted.results[0].financialReviews[0], status: "pending", ticketCount: null }]
  });
  assert.equal(balanceOf(reimported).persona, 3, "確定済み受領は同一未確定行の再取込で二重加算せず保持");
});

test("パックチケットの確認確定はパック名ごとに残数を増減する", () => {
  const base = withResult({ persona: 0, ego: 0, choice: 0, pack: { "肉斬骨断": 3 } });
  base.results[0].financialReviews = [{
    key: "review-pack-ticket", line: "〈肉斬骨断〉チケット×2", lineIndex: 1,
    category: "ticket", status: "pending"
  }];
  const spent = reducer(base, {
    type: "RESOLVE_FINANCIAL_REVIEW", category: "ticket",
    resultId: "res-1", candidateKey: "review-pack-ticket",
    ticketKind: "pack", ticketPack: "肉斬骨断", ticketCount: "2", ticketDirection: "spend"
  });
  assert.equal(balanceOf(spent).pack["肉斬骨断"], 1);
  assert.equal(spent.entries[0].tickets.pack["肉斬骨断"], 2);
  assert.equal(spent.results[0].financialReviews[0].ticketPack, "肉斬骨断");
});

test("SPEND_TICKET の明示的な0枚は既定の1枚消費にならない", () => {
  const s = withResult({ persona: 2 });
  const zeroNumber = reducer(s, { type: "SPEND_TICKET", kind: "persona", count: 0 });
  const zeroString = reducer(s, { type: "SPEND_TICKET", kind: "persona", count: "0" });
  assert.equal(zeroNumber.entries.length, 0);
  assert.equal(zeroString.entries.length, 0);
  assert.equal(balanceOf(zeroNumber).persona, 2);
  assert.equal(balanceOf(zeroString).persona, 2);
  const omitted = reducer(s, { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(omitted.entries.length, 1, "枚数省略のときだけ既定の1枚を消費する");
  assert.equal(balanceOf(omitted).persona, 1);
});

test("チケット・通貨残高計算は欠落または不正な配列入力で例外を出さない", () => {
  assert.deepEqual(reducer(withResult({}), { type: "NOOP" }).entries, []);
  assert.deepEqual(JSON.parse(JSON.stringify(balanceOf({ results: {}, entries: {} }))), {
    persona: 0, ego: 0, choice: 0, pack: {}
  });
  const ledger = context.window.LBT_computeLedgerBalance({}, {});
  assert.equal(ledger.lp, 0);
  assert.equal(ledger.shards, 0);
  assert.equal(ledger.tickets.persona, 0);
});

test("残数 0 のときに SPEND_TICKET は何も起こさない", () => {
  const s = withResult({});
  const spent = reducer(s, { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(spent.entries.length, 0);
});

test("SET_TICKET_COUNT は残数の目標値に合わせ、減算を調整消費として記録する", () => {
  const s = reducer(withResult({ persona: 2 }), { type: "SET_TICKET_COUNT", kind: "persona", count: 5 });
  assert.equal(balanceOf(s).persona, 5);
  const down = reducer(s, { type: "SET_TICKET_COUNT", kind: "persona", count: 1 });
  assert.equal(balanceOf(down).persona, 1);
  assert.equal(down.results[0].income.tickets.persona, 5, "元の受領記録は書き換えない");
  const adjustment = down.entries.find((entry) => entry.ref?.kind === "ticketBalanceAdjustment");
  assert.equal(adjustment?.tickets.persona, 4, "不足させた4枚を調整消費として追跡する");
});

test("SET_TICKET_COUNT は古いリザルトに残るチケットも合計残数の目標値まで減らせる", () => {
  const state = withResult(
    { persona: 0, ego: 0, choice: 0, pack: {} },
    {
      results: [
        { id: "res-old", name: "第一夜", date: "2026-11-01", income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } } },
        { id: "res-latest", name: "第二夜", date: "2026-11-02", income: { lp: 0, shards: 0, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } } }
      ],
      entries: []
    }
  );
  const set = reducer(state, { type: "SET_TICKET_COUNT", kind: "persona", count: 1 });
  assert.equal(balanceOf(set).persona, 1, "最新リザルトにチケットが無くても合計を1枚に設定できる");
  assert.equal(set.results[0].income.tickets.persona, 3, "過去リザルトの受領記録は維持");
  assert.equal(set.results[1].income.tickets.persona, 0);
  assert.equal(set.entries[0].tickets.persona, 2, "差分2枚を明細で記録");
  assert.equal(set.entries[0].resultId, "res-latest", "調整明細は最新リザルトへ帰属");
});

test("特殊なプロパティ名のパックも付与・消費・復元できる", () => {
  const granted = reducer(withResult({}), { type: "GRANT_TICKET", kind: "pack", pack: "__proto__", count: 3 });
  assert.equal(Object.prototype.hasOwnProperty.call(balanceOf(granted).pack, "__proto__"), true);
  assert.equal(balanceOf(granted).pack["__proto__"], 3);
  const spent = reducer(granted, { type: "SPEND_TICKET", kind: "pack", pack: "__proto__", ref: { kind: "gacha" } });
  assert.equal(balanceOf(spent).pack["__proto__"], 2);

  const legacy = {
    ...withResult({}),
    tickets: [
      { kind: "pack", pack: "__proto__", count: 2 },
      { kind: "pack", pack: "constructor", count: 4 }
    ]
  };
  const migrated = context.window.LBT_normalizeStateShape(legacy);
  const balance = balanceOf(migrated);
  assert.equal(balance.pack["__proto__"], 2);
  assert.equal(balance.pack.constructor, 4);
  assert.deepEqual([...migrated.tickets], []);
});

test("旧セーブの state.tickets はリザルト収入へ移行する", () => {
  const legacy = {
    ...withResult({}),
    tickets: [
      { kind: "persona", pack: null, count: 2 },
      { kind: "pack", pack: "肉斬骨断", count: 1 }
    ]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  const b = balanceOf(next);
  assert.equal(b.persona, 2, "所持が収入へ移る");
  assert.equal(b.pack["肉斬骨断"], 1, "パック名も移る");
  assert.deepEqual([...next.tickets], [], "旧在庫は空になる");
  assert.ok(next.results.some((r) => r.name === "抽出チケットの受領"), "受領リザルトができる");
});

test("旧チケット移行は不正枚数・不完全パック・プリミティブを数値化せず保持する", () => {
  const legacy = {
    ...withResult({}),
    tickets: [
      { kind: "persona", pack: null, count: 2 },
      { kind: "choice", pack: null, count: "3" },
      { kind: "ego", pack: null, count: true },
      { kind: "persona", pack: null, count: "2.5" },
      { kind: "persona", pack: null, count: "2x" },
      { kind: "pack", pack: "", count: 4 },
      null
    ]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  const balance = balanceOf(next);
  assert.equal(balance.persona, 2, "正しい人格チケットだけ移行される");
  assert.equal(balance.choice, 3, "数値文字列の整数は移行される");
  assert.equal(balance.ego, 0, "boolean を枚数1として誤移行しない");
  assert.equal(next.tickets.length, 5, "移行できない行は失わず保持する");
  assert.ok(next.tickets.every((ticket) => ticket && typeof ticket === "object" && !Array.isArray(ticket)),
    "不正なプリミティブもJSON移送できるレコードとして保持する");
  assert.ok(next.tickets.some((ticket) => ticket._lbtLegacyUnresolvedReason === "missing-pack-name"));
  assert.ok(next.tickets.some((ticket) => ticket._lbtLegacyUnresolvedReason === "invalid-ticket-count"));
  const again = context.window.LBT_normalizeStateShape(next);
  assert.equal(balanceOf(again).persona, 2, "再ロード時に在庫を二重計上しない");
  assert.equal(again.tickets.length, 5, "未解決行を再ラップ／削除しない");
});

test("移行専用IDを持つ同一内容は再計上しない（二重計上を避ける）", () => {
  const legacy = {
    ...withResult({}),
    roster: { personas: [{ uid: "owned-1", mode: "n", no: 1 }], egos: [], supports: [], spirits: [] },
    results: [{
      id: "res-ticket-grant",
      name: "抽出チケットの受領",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }],
    tickets: [{ kind: "persona", pack: null, count: 2 }]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(balanceOf(next).persona, 2, "移行済み在庫は再加算されない");
  assert.equal(next.results.filter((r) => r.id === "res-ticket-grant").length, 1);
  assert.deepEqual([...next.tickets], []);
});

test("パック別チケットは『〈パック名〉抽出チケット』と表記される", () => {
  const label = context.window.LBT_ticketLabel;
  assert.equal(label("persona"), "人格抽出チケット");
  assert.equal(label("ego"), "E.G.O抽出チケット");
  assert.equal(label("pack", "肉斬骨断"), "〈肉斬骨断〉抽出チケット");
  assert.equal(label("pack", null), "特定抽出パック");
});

test("リザルトが空なら『初期作成』を作り、キャラ作成時の30LPを収入に置く", () => {
  const fresh = { roster: { personas: [], egos: [], supports: [], spirits: [] }, results: [], entries: [], inventory: [] };
  const next = context.window.LBT_normalizeStateShape(fresh);
  assert.equal(next.results.length, 1);
  assert.equal(next.results[0].name, "初期作成");
  assert.equal(next.results[0].income.lp, 30);
  assert.equal(context.window.LBT_latestResultId(next), next.results[0].id);
});

test("継承アカウント: 直近リザルトが初期支給(30LP)と一致するなら足さない", () => {
  const already = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "30", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = context.window.LBT_normalizeStateShape(already);
  assert.equal(next.results.length, 1);
  assert.equal(next.results[0].name, "第一夜");
});

test("継承アカウント: 支給が一致しなければ先頭に初期作成を置く", () => {
  const legacy = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "500" } }],
    entries: [], inventory: []
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(next.results.length, 2);
  assert.equal(next.results[0].id, "res-initial");
  assert.equal(next.results[1].name, "第一夜");
});

test("初期作成の30LPから人格購入が差し引かれる", () => {
  const fresh = context.window.LBT_normalizeStateShape({
    roster: { personas: [], egos: [], supports: [], spirits: [] }, results: [], entries: [], inventory: []
  });
  const before = context.window.LBT_computeLedgerBalance(fresh.results, fresh.entries).lp;
  assert.equal(before, 30);
  const next = reducer(fresh, { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(context.window.LBT_computeLedgerBalance(next.results, next.entries).lp, 10);
  assert.equal(next.entries[0].resultId, "res-initial");
});

/* --- 初期作成用人格チケット -----------------------------------------------
   人格を1つも持たない初期状態では、最初の1人格は指定購入か抽出のどちらかで決める。
   どちらを選んでも二重得にならないよう、最初の人格が所持になった時点で
   初期作成用チケットは消費する。 */

const ticketBalance = (s) => context.window.LBT_computeTicketBalance(s.results, s.entries);
const freshState = () => context.window.LBT_normalizeStateShape({
  roster: { personas: [], egos: [], supports: [], spirits: [] }, results: [], entries: [], inventory: []
});

test("人格を1つも持たない初期状態には初期作成用人格チケットが1枚ある", () => {
  const fresh = freshState();
  assert.equal(ticketBalance(fresh).persona, 1, "初期作成リザルトが人格チケットを1枚 Lashえる");
});

test("初期作成用人格チケットで抽出すると初期作成リザルトに帰属する", () => {
  const fresh = freshState();
  const batch = {
    schemaVersion: 1,
    ruleset: "core-ticket",
    kind: "persona",
    count: 1,
    commit: "ticket-migration-test-commit",
    batchHash: "ticket-migration-test-hash",
    records: [{
      index: 0,
      kind: "persona",
      method: "ticket",
      item: { kind: "persona", mode: "n", no: 1, name: "黒雲会組員" },
      cost: { lp: 0, shards: 0 },
      duplicate: false,
      grantedShards: 0
    }]
  };
  const applied = reducer(fresh, {
    type: "APPLY_DRAW_BATCH",
    resultId: "res-initial",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });
  assert.equal(ticketBalance(applied).persona, 0, "経済取引の一括適用でチケットを消費する");
  assert.equal(applied.roster.personas.length, 1, "抽出した人格が所持へ入る");
  assert.equal(applied.entries.find((e) => e.ref?.kind === "rosterPersona")?.resultId, "res-initial");

  const drawn = reducer(applied, {
    type: "ADD_DRAW_RECORD",
    batch,
    entry: { id: "ticket-migration-test-log", at: "2026-10-23T00:00:00.000Z", hits: ["黒雲会組員"] }
  });
  assert.equal(drawn.draws.length, 1, "証明の記録が確定する");
  assert.equal(drawn.gachaLog.length, 1, "決定ログが同じ確定へ結び付く");
  assert.equal(ticketBalance(drawn).persona, 0, "チケットは消費済みなので二重消費しない");
});

test("初回の人格チケット抽選では追加取得分を二重消費しない", () => {
  const fresh = freshState();
  const withExtraTicket = reducer(fresh, {
    type: "GRANT_TICKET",
    kind: "persona",
    count: 1,
    resultId: "res-initial"
  });
  assert.equal(ticketBalance(withExtraTicket).persona, 2, "初期作成分と追加取得分の2枚");

  const batch = {
    schemaVersion: 1,
    ruleset: "core-ticket",
    kind: "persona",
    count: 1,
    commit: "initial-extra-ticket-commit",
    batchHash: "initial-extra-ticket-hash",
    records: [{
      index: 0,
      kind: "persona",
      method: "ticket",
      item: { kind: "persona", mode: "n", no: 1, name: "黒雲会組員" },
      cost: { lp: 0, shards: 0 },
      duplicate: false,
      grantedShards: 0
    }]
  };
  const applied = reducer(withExtraTicket, {
    type: "APPLY_DRAW_BATCH",
    resultId: "res-initial",
    batch,
    ticketSpend: { kind: "persona", count: 1 }
  });

  assert.equal(ticketBalance(applied).persona, 1, "抽選1回ぶんだけ消費し、追加取得分1枚が残る");
  const ticketSpends = applied.entries.filter((entry) => entry.kind === "ticket");
  assert.equal(ticketSpends.length, 1, "抽選のチケット消費明細は1件だけ");
  assert.equal(ticketSpends[0].tickets.persona, 1, "消費枚数も1枚だけ");
});

test("人格チケット以外で初回人格を取得した場合は初期チケットを消費する", () => {
  const fresh = freshState();
  const withExtraTicket = reducer(fresh, {
    type: "GRANT_TICKET",
    kind: "persona",
    count: 1,
    resultId: "res-initial"
  });
  const batch = {
    schemaVersion: 1,
    ruleset: "core",
    kind: "persona",
    count: 1,
    commit: "initial-paid-draw-commit",
    batchHash: "initial-paid-draw-hash",
    records: [{
      index: 0,
      kind: "persona",
      method: "draw",
      item: { kind: "persona", mode: "n", no: 1, name: "黒雲会組員" },
      cost: { lp: 0, shards: 0 },
      duplicate: false,
      grantedShards: 0
    }]
  };
  const applied = reducer(withExtraTicket, {
    type: "APPLY_DRAW_BATCH",
    resultId: "res-initial",
    batch
  });

  assert.equal(ticketBalance(applied).persona, 1, "追加取得分を残し、初期作成分だけを消費する");
  assert.equal(applied.entries.filter((entry) => entry.kind === "ticket").length, 1, "初期分の自動消費は1件だけ");
});

test("指定購入で人格を決めたら初期作成用チケットは残らない", () => {
  const fresh = freshState();
  assert.equal(ticketBalance(fresh).persona, 1, "購入前は1枚ある");
  const bought = reducer(fresh, { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(ticketBalance(bought).persona, 0, "指定購入ならチケットは消える");
  assert.ok(bought.entries.some((e) => e.kind === "ticket"), "チケット消費が明細に残る");
  assert.equal(context.window.LBT_computeLedgerBalance(bought.results, bought.entries).lp, 10, "購入の20LPは引かれる");
});

test("購入せず所持に追加した場合も初期作成用チケットは消える", () => {
  const bought = reducer(freshState(), { type: "ADD_ROSTER", mode: "n", no: 1 });
  assert.equal(ticketBalance(bought).persona, 0, "所持になったらチケットは意味を失う");
});

test("2人目以降の人格追加では追加取得した人格チケットを消費しない", () => {
  const first = reducer(freshState(), { type: "ADD_ROSTER", mode: "n", no: 1 });
  assert.equal(ticketBalance(first).persona, 0, "初回の取得で初期作成用チケットだけを消費する");

  const rewarded = reducer(first, {
    type: "GRANT_TICKET", kind: "persona", count: 2, resultId: "res-initial"
  });
  const second = reducer(rewarded, { type: "ADD_ROSTER", mode: "n", no: 2 });

  assert.equal(ticketBalance(second).persona, 2, "2人目の取得では通常の所持チケットが残る");
  assert.equal(second.entries.filter((entry) => entry.ref?.kind === "initialPersonaTicket").length, 1,
    "初期作成用チケットの自動消費は一度だけ");
});

test("初期チケットを0枚に修正した後の後日付与分は初期人格の自動消費対象にしない", () => {
  const initialWithoutTicket = {
    ...freshState(),
    results: [{
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }]
  };
  const added = reducer(initialWithoutTicket, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  assert.equal(ticketBalance(added).persona, 2, "後日付与された2枚は消費されない");
  assert.equal(added.entries.some((entry) => entry.ref?.kind === "initialPersonaTicket"), false);
});

test("後日リザルト経由の初回人格登録でも初期チケット支出は初期作成へ帰属する", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日シナリオ",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }]
  };
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  const spend = added.entries.find((entry) => entry.ref?.kind === "initialPersonaTicket");
  assert.equal(spend?.resultId, "res-initial", "消費明細は初期作成リザルトへ固定する");
  assert.equal(ticketBalance(added).persona, 2, "後日報酬の2枚は残る");
});

test("帰属不明な旧チケット消費がある場合は初期分の自動消費を保留する", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }],
    entries: [{
      id: "legacy-unassigned-ticket",
      kind: "ticket",
      tickets: { persona: 1, ego: 0, choice: 0, pack: {} },
      resultId: null
    }]
  };
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  assert.equal(ticketBalance(added).persona, 2, "帰属不明明細を初期分と決めつけて再消費しない");
  assert.equal(added.entries.filter((entry) => entry.ref?.kind === "initialPersonaTicket").length, 0);
});

test("同名の通常シナリオがあっても固定IDの初期作成リザルトへ消費を記録する", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "res-decoy",
      name: "初期作成",
      income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }]
  };
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  const spend = added.entries.find((entry) => entry.ref?.kind === "initialPersonaTicket");
  assert.equal(spend?.resultId, "res-initial", "固定IDの初期作成へ帰属する");
  assert.equal(ticketBalance(added).persona, 5, "同名の通常シナリオの3枚と後日報酬2枚は残る");
});

test("同名の旧初期作成候補は初期支給額が一致する唯一のレコードを選ぶ", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "legacy-decoy",
      name: "初期作成",
      income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "legacy-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }]
  };
  assert.equal(context.window.LBT_findInitialResult(state.results)?.id, "legacy-initial");
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  const spend = added.entries.find((entry) => entry.ref?.kind === "initialPersonaTicket");
  assert.equal(spend?.resultId, "legacy-initial");
  assert.equal(ticketBalance(added).persona, 5, "通常の同名シナリオと後日付与分は残す");
});

test("唯一の同名通常シナリオは初期作成として扱わず、本物の初期リザルトを補完する", () => {
  const decoy = {
    id: "res-decoy",
    name: "初期作成",
    income: { lp: 0, shards: 0, tickets: { persona: 3, ego: 0, choice: 0, pack: {} } }
  };
  assert.equal(context.window.LBT_findInitialResult([decoy]), null,
    "同名だけでは旧初期リザルトと認定しない");
  const normalized = context.window.LBT_normalizeStateShape({
    ...freshState(),
    results: [decoy],
    entries: []
  });
  assert.ok(normalized.results.some((result) => result.id === "res-initial"),
    "本物の初期支給リザルトを別途作成する");
});

test("同名候補が複数で初期支給額でも一意に判定できない旧データは自動消費を保留する", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "legacy-one",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "legacy-two",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }]
  };
  assert.equal(context.window.LBT_findInitialResult(state.results), null);
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  assert.equal(added.entries.some((entry) => entry.ref?.kind === "initialPersonaTicket"), false);
  assert.equal(ticketBalance(added).persona, 5, "曖昧な初期候補から後日報酬を差し引かない");
});

test("初期リザルトに帰属する人格チケットを既に使っていれば後日分から補填消費しない", () => {
  const state = {
    ...freshState(),
    results: [{
      id: "res-initial",
      name: "初期作成",
      income: { lp: 30, shards: 10, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
    }, {
      id: "res-later",
      name: "後日報酬",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } }
    }],
    entries: [{
      id: "initial-ticket-used",
      kind: "ticket",
      name: "人格抽出チケット を使用",
      tickets: { persona: 1, ego: 0, choice: 0, pack: {} },
      resultId: "res-initial"
    }]
  };
  const added = reducer(state, {
    type: "ADD_ROSTER", mode: "n", no: 1, purchase: false, resultId: "res-later"
  });
  assert.equal(ticketBalance(added).persona, 2, "初期支給の消費済み分を後日付与分から再消費しない");
  assert.equal(added.entries.filter((entry) => entry.ref?.kind === "initialPersonaTicket").length, 0);
});

test("既所持人格がある状態で一括取得しても通常の人格チケットは減らない", () => {
  const first = reducer(freshState(), { type: "ADD_ROSTER", mode: "n", no: 1 });
  const rewarded = reducer(first, {
    type: "GRANT_TICKET", kind: "persona", count: 3, resultId: "res-initial"
  });
  const added = reducer(rewarded, {
    type: "ADD_ROSTER_MANY",
    resultId: "res-initial",
    adds: [
      { type: "persona", mode: "n", no: 2 },
      { type: "persona", mode: "n", no: 3 }
    ]
  });
  assert.equal(ticketBalance(added).persona, 3, "2人追加しても抽出権利の残数は変わらない");
  assert.equal(added.entries.filter((entry) => entry.ref?.kind === "initialPersonaTicket").length, 1);
});

test("複数人を1アクションで所持へ入れても初期作成用チケットは1枚だけ消費する", () => {
  const fresh = freshState();
  const next = reducer(fresh, {
    type: "ADD_ROSTER_MANY",
    resultId: "res-initial",
    adds: [
      { type: "persona", mode: "n", no: 1, cost: { lp: 0, shards: 0 } },
      { type: "persona", mode: "n", no: 2, cost: { lp: 0, shards: 0 } }
    ]
  });
  assert.equal(ticketBalance(next).persona, 0, "残りは0");
  assert.equal(next.entries.filter((e) => e.kind === "ticket").length, 1, "チケット消費は1件だけ");
});

test("履歴インポートでpersonaチケット消費と初回人格獲得が並ぶ場合は一度だけ減る", () => {
  const fresh = freshState();
  const imported = reducer(fresh, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      {
        type: "ADD_RESULT",
        name: "初回抽選の履歴",
        income: { lp: 0, shards: 0, tickets: { persona: 1, ego: 0, choice: 0, pack: {} } }
      },
      {
        type: "ADD_ENTRY",
        kind: "other",
        name: "履歴上の使用：人格抽出チケット",
        cost: { lp: 0, shards: 0 },
        tickets: { persona: 1, ego: 0, choice: 0, pack: {} }
      },
      { type: "ADD_ROSTER", mode: "n", no: 1, skipInitialTicketConsumption: true }
    ]
  });
  assert.equal(ticketBalance(imported).persona, 1, "履歴に明示された1枚だけを消費し、初期作成分は重ねて引かない");
});

test("セーブの取り込みでは初期作成用チケットを消費しない", () => {
  const fresh = freshState();
  const imported = reducer(fresh, { type: "ADD_ROSTER_PERSONAS_BULK", personas: [{ mode: "n", no: 1 }] });
  assert.equal(ticketBalance(imported).persona, 1, "取り込みは購入でも抽選でもないのでチケットは残る");
});

/* --- 購入可否は「必要な通貨だけ」と比べる -------------------------------
   欠片が負でも、欠片を必要としない人格購入（core:359 の20LP）は通す。
   必要額0の通貨と残高を比べる意味が無いので、比較しない。 */

const negativeShardState = () => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  results: [{ id: "res-1", name: "第一夜", income: { lp: "100", shards: "0" } }],
  entries: [{ id: "e1", kind: "ego", name: "解析", cost: { lp: 0, shards: "160" }, resultId: "res-1" }],
  inventory: []
});

test("欠片が負でも人格購入（欠片不要）は通る", () => {
  const st = negativeShardState();
  assert.equal(context.window.LBT_computeLedgerBalance(st.results, st.entries).shards, -160, "前提: 欠片は負");
  const afford = context.window.LBT_purchaseAffordability(st, { lp: 20, shards: 0 });
  assert.equal(afford.ok, true, "必要0の欠片で不足にしない: " + afford.reason);
  const next = reducer(st, { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 20, shards: 0 } });
  assert.equal(next.roster.personas.length, 1, "所持へ入る");
  assert.equal(next.entries.length, 2, "購入の明細も立つ");
});

test("欠片が必要なものは残高不足で従来どおり止まる", () => {
  const st = negativeShardState();
  const afford = context.window.LBT_purchaseAffordability(st, { lp: 0, shards: 50 });
  assert.equal(afford.ok, false);
  assert.match(afford.reason, /欠片/);
});

test("購入可否の理由に『必要 0』の不足は出ない", () => {
  const st = negativeShardState();
  const reason = context.window.LBT_purchaseAffordability(st, { lp: 20, shards: 0 }).reason;
  assert.doesNotMatch(reason, /必要 0/);
});

test("先行シナリオのログが初期作成用人格チケットを壊さない", () => {
  const legacy = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(ticketBalance(next).persona, 0, "継承アカウントには初期チケットを足さない");
});

/* --- サポートの手動編集 ---------------------------------------------------
   装備枠（state.supports）は roster.supports からの投影。PATCH_SUPPORT が
   reducer に無く default: return state へ落ちていたため、4つの入力欄
   （名前・発動条件・効果・LP）は何も起こらずに黙って捨てられていた。 */
test("サポート枠の手動編集が保存される（投影へ反映される）", () => {
  const { reducer, initialState } = loadRuntime();
  const added = reducer(initialState, {
    type: "ADD_ROSTER_SUPPORT",
    spp: { id: 7, name: "テストサポート", cond: "なし", effect: "効果", lp: 3 },
    purchase: false
  });
  const target = (added.roster?.supports || [])[0];
  assert.ok(target, "サポートが所持へ入る");
  const equipped = reducer(added, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: target.uid, equipped: true });

  const after = reducer(equipped, { type: "PATCH_SUPPORT", id: target.uid, patch: { lp: 99, effect: "書き換え済み" } });

  assert.equal((after.roster?.supports || []).find((s) => s.uid === target.uid).lp, 99, "roster 側が変わる");
  const projected = (after.supports || []).find((s) => s.id === target.uid);
  assert.ok(projected, "装備枠に投影される");
  assert.equal(projected.lp, 99, "装備枠の LP が変わる");
  assert.equal(projected.effect, "書き換え済み", "装備枠の効果が変わる");
});

test("UI が送る action はすべて reducer が受け付けている", () => {
  const fs = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const reducerTypes = new Set([...fs.matchAll(/case\s+"([A-Z_0-9]+)":/g)].map((m) => m[1]));
  const orphans = [];
  for (const f of ["OtherSections.js", "App.js", "PersonaCodex.js", "ItemCodex.js", "accounts-ui.js", "ui.js", "DataQuality.js"]) {
    const src = readFileSync(new URL("../js/" + f, import.meta.url), "utf8");
    for (const m of src.matchAll(/dispatch\(\s*\{\s*type:\s*"([A-Z_0-9]+)"/g)) {
      if (!reducerTypes.has(m[1])) orphans.push(f + ": " + m[1]);
    }
  }
  assert.deepEqual(orphans, [], "reducer に無い action を送ると default へ落ちて黙って捨てられる: " + orphans.join(", "));
});

/* --- 一括抽選のチケット消費 ------------------------------------------------
   ガチャは「引いた回数ぶん」を count でまとめて 1 action で送る。
   SPEND_TICKET が count を無視すると、5 枚で 5 回引いても 1 枚しか消費されず、
   残数が増える（5 - (-1) = 6）。 */
const withTickets = (n) => reducer(context.window.LBT_normalizeStateShape({
  /* 初期作成直後ではないProgress済みアカウント。初期作成用人格チケットが
     混ざると「n枚でn回」の残数検証が1ずれる。 */
  results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }], entries: [], inventory: []
}), {
  type: "ADD_RESULT",
  name: "初期",
  income: { lp: 0, shards: 0, tickets: { persona: n, ego: 0, choice: 0, pack: {} } }
});

test("一括抽選は引いた回数ぶんチケットを消費する", () => {
  const next = reducer(withTickets(5), { type: "SPEND_TICKET", kind: "persona", count: -5 });
  assert.equal(balanceOf(next).persona, 0, "5枚で5回なら残0");
});

test("SPEND_TICKET の count は負数で「消費した枚数」を表す", () => {
  const next = reducer(withTickets(10), { type: "SPEND_TICKET", kind: "persona", count: -3 });
  assert.equal(balanceOf(next).persona, 7);
});

test("count 無しなら 1 枚だけ消費する（従来どおり）", () => {
  const next = reducer(withTickets(5), { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(balanceOf(next).persona, 4);
});

test("所持より多くは消費しない（残を負にしない）", () => {
  const next = reducer(withTickets(3), { type: "SPEND_TICKET", kind: "persona", count: -5 });
  assert.equal(balanceOf(next).persona, 0, "足りなければ手前まで使って止まる");
});

test("0枚なら何も消費しない（明細も残さない）", () => {
  const before = withTickets(0);
  const next = reducer(before, { type: "SPEND_TICKET", kind: "persona", count: -1 });
  assert.equal(balanceOf(next).persona, 0);
  assert.equal((next.entries || []).length, (before.entries || []).length, "明細が増えるべきでない");
});

test("複数枚の消費は明細に枚数が残る", () => {
  const next = reducer(withTickets(5), { type: "SPEND_TICKET", kind: "persona", count: -5 });
  const entry = (next.entries || [])[0];
  assert.equal(entry.tickets.persona, 5, "明細が 5 枚ぶんの消費を表す");
  assert.match(entry.name, /5枚/, "明細の名にも枚数が分かる");
});

/* --- 抽選の決定記録 -------------------------------------------------------
   支払いと取得物はUndoで巻き戻る（それは正しい）。
   「この抽選で何が出た」という決定だけは、Undoしてもアカウントを
   切り替えても、セーブデータを読み込んでも残る。 */

test("抽選の決定記録は追記され、二重にならない", () => {
  const entry = { id: "c1", at: "2026-01-01T00:00:00Z", route: "persona", times: 1, hits: [{ name: "A" }] };
  let s = reducer(context.window.LBT_normalizeStateShape({}), { type: "ADD_GACHA_LOG", entry });
  assert.equal(s.gachaLog.length, 1);
  s = reducer(s, { type: "ADD_GACHA_LOG", entry });
  assert.equal(s.gachaLog.length, 1, "同じ id は二重に入らない（Undoでの再適用でも安全）");
  const other = reducer(s, { type: "ADD_GACHA_LOG", entry: { ...entry, id: "c2" } });
  assert.equal(other.gachaLog.length, 2, "別の抽選は追記される");
});

test("抽選の記録はソートせず、決まった順に積む", () => {
  let s = context.window.LBT_normalizeStateShape({});
  for (const id of ["a", "b", "c"]) s = reducer(s, { type: "ADD_GACHA_LOG", entry: { id, hits: [] } });
  assert.equal(s.gachaLog.map((e) => e.id).join(","), "a,b,c");
});

