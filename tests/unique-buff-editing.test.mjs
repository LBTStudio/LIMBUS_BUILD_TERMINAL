import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

/* 同期編集（手動編集）中の固有バフ。
   カードは入力欄として開き、追加した空カードをその場で書けること。
   以前は表示カードだけで、手動追加が「名前も説明も入れられない空カード」を作っていた。 */

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const coreSource = readFileSync(new URL("../js/core.js", import.meta.url), "utf8");
const sectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function loadReducer() {
  const context = { window: { DB: { normal_personas: [], tokui_personas: [], egos: [], default_statuses: [] } }, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(coreSource, context);
  vm.runInContext(stateSource, context);
  return { reducer: context.window.appReducer, initState: context.window.INIT_STATE };
}

const baseState = (overrides = {}) => ({
  charName: "テスト",
  plName: "PL",
  personaMode: "n",
  personaNo: 1,
  personaSrc: { name: "テスト人格", keywords: [] },
  roster: { personas: [{ uid: "p1", mode: "n", no: 1, equipped: true }], egos: [] },
  hp: "100", san: "45", speed: "1d5", bullets: "×",
  resS: "普通", resP: "普通", resB: "普通",
  skills: [],
  egoSlots: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null },
  supports: [], uniqueBuffs: [], customStatuses: [], enhancements: [],
  pas: { name: "", cond: "", always: "", effect: "", quick: "" },
  pas2Enabled: false,
  pas2: { name: "", cond: "", always: "", effect: "" },
  extraPassives: [],
  deathSupport: null,
  spirit: "", spiritAlways: "", spiritMorale: "", spiritConfuse: "",
  formulas: [], builtinFormulasOverride: {}, autoFml: true, moraleLine: "12", extraCmd: "",
  ...overrides
});

test("手動追加した固有バフは名称・種別・初期値・最大値・出力先・説明をその場で編集できる", () => {
  const { reducer, initState } = loadReducer();
  let state = reducer(initState, { type: "HYDRATE", state: baseState() });
  state = reducer(state, { type: "ADD_UB" });
  assert.equal(state.uniqueBuffs.length, 1, "追加できる");
  const id = state.uniqueBuffs[0].id;
  assert.ok(id, "編集に使う id がある");
  assert.equal(state.uniqueBuffs[0].name, "", "空カードから書き始められる");

  state = reducer(state, { type: "PATCH_UB", id, patch: { name: "  呼吸  ", type: "固有バフ", initial: 2, max: 20, place: "params" } });
  const patched = state.uniqueBuffs[0];
  assert.equal(patched.name, "呼吸", "名称は前後の空白を落として入る");
  assert.equal(patched.type, "固有バフ");
  assert.equal(patched.initial, 2);
  assert.equal(patched.max, 20);
  assert.equal(patched.place, "params");

  state = reducer(state, { type: "PATCH_UB", id, patch: { desc: "ラウンド開始時に1減少する。", noST: true } });
  assert.equal(state.uniqueBuffs[0].desc, "ラウンド開始時に1減少する。");
  assert.equal(state.uniqueBuffs[0].noST, true);

  state = reducer(state, { type: "PATCH_UB", id, patch: { noST: false } });
  assert.equal(state.uniqueBuffs[0].noST, false);
});

test("編集は対象のカードだけに効き、削除もそのカードだけを消す", () => {
  const { reducer, initState } = loadReducer();
  let state = reducer(initState, { type: "HYDRATE", state: baseState() });
  state = reducer(state, { type: "ADD_UB" });
  state = reducer(state, { type: "ADD_UB" });
  const [first, second] = state.uniqueBuffs;
  assert.notEqual(first.id, second.id, "連続追加でも id は重複しない");
  state = reducer(state, { type: "PATCH_UB", id: second.id, patch: { name: "二枚目" } });
  assert.equal(state.uniqueBuffs[0].name, "", "一枚目は触らない");
  assert.equal(state.uniqueBuffs[1].name, "二枚目");

  state = reducer(state, { type: "PATCH_UB", id: "ub-missing", patch: { name: "幽霊" } });
  assert.deepEqual(Array.from(state.uniqueBuffs, (b) => b.name), ["", "二枚目"], "存在しない id は何もしない");

  state = reducer(state, { type: "REMOVE_UB", id: first.id });
  assert.deepEqual(Array.from(state.uniqueBuffs, (b) => b.name), ["二枚目"]);
});

test("同期編集の固有カードは入力欄を持ち、閲覧専用では表示カードに戻る", () => {
  const block = sectionsSource.slice(sectionsSource.indexOf("const UniqueBuffsBlock ="), sectionsSource.indexOf("const SOURCE_OPTIONS"));
  assert.ok(block.length > 0, "UniqueBuffsBlock が読める");

  /* 追加の入口は編集モード限定のまま。 */
  assert.match(block, /dispatch\(\{ type: "ADD_UB" \}\)/);

  /* カードの各項目が PATCH_UB へ流れる（id つきなので他のカードを巻き込まない）。 */
  for (const field of ["name", "type", "initial", "max", "place", "desc", "noST"]) {
    assert.match(block, new RegExp('PATCH_UB", id: b\\.id, patch: \\{ ' + field + ":"), `${field} を編集できる`);
  }

  /* 入力欄そのもの（数値欄・チェック・文章欄）。 */
  assert.match(block, /className: "ubc-field"/);
  assert.match(block, /className: "ubc-check"/);
  assert.match(block, /type: "number"/);
  assert.match(block, /className: "textarea"/);

  /* 閲覧専用のときは従来どおり表示カード（名前・種別・出力先・初期/最大・説明）。 */
  assert.match(block, /className: "ubc-name"/);
  assert.match(block, /className: "ubc-count"/);
  assert.match(block, /className: "ubc-desc"/);

  /* 並べ替え・削除は編集モードの操作として残る。 */
  assert.match(block, /REORDER_LIST", field: "uniqueBuffs", key: b\.id/);
  assert.match(block, /REMOVE_UB", id: b\.id/);
});

test("固有バフの種別はDB実測の語を選べる", () => {
  const options = sectionsSource.match(/const UB_TYPE_OPTIONS = \[([^\]]+)\]/);
  assert.ok(options, "UB_TYPE_OPTIONS がある");
  for (const type of ["バフ", "デバフ", "中立バフ", "固有バフ", "固有弾丸", "その他"]) {
    assert.ok(options[1].includes(`"${type}"`), `${type} を選べる`);
  }
});
