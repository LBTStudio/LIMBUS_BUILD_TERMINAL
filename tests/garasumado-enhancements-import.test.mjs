import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function load() {
  const w = { DB: db, LBT_PDF_KEYWORD_ORDER: [], console, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} } };
  const context = { window: w, console, URL, TextEncoder, TextDecoder, module: { exports: {} }, React: w.React };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    "js/roster-resolver.js",
    "js/garasumado-memo-parse.js",
    "js/ledger-provenance.js",
    "js/garasumado-roster-import.js",
    "js/state.js"
  ]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  return context.window;
}

function baseState() {
  return {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [], entries: [], inventory: [], initialPersonaTickets: 0,
    historyRecent: [], supports: [], deathSupport: null, enhancements: [], ui: {}
  };
}

function manifestFor(w, enhancementNames) {
  const personaName = "黒雲会若衆";
  const index = w.LBT_buildNameIndex(db, {});
  const nameIndex = {
    resolve: (name) => w.LBT_resolveCandidates(index, name)?.[0] || null,
    candidates: (name) => w.LBT_resolveCandidates(index, name) || []
  };
  return w.LBT_garasumado.buildManifest({
    name: "テスト",
    owned: { personas: [{ name: personaName, enhancements: enhancementNames }], egos: [], supportPassives: [], spirits: [] },
    items: [],
    scenarioHistory: []
  }, nameIndex);
}

test("硝子窓の人格別強化を通常強化・特殊強化のDBレコードに解決する", () => {
  const w = load();
  const manifest = manifestFor(w, ["闘志", "自生する肉体", "サポートスロット"]);
  const generated = w.LBT_garasumado.toDispatchActions(
    manifest, ["personas:黒雲会若衆"], { db, purchases: {} }
  );
  const importAction = generated.actions.find((action) => action.type === "IMPORT_PERSONA_ENHANCEMENTS");
  assert.ok(importAction, "人格強化の保存actionが生成される");
  assert.deepEqual([...importAction.enhancements.map((row) => row.name)], [
    "燃え上がる闘志", "自生する肉体", "サポートスロット追加"
  ]);
  assert.equal(generated.skipped.length, 0, "既知の略称は除外扱いにならない");
});

test("旧形式の強化グループ・範囲表記をDBに存在する段階へ展開する", () => {
  const w = load();
  const manifest = manifestFor(w, ["肉体強化0", "精神強化0-A-1~3"]);
  const generated = w.LBT_garasumado.toDispatchActions(
    manifest, ["personas:黒雲会若衆"], { db, purchases: {} }
  );
  const importAction = generated.actions.find((action) => action.type === "IMPORT_PERSONA_ENHANCEMENTS");
  assert.ok(importAction);
  assert.deepEqual([...importAction.enhancements.map((row) => row.name)], [
    "肉体強化0-1", "肉体強化0-2", "肉体強化0-3", "肉体強化0-4", "肉体強化0-5",
    "精神強化0-A-1", "精神強化0-A-2", "精神強化0-A-3"
  ]);
  assert.equal(generated.skipped.length, 0);
});

test("取り込み確定で人格ビルドへ強化を保存し、購入通帳を二重計上しない", () => {
  const w = load();
  const manifest = manifestFor(w, ["闘志", "自生する肉体"]);
  const generated = w.LBT_garasumado.toDispatchActions(
    manifest, ["personas:黒雲会若衆"], { db, purchases: {} }
  );
  const after = w.appReducer(baseState(), { type: "APPLY_IMPORT_BATCH", actions: generated.actions });
  const persona = after.roster.personas.find((row) => row.mode === "n" && String(row.no) === "2");
  assert.ok(persona, "人格が所持へ入る");
  assert.deepEqual([...persona.build.enhancements.map((row) => row.name)], [
    "燃え上がる闘志", "自生する肉体"
  ]);
  assert.equal(after.entries.length, 0, "共有済み強化の再取込で購入費は追加しない");
});

test("未対応の強化名はDBへ推測登録せず、理由を残す", () => {
  const w = load();
  const manifest = manifestFor(w, ["判読不能な強化名"]);
  const generated = w.LBT_garasumado.toDispatchActions(
    manifest, ["personas:黒雲会若衆"], { db, purchases: {} }
  );
  assert.equal(generated.actions.some((action) => action.type === "IMPORT_PERSONA_ENHANCEMENTS"), false);
  assert.ok(generated.skipped.some((item) => /判読不能な強化名/.test(item.reason)));
});

test("購入扱いでも購入額がない人格取り込みは0LPの購入明細を作らない", () => {
  const w = load();
  const manifest = manifestFor(w, []);
  const item = manifest.groups.find((group) => group.id === "personas")
    .items.find((candidate) => candidate.name === "黒雲会若衆");
  assert.ok(item, "テスト用の人格項目がある");
  item.source = "buy";
  const generated = w.LBT_garasumado.toDispatchActions(
    manifest, ["personas:黒雲会若衆"], { db, purchases: {} }
  );
  const rosterAction = generated.actions.find((action) => action.type === "ADD_ROSTER");
  assert.ok(rosterAction, "人格の所持登録は行う");
  assert.equal(rosterAction.source, "buy", "購入という入手方法は保持する");
  assert.equal(rosterAction.purchase, true, "購入方法は購入 action として渡す");
  assert.equal(Object.hasOwn(rosterAction, "cost"), false, "価格を0で偽装せず reducer に解決させる");
  const after = w.appReducer(baseState(), { type: "APPLY_IMPORT_BATCH", actions: generated.actions });
  assert.equal(after.roster.personas.length, 1, "人格は所持へ入る");
  assert.equal(after.entries.length, 1, "価格が解決された購入明細が1件だけ残る");
  assert.equal(after.entries[0].cost.lp, 20, "未所持からの購入額はルールの20LP");
  assert.equal(after.entries[0].cost.shards, 0, "人格購入に欠片は要求しない");
});

test("人格購入は所持状態に応じて20LPまたは200LPを記帳する", () => {
  const w = load();
  const firstState = baseState();
  const first = w.appReducer(firstState, {
    type: "ADD_ROSTER", no: "2", mode: "n", purchase: true
  });
  assert.equal(first.entries.length, 1);
  assert.equal(first.entries[0].cost.lp, 20, "人格未所持なら20LP");
  const alreadyOwns = {
    ...baseState(),
    roster: { personas: [{ uid: "pr-existing", no: "1", mode: "n" }], egos: [], supports: [], spirits: [] }
  };
  const second = w.appReducer(alreadyOwns, {
    type: "ADD_ROSTER", no: "2", mode: "n", purchase: true
  });
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].cost.lp, 200, "既に人格を所持していれば200LP");
});
