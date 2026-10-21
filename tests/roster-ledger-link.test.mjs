import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   所持追加（= 取り込み・ショップ購入の入口）が「記録」と正しく繋がることを守る。

   守るべき性質:
     - DB 照合は文字列比較。取り込み経路が no を文字列で渡しても
       名前と価格が引けること（引けないとフォールバック名・0円で記録される）
     - 所持を立てる 4 経路すべてが resultId をappendLedgerEntry に渡すこと
       （渡さないと常に「直近のリザルト」へ倒れ、取り込んだ先と食い違う）
     - 明細の ref.uid が所持の uid と一致すること
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadReducer() {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: { DB: db }, console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.appReducer;
}

const base = () => ({
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  entries: [],
  results: [{ id: "res-a", name: "Week0", income: { lp: 100, shards: 100 } }, { id: "res-b", name: "Week1", income: { lp: 100, shards: 100 } }],
  ui: {}
});

/* DB 実データから必ず引ける E.G.O を 1 件選ぶ（結果に依存させない）。 */
const dbEgo = db.egos[0];
const dbSpirit = db.spirits[0];

test("E.G.O の所持追加: no を文字列で渡しても名前と価格が引ける", () => {
  const reducer = loadReducer();
  const s = reducer(base(), { type: "ADD_ROSTER_EGO", no: String(dbEgo.no), rank: dbEgo.rank, purchase: true, resultId: "res-b" });
  const entry = s.entries[0];
  assert.ok(entry, "明細が立つ");
  assert.equal(entry.name, dbEgo.name, "フォールバック名にならない");
  assert.equal(entry.resultId, "res-b");
  const shards = Number(String(dbEgo.shards ?? 0).replace(/[^\d.-]/g, "")) || 0;
  assert.equal(entry.cost.shards, shards, "DB の価格が反映される");
});

test("E.G.O の所持追加: 数値の no でも同じ結果になる（どちらの型でも落ちない）", () => {
  const reducer = loadReducer();
  const num = reducer(base(), { type: "ADD_ROSTER_EGO", no: Number(dbEgo.no), rank: dbEgo.rank, purchase: true, resultId: "res-b" });
  const str = reducer(base(), { type: "ADD_ROSTER_EGO", no: String(dbEgo.no), rank: dbEgo.rank, purchase: true, resultId: "res-b" });
  assert.equal(num.entries[0].name, str.entries[0].name);
  assert.deepEqual(num.entries[0].cost, str.entries[0].cost);
});

test("人格の所持追加: 明細の ref.uid が所持の uid と一致する", () => {
  const reducer = loadReducer();
  const s = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 0, shards: 0 }, resultId: "res-b" });
  const uid = s.roster.personas[0].uid;
  assert.equal(s.entries[0].ref.kind, "rosterPersona");
  assert.equal(s.entries[0].ref.uid, uid);
  assert.equal(s.entries[0].resultId, "res-b");
  assert.equal(s.entries[0].cost.lp, 0, "人格はガチャ費用ではなく、所持へ入れた時点で明細が立つ");
});

test("所持.passive と spirit も明示したリザルトへ帰属する（常に直近へ倒さない）", () => {
  const reducer = loadReducer();
  const withSupport = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: db.support_passives[0].name }, resultId: "res-a" });
  assert.equal(withSupport.entries[0].resultId, "res-a", "res-a を明示しているのに res-b へ倒れない");
  assert.equal(withSupport.entries[0].ref.kind, "rosterSupport");
  assert.equal(withSupport.entries[0].ref.uid, withSupport.roster.supports[0].uid);

  const withSpirit = reducer(base(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: dbSpirit.name }, resultId: "res-a" });
  assert.equal(withSpirit.entries[0].resultId, "res-a");
  assert.equal(withSpirit.entries[0].ref.kind, "rosterSpirit");
  assert.equal(withSpirit.entries[0].ref.uid, withSpirit.roster.spirits[0].uid);
});

test("resultId 未指定の所持追加は、所持レコードと明細が同じ直近リザルトを指す", () => {
  const reducer = loadReducer();
  const support = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: db.support_passives[0].name } });
  assert.equal(support.roster.supports[0].resultId, "res-b");
  assert.equal(support.entries[0].resultId, "res-b");

  const spirit = reducer(base(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: dbSpirit.name } });
  assert.equal(spirit.roster.spirits[0].resultId, "res-b");
  assert.equal(spirit.entries[0].resultId, "res-b");
});

test("購入でない所持は、明細が無いので未分類のまま（勝手に直近へ倒さない）", () => {
  const reducer = loadReducer();
  const support = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: db.support_passives[0].name }, purchase: false });
  assert.equal(support.roster.supports[0].resultId, null);
  const spirit = reducer(base(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: dbSpirit.name }, purchase: false });
  assert.equal(spirit.roster.spirits[0].resultId, null);
});

test("通帳の帰属を変えると、対応する所持レコードも同じリザルトへ動く", () => {
  const reducer = loadReducer();
  let s = reducer(base(), { type: "ADD_ROSTER_SUPPORT", spp: { name: db.support_passives[0].name } });
  const entry = s.entries[0];
  s = reducer(s, { type: "SET_ENTRY_RESULT", id: entry.id, resultId: "res-a" });
  assert.equal(s.entries[0].resultId, "res-a");
  assert.equal(s.roster.supports[0].resultId, "res-a", "片方だけ動かさない");
});

test("所持を外すと、その所持に対応する支出も同時に消える", () => {
  const reducer = loadReducer();
  let s = reducer(base(), { type: "ADD_ROSTER_EGO", no: String(dbEgo.no), rank: dbEgo.rank, purchase: true, resultId: "res-a" });
  assert.equal(s.entries.length, 1);
  const uid = s.roster.egos[0].uid;
  s = reducer(s, { type: "REMOVE_ROSTER_EGO", uid });
  assert.equal(s.roster.egos.length, 0);
  assert.equal(s.entries.length, 0, "明細だけ残ると残高が狂う");
});

test("精神の初期枠は装備扱いで、明細を立てない", () => {
  const reducer = loadReducer();
  const free = db.spirits.filter((s) => !(Number(s.price) > 0)).map((s) => s.name);
  assert.ok(free.length > 0, "初期選択可能な精神が DB にある");

  const defined = reducer(base(), { type: "SET_INITIAL_SPIRITS", names: [...free, "  ", free[0]] });
  assert.deepEqual([...defined.initialSpirits], free, "空文字と重複を除く");

  const seeded = reducer(defined, { type: "APPLY_INITIAL_SPIRITS" });
  assert.equal(seeded.roster.spirits.length, free.length);
  assert.ok(seeded.roster.spirits.every((entry) => entry.origin === "initial" && !!entry.uid));
  assert.equal(seeded.entries.length, 0, "精神は購入ではないので明細を立てない");

  const again = reducer(seeded, { type: "APPLY_INITIAL_SPIRITS" });
  assert.equal(again.roster.spirits.length, free.length, "取り込みは冪等");
});

test("精神の試着（初期枠）は所持へは入るが購入明細は立てない", () => {
  const reducer = loadReducer();
  const sp = db.spirits[0];
  const viaPurchase = reducer(base(), { type: "ADD_ROSTER_SPIRIT", spirit: { name: sp.name } });
  assert.equal(viaPurchase.entries.length, 1, "ショップ経由は購入として明細が立つ");

  const viaInitial = reducer(base(), { type: "SET_INITIAL_SPIRITS", names: [sp.name] });
  const seeded = reducer(viaInitial, { type: "APPLY_INITIAL_SPIRITS" });
  assert.equal(seeded.roster.spirits.length, 1);
  assert.equal(seeded.entries.length, 0, "初期枠は装備扱いで明細を立てない");
});

test("人格・E.G.O の一括削除も購入明細を外し、undo で所持と明細を戻す", () => {
  const reducer = loadReducer();
  let s = reducer(base(), { type: "ADD_ROSTER", mode: "n", no: 1, purchase: true, cost: { lp: 0, shards: 0 }, resultId: "res-a" });
  const persona = s.roster.personas[0];
  const personaEntry = s.entries[0];
  s = reducer(s, { type: "REMOVE_ROSTER_BATCH", uids: [persona.uid] });
  assert.equal(s.roster.personas.length, 0);
  assert.equal(s.entries.length, 0, "単体削除と同じく明細も外す");
  s = reducer(s, { type: "RESTORE_ROSTER_BATCH", kind: "personas", items: [persona], entries: [personaEntry] });
  assert.equal(s.roster.personas.length, 1);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].id, personaEntry.id);

  let e = reducer(base(), { type: "ADD_ROSTER_EGO", no: String(dbEgo.no), rank: dbEgo.rank, purchase: true, resultId: "res-a" });
  const ego = e.roster.egos[0];
  const egoEntry = e.entries[0];
  e = reducer(e, { type: "REMOVE_ROSTER_EGO_BATCH", uids: [ego.uid], deleteCustomConfirmed: true });
  assert.equal(e.roster.egos.length, 0);
  assert.equal(e.entries.length, 0);
  e = reducer(e, { type: "RESTORE_ROSTER_BATCH", kind: "egos", items: [ego], entries: [egoEntry] });
  assert.equal(e.roster.egos.length, 1);
  assert.equal(e.entries.length, 1);
});