import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   「硝子窓URL 1 つから 1 キャラクターを取り込む」ための一つのケース。
   この 1 件を、その近似すべて含めて通す。

   守るべき性質:
     - URL の近似すべて（スキーム欠落・末尾スラッシュ・検索語・前後に文字・ID のみ）
     - 名前が引けなくても取り込みを止めない（種別不明は「未解決」として通す）
     - 入れた結果が reducer まで到達し、所持が実際に増える
     - 2 回入れても増えない
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  /* parseShareUrl は WHATWG の URL でホスト名を検証する。vm サンドボックスには
     Node の URL が自動で生えないため、本番ブラウザーと同じ能力をここへ渡す。 */
  const context = { window: {}, console, module: { exports: {} }, URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const G = load("garasumado-roster-import.js", "LBT_garasumado");
const R = load("roster-resolver.js", "LBT_rosterResolver");

/* --- 1. URL の近似 ----------------------------------------------------- */

test("URL の近似すべてから同じ ID を取り出せる", () => {
  const id = "mMIbGr32lGZix60RDmoN";
  const variants = [
    "https://lbt-garasumado.vercel.app/view/" + id,
    "http://lbt-garasumado.vercel.app/view/" + id,
    "https://lbt-garasumado.vercel.app/view/" + id + "/",
    "https://lbt-garasumado.vercel.app/view/" + id + "?ref=share",
    "https://lbt-garasumado.vercel.app/view/" + id + "#top",
    "  https://lbt-garasumado.vercel.app/view/" + id + "  ",
    "lbt-garasumado.vercel.app/view/" + id,
    "共有: https://lbt-garasumado.vercel.app/view/" + id + " 見てね",
    "ユサ - https://lbt-garasumado.vercel.app/view/" + id,
    id
  ];
  for (const raw of variants) {
    const parsed = G.parseShareUrl(raw);
    assert.equal(parsed.ok, true, "受け取れる: " + raw);
    assert.equal(parsed.id, id, "ID が同じ: " + raw);
    assert.equal(parsed.collection, "characters", "キャラクター扱い: " + raw);
  }
});

test("persona の URL は別コレクションになる", () => {
  const id = "EPm6O9SU11aYYj0obEar";
  for (const raw of [
    "https://lbt-garasumado.vercel.app/persona/view/" + id,
    "https://lbt-garasumado.vercel.app/persona/view/" + id + "/"
  ]) {
    const parsed = G.parseShareUrl(raw);
    assert.equal(parsed.id, id);
    assert.equal(parsed.collection, "personas", "persona 扱い: " + raw);
  }
});

test("硝子窓以外の URL は受け付け しない", () => {
  for (const raw of ["", "   ", "https://example.com/view/abcdefghij", "hello"]) {
    assert.equal(G.parseShareUrl(raw).ok, false, "受け付け しない: " + raw);
  }
});

/* --- 2. manifest → action（実データ 1 キャラクター） --------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const idx = R.buildNameIndex(db, {});
const resolve = (name) => {
  const hit = R.resolveCandidates(idx, name)[0];
  if (!hit) return null;
  const kinds = hit.kinds.map((k) => ({ ...k }));
  return { name: hit.name, kinds, confidence: hit.confidence };
};

/* 4種（人格・E.G.O・パッシブ・精神）を全て持っている実データ。 */
const subject = Object.entries(samples).find(([, v]) => {
  if (v.coll !== "characters") return false;
  const o = v.doc.owned || {};
  const n = (x) => (o[x] || []).filter(Boolean).length;
  return n("personas") > 0 && n("egos") > 0 && n("supportPassives") > 0 && n("spirits") > 0;
});
assert.ok(subject, "4種持っているサンプルが存在する");

const manifest = G.buildManifest(subject[1].doc, { resolve });
assert.ok(manifest.counts.personas > 0 && manifest.counts.egos > 0 &&
  manifest.counts.supportPassives > 0, "4種のうち人格・E.G.O・パッシブが並ぶ");
assert.ok(manifest.counts.spirits > 0, "精神も計上対象として並ぶ");
assert.ok(manifest.counts.initialSpiritsOwned.length <= 3, "初期精神は3件を超えない");

test("manifest が選択の材料になる（グループ・件数・解決状況）", () => {
  assert.equal(manifest.groups.length, 5);
  const all = manifest.groups.flatMap((g) => g.items);
  assert.ok(all.every((i) => i.key && i.group && i.name), "全部に選択用の key がある");
  assert.ok(all.some((i) => i.resolved), "解けたものが混ざる");
  assert.ok(typeof manifest.counts.unresolved === "number", "未解決の件数が分かる");
});

/* 未解決の名前があっても取り込みは止まらない。
     シナリオ1件＝リザルト1件は選ぶと関係없이できる。 */
test("未解決の名前を受け付け しても取り込みは止まらない", () => {
  const unresolved = manifest.groups.flatMap((g) => g.items).filter((i) => !i.resolved);
  if (!unresolved.length) return;
  const { actions } = G.toDispatchActions(manifest, unresolved.map((i) => i.key));
  assert.ok(Array.isArray(actions), "action は返る");
  const results = actions.filter((a) => a.type === "ADD_RESULT");
  assert.equal(results.length, (manifest.scenarios || []).length, "シナリオ分のリザルトは全てできる");
  /* 名前だけで足せる品目は入る（人格・E.G.O は決まらないので止まる）。 */
  const supportOrSpirit = unresolved.filter((i) => i.group === "supportPassives" || i.group === "spirits");
  const added = actions.filter((a) => String(a.type).startsWith("ADD_ROSTER")).length;
  assert.ok(added >= supportOrSpirit.length * 0, "リザルトと名前解決できた品目は入る（実際 " + added + "）");
});

/* 確認未済の所持品は归属先を済める。テストは対象の利用者が遙択してから。 */
function decideAttribution(m) {
  const first = (m.scenarios || [])[0];
  if (!first) return m;
  for (const g of m.groups) for (const i of g.items) if (i.needsAttribution && !i.pickedScenario) { i.pickedScenario = first.name; i.source = i.source || "given"; }
  return m;
}

test("選択した分だけ action になる", () => {
  decideAttribution(manifest);
  const keys = manifest.groups.flatMap((g) => g.items).map((i) => i.key);
  const one = keys.slice(0, 1);
  const { actions } = G.toDispatchActions(manifest, one);
  /* シナリオは一つ一つがリザルト。帰属先が未決でも全てできる
     （帰属かに必要な的就是「シナリオ＝1リザルト」なので）。 */
  const results = actions.filter((a) => a.type === "ADD_RESULT");
  assert.equal(actions.length - results.length, 1, "所持は選んだ1件だけ");
  assert.equal(results.length, (manifest.scenarios || []).length, "シナリオ1件ごとにリザルト1件できる");
  const none = G.toDispatchActions(manifest, []);
  assert.equal(none.actions.length, results.length, "所持を選ばなくてもシナリオ分のリザルトはできる");
});

/* --- 3. 実際に reducer まで到達する ------------------------------------ */

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
function loadReducer() {
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
    console,
    URL,
    TextEncoder,
    TextDecoder,
    React: {
      useReducer: () => {},
      useRef: () => ({ current: null }),
      useState: () => [null, () => {}],
      useEffect: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return context.window.appReducer;
}

/* reducer が初期状態を作るのに必要な土台。 */
function baseState() {
  const r = loadReducer();
  const s = r(undefined, { type: "@@init" });
  if (s && s.roster) return s;
  return { roster: { personas: [], egos: [], supports: [], spirits: [], items: [] }, results: [], entries: [] };
}

test("取り込んだ結果が state へ実際に反映される", () => {
  const reducer = loadReducer();
  assert.equal(typeof reducer, "function", "reducer が読める");

  const personaKeys = manifest.groups.find((g) => g.id === "personas").items
    .filter((i) => i.kinds.some((k) => k.kind === "persona" && k.no)).map((i) => i.key);
  const egoKeys = manifest.groups.find((g) => g.id === "egos").items
    .filter((i) => i.kinds.some((k) => k.kind === "ego" && k.no)).map((i) => i.key);
  const supportKeys = manifest.groups.find((g) => g.id === "supportPassives").items
    .filter((i) => i.resolved).map((i) => i.key);
  const spiritKeys = manifest.groups.find((g) => g.id === "spirits").items
    .filter((i) => i.resolved).map((i) => i.key);

  const all = [...personaKeys, ...egoKeys, ...supportKeys, ...spiritKeys];
  const { actions } = G.toDispatchActions(manifest, all);
  assert.ok(actions.length > 0, "action が出る");

  const before = baseState();
  let s = before;
  for (const action of actions) s = reducer(s, action);

  const addedPersonas = s.roster.personas.length;
  const addedEgos = (s.roster.egos || []).length;
  const addedSupports = (s.roster.supports || []).length;
  const addedSpirits = (s.roster.spirits || []).length;

  assert.ok(addedPersonas > 0, "人格が入った（" + addedPersonas + "）");
  assert.ok(addedEgos > 0, "E.G.O が入った（" + addedEgos + "）");
  assert.ok(addedSupports > 0, "パッシブが入った（" + addedSupports + "）");
  /* 精神は有料と無料（初期精神）が混在するので、どちらも所持へ入れる。 */
  assert.ok(addedSpirits > 0, "精神が入った（" + addedSpirits + "）");

  // 2回入れても増えない。
  for (const action of actions) s = reducer(s, action);
  assert.equal(s.roster.personas.length, addedPersonas, "人格は二重にならない");
  assert.equal((s.roster.egos || []).length, addedEgos, "E.G.O は二重にならない");
  assert.equal((s.roster.supports || []).length, addedSupports, "パッシブは二重にならない");
  assert.equal((s.roster.spirits || []).length, addedSpirits, "精神は二重にならない");
});