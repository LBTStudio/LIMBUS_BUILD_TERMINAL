import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, previewFromQuery, parseSources } from "../ogp-gateway/worker.mjs";

/* 発行時に query へ載せた summary（lbt_n / lbt_hp / ...）だけで
 * OGP HTML を組み立てられることの検証。
 *
 * これが通ると、/s の cache MISS 時に Rentry/Telegraph へ外部 fetch せず、
 * 公式DBの補完もしなくて済む。summary が無い既存共有は従来経路へ戻るため、
 * 共有リンクの互換性は失われない。 */

const SUMMARY_QUERY = "s=t:LBT-Test&lbt_n=%E9%BB%92%E9%9B%B2%E4%BC%9A%E7%B5%84%E5%93%A1&lbt_hp=105&lbt_san=48&lbt_sync=000&lbt_max=1";

test("previewFromQuery は query から summary を組み立てる", () => {
  const preview = previewFromQuery(new URL(`https://lbt-ogp.example/s?${SUMMARY_QUERY}`));
  assert.equal(preview.personaName, "黒雲会組員");
  assert.equal(preview.title, "黒雲会組員");
  assert.match(preview.description, /HP 105/);
  assert.match(preview.description, /SAN 48/);
  assert.match(preview.description, /同期000/);
  assert.match(preview.description, /MAX/);
});

test("previewFromQuery は lbt_n が無ければ null を返す（従来経路へ戻す）", () => {
  assert.equal(previewFromQuery(new URL("https://lbt-ogp.example/s?s=t:LBT-Test")), null);
  assert.equal(previewFromQuery(new URL("https://lbt-ogp.example/s?s=t:LBT-Test&lbt_hp=100")), null);
});

test("summary 経路の /s は外部保存先を一切読まず OGP HTML を返す", async () => {
  // fetchImpl が呼ばれたら失敗させる。呼ばれないことが今回の目的。
  const mustNotRun = async () => { throw new Error("外部保存先を読むべきではない"); };
  const response = await handleRequest(new Request(`https://lbt-ogp.example/s?${SUMMARY_QUERY}`), { fetchImpl: mustNotRun });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=604800/);
  const html = await response.text();
  assert.match(html, /<meta property="og:title" content="黒雲会組員/);
  assert.match(html, /HP 105/);
  assert.match(html, /SAN 48/);
  // summary 経路では画像ルートの有無を判定できないため静的な既定カードになる
  assert.match(html, /og:image" content="https:\/\/lbtstudio\.github\.io\/[^"]*lbt-share-card\.png/);
  // 遷移先は従来どおり共有ページ
  assert.match(html, /share\.html\?s=t%3ALBT-Test/);
});

test("summary なし（既存共有）は従来どおり snapshot を読む", async () => {
  const snapshot = { _lbtShare: 1, charName: "既存共有", hp: "120", san: "50" };
  const shareToken = `j.${Buffer.from(JSON.stringify(snapshot)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
  const response = await handleRequest(new Request("https://lbt-ogp.example/s?s=t:LBT-Test"), {
    fetchImpl: async (url) => {
      assert.match(String(url), /telegra\.ph/);
      return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
    },
  });
  const html = await response.text();
  assert.match(html, /既存共有/);
});

test("summary 経路でも /i は snapshot を読む（画像は別ルート）", async () => {
  const snapshot = { _lbtShare: 1, charName: "画像あり", shareImageData: "data:image/webp;base64,QUJDRA==" };
  const shareToken = `j.${Buffer.from(JSON.stringify(snapshot)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
  const response = await handleRequest(new Request(`https://lbt-ogp.example/i?s=t:LBT-Test&lbt_n=x&lbt_hp=1`), {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } })),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
});