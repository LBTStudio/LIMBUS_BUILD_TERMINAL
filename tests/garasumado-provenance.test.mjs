import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* garasumado-roster-import.js は window.LBT_garaMemo（メモパーサ）を前提に
   シナリオを分解する。両方を同じコンテキストへロードする。 */
const context = vm.createContext({ console, window: {}, module: { exports: {} }, URL, JSON });
for (const file of ["garasumado-memo-parse.js", "garasumado-roster-import.js"]) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  vm.runInContext(source, context, { filename: file });
}
const gara = context.window.LBT_garasumado;

function makeDoc(owned, history) {
  return { name: "テスト", ownerName: "自分", owned, scenarioHistory: history };
}

test("所持人格をシナリオの獲得idr人に帰属させる", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }, { name: "南部ツヴァイ協会 4 課フィクサー" }], egos: [], supportPassives: [], spirits: [] },
    [
      { name: "鏡屈折鉄道1号線", memo: "人格抽出チケットで獲得：南部ツヴァイ協会 4 課フィクサー\n・支出\n憎悪購入：-50欠片" },
      { name: "別シナリオ", memo: "" }
    ]
  );
  const m = gara.buildManifest(doc, null);
  const via = (name) => (m.groups[0].items.find((i) => i.name === name) || {}).via || [];
  assert.deepEqual([...via("南部ツヴァイ協会 4 課フィクサー")], ["鏡屈折鉄道1号線"]);
  /* 履歴に記載が無い人格は空配列。消さないし、勝手にシナリオを吊るさない。 */
  assert.deepEqual([...via("黒雲会若衆")], []);
});

test("照合のされやすさは空白・全角半角・大小文字を吸収する", () => {
  const doc = makeDoc(
    { personas: [{ name: "南部セブン協会 4 課フィクサー" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "S1", memo: "人格抽出チケットで獲得：南部セブン協会４課フィクサー" }]
  );
  const m = gara.buildManifest(doc, null);
  assert.deepEqual([...(m.groups[0].items[0] || {}).via || []], ["S1"]);
});

test("照合件数の内訳（判明/不明）を明示する", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }, { name: "剣契殺手A" }, { name: "人差し指遂行者" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "S1", memo: "人格抽出チケットで獲得：黒雲会若衆" }]
  );
  const m = gara.buildManifest(doc, null);
  assert.equal(m.attribution.matched, 1);
  assert.equal(m.attribution.unmatched, 2);
  assert.equal(m.counts.unattributed, 2);
  assert.deepEqual([...m.attribution.unmatchedNames], ["剣契殺手A", "人差し指遂行者"]);
});

test("同じ人格が複数シナリオで獲得されていても失わない", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
    [
      { name: "S1", memo: "人格抽出チケットで獲得：黒雲会若衆" },
      { name: "S2", memo: "人格抽出チケットで獲得：黒雲会若衆" }
    ]
  );
  const m = gara.buildManifest(doc, null);
  assert.deepEqual([...m.groups[0].items[0].via], ["S1", "S2"]);
  assert.equal(m.attribution.matched, 1, "所持1件なので matched は1");
});

test("履歴が無い・memoが空でも落とさない", () => {
  const doc = makeDoc({ personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] }, []);
  const m = gara.buildManifest(doc, null);
  assert.equal(m.groups[0].items.length, 1);
  assert.equal(m.attribution.unmatched, 1);
});

test("取り込み action にも帰属シナリオが伝わる", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "S1", memo: "人格抽出チケットで獲得：黒雲会若衆" }]
  );
  const index = {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] })
  };
  const m = gara.buildManifest(doc, index);
  const { actions } = gara.toDispatchActions(m, ["personas:黒雲会若衆"], { purchases: {} });
  const add = actions.find((a) => a.type === "ADD_ROSTER");
  assert.ok(add, "ADD_ROSTER が生成される");
  assert.deepEqual([...add.via], ["S1"]);
});

test("シナリオに記載が無い所持品は、帰属先を選ぶまで登録しない", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "S1", memo: "人格抽出チケットで獲得：別の人格" }]
  );
  const index = {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] })
  };
  const m = gara.buildManifest(doc, index);
  const key = "personas:黒雲会若衆";

  /* 未決のままなら入れてはいけない */
  const before = gara.toDispatchActions(m, [key], { purchases: {} });
  assert.equal(before.actions.length, 0, "帰属先が決まるまで登録しない");
  assert.match(before.skipped[0].reason, /どのシナリオ/);

  /* 利用者が帰属先を選んだら、そのシナリオに入る */
  m.groups[0].items[0].pickedScenario = "S1";
  const after = gara.toDispatchActions(m, [key], { purchases: {} });
  assert.equal(after.actions.length, 1);
  assert.deepEqual([...after.actions[0].via], ["S1"]);
});

test("チケット/購入の選択が購入の有無になる", () => {
  const owned = { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] };
  const hist = [{ name: "S1", memo: "人格抽出チケットで獲得：黒雲会若衆" }];
  const index = {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] })
  };
  const key = "personas:黒雲会若衆";

  const ticket = gara.buildManifest(makeDoc(owned, hist), index);
  const t = gara.toDispatchActions(ticket, [key], { purchases: {} }).actions[0];
  assert.equal(t.source, "ticket", "履歴にチケットと書いてあれば ticket");
  assert.equal(t.purchase, false, "チケットはコスト的が掛からない");

  const buy = gara.buildManifest(makeDoc(owned, hist), index);
  buy.groups[0].items[0].source = "buy";
  const b = gara.toDispatchActions(buy, [key], { purchases: {} }).actions[0];
  assert.equal(b.purchase, true, "購入なら DB 価で請求する");
});

/* --- 同名候補の選択 ------------------------------------------------- */

const dupDoc = () => makeDoc(
  { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
  [{ name: "S1", memo: "人格抽出チケットで獲得：黒雲会若衆" }]
);

/* 通常と外套が同じ名前で存在する状況。索引の kinds に 2 件の並び得る。 */
const dupIndex = {
  resolve: () => ({
    name: "黒雲会若衆",
    confidence: "exact",
    kinds: [
      { kind: "persona", no: 208, mode: "n" },
      { kind: "persona", no: 55, mode: "t" }
    ]
  }),
  candidates: () => [{
    name: "黒雲会若衆",
    kinds: [
      { kind: "persona", no: 208, mode: "n" },
      { kind: "persona", no: 55, mode: "t" }
    ]
  }]
};

test("同名候補が複数あるとき、選ぶまで確定しない", () => {
  const m = gara.buildManifest(dupDoc(), dupIndex);
  const item = m.groups[0].items[0];
  assert.equal(item.needsIdentity, true, "候補が2件なので選択が必要");
  assert.equal(item.identityCandidates.length, 2);

  /* 選ばずに帰属と入手方法だけ決めても、番号は埋まらない */
  item.pickedScenario = "S1";
  item.source = "ticket";
  const out = gara.toDispatchActions(m, ["personas:黒雲会若衆"], { purchases: {} });
  assert.equal(out.actions.length, 0, "どの候補か決まるまで入れない");
});

test("候補を選ぶと、その番号で登録される", () => {
  const m = gara.buildManifest(dupDoc(), dupIndex);
  const item = m.groups[0].items[0];
  item.pickedScenario = "S1";
  item.source = "ticket";
  item.picked = item.identityCandidates.find((c) => c.mode === "t");
  const out = gara.toDispatchActions(m, ["personas:黒雲会若衆"], { purchases: {} });
  assert.equal(out.actions.length, 1);
  assert.equal(out.actions[0].mode, "t", "選んだ外套の方が入る");
  assert.equal(String(out.actions[0].no), "55");
});

test("候補が1件だけなら選択せず確定する", () => {
  const m = gara.buildManifest(dupDoc(), {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] }),
    candidates: () => [{ name: "黒雲会若衆", kinds: [{ kind: "persona", no: 208, mode: "n" }] }]
  });
  assert.equal(m.groups[0].items[0].needsIdentity, false);
});

test("候補が0件の名前は、推測で埋めずに理由を出す", () => {
  const m = gara.buildManifest(dupDoc(), { resolve: () => null, candidates: () => [] });
  const item = m.groups[0].items[0];
  assert.equal(item.needsIdentity, true);
  item.pickedScenario = "S1";
  item.source = "ticket";
  const out = gara.toDispatchActions(m, ["personas:黒雲会若衆"], { purchases: {} });
  assert.equal(out.actions.length, 0);
  assert.match(out.skipped[0].reason, /DB番号/);
});