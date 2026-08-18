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
  assert.match(page.headers.get("cache-control"), /max-age=604800/);
  assert.match(page.headers.get("cache-control"), /stale-while-revalidate=2592000/);
  assert.match(html, /<meta property="og:title" content="東部親指カポIIII">/);
  assert.match(html, /HP 120 ｜ SAN 50 ｜ 同期000 ｜ MAX/);
  assert.doesNotMatch(html, /LBT キャラクターシート · HP/);
  assert.match(html, /<link rel="canonical" href="https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html\?s=t%3ALBT-Test">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html\?s=t%3ALBT-Test">/);
  assert.match(html, /https:\/\/lbt-ogp\.example\/i\?s=t%3ALBT-Test/);
  const imageResponse = await handleRequest(new Request("https://lbt-ogp.example/i?s=t:LBT-Test"), { fetchImpl });
  assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  assert.equal(Buffer.from(await imageResponse.arrayBuffer()).toString(), "ABCD");
});

test("共有保存先の直読みが失敗した閲覧者向けに、同じ共有IDからトークンを返す予備復元口を提供する", async () => {
  const shareToken = token({ charName: "予備復元PC" });
  const fetchImpl = async (url) => {
    assert.equal(String(url), "https://api.telegra.ph/getPage/LBT-Recovery?return_content=true");
    return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
  };
  const response = await handleRequest(new Request("https://lbt-ogp.example/d?s=t:LBT-Recovery"), { fetchImpl });
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(await response.text(), shareToken);
});

test("予備復元口は主保存先が失敗してもURL内の予備保存先からトークンを返す", async () => {
  const shareToken = token({ charName: "予備先からの復元" });
  const fetchImpl = async (url) => {
    if (String(url) === "https://api.telegra.ph/getPage/LBT-Recovery?return_content=true") return new Response("not found", { status: 404 });
    assert.equal(String(url), "https://rentry.co/lbt-recovery");
    return new Response(`LBT_SHARE_TOKEN=${shareToken}`);
  };
  const response = await handleRequest(new Request("https://lbt-ogp.example/d?s=t:LBT-Recovery,r:lbt-recovery"), { fetchImpl });
  assert.equal(await response.text(), shareToken);
});

test("予備復元口は主保存先のトークンが破損していても有効な予備保存先へ切り替える", async () => {
  const shareToken = token({ charName: "破損主保存の予備" });
  const fetchImpl = async (url) => {
    if (String(url) === "https://rentry.co/lbt-corrupt-primary") return new Response("LBT_SHARE_TOKEN=j.e30...");
    assert.equal(String(url), "https://api.telegra.ph/getPage/LBT-Valid-Backup?return_content=true");
    return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
  };
  const response = await handleRequest(new Request("https://lbt-ogp.example/d?s=r:lbt-corrupt-primary,t:LBT-Valid-Backup"), { fetchImpl });
  assert.equal(await response.text(), shareToken);
});

test("WorkerはRentry本文に分割保存された長いトークンを再結合してOGPを生成する", async () => {
  const shareToken = token({ charName: "分割Rentry復元" });
  const midpoint = Math.floor(shareToken.length / 2);
  const chunks = [shareToken.slice(0, midpoint), shareToken.slice(midpoint)];
  const fetchImpl = async (url) => {
    assert.equal(String(url), "https://rentry.co/lbt-chunked");
    return new Response(chunks.map((chunk, index) => `LBT_SHARE_TOKEN_PART=${index + 1}/2:${chunk}`).join("\n"));
  };
  const page = await handleRequest(new Request("https://lbt-ogp.example/s?s=r:lbt-chunked"), { fetchImpl });
  const html = await page.text();
  assert.match(html, /<meta property="og:title" content="分割Rentry復元">/);
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
  assert.match(html, /<meta property="og:title" content="補完人格">/);
  assert.match(html, /HP 135 ｜ SAN 42 ｜ 同期00/);
});

test("長い人格名は表示枠へ収め、同期ランクとMAXを同時にOGPへ表示する", async () => {
  const longName = "長い人格名をDiscordのカード表示で見切れずに読める範囲へ整形するための検証用フィクサー・補足情報まで含む完全名称";
  const visibleName = `${Array.from(longName).slice(0, 48).join("")}…`;
  const shareToken = token({ personaSrc: { name: longName }, hp: "145", san: "55", roster: { personas: [{ syncRank: "000", syncMax: true }] } });
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${shareToken}`] }] } }));
  const page = await handleRequest(new Request("https://lbt-ogp.example/s?s=t:LBT-Long"), { fetchImpl });
  const html = await page.text();
  assert.match(html, new RegExp(`<meta property="og:title" content="${visibleName}">`));
  assert.match(html, /HP 145 ｜ SAN 55 ｜ 同期000 ｜ MAX/);
});

test("共有データの取得失敗時も静的共有ページへ安全にフォールバックする", async () => {
  const response = await handleRequest(new Request("https://lbt-ogp.example/s?s=r:missing-entry"), { fetchImpl: async () => new Response("missing", { status: 404 }) });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html\?s=r%3Amissing-entry/);
  assert.match(html, /LIMBUS BUILD TERMINAL — キャラクターシート/);
});
