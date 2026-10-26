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
db.items = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));

function load() {
  const w = { DB: db, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  const c = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  for (const f of ["js/roster-resolver.js", "js/garasumado-memo-parse.js", "js/ledger-provenance.js", "js/garasumado-roster-import.js"]) {
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

test("硝子の破片消費は通貨支出と分離して結果の consumedItems へ渡す", () => {
  const memo = "LP50+欠片30\n硝子の破片を2つ使用して人差し指のCTを解除";
  const parsed = w.LBT_garaMemo.parseMemo(memo);
  assert.equal(parsed.income.lp, 50);
  assert.equal(parsed.income.shards, 30);
  assert.deepEqual([...parsed.consumedItems].map((item) => [item.itemId, item.quantity]), [
    ["resource-glass-shard", 2]
  ]);
  assert.equal(parsed.spends.some((spend) => /硝子の破片/.test(spend.name || "")), false,
    "購入明細へ二重に計上しない");

  const manifest = make({ personas: [], egos: [], supportPassives: [], spirits: [] }, [
    { name: "旧ログ", memo }
  ]);
  const actions = G.toDispatchActions(manifest, [], {}).actions;
  const result = actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.consumedItems[0].itemName, "硝子の破片");
  assert.equal(result.consumedItems[0].detail, "硝子の破片を2つ使用して人差し指のCTを解除");
  assert.match(result.consumedItems[0].detail, /CTを解除/);
});

test("複数の硝子窓URLは重複を除き、同じキャラクターの履歴だけを統合する", () => {
  const urls = [
    "https://lbt-garasumado.vercel.app/view/6yXgGPzX1eSEboi2KSLM",
    "https://lbt-garasumado.vercel.app/view/Eo19HoEJpsICZwLc7MN4",
    "https://lbt-garasumado.vercel.app/view/6yXgGPzX1eSEboi2KSLM"
  ].join("\n");
  const parsed = G.parseShareUrls(urls);
  assert.equal(parsed.urls.length, 2, "同じ共有文書を二重に取得しない");
  assert.deepEqual([...parsed.urls].map((item) => item.id), [
    "6yXgGPzX1eSEboi2KSLM", "Eo19HoEJpsICZwLc7MN4"
  ]);

  const merged = G.mergeGarasumadoDocuments([
    {
      id: "old",
      updateTime: "2026-10-01T00:00:00Z",
      doc: {
        name: "キャラクターA", plName: "PL A",
        owned: { personas: [{ name: "古い所持" }] },
        items: [{ name: "硝子の破片", count: 3 }],
        scenarioHistory: [
          { name: "共通", memo: "50LP" },
          { name: "共通", memo: "50LP" }
        ]
      }
    },
    {
      id: "new",
      updateTime: "2026-10-02T00:00:00Z",
      doc: {
        name: "キャラクターA", plName: "PL A",
        owned: { personas: [{ name: "最新所持" }] },
        items: [{ name: "硝子の破片", count: 1 }],
        scenarioHistory: [
          { name: "共通", memo: "50LP" },
          { name: "最新", memo: "LP80" }
        ]
      }
    }
  ]);
  assert.equal(merged.name, "キャラクターA");
  assert.deepEqual([...merged.owned.personas].map((item) => item.name), ["最新所持"]);
  assert.equal(merged.items[0].count, 1, "最新スナップショットの現所持を保つ");
  assert.equal(merged.scenarioHistory.length, 3, "同じ本文の実通過回数は残し、スナップショット重複だけ除く");
  assert.equal(merged.scenarioHistory[2].name, "最新");
});

test("同じPLでも別キャラクターURLは履歴を統合しない", () => {
  const merged = G.mergeGarasumadoDocuments([
    {
      updateTime: "2026-10-01T00:00:00Z",
      doc: { name: "キャラクターA", plName: "同じPL", owned: { personas: [{ name: "Aの所持" }] }, scenarioHistory: [{ name: "Aの履歴", memo: "50LP" }] }
    },
    {
      updateTime: "2026-10-02T00:00:00Z",
      doc: { name: "キャラクターB", plName: "同じPL", owned: { personas: [{ name: "Bの所持" }] }, scenarioHistory: [{ name: "Bの履歴", memo: "75LP" }] }
    }
  ]);
  assert.match(merged.error, /異なるキャラクター／PL名/);
  assert.deepEqual([...merged.identities.characterNames], ["キャラクターa", "キャラクターb"]);
});

test("複数URLのうちキャラクター名またはPL名を確認できない場合は統合しない", () => {
  const merged = G.mergeGarasumadoDocuments([
    { doc: { name: "キャラクターA", plName: "同じPL", scenarioHistory: [] } },
    { doc: { name: "キャラクターA", scenarioHistory: [] } }
  ]);
  assert.match(merged.error, /異なるキャラクター／PL名/);
});

test("異なるPLの硝子窓URLを誤って同じ所持へ統合しない", () => {
  const merged = G.mergeGarasumadoDocuments([
    { doc: { name: "キャラクターA", plName: "PL A", scenarioHistory: [] } },
    { doc: { name: "キャラクターB", plName: "PL B", scenarioHistory: [] } }
  ]);
  assert.match(merged.error, /異なるキャラクター／PL名/);
});

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

test("カードから戻した所持は未割当へ返り、選び直すと再分類できる", () => {
  const m = make(
    { personas: [{ name: PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜E", memo: "空" }, { name: "夜F", memo: `ガチャ結果→${PERSONA}` }]
  );
  const key = m.groups[0].items[0].key;
  /* 照合で入っている状態を、戻しで未割当へ返す（照合より戻しが優先）。 */
  const back = G.buildResultDraft(m, { db, identity: { [key]: { returned: true } } });
  assert.equal(back.blocks.every((b) => b.items.length === 0), true, "どのカードにも残らない");
  assert.equal(back.unassigned.length, 1, "未割当へ返る");
  assert.match(back.unassigned[0].reason, /戻しました/, "戻したことが分かる理由");
  /* 戻したまま別のシナリオを選べば、戻しは解けて再分類される。 */
  const again = G.buildResultDraft(m, { db, identity: { [key]: { returned: true, pickedScenario: "夜E" } } });
  const e = again.blocks.find((b) => b.name === "夜E");
  assert.equal(e.items.length, 1, "選び直しが優先される");
  assert.equal(e.items[0].tier, "M", "選び直しは利用者指定");
  assert.equal(again.unassigned.length, 0);
});

test("証跡が無い人格は入手方法（source）を選ばせる", () => {  /* 獲得行がある＝証跡がある。guessSource が決めるので自動化で足りる。 */
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
    const held = built.actions.filter((a) => String(a.type || "").startsWith("ADD_ROSTER") || a.type === "ADD_CUSTOM_ROSTER_EGO").length;
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
  /* メモが「ガチャ結果→X」と書いている品目は、チェックの有無に関わらず
     記録として入り込む（その場の獲得記録なので）。チェックで効くのは、
     メモに獲得の記載が無い品目。 */
  const none = G.buildResultDraft(m, { db, identity: {}, selected: [], resolve });
  const on = G.buildResultDraft(m, { db, identity: {}, selected: [m.groups[0].items[0].key], resolve });
  assert.equal(none.simulation.held, 1, "獲得行のある品目は入る");
  assert.equal(on.simulation.held, 1, "選択しても二重には入らない");

  const only = make(
    { personas: [{ name: OTHER_PERSONA }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜K2", memo: "何もない" }]
  );
  const key = only.groups[0].items[0].key;
  const off = G.buildResultDraft(only, { db, identity: {}, selected: [], resolve });
  const checked = G.buildResultDraft(only, { db, identity: {}, selected: [key], resolve });
  assert.equal(off.simulation.held, 0, "獲得の記載が無い品目は未選択なら入らない");
  assert.equal(checked.simulation.held, 1, "選択すれば入る");
});

test("シナリオは一つ一つがリザルトになる（帰属が無くても作られる）", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜R1", memo: "60LPを獲得" }, { name: "夜R2", memo: "40欠片を獲得" }]
  );
  const built = G.toDispatchActions(m, [], {});
  const results = built.actions.filter((a) => a.type === "ADD_RESULT");
  assert.equal(results.length, 2, "所持が1件も無くてもシナリオ2件 → リザルト2件");
  assert.equal(results.reduce((n, a) => n + Number(a.income && a.income.lp || 0), 0), 60, "収入も入る");
});

test("実サンプル：シナリオ数とリザルト数が全文書で一致する", () => {
  const docs = Object.entries(samples).map(([, v]) => (v && v.doc ? v.doc : v)).filter((d) => d && d.owned);
  let mismatch = 0;
  let checked = 0;
  let incomeMismatch = 0;
  for (const doc of docs) {
    const manifest = G.buildManifest(doc, { resolve });
    const scenarios = manifest.scenarios || [];
    const built = G.toDispatchActions(manifest, [], {});
    const results = built.actions.filter((a) => a.type === "ADD_RESULT");
    checked += 1;
    if (results.length !== scenarios.length) mismatch += 1;
    const scLp = scenarios.reduce((n, s) => n + (Number(s.income && s.income.lp) || 0), 0);
    const scSh = scenarios.reduce((n, s) => n + (Number(s.income && s.income.shards) || 0), 0);
    const rLp = results.reduce((n, a) => n + (Number(a.income && a.income.lp) || 0), 0);
    const rSh = results.reduce((n, a) => n + (Number(a.income && a.income.shards) || 0), 0);
    if (scLp !== rLp || scSh !== rSh) incomeMismatch += 1;
  }
  assert.ok(checked > 40, "実サンプルを十分に含む（実際 " + checked + "）");
  assert.equal(mismatch, 0, "シナリオ数とリザルト数が全文書で一致する");
  assert.equal(incomeMismatch, 0, "シナリオの収入が1件も落ちていない");
});

test("同名のシナリオが潰れてカードが減らない", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [], spirits: [] },
    [{ name: "同じ名前", memo: "10LPを獲得" }, { name: "同じ名前", memo: "20LPを獲得" }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  assert.equal(draft.blocks.length, 2, "同名のシナリオも2枚のカードとして残る");
  const built = G.toDispatchActions(m, [], {});
  assert.equal(built.actions.filter((a) => a.type === "ADD_RESULT").length, 2, "リザルトも2件");
});

test("同期・解析の記載があれば、獲得行に無くても帰属が決まる（所持に存在した証拠）", () => {
  const w2 = load();
  const resolve2 = (n) => w2.LBT_resolveCandidates(w2.LBT_buildNameIndex(db, {}), n)?.[0] || null;
  /* 獲得行（ガチャ結果→）が無く、同答主語だけがある。 */
  const doc = {
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [{ name: "剣契殺手Aの人格" }], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜S", memo: "欠片50を消費して同期化「θ剣契殺手A」" }]
  };
  const m = w2.LBT_garasumado.buildManifest(doc, { resolve: resolve2 });
  const draft = w2.LBT_garasumado.buildResultDraft(m, { db, identity: {}, resolve: resolve2 });
  const block = draft.blocks.find((b) => b.name === "夜S");
  assert.ok(block, "夜S のリザルトがある");
  assert.equal(block.items.length, 1, "同期対象は所持に存在するので帰属が決まる");
  assert.equal(block.items[0].name, "剣契殺手Aの人格");
  assert.equal(block.items[0].tier, "S", "同期の記載による帰属");
});

test("所持名に装飾があっても、正式名の同期対象と一致する", () => {
  const w2 = load();
  const resolve2 = (n) => w2.LBT_resolveCandidates(w2.LBT_buildNameIndex(db, {}), n)?.[0] || null;
  /* 所持側は「剣契殺手Aの人格」（装飾付き）、メモ側は正式名「剣契殺手A」。 */
  const doc = {
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [{ name: "剣契殺手Aの人格" }], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜T", memo: "同期化「剣契殺手A」" }]
  };
  const m = w2.LBT_garasumado.buildManifest(doc, { resolve: resolve2 });
  const draft = w2.LBT_garasumado.buildResultDraft(m, { db, identity: {}, resolve: resolve2 });
  const block = draft.blocks.find((b) => b.name === "夜T");
  assert.equal(block.items.length, 1, "装飾を除いた形で一致する");
});

test("同期の記載にも本文にも無いものは未割当のまま（推測しない）", () => {
  const m = make(
    { personas: [{ name: "まったく別の名前" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "夜U", memo: "同期化「剣契殺手A」" }]
  );
  const draft = G.buildResultDraft(m, { db, identity: {} });
  assert.equal(draft.blocks.every((b) => b.items.length === 0), true, "别人的名前は入らない");
  assert.equal(draft.unassigned.length, 1);
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

/* --- DB候補に本人を必ず含める ---------------------------------------------
   憎悪は spirits（混乱効果）の 2 文字、肩慣らしは 4 文字のサポパ。以前は
   文字一致の下限（F_MIN_DB_NAME=5）と spirits 未走査のせいで本人が候補から
   落ち、憎悪は E.G.O の「愛と憎悪の名の下に」だけが候補になっていた。
   名前が DB 行と完全一致するなら、短くても・精神でも本人を候補に出す。 */
test("所持の DB 候補には同名の DB 行（本人）が必ず入る", () => {
  const hate = G.overlapCandidates("憎悪", db);
  assert.ok(hate.some((c) => c.name === "憎悪" && c.kind === "spirit"), "精神 憎悪 が自身の候補になる");
  assert.equal(hate[0].name, "憎悪", "完全一致は先頭に来る");
  const kata = G.overlapCandidates("肩慣らし", db);
  assert.ok(kata.some((c) => c.name === "肩慣らし" && c.kind === "support"), "短いサポパ名も自身の候補になる");
  assert.equal(G.overlapCandidates("黒", db).length, 0, "完全一致の無い 1 文字は依然として推測しない");
});

/* カナだけの名前は overlapChars（漢字・英数のみ）が拾わない。完全一致の判定を
   文字種から独立させないと候補 0 になり、本人を選べない。強化も走査から漏れていた。 */
test("カナだけの名前と強化も、本人が DB 候補に出る", () => {
  const panic = G.overlapCandidates("パニック", db);
  assert.ok(panic.some((c) => c.name === "パニック" && c.kind === "spirit"), "カナ名の精神が自身の候補になる");
  assert.equal(panic[0].name, "パニック", "完全一致は先頭");
  const enha = G.overlapCandidates("燃え上がる闘志", db);
  assert.ok(enha.some((c) => c.name === "燃え上がる闘志" && c.kind === "enhancement"), "強化が自身の候補になる");
});

test("実サンプル: 購入した精神 憎悪 がシナリオカードの DB 候補に出る", () => {
  const mmib = samples.mMIbGr32lGZix60RDmoN.doc;
  const m = G.buildManifest(mmib, { resolve, candidates: (n) => w.LBT_resolveCandidates(index, n) || [] }, db);
  const draft = G.buildResultDraft(m, { db, identity: {} });
  const row = draft.blocks.flatMap((b) => b.items).find((i) => i.name === "憎悪");
  assert.ok(row, "憎悪 の行がシナリオカードにある");
  assert.ok(row.candidates.some((c) => c.name === "憎悪" && c.kind === "spirit"), "DB 候補に本人（精神）が入る");
});

/* --- 所持アイテム（包帯・鎮静剤…） ----------------------------------------
   toDispatchActions は items グループを知らず、全部「未知のグループ」として
   捨てていた（45/50 文書・131 行）。アイテムは items.json にしか無いので、
   人格・E.G.O の索引では候補も出ない。 */
test("所持アイテムの候補はアイテムカタログからだけ引く", () => {
  const cands = G.overlapCandidates("包帯", db, { only: "items" });
  assert.ok(cands.some((c) => c.name === "包帯" && c.kind === "item"), "カタログの本人が候補になる");
  assert.ok(cands.every((c) => c.kind === "item"), "人格・E.G.O を混ぜない");
  const typo = G.overlapCandidates("命体切断システム装置", db, { only: "items" });
  assert.deepEqual(Array.from(typo, (c) => c.name), ["生命体切断システム装置"], "一字違いのカタログ名が候補になる");
});

/* --- 同一品目が種別ごとに別名（賭博師＝サポパ行 / ギャンブラー＝精神行） ---
   メモの章立て（精神の章に賭博師、サポパの章にギャンブラー）と実体の
   種別が食い違うことがある。存在する種別のほうへ入れる（捨てない）。 */
test("賭博師はサポパ行として実在する", () => {
  const cands = G.overlapCandidates("賭博師", db);
  assert.ok(cands.some((c) => c.name === "賭博師" && c.kind === "support"), "サポパの賭博師");
  assert.ok(cands.every((c) => c.kind === "support"), "同名の精神は無い（精神側はギャンブラー）");
});

test("精神の章に賭博師と書いた文書は ADD_ROSTER_SUPPORT で入る", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [], spirits: [{ name: "賭博師" }] },
    [{ name: "夜L", memo: "何もない" }]
  );
  const group = m.groups.find((g) => g.id === "spirits");
  const item = group.items[0];
  const built = G.toDispatchActions(m, [item.key], {});
  const supports = built.actions.filter((a) => a.type === "ADD_ROSTER_SUPPORT");
  assert.equal(supports.length, 1, "実体の種別（サポパ）で入る");
  assert.equal(supports[0].spp.name, "賭博師");
  assert.ok(!built.skipped.some((s) => s.key === item.key), "捨てない");
});

test("サポパと精神の両方に同名 ギャンブラー が実在する（候補は種別まで選べる）", () => {
  const cands = G.overlapCandidates("ギャンブラー", db);
  assert.ok(cands.some((c) => c.name === "ギャンブラー" && c.kind === "support"), "サポパのギャンブラー");
  assert.ok(cands.some((c) => c.name === "ギャンブラー" && c.kind === "spirit"), "精神のギャンブラー");
});

test("サポパ章の所持でも精神候補を pick すれば ADD_ROSTER_SPIRIT で入る", () => {
  const m = make(
    { personas: [], egos: [], supportPassives: [{ name: "ギャンブラー" }], spirits: [] },
    [{ name: "夜M", memo: "何もない" }]
  );
  const group = m.groups.find((g) => g.id === "supportPassives");
  const item = group.items[0];
  item.picked = (G.overlapCandidates("ギャンブラー", db) || []).find((c) => c.kind === "spirit");
  const built = G.toDispatchActions(m, [item.key], {});
  const spirits = built.actions.filter((a) => a.type === "ADD_ROSTER_SPIRIT");
  assert.equal(spirits.length, 1, "選んだ種別（精神）で入る");
  assert.equal(spirits[0].spirit.name, "ギャンブラー");
  assert.ok(!built.skipped.some((s) => s.key === item.key), "捨てない");
});

test("所持アイテムは所持として入る（購入として課帳しない）", () => {
  const m = G.buildManifest(
    { currency: { lp: 0, fragments: 0 }, owned: { personalities: [], egos: [], supports: [] }, items: [{ name: "包帯", count: "2" }], scenarioHistory: [] },
    { resolve }
  );
  const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
  const out = G.toDispatchActions(m, keys, { purchases: {}, db });
  const add = out.actions.filter((a) => a.type === "ADD_ITEM_INVENTORY");
  assert.equal(add.length, 1, "アイテムが所持として入る");
  assert.equal(add[0].itemId, "heal-bandage", "カタログの id へ引く");
  assert.equal(add[0].quantity, 2, "個数を持たせる");
  assert.ok(!out.skipped.some((s) => /未知のグループ/.test(s.reason || "")), "未知のグループにしない");
});

test("実サンプル: 所持アイテムの行がどの文書でも捨てられない", () => {
  const ids = new Set(db.items.map((it) => String(it.id)));
  let rows = 0;
  for (const entry of Object.values(samples)) {
    const doc = entry && entry.doc;
    if (!doc) continue;
    const m = G.buildManifest(doc, { resolve, candidates: (n) => w.LBT_resolveCandidates(index, n) || [] }, db);
    const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
    const out = G.toDispatchActions(m, keys, { purchases: {}, db });
    assert.ok(!out.skipped.some((s) => /未知のグループ/.test(s.reason || "")), "未知のグループを出さない");
    for (const a of out.actions.filter((a) => a.type === "ADD_ITEM_INVENTORY")) {
      assert.ok(ids.has(a.itemId), "カタログに無い id を所持へ足さない: " + a.itemId);
    }
    for (const it of ((doc.items) || []).filter((i) => Number(i.count) > 0)) rows += 1;
  }
  assert.equal(rows, 131, "所持アイテムの総行数（実サンプル 50 文書）");
});
test("キャラクターURLと人格URLは取り込み前から別種として識別される", () => {
  const character = G.parseShareUrl("https://lbt-garasumado.vercel.app/view/AbCdEF1234567890abcd");
  const persona = G.parseShareUrl("https://lbt-garasumado.vercel.app/persona/view/ZyXwVu1234567890abcd");
  assert.equal(character.ok, true);
  assert.equal(character.collection, "characters");
  assert.equal(persona.ok, true);
  assert.equal(persona.collection, "personas");
  const batch = G.parseShareUrls([
    "https://lbt-garasumado.vercel.app/view/AbCdEF1234567890abcd",
    "https://lbt-garasumado.vercel.app/persona/view/ZyXwVu1234567890abcd"
  ].join("\n"));
  assert.deepEqual([...batch.urls].map((row) => row.collection), ["characters", "personas"]);
});

test("混在する硝子窓URLは全件抽出し、不正URLも成功分と別に報告する", () => {
  const parsed = G.parseShareUrls([
    "https://lbt-garasumado.vercel.app/view/AbCdEF1234567890abcd",
    "AbCdEF1234567890abcd",
    "lbt-garasumado.vercel.app/persona/view/ZyXwVu1234567890abcd",
    "https://lbt-garasumado.vercel.app/not-a-share-link/BadId"
  ].join("\n"));
  assert.equal(parsed.urls.length, 2, "同じキャラクターIDの裸IDを重複登録しない");
  assert.deepEqual([...parsed.urls].map((row) => row.collection), ["characters", "personas"]);
  assert.ok(parsed.invalid.some((row) => row.text.includes("not-a-share-link")),
    "不正URLを成功したURLの陰に隠して捨てない");
});


test("支出節の現在残高・残り残高を支出額として誤記帳しない", () => {
  const parsed = w.LBT_garaMemo.parseMemo([
    "・支出",
    "道具A 現在130LP",
    "道具B 残り42欠片",
    "道具C 130LP",
    "正義購入 現在87欠片"
  ].join("\n"));
  assert.deepEqual(
    [...parsed.spends].map((spend) => [spend.name, spend.lp, spend.shards]),
    [["道具C 130LP", 130, 0], ["正義", 0, 0]]
  );
  assert.ok(parsed.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)),
    "購入動詞があっても残高しかなければ、支出額の確認理由を返す");
});
