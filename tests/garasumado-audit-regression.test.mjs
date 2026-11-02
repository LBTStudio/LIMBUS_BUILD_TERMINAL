import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const db = { normal_personas: [{ no: 1, name: "対象人格" }], tokui_personas: [], egos: [], support_passives: [], death_passives: [], spirits: [], normal_enhancements: [], special_enhancements: [], items: [] };
function loadAuditApis() { const window = { DB: db }, parserModule = { exports: {} }, rosterModule = { exports: {} }; vm.runInNewContext(read("../js/garasumado-memo-parse.js"), { window, module: parserModule, console }); vm.runInNewContext(read("../js/garasumado-roster-import.js"), { window, module: rosterModule, console }); return { memo: parserModule.exports, roster: rosterModule.exports }; }
function scenario(key, wins = [], extra = {}) { return { key, name: "同じ卓", memo: "", income: { lp: 0, shards: 0 }, tickets: { persona: 0, ego: 0, choice: 0 }, pack: {}, spends: [], reasons: [], sourceAudits: [], financialCoverage: [], wins, ticketSpends: [], consumedItems: [], ...extra }; }

test("同名シナリオでも取得証跡が一意なら正しいシナリオkeyへ割り当てる", () => {
 const { roster } = loadAuditApis(); const manifest = { scenarios: [scenario("scenario:0"), scenario("scenario:1", [{ name: "対象人格" }])], groups: [{ id: "personas", items: [{ key: "owned:1", name: "対象人格", kinds: [{ kind: "persona", no: 1, mode: "n" }], source: "given" }] }] };
 const draft = roster.buildResultDraft(manifest, { db, selected: ["owned:1"] }); assert.equal(draft.blocks[0].items.length, 0); assert.equal(draft.blocks[1].items.length, 1); assert.equal(draft.blocks[1].items[0].scenarioKey, "scenario:1");
});
test("同じ所持品が複数の同名シナリオに現れる場合は誤帰属せず手動確認へ回す", () => {
 const { roster } = loadAuditApis(); const manifest = { scenarios: [scenario("scenario:0", [{ name: "対象人格" }]), scenario("scenario:1", [{ name: "対象人格" }])], groups: [{ id: "personas", items: [{ key: "owned:1", name: "対象人格", kinds: [{ kind: "persona", no: 1, mode: "n" }], source: "given" }] }] };
 const draft = roster.buildResultDraft(manifest, { db, selected: ["owned:1"] }); assert.equal(draft.blocks[0].items.length + draft.blocks[1].items.length, 0); assert.equal(draft.unassigned.length, 1); assert.match(draft.unassigned[0].reason, /複数のシナリオ/);
});
test("手動指定のシナリオkeyは同名でもactionへ渡す", () => {
 const { roster } = loadAuditApis(); const manifest = { scenarios: [scenario("scenario:0"), scenario("scenario:1")], groups: [{ id: "personas", items: [{ key: "owned:1", name: "対象人格", kinds: [{ kind: "persona", no: 1, mode: "n" }], via: [], source: "given" }] }] };
 const { actions } = roster.toDispatchActions(manifest, ["owned:1"], { db, scenarioKeyByItem: { "owned:1": "scenario:1" } }); const added = actions.find((a) => a.type === "ADD_ROSTER"); assert.ok(added); assert.deepEqual(Array.from(added.viaKeys), ["scenario:1"]); assert.deepEqual(Array.from(added.via), ["同じ卓"]); assert.equal(actions.filter((a) => a.type === "ADD_RESULT")[1].batchKey, "scenario:1");
});
test("金額未確定のゼロ支出は確定明細にせず保留する", () => {
 const { roster } = loadAuditApis(), raw = "東部親指ソルダードII 87"; const manifest = { groups: [], scenarios: [scenario("scenario:0", [], { spends: [{ name: raw, raw, lp: 0, shards: 0 }], reasons: [{ line: raw, reason: "支出金額が読み取れない（要確認）" }] })] };
 const { actions, skipped } = roster.toDispatchActions(manifest, [], { db }); assert.equal(actions.filter((a) => a.type === "ADD_ENTRY").length, 0); assert.ok(skipped.some((a) => /金額未確定の支出候補/.test(a.reason)));
});
test("パーサが補正した通貨候補行も元表記の警告と照合して保留する", () => {
 const { roster } = loadAuditApis();
 const normalized = "対象品 現在87";
 const source = "対象品 現座87";
 const manifest = {
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   spends: [{ name: normalized, raw: normalized, lp: 0, shards: 0 }],
   reasons: [{ line: source, reason: "支出金額が読み取れない（要確認）" }]
  })]
 };
 const { actions, skipped } = roster.toDispatchActions(manifest, [], { db });
 assert.equal(actions.filter((a) => a.type === "ADD_ENTRY").length, 0);
 assert.ok(skipped.some((a) => /金額未確定の支出候補/.test(a.reason)));
});
test("通貨単位の無い支出数値は未確定候補として警告に残す", () => {
 const { memo } = loadAuditApis(), parsed = memo.parseMemo("・支出\n東部親指ソルダードII 87"); assert.ok(parsed.financialCoverage.some((a) => a.status === "unitless-currency-review")); assert.ok(parsed.sourceAudits.some((a) => a.code === "unitless-expense-candidate" && a.severity === "review")); assert.ok(parsed.reasons.some((a) => /通貨単位がありません/.test(a.reason)));
});
test("金額を読み取れていても通貨監査警告がある支出は確定明細にしない", () => {
 const { roster } = loadAuditApis();
 const raw = "対象品 87LP消費";
 const manifest = {
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   importSourceKey: "gara1:share-source-123:row0:2026-11-03:spend:1",
   memo: "・支出\n" + raw,
   spends: [{ name: "対象品", raw, lp: 87, shards: 0 }],
   sourceAudits: [{ code: "currency-direction-uncertain", severity: "warning", lineIndex: 2, line: raw, message: "方向の確認が必要" }],
   financialCoverage: []
  })]
 };
 const built = roster.toDispatchActions(manifest, [], { db });
 assert.equal(built.actions.filter((action) => action.type === "ADD_ENTRY").length, 0,
  "警告行の暫定87LPを台帳へ入れない");
 const result = built.actions.find((action) => action.type === "ADD_RESULT");
 assert.equal(result.financialReviews.length, 1);
 assert.equal(result.financialReviews[0].line, raw);
});

test("金額未確定候補はリザルトへ保存され、残高へ混ぜず後から明示確定できる", () => {
 const { memo, roster } = loadAuditApis();
 const raw = "東部親指ソルダードII 87";
 const parsed = memo.parseMemo("・支出\n" + raw);
 const sourceKey = "gara1:share-source-123:2026-11-03:scenario-a:1";
 const manifest = {
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   importSourceKey: sourceKey,
   sourceId: "share-source-123",
   scenarioIndex: 0,
   sourceIndex: 0,
   memo: "・支出\n" + raw,
   ...parsed,
   name: "候補保持テスト"
  })]
 };
 const { actions } = roster.toDispatchActions(manifest, [], { db });
 assert.equal(actions.filter((action) => action.type === "ADD_ENTRY").length, 0,
  "読み取れない金額を0円支出として作らない");
 const resultAction = actions.find((action) => action.type === "ADD_RESULT");
 assert.ok(resultAction);
 assert.equal(resultAction.financialReviews.length, 1);
 assert.equal(resultAction.financialReviews[0].line, raw);
 assert.equal(resultAction.financialReviews[0].lineIndex, 2);
 assert.equal(resultAction.financialReviews[0].sourceKey, sourceKey);
 assert.equal(resultAction.financialReviews[0].status, "pending");

 const stateContext = { window: { DB: db, console }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
 stateContext.globalThis = stateContext;
 vm.runInNewContext(read("../js/ledger-provenance.js"), stateContext, { filename: "ledger-provenance.js" });
 vm.runInNewContext(read("../js/state.js"), stateContext, { filename: "state.js" });
 const reducer = stateContext.window.appReducer;
 const baseState = {
  results: [], entries: [],
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  inventory: [], tickets: []
 };
 const imported = reducer(baseState, { type: "APPLY_IMPORT_BATCH", actions });
 const stored = imported.results[0].financialReviews[0];
 assert.equal(stored.status, "pending");
 assert.equal(stateContext.window.LBT_computeLedgerBalance(imported.results, imported.entries).spentLp, 0);
 assert.equal(stateContext.window.LBT_computeLedgerBalance(imported.results, imported.entries).spentShards, 0);

 const resolved = reducer(imported, {
  type: "RESOLVE_FINANCIAL_REVIEW",
  resultId: imported.results[0].id,
  candidateKey: stored.key,
  currency: "lp",
  direction: "spend",
  amount: "87"
 });
 assert.equal(resolved.entries.length, 1);
 assert.equal(resolved.entries[0].cost.lp, 87);
 assert.equal(resolved.entries[0].resultId, imported.results[0].id);
 assert.equal(resolved.entries[0].ref.kind, "financialReview");
 assert.equal(resolved.results[0].financialReviews[0].status, "confirmed");
 assert.equal(stateContext.window.LBT_computeLedgerBalance(resolved.results, resolved.entries).spentLp, 87);
 const repeated = reducer(resolved, {
  type: "RESOLVE_FINANCIAL_REVIEW",
  resultId: resolved.results[0].id,
  candidateKey: stored.key,
  currency: "lp",
  direction: "spend",
  amount: "87"
 });
 assert.strictEqual(repeated, resolved, "確定済み候補は二重確定できない");
});

test("同一共有元の再取込は確定候補を保持し、候補行を増殖させない", () => {
 const { memo, roster } = loadAuditApis();
 const raw = "東部親指ソルダードII 87";
 const parsed = memo.parseMemo("・支出\n" + raw);
 const sourceKey = "gara1:share-source-123:2026-11-03:scenario-a:1";
 const manifest = {
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   importSourceKey: sourceKey, sourceId: "share-source-123",
   memo: "・支出\n" + raw, ...parsed
  })]
 };
 const { actions } = roster.toDispatchActions(manifest, [], { db });
 const stateContext = { window: { DB: db, console }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
 stateContext.globalThis = stateContext;
 vm.runInNewContext(read("../js/ledger-provenance.js"), stateContext, { filename: "ledger-provenance.js" });
 vm.runInNewContext(read("../js/state.js"), stateContext, { filename: "state.js" });
 const reducer = stateContext.window.appReducer;
 const baseState = { results: [], entries: [], roster: { personas: [], egos: [], supports: [], spirits: [] }, inventory: [] };
 const imported = reducer(baseState, { type: "APPLY_IMPORT_BATCH", actions });
 const candidate = imported.results[0].financialReviews[0];
 const resolved = reducer(imported, {
  type: "RESOLVE_FINANCIAL_REVIEW", resultId: imported.results[0].id,
  candidateKey: candidate.key, currency: "shards", direction: "income", amount: 12
 });
 const reimported = reducer(resolved, { type: "APPLY_IMPORT_BATCH", actions });
 assert.equal(reimported.results.length, 1);
 assert.equal(reimported.results[0].financialReviews.length, 1);
 assert.equal(reimported.results[0].financialReviews[0].status, "confirmed");
 assert.equal(reimported.results[0].financialReviews[0].currency, "shards");
 assert.equal(reimported.results[0].financialReviews[0].amount, 12);
 assert.equal(reimported.entries.length, 0);
 assert.equal(reimported.results[0].income.shards, 12,
  "パーサ再出力に候補が残る間は、確定済み収入を再取込で失わない");
});

test("確定支出の明細を削除すると、元の確認候補が再びpendingへ戻る", () => {
 const { memo, roster } = loadAuditApis();
 const raw = "東部親指ソルダードII 87";
 const parsed = memo.parseMemo("・支出\n" + raw);
 const manifest = { groups: [], scenarios: [scenario("scenario:0", [], {
  importSourceKey: "gara1:share-source-123:row0:2026-11-03:scenario-a:1",
  sourceId: "share-source-123", memo: "・支出\n" + raw, ...parsed
 })] };
 const { actions } = roster.toDispatchActions(manifest, [], { db });
 const context = { window: { DB: db, console }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
 context.globalThis = context;
 vm.runInNewContext(read("../js/ledger-provenance.js"), context, { filename: "ledger-provenance.js" });
 vm.runInNewContext(read("../js/state.js"), context, { filename: "state.js" });
 const reducer = context.window.appReducer;
 const imported = reducer({
  results: [], entries: [], roster: { personas: [], egos: [], supports: [], spirits: [] }, inventory: []
 }, { type: "APPLY_IMPORT_BATCH", actions });
 const review = imported.results[0].financialReviews[0];
 const resolved = reducer(imported, {
  type: "RESOLVE_FINANCIAL_REVIEW", resultId: imported.results[0].id,
  candidateKey: review.key, currency: "lp", direction: "spend", amount: 87
 });
 const entry = resolved.entries.find((row) => row.ref?.kind === "financialReview");
 assert.ok(entry);
 const deleted = reducer(resolved, { type: "PURGE_ENTRY", id: entry.id });
 assert.equal(deleted.entries.length, 0);
 assert.equal(deleted.results[0].financialReviews[0].status, "pending");
 assert.equal(deleted.results[0].financialReviews[0].amount, null);
});

test("行番号付き新キーへの移行時も旧リザルト・旧取込明細を再利用する", () => {
 const { roster } = loadAuditApis();
 const oldKey = "gara1:share-source-123:2026-11-03:同じ卓:1";
 const newKey = "gara1:share-source-123:row0:2026-11-03:同じ卓:1";
 const manifest = {
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   name: "同じ卓",
   importSourceKey: newKey,
   legacyImportSourceKey: oldKey,
   spends: [{ name: "試験購入", raw: "試験購入 10LP", lp: 10, shards: 0 }]
  })]
 };
 const actions = roster.toDispatchActions(manifest, [], {}).actions;
 const resultId = "legacy-imported-result";
 const context = { window: { DB: db, console }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
 context.globalThis = context;
 vm.runInNewContext(read("../js/ledger-provenance.js"), context, { filename: "ledger-provenance.js" });
 vm.runInNewContext(read("../js/state.js"), context, { filename: "state.js" });
 const reducer = context.window.appReducer;
 const before = {
  results: [{ id: resultId, name: "同じ卓", importSourceKey: oldKey, income: { lp: 0, shards: 0 } }],
  entries: [{
   id: "old-import-entry", kind: "other", name: "旧取込明細",
   cost: { lp: 10, shards: 0 }, resultId, importResultKey: oldKey
  }],
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  inventory: []
 };
 const updated = reducer(before, { type: "APPLY_IMPORT_BATCH", actions });
 assert.equal(updated.results.length, 1, "既存リザルトを新規作成せず更新する");
 assert.equal(updated.results[0].id, resultId);
 assert.equal(updated.results[0].importSourceKey, newKey, "新しい行番号付きキーへ移行する");
 assert.equal(updated.entries.filter((entry) => entry.importResultKey === oldKey).length, 0,
  "旧キーの明細は置き換える");
 assert.equal(updated.entries.filter((entry) => entry.importResultKey === newKey).length, 1,
  "新キーの明細だけが残る");
 assert.equal(updated.entries.filter((entry) => entry.cost.lp === 10).length, 1,
  "再取込でLP支出を二重計上しない");
});

test("同名・同日シナリオの並べ替えは共有行キーを変える", () => {
 const { memo, roster } = loadAuditApis();
 const raw = "対象品 87";
 const parsed = memo.parseMemo("・支出\n" + raw);
 const makeManifest = (sourceIndex) => ({
  groups: [],
  scenarios: [scenario("scenario:0", [], {
   sourceId: "share-source-123",
   sourceIndex,
   scenarioIndex: sourceIndex,
   importSourceKey: "gara1:share-source-123:row" + sourceIndex + ":2026-11-03:same-scenario:1",
   memo: "・支出\n" + raw,
   date: "2026-11-03",
   ...parsed
  })]
 });
 const actionsA = roster.toDispatchActions(makeManifest(0), [], { db }).actions;
 const actionsB = roster.toDispatchActions(makeManifest(1), [], { db }).actions;
 const resultA = actionsA.find((action) => action.type === "ADD_RESULT");
 const resultB = actionsB.find((action) => action.type === "ADD_RESULT");
 assert.notEqual(resultA.financialReviews[0].key, resultB.financialReviews[0].key,
  "レビュー行keyは元行位置を反映する");
 assert.equal(resultA.importSourceKey, resultB.importSourceKey,
  "リザルト自体の共有元keyは履歴の並べ替えで変えない");

 const context = { window: { DB: db, console }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
 context.globalThis = context;
 vm.runInNewContext(read("../js/ledger-provenance.js"), context, { filename: "ledger-provenance.js" });
 vm.runInNewContext(read("../js/state.js"), context, { filename: "state.js" });
 const reducer = context.window.appReducer;
 const baseState = { results: [], entries: [], roster: { personas: [], egos: [], supports: [], spirits: [] }, inventory: [] };
 const imported = reducer(baseState, { type: "APPLY_IMPORT_BATCH", actions: actionsA });
 const candidate = imported.results[0].financialReviews[0];
 const resolved = reducer(imported, {
  type: "RESOLVE_FINANCIAL_REVIEW", resultId: imported.results[0].id,
  candidateKey: candidate.key, currency: "lp", direction: "spend", amount: 87
 });
 const reordered = reducer(resolved, { type: "APPLY_IMPORT_BATCH", actions: actionsB });
 assert.equal(reordered.results.length, 1, "行移動でも既存リザルトを更新する");
 assert.equal(reordered.results[0].financialReviews[0].status, "confirmed",
  "原文行が一意に一致すれば確認状態を引き継ぐ");
 assert.equal(reordered.entries.length, 1, "確認済み支出を再作成しない");
 assert.equal(reordered.entries[0].cost.lp, 87);
});

test("取込リデューサーは固有keyで明細の帰属先を解決する", () => {
 const src = read("../js/state.js"); assert.match(src, /const resultIdByBatchKey = new Map\(\)/); assert.match(src, /Array\.isArray\(sub\.viaKeys\)/); assert.match(src, /resultIdByBatchKey\.get\(viaKey\)/); assert.match(src, /const batchKey = String\(sub\.batchKey \|\| ""\)/);
});
