import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   所持項目の由来（なぜ手に入ったか）と、計算に含めるかどうか。

   守るべき性質:
     - 同じ名前でも配布・チケット抽出・ランダムガチャ・指定購入で意味が変わること
     - 由来を推定した しても「推定」であること
     - 人格には価格が無いので自動計算できないこと（欠落ではなく仕様）
     - 初期値は自動判定、利用者が項目ごとに切り替えられること
   --------------------------------------------------------------------------- */

function load(file, apiName, extra) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: { ...(extra || {}) }, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const V = load("ledger-provenance.js", "LBT_provenance");

/* --- 由来 ------------------------------------------------------------- */

test("同じ E.G.O でも由来が違えば帳簿上の意味が変わる", () => {
  const grant = V.inferProvenance("開花E.G.O:壇香梅 獲得");
  const ticket = V.inferProvenance("開花E.G.O:壇香梅 人格抽出チケット1枚");
  const purchase = V.inferProvenance("開花E.G.O:壇香梅 購入");
  assert.equal(grant.priced, false, "配布は支出ではない");
  assert.equal(ticket.priced, false, "チケット抽出は支出ではない");
  assert.equal(purchase.priced, true, "指定購入は支出");
  assert.notEqual(grant.id, purchase.id);
});

test("推定には必ず根拠と確度が付く", () => {
  const hit = V.inferProvenance("ルサンチマン 購入");
  assert.ok(hit.id, "由来が分かる");
  assert.ok(["strong", "weak", "ambiguous", "none"].includes(hit.confidence), "確度が付く");
  assert.ok(hit.reason, "根拠が返る");
});

test("由来を示す語が無いときは unknown を返す（勝手に決めたふりをしない）", () => {
  const hit = V.inferProvenance("獄火の鱗");
  assert.equal(hit.id, "unknown");
  assert.equal(hit.priced, false);
});

/* --- 価格 ------------------------------------------------------------- */

test("価格が引けるのは DB が価格を持つ種別だけ", () => {
  const ego = db.egos.find((e) => e.name && e.shards);
  assert.ok(ego, "E.G.O に欠片価格がある");
  const price = V.priceOf(ego.name, "ego", db);
  assert.equal(price.shards, Number.parseInt(ego.shards, 10), "E.G.O は欠片で引ける");

  const persona = db.normal_personas[0];
  assert.equal(V.priceOf(persona.name, "persona", db), null, "人格は価格が無いので算出できない");

  const spirit = db.spirits.find((s) => s.price);
  assert.ok(V.priceOf(spirit.name, "spirit", db), "精神は引ける");
});

/* --- 公式ルール（ルールブック core からの価格） ------------------------- */

test("人格の入手価格は公式ルールどおり（core:603-621）", () => {
  /* 人格を持っていない場合 */
  assert.equal(V.acquireCost("persona", "gachaPaid", { ownsPersona: false }).lp, 0, "初抽取は無料");
  assert.equal(V.acquireCost("persona", "purchase", { ownsPersona: false }).lp, 20, "初購入は 20LP");
  /* 既に人格を持っている場合 */
  assert.equal(V.acquireCost("persona", "gachaPaid", { ownsPersona: true }).lp, 100, "抽取は 100LP");
  assert.equal(V.acquireCost("persona", "purchase", { ownsPersona: true }).lp, 200, "購入は 200LP");
  /* 配布は支出ではない */
  const grant = V.acquireCost("persona", "grant", { ownsPersona: true });
  assert.equal(grant.lp, 0);
  assert.equal(grant.shards, 0);
});

test("E.G.O 抽出は自我の欠片 100 個（core:9501-9503）", () => {
  const gacha = V.acquireCost("ego", "gachaPaid", { ownsPersona: true });
  assert.equal(gacha.shards, 100);
  assert.equal(gacha.lp, 0);
  /* 購入は DB の shards が正。抽出価格に_CRASHしない。 */
  assert.equal(V.acquireCost("ego", "purchase", {}), null, "購入は DB 由来");
});

test("価格の出典が残る（どの条文由来か）", () => {
  const rule = V.acquireCost("persona", "gachaPaid", { ownsPersona: true });
  assert.match(rule.source, /core:\d+/, "core の条文番号が読める");
  assert.match(V.acquireCost("ego", "gachaPaid", {}).source, /core:\d+/);
});

/* --- manifest への付与 ------------------------------------------------ */

const manifest = {
  character: { name: "テスト" },
  groups: [
    {
      id: "personas", label: "所持人格",
      items: [{ key: "personas:A", group: "personas", name: db.normal_personas[0].name, resolved: true, dbName: db.normal_personas[0].name, kinds: [{ kind: "persona", no: 1, mode: "n" }], sourceLine: db.normal_personas[0].name + " 獲得" }]
    },
    {
      id: "egos", label: "所持 E.G.O",
      items: [{
        key: "egos:A", group: "egos", name: db.egos.find((e) => e.shards).name, resolved: true,
        dbName: db.egos.find((e) => e.shards).name,
        kinds: [{ kind: "ego", no: 1, rank: "ZAYIN", shards: 50 }],
        sourceLine: db.egos.find((e) => e.shards).name + " 購入"
      }]
    },
    {
      id: "supportPassives", label: "所持パッシブ",
      items: [{ key: "spp:A", group: "supportPassives", name: "ルサンチマン", resolved: true, dbName: "ルサンチマン", kinds: [{ kind: "support", lp: 7 }], sourceLine: "ルサンチマン 購入" }]
    }
  ]
};

test("manifest に由来・価格・計算フラグが付く", () => {
  const out = V.annotateManifest(manifest, { db });
  const byKey = new Map(out.groups.flatMap((g) => g.items).map((i) => [i.key, i]));

  const ego = byKey.get("egos:A");
  assert.ok(ego.price && ego.price.shards, "E.G.O は価格が引ける");
  assert.equal(ego.provenance.id, "purchase");
  assert.equal(ego.include, true, "購入なので初期値は計算に含める");
  assert.equal(ego.includeIsAuto, true);
  assert.equal(ego.needsDecision, null);

  const support = byKey.get("spp:A");
  assert.equal(support.price.lp, 7);
  assert.equal(support.include, true);

  const persona = byKey.get("personas:A");
  assert.equal(persona.price, null, "人格に価格は無い");
  assert.equal(persona.include, false, "価格が無いので自動では含めない");
  assert.equal(persona.needsDecision, "no-price", "判断が要ると分かる");
});

test("配布された項目は初期値の計算から外れる", () => {
  const gifted = JSON.parse(JSON.stringify(manifest));
  gifted.groups[2].items[0].sourceLine = "ルサンチマン シナリオ報酬で配布";
  const out = V.annotateManifest(gifted, { db });
  const support = out.groups.find((g) => g.id === "supportPassives").items[0];
  assert.equal(support.provenance.priced, false, "配布は支出ではない");
  assert.equal(support.include, false, "初期値で入らない");
  assert.equal(support.includeIsAuto, false);
  // でも利用者は後から含められる。
  assert.equal(typeof support.include, "boolean", "切り替えられる形");
});

test("利用者が個別に決められる（force で全件の上書きできる）", () => {
  const forced = V.annotateManifest(manifest, { db, force: true });
  const auto = V.annotateManifest(manifest, { db });
  for (const item of forced.groups.flatMap((g) => g.items)) {
    assert.equal(item.include, true, "強制 Include できる");
    assert.equal(typeof item.includeIsAuto, "boolean", "自動由来かどうかも残る");
  }
  // 上書きしても「自動判定がどうだったか」は消さない。利用者が変えた痕跡留下的ため。
  const autoEgo = auto.groups.find((g) => g.id === "egos").items[0];
  const forcedEgo = forced.groups.find((g) => g.id === "egos").items[0];
  assert.equal(autoEgo.includeIsAuto, true);
  assert.equal(forcedEgo.includeIsAuto, true, "元の自動判定が保持される");

  // 配布の項目は force で無理.Include できる（利用者が意図的に選ぶため）。
  const forcedPersona = forced.groups.find((g) => g.id === "personas").items[0];
  const autoPersona = auto.groups.find((g) => g.id === "personas").items[0];
  assert.equal(autoPersona.include, false, "人格は自動では入らない");
  assert.equal(forcedPersona.include, true, "利用者が選べば入る");
  assert.equal(autoPersona.includeIsAuto, false, "自動判定は入らないだった");
});