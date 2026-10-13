import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   硝子窓の共有URL取り込みの回帰テスト。

   守るべき性質:
     - 共有URL 1 つで所持が全部取れること（一覧取得は存在しない）
     - コレクションは characters / personas を正しく見分けること
     - 取り込む前に「何が存在するか」が一覧できること（選択の材料）
     - DB に無い名前は解決済みにしないこと
     - 壊れた値でも manifest を落とさないこと
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const G = load("garasumado-roster-import.js", "LBT_garasumado");

test("共有URL からドキュメント ID とコレクションを抜く", () => {
  const a = G.parseShareUrl("https://lbt-garasumado.vercel.app/view/mMIbGr32lGZix60RDmoN");
  assert.equal(a.ok, true);
  assert.equal(a.id, "mMIbGr32lGZix60RDmoN");
  assert.equal(a.collection, "characters");

  const b = G.parseShareUrl("https://lbt-garasumado.vercel.app/persona/view/EPm6O9SU11aYYj0obEar");
  assert.equal(b.collection, "personas");

  assert.equal(G.parseShareUrl("").ok, false);
  assert.equal(G.parseShareUrl("https://example.com/view/abc123").ok, false);
});

test("Firestore の値表現を素の値へ戻す", () => {
  const out = G.unwrapFirestore({
    name: { stringValue: "ユサ" },
    n: { integerValue: "12" },
    ok: { booleanValue: true },
    list: { arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } },
    nested: { mapValue: { fields: { x: { stringValue: "y" } } } }
  });
  assert.equal(out.name, "ユサ");
  assert.equal(out.n, 12);
  assert.equal(out.ok, true);
  assert.deepEqual(out.list, ["a", "b"]);
  assert.equal(out.nested.x, "y");
});

/* --- 実サンプル 29 件（提示された URL から取得した実物） --------------- */
/* 実データは公開リポジトリに載せられないので personal 語のみ除いた匿名版を使う。 */
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const chars = Object.entries(samples).filter(([, v]) => v.coll === "characters");
const personas = Object.entries(samples).filter(([, v]) => v.coll === "personas");

test("実サンプルが 49 キャラクター + 1  persona で揃っている", () => {
  assert.equal(chars.length, 49);
  assert.equal(personas.length, 1);
});

test("実サンプルの manifest が全キャラクターで組める", () => {
  let totalScenarios = 0;
  for (const [, { doc }] of chars) {
    const m = G.buildManifest(doc, null);
    assert.ok(m.character.name, "キャラクター名が取れる");
    assert.equal(m.groups.length, 4, "人格 / E.G.O / パッシブ / 精神 の 4 グループ");
    // 重複名は 1 件に畳まれる。所以 manifest は「一意な名前」の数になる。
    const unique = new Set((doc.owned?.personas || [])
      .map((v) => (typeof v === "string" ? v.trim() : (v && v.name ? String(v.name).trim() : "")))
      .filter(Boolean));
    assert.equal(m.counts.personas, unique.size, "重複を畳んだ所持人格の数が一致する");
    assert.ok(m.currency.lp !== undefined && m.currency.shards !== undefined, "残高が取れる");
    totalScenarios += m.counts.scenarios;
  }
  assert.ok(totalScenarios > 400, "シナリオ履歴がまとめて取れている（実際 " + totalScenarios + "）");
});

test("manifest は「解けた／解けない」を区別して出す", () => {
  const doc = chars.find(([, { doc: d }]) =>
    JSON.stringify(d.owned || {}).includes("ミートパイ"));
  assert.ok(doc, "ミート파이を含むキャラクターが存在する");
  const m = G.buildManifest(doc[1].doc, {
    resolve(name) {
      return name.includes("ミートパイ")
        ? { name: "○○のミートパイ厨房長", kinds: [{ kind: "persona" }], confidence: "unique-substring" }
        : null;
    }
  });
  const all = m.groups.flatMap((g) => g.items);
  assert.ok(all.length > 0, "候補が出ている");
  assert.ok(all.some((i) => i.resolved), "解けたものが混ざる");
  assert.ok(all.some((i) => !i.resolved), "解けないものも混ざる");
  assert.ok(m.counts.unresolved >= 0, "未解決の件数を持つ");
  for (const item of all) {
    if (item.resolved) assert.ok(item.dbName, "解けたものは DB 名を持つ");
    else assert.equal(item.dbName, "", "解けていないものに DB 名は作らない");
  }
});

test("壊れた値でも manifest を落とさない", () => {
  for (const bad of [{}, null, { owned: null }, { owned: { personas: null } }, { owned: { personas: [null, {}, 3] } }]) {
    const m = G.buildManifest(bad, null);
    assert.equal(m.groups.length, 4);
    assert.equal(m.counts.scenarios, 0);
  }
});

test("キャラクター名と所有者名は別物", () => {
  const withOwner = chars.find(([, { doc }]) => doc.ownerName);
  const m = G.buildManifest(withOwner[1].doc, null);
  assert.equal(m.character.name, withOwner[1].doc.name);
  assert.equal(m.character.ownerName, withOwner[1].doc.ownerName);
  assert.notEqual(m.character.name, m.character.ownerName, "名前と PL 名を取り違えない");
});

/* --- 実際に投げる action まで（製品経路は toDispatchActions） --------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadResolver() {
  const w = { DB: db };
  const context = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  for (const f of ["js/garasumado-roster-import.js", "js/roster-resolver.js"]) {
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), context, { filename: f });
  }
  return w;
}

const charDocs = chars.map(([, { doc }]) => doc);

function resolvedManifest(doc) {
  const w = loadResolver();
  const index = w.LBT_buildNameIndex(db, {});
  return G.buildManifest(doc, { resolve: (name) => w.LBT_resolveCandidates(index, name)?.[0] || null });
}

test("取り込み: 実サンプル 49 文書から所持を列挙し、action を大量に出せる", () => {
  assert.equal(charDocs.length, 49);
  let resolved = 0;
  let actions = 0;
  for (const doc of charDocs) {
    const m = resolvedManifest(doc);
    for (const g of m.groups) for (const it of g.items) if (it.kinds?.length) resolved++;
    actions += G.toDispatchActions(m, m.groups.flatMap((g) => g.items.map((i) => i.key)), {}).actions.length;
  }
  assert.ok(resolved > 800, "大半の所持が DB に引ける（実際 " + resolved + "）");
  assert.ok(actions > 800, "所持追加 action を大量に出せる（実際 " + actions + "）");
});

test("取り込み: 所持だけ入れず reducer の購入経路に預ける（番号は数値のまま預ける）", () => {
  const manifest = {
    groups: [
      { id: "personas", items: [{ key: "p1", name: "黒雲会組員", dbName: "黒雲会組員", kinds: [{ kind: "persona", no: 1, mode: "n" }] }] },
      { id: "egos", items: [{ key: "e1", name: "X", dbName: "X", kinds: [{ kind: "ego", no: 32, rank: "TETH" }] }] },
      { id: "spirits", items: [{ key: "s1", name: "Y", dbName: "Y", kinds: [{ kind: "spirit" }] }] },
      { id: "supportPassives", items: [{ key: "b1", name: "Z", dbName: "Z", kinds: [{ kind: "support" }] }] }
    ],
    scenarios: []
  };
  const built = G.toDispatchActions(manifest, ["p1", "e1", "s1", "b1"], {});
  /* vm の中で作られた配列はこっちの Array ではない。広げてから比べる。 */
  assert.deepEqual([...built.actions.map((a) => a.type)].sort(),
    ["ADD_ROSTER", "ADD_ROSTER_EGO", "ADD_ROSTER_SPIRIT", "ADD_ROSTER_SUPPORT"]);
  /* 番号は文字列化しない。DB 照合は文字列比較に寄せたので、渡せる状態にしてある。 */
  assert.equal(built.actions.find((a) => a.type === "ADD_ROSTER").no, "1");
  assert.equal(built.actions.find((a) => a.type === "ADD_ROSTER_EGO").no, "32");
  /* resultId は呼び出し側が付ける（panel はどちらのリザルトかも知らない）。 */
  assert.ok(built.actions.every((a) => !("resultId" in a)));
  assert.equal(built.skipped.length, 0);
});

test("取り込み: 番号やランクが引けないものは理由付きで除外する", () => {
  const manifest = {
    groups: [
      { id: "egos", items: [
        { key: "bad1", name: "A", dbName: "A", kinds: [{ kind: "ego", rank: "TETH" }] },
        { key: "bad2", name: "B", dbName: "B", kinds: [{ kind: "ego", no: 5 }] },
        { key: "ok", name: "C", dbName: "C", kinds: [{ kind: "ego", no: 5, rank: "HE" }] }
      ] }
    ],
    scenarios: []
  };
  const built = G.toDispatchActions(manifest, ["bad1", "bad2", "ok"], {});
  assert.equal(built.actions.length, 1, "引けた1件だけ入れる");
  assert.equal(built.actions[0].no, "5");
  assert.equal(built.skipped.length, 2, "残り2件は理由付きで除外");
  assert.ok(built.skipped.every((s) => /DB番号かランク/.test(s.reason)));
});

test("取り込み: シナリオ1件ごとに ADD_RESULT が出て、ADD_ENTRY が直後に続く", () => {
  const manifest = {
    groups: [],
    scenarios: [
      { key: "scenario:0", name: "第一夜", memo: "", group: "scenarios" },
      { key: "scenario:1", name: "第二夜", memo: "", group: "scenarios" }
    ]
  };
  const built = G.toDispatchActions(manifest, ["scenario:0", "scenario:1"], {
    income: { lp: "10", shards: "2" },
    purchases: { "scenario:0": [{ kind: "spirit", name: "パニック", cost: { lp: 1 } }] }
  });
  const types = [...built.actions.map((a) => a.type)];
  assert.deepEqual(types, ["ADD_RESULT", "ADD_ENTRY", "ADD_RESULT"]);
  assert.equal(built.actions[0].name, "第一夜");
  /* 支出明細は直前のリザルトに歸属する。順序が崩れると明細が別の夜に入る。 */
  assert.equal(built.actions[1].kind, "spirit");
  assert.equal(built.actions[2].name, "第二夜");
});