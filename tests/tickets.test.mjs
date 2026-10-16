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

test("残数 0 のときに SPEND_TICKET は何も起こさない", () => {
  const s = withResult({});
  const spent = reducer(s, { type: "SPEND_TICKET", kind: "persona" });
  assert.equal(spent.entries.length, 0);
});

test("SET_TICKET_COUNT は残数の目標値に合わせる", () => {
  const s = reducer(withResult({ persona: 2 }), { type: "SET_TICKET_COUNT", kind: "persona", count: 5 });
  assert.equal(balanceOf(s).persona, 5);
  const down = reducer(s, { type: "SET_TICKET_COUNT", kind: "persona", count: 1 });
  assert.equal(balanceOf(down).persona, 1);
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

test("同じ内容が既に収入にある場合は移行しない（二重計上を避ける）", () => {
  const legacy = {
    ...withResult({ persona: 2 }),
    tickets: [{ kind: "persona", pack: null, count: 2 }]
  };
  const next = context.window.LBT_normalizeStateShape(legacy);
  assert.equal(balanceOf(next).persona, 2, "増えない");
  assert.equal(next.results.filter((r) => r.name === "抽出チケットの受領").length, 0);
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
  const spent = reducer(fresh, { type: "SPEND_TICKET", kind: "persona", count: 1, resultId: "res-initial" });
  assert.equal(ticketBalance(spent).persona, 0, "抽出手番でチケットが消費される");
  const drawn = reducer(spent, {
    type: "ADD_DRAW_BATCH",
    resultId: "res-initial",
    batch: { records: [{ kind: "persona", item: { kind: "persona", mode: "n", no: 1, name: "黒雲会組員" }, cost: { lp: 0, shards: 0 } }] }
  });
  assert.equal(drawn.roster.personas.length, 1, "抽出した人格が所持へ入る");
  assert.equal(drawn.entries.find((e) => e.ref?.kind === "rosterPersona")?.resultId, "res-initial");
  assert.equal(ticketBalance(drawn).persona, 0, "チケットは消費済みなので二重消費しない");
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

test("複数人をまとめて所持へ入れても初期作成用チケットは1枚だけ消費する", () => {
  const fresh = freshState();
  const next = reducer(fresh, {
    type: "ADD_DRAW_BATCH",
    resultId: "res-initial",
    batch: { records: [
      { kind: "persona", item: { kind: "persona", mode: "n", no: 1, name: "黒雲会組員" }, cost: { lp: 0, shards: 0 } },
      { kind: "persona", item: { kind: "persona", mode: "n", no: 2, name: "黒雲会組員" }, cost: { lp: 0, shards: 0 } }
    ] }
  });
  assert.equal(ticketBalance(next).persona, 0, "残りは0");
  assert.equal(next.entries.filter((e) => e.kind === "ticket").length, 1, "チケット消費は1件だけ");
});

test("セーブの取り込みでは初期作成用チケットを消費しない", () => {
  const fresh = freshState();
  const imported = reducer(fresh, { type: "ADD_ROSTER_PERSONAS_BULK", personas: [{ mode: "n", no: 1 }] });
  assert.equal(ticketBalance(imported).persona, 1, "取り込みは購入でも抽選でもないのでチケットは残る");
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
    spp: { id: 7, name: "テストサポート", cond: "なし", effect: "効果", lp: 3 }
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

