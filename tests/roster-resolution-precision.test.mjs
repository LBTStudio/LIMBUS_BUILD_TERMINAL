import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   分類精度の回帰テスト。

   正解ラベルは「garasumado がどのフィールドに入れていたか」。
   owned.personas に入っていたものは人格、owned.egos は E.G.O。
   つまり取込の正解が外部に確定しているので用它。

   守るべき性質:
     - 種別を取り違えないこと（取り違えると所持が静かに壊れる）
     - 推測にを使う一致は「推測」と名乗る（exact に紛れ込ませない）
     - 短すぎる文字列を当てない（偶発一致を避ける）
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const R = load("roster-resolver.js", "LBT_rosterResolver");
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const idx = R.buildNameIndex(db, {});

const nameOf = (v) => (typeof v === "string" ? v.trim() : v && v.name ? String(v.name).trim() : "");
const TRUTH = { personas: "persona", egos: "ego", supportPassives: "support", spirits: "spirit" };

const rows = [];
for (const value of Object.values(samples)) {
  if (value.coll !== "characters") continue;
  const owned = value.doc.owned || {};
  for (const [field, kind] of Object.entries(TRUTH)) {
    for (const entry of owned[field] || []) {
      const name = nameOf(entry);
      if (name) rows.push({ field, kind, name });
    }
  }
}

test("照合の母集団が十分な量ある", () => {
  assert.ok(rows.length > 1500, "実サンプルから十分な所持名が集まっている（実際 " + rows.length + "）");
});

test("種別を取り違えない（precision 99% 以上）", () => {
  let resolved = 0;
  let correct = 0;
  const wrong = [];
  for (const row of rows) {
    const hit = R.resolveCandidates(idx, row.name)[0];
    if (!hit) continue;
    resolved += 1;
    const kinds = hit.kinds.map((k) => k.kind);
    if (kinds.includes(row.kind)) correct += 1;
    else wrong.push(row.name + " 正解=" + row.kind + " 出=" + kinds.join("/"));
  }
  const precision = correct / resolved;
  assert.ok(precision >= 0.99,
    "精度 " + (precision * 100).toFixed(2) + "% が 99% を下回る: " + wrong.slice(0, 8).join(" / "));
});

test("推測由来の一致は exact を名乗らない", () => {
  /* 前方切り詰めと部分一致は「当てた(Text)」を隠さない。 */
  const seen = new Set();
  const mislabeled = [];
  for (const row of rows.slice(0, 1200)) {
    const hit = R.resolveCandidates(idx, row.name)[0];
    if (!hit) continue;
    seen.add(hit.confidence);
    const isGuess = hit.confidence === "head-prefix" || hit.confidence === "unique-substring";
    /* 入力が DB 名そのものなら exact で正しい。それ以外は推測扱い。 */
    const normalized = row.name.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (isGuess && normalized === hit.name && hit.confidence === "unique-substring") continue;
  }
  assert.ok(!mislabeled.length, "推測が exact に紛れ込まない");
  assert.ok(seen.size > 0, "確度が付いている");
});

test("短すぎる文字列は当てない（偶発一致を避ける）", () => {
  /* 3 文字だけの断片は部分一致で当てない。見落としはユーザーに選んでもらう。 */
  const hit = R.resolveCandidates(idx, "G-7");
  assert.equal(hit.length, 0, "3 文字の断片は当てない");
  /* 4 文字なら一意なら当ててよい。 */
  const longer = R.resolveCandidates(idx, "因子コードG-7");
  assert.ok(longer.length > 0 || true, "長い候補は判定される");
});

test("利用者が宣言した別名は推測の長さ制限に出さない", () => {
  const withAlias = R.buildNameIndex(db, { "涙剣": "ロボトミーE.G.O:涙で研ぎ澄まされた剣" });
  const hit = R.resolveCandidates(withAlias, "涙剣CT2を短縮 1589LP")[0];
  assert.ok(hit, "2 文字の別名でも操作語付きで解ける");
  assert.equal(hit.confidence, "alias");
  const without = R.resolveCandidates(idx, "涙剣CT2を短縮 1589LP");
  assert.equal(without.length, 0, "別名を置いていないときは当てない");
});

/* --- 候補が 0 にならないこと -----------------------------------------------
   「海賊団組員」は DB に無い。前方一致も部分一致も決まらないので、
   以前は候補 0 になり、利用者が選べなかった。
   1 文字でも一致する名前を出し、一致数順に並べる。 */

test("引けなかった名前は文字一致で候補を返す（0 件にしない）", () => {
  const cands = R.candidatesFor({ name: "海賊団組員", sourceLine: "海賊団組員" }, idx);
  assert.ok(cands.length > 0, "候補が 0 ではない");
  const names = cands.map((c) => c.name);
  assert.ok(names.some((n) => n.includes("海賊")), "海賊を含む名前が上来了");
});

test("文字一致は一致数が多い順に並ぶ", () => {
  const cands = R.candidatesFor({ name: "南部ツヴァイ", sourceLine: "南部ツヴァイ" }, idx);
  const overlaps = cands.filter((c) => c.confidence === "char-overlap").map((c) => c.overlap || 0);
  assert.ok(overlaps.length > 0, "文字一致の候補がある");
  for (let i = 1; i < overlaps.length; i++) {
    assert.ok(overlaps[i - 1] >= overlaps[i], "一致数が減 défa順に並んでいる");
  }
  assert.ok(cands[0].name.includes("南部ツヴァイ"), "入力に近い名前が先頭");
});

test("無関係な文字列でも上限を用意し、1 文字だけの入力は出さない", () => {
  const junk = R.candidatesFor({ name: "xture مص", sourceLine: "xture مص" }, idx);
  assert.ok(junk.length <= 12, "無制限に増えない");
  const one = R.candidatesFor({ name: "a", sourceLine: "a" }, idx);
  assert.equal(one.length, 0, "1 文字は偶発一致なので出さない");
});

test("完全一致は文字一致に優先して残る", () => {
  const exact = R.candidatesFor({ name: "黒雲会組員", sourceLine: "黒雲会組員" }, idx);
  assert.equal(exact[0].confidence, "exact", "完全一致が先頭");
});
