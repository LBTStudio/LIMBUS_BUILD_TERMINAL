import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   所持E.G.Oを硝子窓から取り込むとき、E.G.O抽出チケットで入手したものを
   「購入」として計上していた。

   candidatesFor は E.G.O に対して DB の欠片数をそのまま価格として出す
   （core:9510 の E.G.O購入価格）。しかしその価格は「購入」のときのMedicinal thingで、
   抽出/core:9502 のとき動かない。E.G.O は**:

     - 指定購入 … その E.G.O 番号横の欠片数を消費（core:9510-9512）
     - 抽出     … 一律 100 欠片（core:9502）
     - 抽出チケット … 0（チケットは 0 円的东西、支出ではない）

   由来を語れる line（ledger-provenance の PROVENANCE）が既にあるのに、
   candidatesFor がそれを見ていないのが原因。

   守るべき性質:
     - チケット/配布由来の E.G.O は価格付き候補にしない（0 埋めない）
     - 購入由来の E.G.O は今まで通り DB の欠片数を出す（回帰しない）
     - 由来が不明なら勝手に「無料」にしない。判断を要しないと分かる状態を返す
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const egoWithShards = db.egos.find((e) => e.shards && e.rank && e.no);

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const ctx = { window: { DB: db }, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: file });
  return ctx.window[apiName];
}

const provenance = load("ledger-provenance.js", "LBT_provenance");
/* roster-resolver は window.LBT_inferProvenance を見る。ブラウザと同じく
   同じ window に両方を載せる（別 vm で読み込むと由来が常に null になる）。 */
function loadResolver() {
  const ctx = { window: { DB: db }, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of ["ledger-provenance.js", "roster-resolver.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + file, import.meta.url), "utf8"), ctx, { filename: file });
  }
  return ctx.window.LBT_rosterResolver;
}
const resolver = loadResolver();
const idx = resolver.buildNameIndex(db, {});

function candidatesFor(sourceLine, name) {
  return resolver.candidatesFor({ name, sourceLine, kinds: [{ kind: "ego" }] }, idx);
}
const egoName = egoWithShards ? egoWithShards.name : db.egos[0].name;

/* --- 由来が分かる場合 --------------------------------------------------- */

test("E.G.O抽出チケットで入手したものは「支出なし」として扱う", () => {
  const line = `${egoName} E.G.O抽出チケット1枚`;
  const prov = provenance.inferProvenance(line);
  assert.equal(prov.priced, false, "チケット由来は支出ではない");

  const priced = candidatesFor(line, egoName).filter((c) => c.price);
  assert.deepEqual([...priced], [], "DB の購入価格を 提示しない");
});

test("人格抽出チケットも同じ（人格は core ルール価格が無いので握りつぶさない）", () => {
  const line = `南部セブン協会5課フィクサー 人格抽出チケット1枚`;
  const prov = provenance.inferProvenance(line);
  assert.equal(prov.priced, false);
  const priced = candidatesFor(line, "南部セブン協会5課フィクサー").filter((c) => c.price);
  assert.deepEqual([...priced], [], "抽出したE.G.O は 0 円");
});

test("指定購入なら今まで通り DB の欠片数を出す（回帰させない）", () => {
  const line = `${egoName} 購入`;
  assert.equal(provenance.inferProvenance(line).priced, true);
  const priced = candidatesFor(line, egoName).filter((c) => c.price);
  assert.ok(priced.length, "購入なら価格が出る");
  assert.equal(priced[0].price.shards, Number.parseInt(egoWithShards.shards, 10), "core:9510 の購入価格");
});

/* --- 由来が分からない場合 ---------------------------------------------- */

test("由来が不明でも勝手に無料にしない（判断が要ると分かる状態を返す）", () => {
  const line = egoName;
  const prov = provenance.inferProvenance(line);
  assert.equal(prov.id, "unknown");
  assert.equal(prov.priced, false, "不明は支出と決めない");
});

/* --- 候補の記述 ------------------------------------------------------- */

test("チケット由来の候補は「無料」でない旨と、由来が分かる形で出る", () => {
  const cands = candidatesFor(`${egoName} E.G.O抽出チケット1枚`, egoName);
  assert.ok(cands.length, "候補は消さない（利用者が選べるように）");
  const nonPurchase = cands.filter((c) => c.acquisition !== "db" || !c.price);
  assert.ok(nonPurchase.length, "価格なし候補として残る");
});

/* --- 取り込み画面の既定値 ---------------------------------------------- */

test("取り込み画面は「支出でない」項目を既定で計算に入れない", () => {
  const ui = readFileSync(new URL("../js/garasumado-import-ui.js", import.meta.url), "utf8");
  /* provenance.priced を見て include を決める分岐があること。
     include=true を先に書いて後から上書きすると，既存の無料判定が打ち消される。 */
  assert.match(ui, /item\.provenance/,
    "由来を見て既定値を決める");
  assert.match(ui, /priced === false[\s\S]{0,400}include = false/,
    "支出でない項目は include=false にする");
});