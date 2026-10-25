import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const generator = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");
const shareLinkSource = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
const otherSections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function loadBootstrap(fetchImpl) {
  const script = [...indexHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0]?.[1];
  assert.ok(script, "index.html にインラインの起動スクリプトがある");
  const warnings = [];
  const consoleMock = { warn: (...args) => warnings.push(args) };
  const context = {
    window: { fetch: fetchImpl, console: consoleMock },
    fetch: fetchImpl,
    console: consoleMock,
    Promise,
    XMLHttpRequest: function () { throw new Error("XHR fallback should not run in this test"); }
  };
  vm.runInNewContext(script, context, { filename: "index.html bootstrap" });
  return { ready: context.lbtDbReady, window: context.window, warnings };
}

function loadShareLink() {
  const window = {};
  vm.runInNewContext(shareLinkSource, {
    window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
    Blob, Response, URL, URLSearchParams, btoa, atob
  }, { filename: "js/share-link.js" });
  return window.LBT_shareLink;
}

test("任意のガチャパックJSONの通信失敗は起動を止めず、アイテムカタログは完全に保つ", async () => {
  const itemCatalog = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
  const specialItemCatalog = JSON.parse(readFileSync(new URL("../data/special-items.json", import.meta.url), "utf8"));
  const fetchMock = async (url) => {
    if (url.includes("db.json")) return { ok: true, json: async () => ({ marker: "db-ready" }) };
    if (url.includes("special-items.json")) return { ok: true, json: async () => specialItemCatalog };
    if (url.includes("items.json")) return { ok: true, json: async () => itemCatalog };
    throw new Error("optional gacha pack network offline");
  };
  const loaded = loadBootstrap(fetchMock);
  await loaded.ready;
  assert.equal(loaded.window.DB.marker, "db-ready");
  assert.equal(loaded.window.DB.items.length, 35, "必須のアイテム一覧は完全なまま");
  assert.equal(loaded.window.DB.specialItems.length, 2, "特殊アイテム一覧も完全なまま");
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.window.LBT_GACHA_PACKS)), { packs: [] });
  assert.equal(loaded.warnings.length, 1, "任意のガチャパック失敗だけを警告する");
});

test("DB本体のHTTP失敗だけは起動エラーになる", async () => {
  const fetchMock = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const loaded = loadBootstrap(fetchMock);
  await assert.rejects(loaded.ready, /http 503/);
});

test("圧縮共有トークンの解凍サイズが4 MiBを超える場合はJSON解析前に拒否する", async () => {
  const share = loadShareLink();
  const raw = JSON.stringify({ _lbtShare: 1, payload: "x".repeat(4 * 1024 * 1024 + 128) });
  const compressedStream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
  const base64 = btoa(String.fromCharCode(...compressed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  await assert.rejects(share.decodeToken("z." + base64), /展開サイズ/);
});

test("共有発行結果と手動コピーUIは発行ボタンの外側に追加する", () => {
  assert.match(generator, /<div class="share-publish-results" aria-live="polite"><\/div>/);
  assert.match(generator, /const resultArea = root\.querySelector\("\.share-publish-results"\)/);
  assert.doesNotMatch(generator, /const resultArea = statusEl\.parentElement/);
  assert.match(generator, /cpBtn\.addEventListener\("click", async \(\) => \{/);
});

test("共有モーダルは初期フォーカス、Tab閉じ込め、Escape、終了後のフォーカス復帰を持つ", () => {
  assert.match(generator, /role="dialog" aria-modal="true" tabindex="-1"/);
  assert.match(generator, /root\.querySelector\('\[data-act="publish"\]'\)\?\.focus\(\)/);
  assert.match(generator, /e\.key !== "Tab"/);
  assert.match(generator, /if \(e\.key === "Escape"\)/);
  assert.match(generator, /previouslyFocused\.focus\(\)/);
});

test("共有シートのHTMLエスケープは数値0を空文字へ変換しない", () => {
  assert.match(generator, /const esc = \(s\) => String\(s \?\? ""\)/);
});

test("所持一覧の行は操作要素を内包せず、詳細操作と即時装備ボタンが兄弟になる", () => {
  const start = otherSections.indexOf("const renderItem = (item) =>");
  const end = otherSections.indexOf("const libraryTabLabel", start);
  const block = otherSections.slice(start, end);
  const beforeCheckbox = block.slice(0, block.indexOf('manageMode && h("input"'));
  assert.doesNotMatch(beforeCheckbox, /role: manageMode \? undefined : "button"/);
  assert.match(block, /className: "roster-item-info", role: manageMode \? undefined : "button"/);
  assert.match(block, /className: "roster-item-actions"/);
  assert.match(block, /onKeyDown: \(event\) => \{ if \(!manageMode && \(event\.key === "Enter" \|\| event\.key === " "\)\)/);
});

test("Service Workerは必須プリキャッシュ失敗時に新バージョンを有効化せず、任意アセットだけ失敗を許容する", () => {
  assert.match(serviceWorker, /const REQUIRED_PRECACHE_URLS = PRECACHE_URLS\.filter/);
  assert.match(serviceWorker, /await Promise\.all\(REQUIRED_PRECACHE_URLS\.map\(\(u\) => cache\.add\(u\)\)\)/);
  assert.match(serviceWorker, /await Promise\.allSettled\(\[\.\.\.OPTIONAL_PRECACHE_URLS\]\.map\(\(u\) => cache\.add\(u\)\)\)/);
  assert.ok(serviceWorker.indexOf("await Promise.all(REQUIRED_PRECACHE_URLS") < serviceWorker.indexOf("await self.skipWaiting()"));
});


test("同期設定はランク選択と同期MAXを横並びにし、補足文・余白を圧縮する", () => {
  const css = readFileSync(new URL("../assets/v68-interaction-a11y.css", import.meta.url), "utf8");
  assert.match(otherSections, /className: "roster-sync-ops-head"[\s\S]{0,250}"同期設定"/);
  assert.match(otherSections, /className: "roster-sync-source"/);
  assert.match(otherSections, /初回設定時：同期ランク/);
  assert.match(css, /\.roster-sync-ops\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) max-content/s);
  assert.match(css, /\.sync-max-detail-toggle\s*\{[^}]*grid-column: 2;/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.roster-sync-ops\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(otherSections, /同期は自己の欠片を支払う処理です。誤った操作なら上の操作で解除できます/);
});
