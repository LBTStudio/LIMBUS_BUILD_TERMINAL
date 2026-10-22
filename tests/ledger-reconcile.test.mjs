import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   取り込み時の帳尻合わせと、購入履歴の予測変換。

   守るべき性質:
     - 収入合計と現在残高から支出額を導出できること
   - 合わない箇所を勝手に埋めず、指摘として返すこと
   - 名前が一致すれば、ログに金額が無くても DB の価格で過不足が埋まること
     - 価格が無いものは提案しないこと
   --------------------------------------------------------------------------- */

function load(file, apiName, extra) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: { ...(extra || {}) }, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const C = load("ledger-import-reconcile.js", "LBT_ledgerReconcile", { DB: db });
const R = load("roster-resolver.js", "LBT_rosterResolver");
const idx = R.buildNameIndex(db, {});

/* --- 1. 帳尻合わせ ----------------------------------------------------- */

test("連続するリザルトから支出額を導出する", () => {
  const rows = [
    { title: "第1回", income: { lp: 100 }, current: { lp: 130 } },
    { title: "第2回", income: { lp: 50 }, current: { lp: 100 } },
    { title: "第3回", income: { lp: 20 }, current: { lp: 70 } }
  ];
  const out = C.reconcileResults(rows);
  assert.equal(out.length, 3);
  assert.equal(out[0].impliedSpend.lp, 100, "1件目は獲得分が基準");
  assert.equal(out[1].impliedSpend.lp, 80, "130 + 50 - 100 = 80");
  assert.equal(out[2].impliedSpend.lp, 50, "100 + 20 - 70 = 50");
  for (const row of out) {
    assert.equal(row.flags.filter((f) => f.level === "error").length, 0, "全部整合");
  }
  // shards の現在残高が未入力なので info は出る。それは仕様。
  assert.ok(out[0].flags.some((f) => f.code === "no-current" && f.currency === "shards"));
});

test("合わない箇所は埋めずに指摘として返す", () => {
  const rows = [
    { title: "第1回", income: { lp: 35 }, current: { lp: 75 } },
    { title: "第2回", income: { lp: 30 }, current: { lp: 150 } }
  ];
  const out = C.reconcileResults(rows);
  const errors = out[1].flags.filter((f) => f.level === "error");
  assert.equal(errors.length, 1, "1件指摘");
  assert.equal(errors[0].code, "negative-spend");
  assert.equal(errors[0].currency, "lp");
  assert.equal(errors[0].gap, 45, "75 + 30 - 150 = -45");
});

test("現在残高が未入力なら指摘する（黙って通さない）", () => {
  const rows = [
    { title: "第1回", income: { lp: 100 }, current: { lp: "" } },
    { title: "第2回", income: { lp: 10 }, current: { lp: 100 } }
  ];
  const out = C.reconcileResults(rows);
  const infos = out[0].flags.filter((f) => f.code === "no-current");
  assert.ok(infos.length >= 1, "未入力が指摘される");
});

test("LP と 欠片 を別々に見る", () => {
  const rows = [
    { title: "第1回", income: { lp: 10, shards: 5 }, current: { lp: 100, shards: 40 } },
    { title: "第2回", income: { lp: 10, shards: 5 }, current: { lp: 90, shards: 20 } }
  ];
  const out = C.reconcileResults(rows);
  assert.equal(out[1].impliedSpend.lp, 20);
  assert.equal(out[1].impliedSpend.shards, 25);
});


test("LP と欠片の初回残高は通貨別に判定する", () => {
  const out = C.reconcileResults([
    { title: "第1回", income: { lp: 10, shards: 100 }, current: { lp: 100, shards: "" } },
    { title: "第2回", income: { lp: 10, shards: 10 }, current: { lp: 90, shards: 50 } }
  ]);
  assert.equal(out[1].impliedSpend.lp, 20, "LP は前回残高を基準に計算");
  assert.equal(out[1].impliedSpend.shards, 10, "欠片は初めて残高が分かった行を基準にする");
  assert.equal(out[1].flags.some((f) => f.code === "negative-spend" && f.currency === "shards"), false,
    "過去の欠片残高が不明なのに架空の不足を指摘しない");
});

test("非数値の現在残高はゼロと誤認せず未入力として警告する", () => {
  const out = C.reconcileResults([
    { title: "入力ミス", income: { lp: 20 }, current: { lp: "abc" } }
  ]);
  assert.equal(out[0].current.lp, null);
  assert.ok(out[0].flags.some((f) => f.code === "no-current" && f.currency === "lp"));
  assert.equal(out[0].impliedSpend.lp, null);
});

test("非数値の収入をゼロとして黙って通さない", () => {
  const out = C.reconcileResults([
    { title: "入力ミス", income: { lp: "12abc" }, current: { lp: 100 } }
  ]);
  assert.equal(out[0].income.lp, 0);
  assert.ok(out[0].flags.some((f) => f.code === "invalid-income" && f.currency === "lp"));
});

test("カンマ区切りの金額は許可し、不正な桁区切りは拒否する", () => {
  const out = C.reconcileResults([
    { title: "正常", income: { lp: "1,200" }, current: { lp: "1,200" } },
    { title: "不正", income: { lp: 10 }, current: { lp: "1,2" } }
  ]);
  assert.equal(out[0].income.lp, 1200);
  assert.equal(out[0].current.lp, 1200);
  assert.equal(out[1].current.lp, null);
  assert.ok(out[1].flags.some((f) => f.code === "no-current" && f.currency === "lp"));
});

/* --- 2. 予測変換（名前から価格を引く） --------------------------------- */

test("名前が一致すれば、ログに金額が無くても価格が確定する", () => {
  const memo = [
    "LP50　現在237",
    "・支出",
    "ルサンチマン　現在52LP",
    "憎悪　現在5欠片"
  ].join("\n");
  const { proposals } = C.proposePurchases(memo, { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  assert.equal(proposals.length, 2, "サポパと精神の 2 件（実際 " + proposals.length + "）");
  const support = proposals.find((p) => p.kind === "support");
  const spirit = proposals.find((p) => p.kind === "spirit");
  assert.equal(support.cost.lp, 7, "ルサンチマンは 7LP（DB 由来）");
  assert.ok(spirit.cost.shards > 0, "精神は欠片（DB 由来の価格）");
  for (const p of proposals) {
    assert.ok(["support", "deathSupport", "spirit", "enhancement"].includes(p.kind), "購入種別: " + p.kind);
    assert.ok(p.confidence, "確度が付いている");
  }
});

test("行ごとに選びれるようにする", () => {
  const memo = ["・支出", "ルサンチマン　現在52LP", "ルサンチマン　現在20LP"].join("\n");
  const { proposals } = C.proposePurchases(memo, { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  const same = proposals.filter((p) => p.name === "ルサンチマン");
  /* 行ごとに選択できるよう、1 行 1 件になる。 */
  assert.equal(same.length, 2, "行ごとに分かれる");
  assert.notEqual(same[0].key, same[1].key, "選択の単位が一意");
  assert.equal(same[0].lineNo, 2);
  assert.equal(same[1].lineNo, 3);
});

test("引けなかった行は unresolved として残り、利用者が決められる", () => {
  const memo = ["・支出", "涙剣 同期化 欠片134", "东部親指ソルダードII　87"].join("\n");
  const { proposals, unresolved } = C.proposePurchases(memo, { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  assert.equal(proposals.length, 0, "推測で埋めない");
  assert.ok(unresolved.length > 0, "判断を仰ぐ行が残る");
  for (const u of unresolved) {
    assert.ok(u.lineNo > 0, "行番号が分かる");
    assert.ok(u.line, "元の行が残る");
  }
});

test("価格が無いものは提案しない（0 件の候補にしない）", () => {
  const { proposals } = C.proposePurchases("南部セブン協会5課フィクサー", { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  assert.equal(proposals.length, 0, "人格は購入提案にしない");
});

test("通貨だけの行を名前とみなさない", () => {
  const { proposals } = C.proposePurchases("90LP　現在100LP\n29欠片　現在39欠片",
    { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  assert.equal(proposals.length, 0);
});

/* --- 3. 実データ: ユサの履歴で実際に線が引けるか ---------------------- */

const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const subject = Object.values(samples).find((v) => v.coll === "characters" && (v.doc.scenarioHistory || []).length > 40);

test("実データ: 履歴から購入候補が実際に引ける", () => {
  assert.ok(subject, "実データが存在する");
  let total = 0;
  let withPrice = 0;
  for (const h of subject.doc.scenarioHistory) {
    const { proposals } = C.proposePurchases(h.memo, { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
    total += proposals.length;
    for (const p of proposals) if (p.cost.lp || p.cost.shards) withPrice += 1;
  }
  assert.ok(total > 0, "購入候補が引ける（実際 " + total + " 件）");
  assert.equal(withPrice, total, "引けた候補はすべて価格が確定している");
});

/* --- 判定不能行の範囲（実データで 254 行の壁になった挙動の固定） -------- */

test("判定不能は支出節の名前行だけに絞る（収入・現在・換算は対象外）", () => {
  const resolve = (n) => R.resolveCandidates(idx, n)[0] || null;
  const memo = [
    "誰も死ななかった！ボーナス人格チケット1枚",
    "涙剣 同期化 欠片134",
    "・支出",
    "东部親指ソルダードII　87 現在52LP",
    "LPを欠片に変換：+11欠片 -22LP",
    "东部親指ソルダードII　87"
  ].join("\n");
  const { unresolved } = C.proposePurchases(memo, { resolve });
  assert.equal(unresolved.length, 1, "支出節の名前行だけが残る");
  assert.equal(unresolved[0].lineNo, 6);
  assert.match(unresolved[0].line, /东部親指ソルダードII/);
});

test("購入候補の抽出は節で絞らない（再現率優先・確認は利用者）", () => {
  const memo = ["・買い物", "ルサンチマン　現在52LP"].join("\n");
  const { proposals } = C.proposePurchases(memo, { resolve: (n) => R.resolveCandidates(idx, n)[0] || null });
  assert.equal(proposals.length, 1, "支出見出しが無くても候補は出す");
});
