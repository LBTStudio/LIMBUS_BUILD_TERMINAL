import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   割当の下書き（buildResultDraft）

   1シナリオ＝1リザルト。所持は照合できたAutomaticで割り当て、できないものだけ
   未割当に残す。画面に出る数字と実際に入る action は同じ変換を覗く。

   照合の階級:
     A  獲得行と完全一致      C  支出行と一致（購入）
     D  メモ本文中に出現      F  文字一致で候補が1件なら自動
     E/M 未割当・利用者が選ぶ
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function load() {
  const w = { DB: db, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  const c = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  for (const f of ["js/garasumado-memo-parse.js", "js/garasumado-roster-import.js", "js/roster-resolver.js"]) {
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), c, { filename: f });
  }
  return c.window;
}
const w = load();
const G = w.LBT_garasumado;
const index = w.LBT_buildNameIndex(db, {});
const resolve = (name) => w.LBT_resolveCandidates(index, name)?.[0] || null;

const make = (owned, history) => G.buildManifest(
  { currency: { lp: 0, fragments: 0 }, owned, scenarioHistory: history },
  { resolve }
);

const PERSONA = db.normal_personas[0].name;
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const PASSIVE = db.support_passives[0].name;
const OTHER_PERSONA = db.normal_personas[1].name;

test("獲得行と完全一致した所持は Automaticでシナリオに入る（A）", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜A", memo: `ガチャ結果→${PERSONA}` }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  const block = draft.blocks.find((b) => b.name === "夜A");
  assert.ok(block, "夜A のリザルトがある");
  assert.equal(block.items.length, 1, "所持が中に入る");
  assert.equal(block.items[0].tier, "A", "完全一致の階級");
  assert.equal(draft.unassigned.length, 0, "未割当は残らない");
});

test("支出行と一致した所持は購入として入る（C）", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [{ name: PASSIVE }], spirits: [] },
    [{ name: "夜B", memo: `・支出\n${PASSIVE} ${db.support_passives[0].lp}LP` }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  const block = draft.blocks.find((b) => b.name === "夜B");
  assert.equal(block.items.length, 1);
  assert.equal(block.items[0].tier, "C", "支出行一致");
  assert.equal(block.items[0].source, "buy", "購入として扱う");
});

test("メモ本文中に出るだけの所持は D（本文言及）として入る", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [{ name: PASSIVE }], spirits: [] },
    [{ name: "夜C", memo: `・獲得\n Afterwards も${PASSIVE}を使った` }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  const block = draft.blocks.find((b) => b.name === "夜C");
  assert.equal(block.items.length, 1);
  assert.equal(block.items[0].tier, "D", "本文言及");
});

test("どこにも出ない所持は未割当になる（E）", () => {
  const m = make(
    { personas: [{ name: "まったく別の名前" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜D", memo: "何もない" }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  assert.equal(draft.blocks.every((b) => b.items.length === 0), true, "どのカードにも入らない");
  assert.equal(draft.unassigned.length, 1, "未割当に残る");
  assert.match(draft.unassigned[0].reason, /照合できるシナリオがありません/);
});

test("利用者が帰属先を選んだ分は照合より優先される（M）", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜E", memo: "空" }, { name: "夜F", memo: `ガチャ結果→${PERSONA}` }]
  );
  const key = m.groups[0].items[0].key;
  const draft = G.buildResultDraft(m, { db, identity: { [key]: { pickedScenario: "夜E", source: "given" } } });
  const e = draft.blocks.find((b) => b.name === "夜E");
  const f = draft.blocks.find((b) => b.name === "夜F");
  assert.equal(e.items.length, 1, "選んだ方へ入る");
  assert.equal(f.items.length, 0, "照合结果是Discard");
  assert.equal(e.items[0].tier, "M", "利用者の選択");
});

test("証跡が無い人格は入手方法（source）を選ばせる", () => {
  /* 獲得行がある＝証跡がある。guessSource が決めるので自動化で足りる。 */
  const withWin = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜G", memo: `ガチャ結果→${PERSONA}` }]
  );
  const winDraft = G.buildResultDraft(withWin, { db, identity: {} });
  assert.equal(winDraft.blocks[0].items[0].needsSource, false, "証跡があれば訊かない");
  assert.ok(winDraft.blocks[0].items[0].source, "証跡から入手方法が決まる");

  /* 本文にしか出ない＝証跡が無い。購入か抽選かが分からないので選ばせる。 */
  const textOnly = make(
    { personas: [{ name: OTHER_PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜G2", memo: `事後に${OTHER_PERSONA}を使った` }]
  );
  const textDraft = G.buildResultDraft(textOnly, { db, identity: {} });
  const item = textDraft.blocks[0].items[0];
  assert.equal(item.tier, "D", "本文言及");
  assert.equal(item.needsSource, true, "証跡が無ければ入手方法を選ばせる");
  assert.equal(textDraft.simulation.awaitingSource, 1, "シミュレーションにも出る");
});

test("サポートパッシブは入手方法が要らない（自動分類の範囲）", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [{ name: PASSIVE }], spirits: [] },
    [{ name: "夜H", memo: `・支出\n${PASSIVE} ${db.support_passives[0].lp}LP` }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  const item = draft.blocks[0].items[0];
  assert.equal(item.automatic, true, "自動分類できる");
  assert.equal(item.needsSource, false, "入手方法を尋ねない");
});

test("シミュレーションは実際に入る action と一致する", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜I", memo: `ガチャ結果→${PERSONA}\n40LPを獲得` }]
  );
  /* 選択を渡さないと何も入らない。 */
  const off = G.buildResultDraft(m, { db, identity: {} });
  const offBuilt = G.toDispatchActions(m, [], {});
  assert.equal(off.simulation.held, offBuilt.actions.filter((a) => String(a.type).startsWith("ADD_ROSTER")).length, "未選択の一致");

  const key = m.groups[0].items[0].key;
  const draft = G.buildResultDraft(m, { db, identity: {}, selected: [key] });
  const built = G.toDispatchActions(m, [key], {});
  assert.equal(draft.simulation.results, built.actions.filter((a) => a.type === "ADD_RESULT").length, "リザルト数が一致");
  assert.equal(draft.simulation.held, built.actions.filter((a) => String(a.type).startsWith("ADD_ROSTER")).length, "所持数が一致");
  const lp = built.actions
    .filter((a) => a.type === "ADD_RESULT" || a.type === "ADD_ENTRY")
    .reduce((n, a) => n + ((a.type === "ADD_RESULT" ? Number(a.income && a.income.lp) : -Number(a.cost && a.cost.lp)) || 0), 0);
  assert.equal(draft.simulation.lp, lp, "LP の合計が一致");
});

test("同じ人格が二重に登録されない", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜J2", memo: `ガチャ結果→${PERSONA}` }]
  );
  const item = m.groups[0].items[0];
  item.pickedScenario = "夜J2";
  const built = G.toDispatchActions(m, [item.key], {});
  assert.equal(
    built.actions.filter((a) => a.type === "ADD_ROSTER").length, 1,
    "所持一覧と獲得行の両方にあっても 1 件だけ"
  );
});

test("シミュレーションは実際に入る action と一致する（実50文書で0件の食い違い）", () => {
  const docs = Object.entries(samples).map(([, v]) => v.doc).filter(Boolean);
  let mismatch = 0;
  let checked = 0;
  for (const doc of docs) {
    const manifest = G.buildManifest(doc, { resolve });
    /* 初期状態と同じ「帰属済みのものだけチェック済み」とする。 */
    const picked = [];
    for (const g of manifest.groups) for (const i of g.items) if (i.via && i.via.length) picked.push(i.key);
    const draft = G.buildResultDraft(manifest, { db, identity: {}, selected: picked, resolve });
    const built = G.toDispatchActions(manifest, picked, {});
    const held = built.actions.filter((a) => String(a.type || "").startsWith("ADD_ROSTER")).length;
    checked += 1;
    if (draft.simulation.held !== held) mismatch += 1;
  }
  assert.ok(checked > 10, "実データで十分に文書がある（実際 " + checked + "）");
  assert.equal(mismatch, 0, "シミュレーションと実際に入る件数が全文書で一致する");
});

test("選択を変えるとシミュレーションも変わる", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜K", memo: `ガチャ結果→${PERSONA}` }]
  );
  const none = G.buildResultDraft(m, { db, identity: {}, selected: [], resolve });
  assert.equal(none.simulation.held, 0, "未選択なら入らない");
  const on = G.buildResultDraft(m, { db, identity: {}, selected: [m.groups[0].items[0].key], resolve });
  assert.equal(on.simulation.held, 1, "選択すれば入る");
});

test("文字一致の候補は一致率の降順で並ぶ", () => {
  const cands = G.overlapCandidates("鬼門事務所フィクサー", db);
  assert.ok(cands.length >= 1, "候補がある");
  for (let i = 1; i < cands.length; i++) {
    assert.ok(cands[i - 1].ratio >= cands[i].ratio, "一致率の高い順");
  }
});

test("推測で埋めない：1文字の所持は候補も割当も出さない", () => {
  const m = make(
    { personas: [{ name: "黒" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜J", memo: "何もない" }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  assert.equal(draft.unassigned.length, 1);
  assert.equal(draft.unassigned[0].candidates.length, 0, "偶発一致を出さない");
});