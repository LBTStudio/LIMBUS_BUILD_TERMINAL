import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/ogp-worker/worker.js";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(new URL("../cloudflare/ogp-worker/worker.js", import.meta.url), "utf8");

function makeKV(initial = new Map()) {
  const objects = initial;
  const putCalls = [];
  return {
    objects,
    putCalls,
    async put(key, value, options = {}) {
      putCalls.push({ key, value: String(value), options });
      objects.set(key, { value: String(value), options });
    },
    async get(key, type = "text") {
      const stored = objects.get(key);
      if (stored === undefined) return null;
      return type === "json" ? JSON.parse(stored.value) : stored.value;
    },
    async getWithMetadata(key) {
      const stored = objects.get(key);
      if (stored === undefined) return { value: null, metadata: null };
      return { value: stored.value, metadata: stored.options?.metadata || null };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    SHARES: makeKV(),
    APP_ORIGIN: "https://lbtstudio.github.io",
    SHARE_VIEWER_URL: "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html",
    SHARE_PUBLIC_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev",
    ...overrides,
  };
}

function publishRequest(body, headers = {}) {
  return new Request("https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1", {
    method: "POST",
    headers: {
      Origin: "https://lbtstudio.github.io",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.12",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("HTML応答の既定キャッシュTTLは現在の設定定数を参照する", () => {
  const match = workerSource.match(/function buildResponse\(html, options = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(match, "buildResponse function exists");
  assert.match(match[0], /SHARE_CACHE_TTL_SECONDS/);
  assert.doesNotMatch(match[0], /\bSHARE_TTL_SECONDS\b/, "the removed constant name must not remain");
});

test("ヘルスチェックは無料のKV保存先が接続されていることを返す", async () => {
  const response = await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/healthz"), makeEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, shareStore: "kv", configured: true });
});

test("KV共有発行は人物別OGP画像URLを設定し、短いURLと復元用tokenを返す", async () => {
  const env = makeEnv();
  const response = await worker.fetch(publishRequest({
    token: "z.ABC_123",
    preview: { personaName: "蜘蛛の巣 中指の親方", hp: "180", san: "45", speed: "1d6", primarySin: "傲慢", syncRank: "00", syncMax: true },
    fallbacks: [{ source: "rentry", id: "rentry-123" }, { source: "telegraph", id: "Page-123" }],
  }), env);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(result.url, "https://lbt-ogp.lbtstudio-share.workers.dev/s/" + result.id);
  const stored = env.SHARES.objects.get("s/" + result.id);
  assert.ok(stored);
  assert.match(stored.value, /property="og:title" content="【人格】蜘蛛の巣 中指の親方｜LIMBUS BUILD TERMINAL"/);
  assert.match(stored.value, /og:description/);
  assert.match(stored.value, /最多資源属性：傲慢/);
  assert.ok(stored.value.includes('og:image" content="https://lbt-ogp.lbtstudio-share.workers.dev/i/' + result.id));
  assert.ok(stored.value.includes('twitter:image" content="https://lbt-ogp.lbtstudio-share.workers.dev/i/' + result.id));
  assert.match(stored.value, /share\.html#lbt=z\.ABC_123/);
  assert.match(stored.value, /rentry-123/);
  assert.equal(stored.options.expirationTtl, 7 * 24 * 60 * 60 + 6 * 60 * 60);
  assert.equal(stored.options.metadata.schema, "1");
  assert.ok(Number.isFinite(Date.parse(stored.options.metadata.lastAccessRefreshAt)));
});

test("短縮共有の画像ルートはtoken内の自動生成カードを返す", async () => {
  const env = makeEnv();
  const snapshot = { _lbtShare: 1, charName: "画像を持つ人格", ogpImageData: "data:image/webp;base64,QUJDRA==" };
  const token = "j." + Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64url");
  const published = await worker.fetch(publishRequest({
    token, preview: { personaName: "画像を持つ人格", hp: "120", san: "45", speed: "2-5", primarySin: "憤怒" }, fallbacks: [],
  }), env);
  assert.equal(published.status, 201);
  const { id } = await published.json();
  const response = await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/i/" + id), env);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").includes("image/webp"));
  assert.equal(Buffer.from(await response.arrayBuffer()).toString("utf8"), "ABCD");
});

test("公開APIは不正origin・不正token・レート超過を拒否する", async () => {
  const env = makeEnv({ SHARE_PUBLISH_LIMIT: { async limit() { return { success: false }; } } });
  const wrongOrigin = await worker.fetch(publishRequest({ token: "z.ABC_123" }, { Origin: "https://evil.example" }), env);
  assert.equal(wrongOrigin.status, 403);

  const badToken = await worker.fetch(publishRequest({ token: "arbitrary html <script>" }), makeEnv());
  assert.equal(badToken.status, 400);

  const limited = await worker.fetch(publishRequest({ token: "z.ABC_123" }), env);
  assert.equal(limited.status, 429);
});

test("以前のKV共有も静的画像から人物別OGP画像URLへ切り替える", async () => {
  const env = makeEnv();
  const snapshot = { _lbtShare: 1, charName: "旧共有", ogpImageData: "data:image/webp;base64,QUJDRA==" };
  const token = "j." + Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64url");
  const published = await worker.fetch(publishRequest({ token, preview: { personaName: "旧共有", hp: "100", san: "40", speed: "1d6" }, fallbacks: [] }), env);
  const { id } = await published.json();
  const key = "s/" + id, stored = env.SHARES.objects.get(key);
  const oldHtml = stored.value
    .replace(/<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/assets/lbt-share-card.png">')
    .replace(/<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/assets/lbt-share-card.png">');
  await env.SHARES.put(key, oldHtml, { ...stored.options, metadata: { ...stored.options.metadata, lastAccessRefreshAt: new Date().toISOString() } });
  const response = await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/s/" + id), env);
  const html = await response.text();
  assert.ok(html.includes('og:image" content="https://lbt-ogp.lbtstudio-share.workers.dev/i/' + id));
  assert.ok(html.includes('twitter:image" content="https://lbt-ogp.lbtstudio-share.workers.dev/i/' + id));
});

test("KVに保存済みの短縮URLはOGPを含むHTMLシェルを返す", async () => {
  const env = makeEnv();
  const created = await worker.fetch(publishRequest({
    token: "j.QUJD",
    preview: { personaName: "テスト人格", hp: "120", san: "50" },
    fallbacks: [],
  }), env);
  const { id } = await created.json();
  const response = await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/s/" + id), env);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /property="og:title" content="【人格】テスト人格/);
  assert.match(html, /share\.html#lbt=j\.QUJD/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("アイドル中の共有は閲覧で期限が延長され、短い間隔の連続閲覧では書き込みを増やさない", async () => {
  const env = makeEnv();
  const created = await worker.fetch(publishRequest({
    token: "j.QUJD",
    preview: { personaName: "期限検証", hp: "120", san: "50" },
    fallbacks: [],
  }), env);
  const { id } = await created.json();
  const key = "s/" + id;
  const stored = env.SHARES.objects.get(key);
  const value = stored.value;
  const old = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  await env.SHARES.put(key, value, {
    expirationTtl: 60,
    metadata: { schema: "1", createdAt: old, lastAccessRefreshAt: old },
  });
  const writesBeforeRead = env.SHARES.putCalls.length;

  const response = await worker.fetch(
    new Request("https://lbt-ogp.lbtstudio-share.workers.dev/s/" + id),
    env
  );
  assert.equal(response.status, 200);
  assert.equal(env.SHARES.putCalls.length, writesBeforeRead + 1);
  const refreshed = env.SHARES.objects.get(key);
  assert.equal(refreshed.options.expirationTtl, 7 * 24 * 60 * 60 + 6 * 60 * 60);
  assert.ok(Date.parse(refreshed.options.metadata.lastAccessRefreshAt) > Date.parse(old));

  const writesAfterRefresh = env.SHARES.putCalls.length;
  await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/s/" + id), env);
  assert.equal(env.SHARES.putCalls.length, writesAfterRefresh);
});

test("KVへの書き込みが失敗したらAPIは従来方式への切り替え用エラーを返す", async () => {
  const env = makeEnv({
    SHARES: {
      async put() { throw new Error("KV quota exceeded"); },
      async get() { return null; },
      async getWithMetadata() { return { value: null, metadata: null }; },
    },
  });
  const response = await worker.fetch(publishRequest({ token: "z.ABC_123" }), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "KV_WRITE_FAILED" });
});

test("従来の /s?s=... OGP URL を維持し、Rentry/Telegraph閲覧ページを埋め込む", async () => {
  const url = "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t%3ALBT-Share-01%2Cr%3Arentry-01&lbt_n=%E3%83%86%E3%82%B9%E3%83%88%E4%BA%BA%E6%A0%BC&lbt_hp=120";
  const response = await worker.fetch(new Request(url), makeEnv());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /property="og:title" content="【人格】テスト人格/);
  assert.match(html, /share\.html\?/);
  assert.match(html, /LBT-Share-01/);
});

test("KVにデータがなく予備保存先も使えない場合は既存リンクを提示して失敗を明示する", async () => {
  const env = makeEnv({ SHARES: makeKV() });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  try {
    const response = await worker.fetch(new Request("https://lbt-ogp.lbtstudio-share.workers.dev/s/ABCDEFGHIJKLMNOP?b=r%3Arentry-01&lbt_n=テスト人格"), env);
    const html = await response.text();
    assert.equal(response.status, 503);
    assert.match(html, /既存の共有方式で開く/);
    assert.match(html, /share\.html\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
