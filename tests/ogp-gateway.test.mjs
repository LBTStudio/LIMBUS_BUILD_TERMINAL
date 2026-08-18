import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, parseSources } from "../ogp-gateway/worker.mjs";

function toBase64Url(text) {
  return Buffer.from(text).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function token(snapshot) {
  return `j.${toBase64Url(JSON.stringify({ _lbtShare: 1, ...snapshot }))}`;
}

test("OGPゲートウェイは許可形式の共有IDだけを受理する", () => {
  const url = new URL("https://lbt-ogp.example/s?s=t:Share-A,r:valid_id-01");
  assert.deepEqual(parseSources(url), [{ source: "telegraph", id: "Share-A" }, { source: "rentry", id: "valid_id-01" }]);
  assert.deepEqual(parseSources(new URL("https://lbt-ogp.example/s?s=r:https%3A%2F%2Fevil.example")), []);
});

test("画像付き共有から個別OGP HTMLとWebP画像を無状態で返す", async () => {
  const image = "data:image/webp;base64,QUJDRA==";
  const shareToken = token({ charName: "検証PC", personaSrc: { name: "東部親指カポIIII" }, hp: "120", san: "50", shareImageData: image, roster: { personas: [{ syncRank: "000", syncMax: true }] } });
  const fetchImpl = async (url) => {
    assert.equal(String(url), "https://api.telegra.ph/getPage/LBT-Test?return_content=true");
    return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
  };
  const page = await handleRequest(new Request("https://lbt-ogp.example/s?s=t:LBT-Test"), { fetchImpl });
  const html = await page.text();
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(html, /東部親指カポIIII — LIMBUS BUILD TERMINAL/);
  assert.match(html, /HP 120 · SAN 50 · MAX/);
  assert.match(html, /https:\/\/lbt-ogp\.example\/i\?s=t%3ALBT-Test/);
  const imageResponse = await handleRequest(new Request("https://lbt-ogp.example/i?s=t:LBT-Test"), { fetchImpl });
  assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  assert.equal(Buffer.from(await imageResponse.arrayBuffer()).toString(), "ABCD");
});

test("公式人格を参照する既存共有では固定DBから名前・HP・SANを補完してOGPへ表示する", async () => {
  const shareToken = token({ personaRef: { mode: "n", no: 7 }, roster: { personas: [{ syncRank: "00", syncMax: false }] } });
  const fetchImpl = async (url) => {
    if (String(url) === "https://api.telegra.ph/getPage/LBT-Legacy?return_content=true") {
      return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
    }
    assert.equal(String(url), "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/data/db.json");
    return new Response(JSON.stringify({ normal_personas: [{ no: 7, name: "補完人格", hp: 135, san: 42 }] }));
  };
  const page = await handleRequest(new Request("https://lbt-ogp.example/s?s=t:LBT-Legacy"), { fetchImpl });
  const html = await page.text();
  assert.match(html, /補完人格 — LIMBUS BUILD TERMINAL/);
  assert.match(html, /HP 135 · SAN 42 · 同期00/);
});

test("共有データの取得失敗時も静的共有ページへ安全にフォールバックする", async () => {
  const response = await handleRequest(new Request("https://lbt-ogp.example/s?s=r:missing-entry"), { fetchImpl: async () => new Response("missing", { status: 404 }) });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html\?s=r%3Amissing-entry/);
  assert.match(html, /LIMBUS BUILD TERMINAL — キャラクターシート/);
});
