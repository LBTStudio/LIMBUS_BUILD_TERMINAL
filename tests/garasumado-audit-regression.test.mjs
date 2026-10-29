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
test("取込リデューサーは固有keyで明細の帰属先を解決する", () => {
 const src = read("../js/state.js"); assert.match(src, /const resultIdByBatchKey = new Map\(\)/); assert.match(src, /Array\.isArray\(sub\.viaKeys\)/); assert.match(src, /resultIdByBatchKey\.get\(viaKey\)/); assert.match(src, /const batchKey = String\(sub\.batchKey \|\| ""\)/);
});
