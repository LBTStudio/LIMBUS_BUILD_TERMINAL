import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   所持モデルの统一（人格 / E.G.O / サポパ / 精神）の回帰テスト。

   守るべき性質:
     - 装備スロットは所持の投影。所持を書き換えると装備が追随する
     - 所持していないものは装備できない（旧経路も塞ぐ）
     - 旧保存データ（装備しか持たない版）はデータを落とさず未分類所持へ移る
     - 帰属先（resultId）は保存・読み込み後も保持される
--------------------------------------------------------------------------- */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

/* 小さなDBスタブ。所持・装備の判定に必要な分だけ。 */
const dbStub = () => ({
  support_passives: [
    { name: "出血促進", cond: "出血があるなら", effect: "出血ダメージ+1", lp: "3LP" },
    { name: "消化", cond: "対象が血鬼なら", effect: "ダメージ量+1", lp: "2LP" }
  ],
  death_passives: [
    { name: "覚悟", cond: "死亡したなら", effect: "呼吸2を得る", lp: "4LP" }
  ],
  spirits: [
    { name: "泉水", price: "50", always_effect: "常時A", morale_effect: "士気M", confuse_effect: "混乱C" }
  ],
  normal_enhancements: [],
  special_enhancements: []
});

function loadContext() {
  const windowStub = { DB: dbStub() };
  const context = {
    window: windowStub,
    console,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

function reducerOf() {
  const context = loadContext();
  const reducer = context.window.appReducer;
  assert.ok(typeof reducer === "function", "appReducer が読み出せる");
  return { reducer, context };
}

function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    spiritMorale: "",
    spiritConfuse: "",
    spiritAlways: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

test("未所持のサポパは装備と同時に所持へ写る（テレポート装備を塞ぐ）", () => {
  const { reducer } = reducerOf();
  const next = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "出血促進", cond: "出血", effect: "X", lp: "3LP" } });
  assert.equal(next.roster.supports.length, 1, "所持へ写る");
  assert.equal(next.roster.supports[0].resultId, null, "帰属は未分類");
  assert.equal(next.supports.length, 1, "装備投影に載る");
  assert.equal(next.supports[0].name, "出血促進");
  assert.equal(next.supports[0].cond, "出血があるなら", "効果文はDB定義を正とする");
});

test("同じ名称は重複所持しない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  s = reducer(s, { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  assert.equal(s.roster.supports.length, 1);
  assert.equal(s.supports.length, 1, "装備も重複しない");
});

test("通常スロットは最大2。3件目を装備すると古い方を外す", () => {
  const { reducer } = reducerOf();
  let s = baseState();
  for (const name of ["出血促進", "消化"]) {
    s = reducer(s, { type: "ADD_SUPPORT", spp: { name } });
    s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: s.roster.supports[s.roster.supports.length - 1].uid });
  }
  assert.equal(s.supports.length, 2, "2件までは並ぶ");

  /* 3件目も所持できる（所持と装備は別）。装備すると枠外へ出る。 */
  s = reducer(s, { type: "ADD_ROSTER_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.roster.supports.length, 3, "所持は3件に増えてよい");
  const third = s.roster.supports.find((x) => x.name === "覚悟");
  assert.equal(third.equipped, false, "追加しただけでは装備されない");

  s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: third.uid });
  assert.equal(s.supports.length, 2, "通常枠は2のまま（最古が外れる）");
  assert.equal(s.roster.supports.filter((x) => x.equipped && x.slot === "normal").length, 2);
});

test("死亡後パッシブは所持した時点で死亡後枠に入る", () => {
  const { reducer } = reducerOf();
  /* DBの death_passives に載っている名前は、所持へ入れた時点で
     死亡後枠と判定される（利用者が枠を覚えなくてよい）。 */
  const s = reducer(baseState(), { type: "ADD_ROSTER_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.roster.supports[0].slot, "death");
  assert.equal(s.roster.supports[0].equipped, false, "所持しただけでは装備されない");
});

test("死亡後スロットは1件だけ。埋まっていれば古い方を外す", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_DEATH_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.deathSupport?.name, "覚悟");
  assert.equal(s.supports.length, 0, "死亡後は通常枠に載らない");

  s = reducer(s, { type: "SET_DEATH_SUPPORT", spp: null });
  assert.equal(s.deathSupport, null, "外せる");
  assert.equal(s.roster.supports[0].equipped, false, "所持は残る（装備だけ外れる）");
});

test("所持から削除すると装備も外れる（取り残しを作らない）", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "消化" } });
  const uid = s.roster.supports[0].uid;
  s = reducer(s, { type: "REMOVE_ROSTER_SUPPORT", uid });
  assert.equal(s.roster.supports.length, 0);
  assert.equal(s.supports.length, 0, "装備投影も空になる");
});

test("精神も所持を経由する。未所持なら写してから装備", () => {
  const { reducer } = reducerOf();
  const s = reducer(baseState(), { type: "APPLY_SPIRIT", spirit: { name: "泉水" } });
  assert.equal(s.spirit, "泉水");
  assert.equal(s.spiritMorale, "士気M", "効果文はDBから引く");
  assert.equal(s.spiritConfuse, "混乱C");
  assert.equal(s.spiritAlways, "常時A");
  assert.equal(s.roster.spirits.length, 1, "所持へ写る");
  assert.equal(s.roster.spirits[0].equipped, true);
  assert.equal(s.roster.spirits[0].resultId, null, "帰属は未分類");
});

test("精神の装備は常に1件。切り替えは前のものを外す", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "APPLY_SPIRIT", spirit: { name: "泉水" } });
  s = reducer(s, { type: "ADD_ROSTER_SPIRIT", spirit: { name: "別の精神" } });
  s = reducer(s, { type: "SET_ROSTER_SPIRIT_EQUIPPED", uid: s.roster.spirits[1].uid });
  assert.equal(s.spirit, "別の精神");
  assert.equal(s.roster.spirits.filter((x) => x.equipped).length, 1, "装備は1件だけ");
});

test("舊保存データ（装備のみ）は未分類の所持へ移り、データを落とさない", () => {
  const context = loadContext();
  const normalize = context.window.LBT_normalizeStateShape;
  assert.ok(typeof normalize === "function", "normalizeStateShape が読み出せる");
  const legacy = {
    ...baseState(),
    supports: [{ id: "spp-1", name: "出血促進", cond: "出血", effect: "手動効果", lp: "3LP" }],
    deathSupport: { id: "sppd-1", name: "覚悟", cond: "", effect: "", lp: "4LP" },
    spirit: "泉水",
    spiritMorale: "古い士気文",
    roster: { personas: [], egos: [] }
  };
  const next = normalize(legacy);
  const names = next.roster.supports.map((s) => s.name);
  assert.ok(names.includes("出血促進"), "通常スロットのサポパを保全");
  assert.ok(names.includes("覚悟"), "死亡後スロットのサポパを保全");
  assert.equal(next.roster.spirits.length, 1, "精神を保全");
  assert.equal(next.roster.spirits[0].name, "泉水");
  for (const entry of [...next.roster.supports, ...next.roster.spirits]) {
    assert.equal(entry.resultId, null, "舊データは未分類として移る");
    assert.ok(entry.uid, "uid が付く");
    assert.equal(entry.equipped, true, "裝備中だったものは裝備のまま");
  }
  /* 効果文はDB定義で上書きされる（保存側の古い文言を引きずらない）。 */
  assert.equal(next.supports[0].effect, "出血ダメージ+1", "効果文はDBを正とする");
  assert.equal(next.spiritMorale, "士気M", "精神の効果文もDBを正とする");
});

test("帰属先（resultId）は読み書きで保持される", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  const uid = s.roster.supports[0].uid;
  s = reducer(s, { type: "SET_ROSTER_SUPPORT_RESULT", uid, resultId: "rs-1" });
  assert.equal(s.roster.supports[0].resultId, "rs-1", "帰属を設定できる");
  s = reducer(s, { type: "SET_ROSTER_SUPPORT_RESULT", uid, resultId: null });
  assert.equal(s.roster.supports[0].resultId, null, "未分類へ戻せる");
});

test("所持済みでも未装備なら、装備操作（ADD_SUPPORT）で装備できる", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  const uid = s.roster.supports[0].uid;
  s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid, equipped: false });
  assert.equal(s.supports.length, 0, "外れている");
  s = reducer(s, { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  assert.equal(s.roster.supports.length, 1, "所持は増えない");
  assert.equal(s.supports.length, 1, "一覧からの装備操作で装備される");
  assert.equal(s.supports[0].name, "出血促進");
});

test("死亡後パッシブも所持済みなら SET_DEATH_SUPPORT で再装備できる", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "SET_DEATH_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.deathSupport?.name, "覚悟");
  s = reducer(s, { type: "SET_DEATH_SUPPORT", spp: null });
  assert.equal(s.deathSupport, null, "外れる");
  s = reducer(s, { type: "SET_DEATH_SUPPORT", spp: { name: "覚悟" } });
  assert.equal(s.roster.supports.length, 1, "所持は増えない");
  assert.equal(s.deathSupport?.name, "覚悟", "再装備できる");
});

test("装備の取り外し（REMOVE_SUPPORT）は装備を外すだけで所持を消さない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "出血促進" } });
  const uid = s.roster.supports[0].uid;
  s = reducer(s, { type: "REMOVE_SUPPORT", id: uid });
  assert.equal(s.supports.length, 0, "装備から外れる");
  assert.equal(s.roster.supports.length, 1, "所持は残る（一覧から消えない）");
  assert.equal(s.roster.supports[0].equipped, false);
});

test("拡張なしでは従来どおり通常2枠。3件目は最古が外れ、所持は残る", () => {
  const { reducer } = reducerOf();
  let s = baseState();
  for (const name of ["出血促進", "消化", "追加サポ"]) {
    s = reducer(s, { type: "ADD_SUPPORT", spp: { name } });
  }
  assert.equal(s.supports.length, 2, "2枠のまま");
  assert.ok(s.supports.some((x) => x.name === "追加サポ"), "新しい方が入る");
  assert.ok(!s.supports.some((x) => x.name === "出血促進"), "最古が外れる");
  assert.equal(s.roster.supports.length, 3, "外れた分も所持には残る");
});

test("拡張『サポートスロット追加』があれば通常3枠を装備でき、既存が外れない", () => {
  const { reducer } = reducerOf();
  let s = { ...baseState(), enhancements: [{ name: "サポートスロット追加" }] };
  for (const name of ["出血促進", "消化", "追加サポ"]) {
    s = reducer(s, { type: "ADD_SUPPORT", spp: { name } });
  }
  assert.equal(s.roster.supports.length, 3);
  assert.equal(s.supports.length, 3, "3枠目を装備しても既存が外れない");
});

test("拡張ありでは所持一覧からの装備（SET_ROSTER_SUPPORT_EQUIPPED）も3枠を保つ", () => {
  const { reducer } = reducerOf();
  let s = { ...baseState(), enhancements: [{ name: "サポートスロット追加" }] };
  for (const name of ["出血促進", "消化", "追加サポ"]) {
    s = reducer(s, { type: "ADD_ROSTER_SUPPORT", spp: { name } });
  }
  for (const entry of s.roster.supports) {
    s = reducer(s, { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: entry.uid });
  }
  assert.equal(s.supports.length, 3, "3件とも装備のまま");
});

test("手動サポート（空名）も所持へ追加でき、空名同士は重複扱いしない", () => {
  const { reducer } = reducerOf();
  let s = reducer(baseState(), { type: "ADD_SUPPORT", spp: { name: "", cond: "", effect: "", lp: "" } });
  assert.equal(s.roster.supports.length, 1, "空名でも所持に入る");
  assert.equal(s.supports.length, 1, "装備される");
  s = reducer(s, { type: "ADD_SUPPORT", spp: { name: "" } });
  assert.equal(s.roster.supports.length, 2, "空名は同名扱いで弾かない");
});
