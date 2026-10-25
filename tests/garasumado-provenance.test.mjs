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

test("チェックした所持品は帰属未決でも配布として入る", () => {
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "S1", memo: "人格抽出チケットで獲得：別の人格" }]
  );
  const index = {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] })
  };
  const m = gara.buildManifest(doc, index);
  const key = "personas:黒雲会若衆";

  /* チェック＝入れるへの同意。帰属先が未決でも入れる（チェックしたのに
     何も入らないのは操作としても嘘）。帰属が決まらないので明細は
     「未分類＝待機項目」へ置かれる。 */
  const before = gara.toDispatchActions(m, [key], { purchases: {} });
  /* シナリオ1件＝リザルト1件は、帰属先が未決でもできる。 */
  assert.equal(before.actions.filter((a) => a.type === "ADD_RESULT").length, 1, "シナリオ分のリザルトはできる");
  const beforeHeld = before.actions.filter((a) => a.type === "ADD_ROSTER");
  assert.equal(beforeHeld.length, 1, "チェックした所持は配布として入る");
  assert.equal(beforeHeld[0].purchase, false, "帰属未決では課帳しない");
  assert.equal(before.skipped.length, 0, "入れるので理由は出ない");

  /* 利用者が帰属先を選んだら、そのシナリオに入る。 */
  m.groups[0].items[0].pickedScenario = "S1";
  const after = gara.toDispatchActions(m, [key], { purchases: {} });
  const afterHeld = after.actions.filter((a) => a.type !== "ADD_RESULT");
  assert.equal(afterHeld.length, 1, "所持は1件");
  assert.deepEqual([...afterHeld[0].via], ["S1"]);
  /* 帰属先のシナリオのリザルト（ADD_RESULT）も同時に作られる。
     これが無いと明細だけが宙に浮いて照合先が無い。 */
  assert.deepEqual([...after.actions.filter((a) => a.type === "ADD_RESULT").map((r) => r.name)], ["S1"]);
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

test("入手方法に未回答のチェック済み品目は配布として入る", () => {
  const owned = { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] };
  const m = gara.buildManifest(makeDoc(owned, [{ name: "S1", memo: "" }]), {
    resolve: () => ({ name: "黒雲会若衆", confidence: "exact", kinds: [{ kind: "persona", no: 208, mode: "n" }] })
  });
  const key = "personas:黒雲会若衆";
  const item = m.groups[0].items[0];
  item.pickedScenario = "S1";

  /* チェック＝入れるへの同意。未回答を配布と勝手に解釈しても、
     purchase は false なので帳は膨らまない（課帳は回答が決めてから）。 */
  assert.equal(item.source, "", "入手方法は未決");
  const out = gara.toDispatchActions(m, [key], { purchases: {} });
  const held = out.actions.filter((a) => a.type === "ADD_ROSTER");
  assert.equal(held.length, 1, "所持へ入る");
  assert.equal(held[0].purchase, false, "未回答では課帳しない");
  assert.equal(out.skipped.length, 0, "理由は出ない");

  /* 答えたらその分類で入る */
  for (const source of ["ticket", "buy", "given"]) {
    item.source = source;
    const next = gara.toDispatchActions(m, [key], { purchases: {} });
    assert.equal(next.actions.filter((a) => a.type === "ADD_ROSTER").length, 1, source + " は入る");
    assert.equal(next.actions.find((a) => a.type === "ADD_ROSTER").source, source);
  }
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
  const held = out.actions.filter((a) => a.type !== "ADD_RESULT");
  /* この項目は番号が2候補あるどの unmarked。シナリオ側の獲得とは別物。 */
  /* シナリオ側の獲得と、この項目の登録は同じ action 型で混ざる。
     項目が未決であることは skipped の理由で見る。 */
  assert.ok(out.skipped.some((s) => /候補/.test(s.reason)), "候補が未選択なら項目は登録しない");
});

test("候補を選ぶと、その番号で登録される", () => {
  const m = gara.buildManifest(dupDoc(), dupIndex);
  const item = m.groups[0].items[0];
  item.pickedScenario = "S1";
  item.source = "ticket";
  item.picked = item.identityCandidates.find((c) => c.mode === "t");
  const out = gara.toDispatchActions(m, ["personas:黒雲会若衆"], { purchases: {} });
  const held = out.actions.filter((a) => a.type !== "ADD_RESULT");
  assert.equal(out.actions.filter((a) => String(a.no) === "55" && a.mode === "t").length, 1);
  assert.equal(held[0].mode, "t", "選んだ外套の方が入る");
  assert.equal(String(held[0].no), "55");
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
  const held = out.actions.filter((a) => a.type !== "ADD_RESULT");
  assert.equal(held.length, 0);
  assert.equal(out.actions.filter((a) => a.type === "ADD_RESULT").length, 1, "リザルトは帰属先として入る");
  assert.match(out.skipped[0].reason, /DB番号/);
});


test("報酬人格は所持一覧と照合し、報酬行と所持一覧から二重登録しない", () => {
  const persona = { kind: "persona", no: 208, mode: "n" };
  const index = {
    resolve: (name) => name === "黒雲会若衆" ? { name, confidence: "exact", kinds: [persona] } : null,
    candidates: (name) => name === "黒雲会若衆" ? [{ name, kinds: [persona] }] : []
  };
  const doc = makeDoc(
    { personas: [{ name: "黒雲会若衆" }], egos: [], supportPassives: [], spirits: [] },
    [{ name: "報酬獲得", memo: "報酬：黒雲会若衆" }]
  );
  const manifest = gara.buildManifest(doc, index);
  const owned = manifest.groups[0].items[0];
  assert.deepEqual([...owned.via], ["報酬獲得"], "報酬を所持人格の獲得元に帰属");
  assert.equal(manifest.scenarios[0].wins[0].name, "黒雲会若衆", "照合用には装飾を除いた正式名を渡す");
  const out = gara.toDispatchActions(manifest, ["personas:黒雲会若衆"], { purchases: {} });
  const rosterAdds = out.actions.filter((a) => a.type === "ADD_ROSTER");
  assert.equal(rosterAdds.length, 1, "所持一覧と報酬行の両方にあっても一件のみ");
  assert.deepEqual([...rosterAdds[0].via], ["報酬獲得"]);
  assert.equal(rosterAdds[0].purchase, false, "直接報酬を購入にしない");
});

test("未所持の報酬人格は既存DB照合を経て所持へ追加する", () => {
  const persona = { kind: "persona", no: 208, mode: "n" };
  const index = {
    resolve: (name) => name === "黒雲会若衆" ? { name, confidence: "exact", kinds: [persona] } : null,
    candidates: (name) => name === "黒雲会若衆" ? [{ name, kinds: [persona] }] : []
  };
  const doc = makeDoc(
    { personas: [], egos: [], supportPassives: [], spirits: [] },
    [{ name: "報酬獲得", memo: "報酬：黒雲会若衆" }]
  );
  const manifest = gara.buildManifest(doc, index);
  const out = gara.toDispatchActions(manifest, [], { purchases: {} });
  const rosterAdds = out.actions.filter((a) => a.type === "ADD_ROSTER");
  assert.equal(rosterAdds.length, 1);
  assert.equal(rosterAdds[0].mode, "n");
  assert.equal(String(rosterAdds[0].no), "208");
});
