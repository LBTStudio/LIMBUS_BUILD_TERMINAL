/* ---------------------------------------------------------------------------
   LIMBUS BUILD TERMINAL Service Worker — B-type production UI rollout 2026-10-29（リポジトリ直下に置くこと。位置が scope になる）

   役割: 再訪時にアセットをネットワークから読まずに済ませる。オフラインでも起動可。

   なぜ cache-first が安全か
   ---------------------------------------------------------------------------
   ?v= はファイル内容のハッシュ（tools/sync-asset-versions.mjs が同期）。
   内容が変われば URL が変わるため、ある URL のレスポンスが後から変わることはない。
   したがって versioned アセットは cache-first で固定してよい。

   ページ本体（index.html / share.html）だけは URL が固定で内容が変わるので
   network-first。オンラインなら常に最新、オフラインはキャッシュへ落ちる。

   更新の流れ
   ---------------------------------------------------------------------------
   アセットが変わると GENERATED ブロックの CACHE_NAME が変わる
   → install で新しいリストを precache → activate で旧 CACHE_NAME を削除。
   ブラウザの SW 更新チェックは index.html 側の reg.update() が発火させる。
--------------------------------------------------------------------------- */
"use strict";

/* ==== GENERATED (tools/sync-asset-versions.mjs) ==== */
const CACHE_NAME = "lbt-fad9d899";
const PRECACHE_URLS = [
  "index.html",
  "share.html",
  "mobile-preview.html",
  "assets/b-type-ui-parity.css?v=0f63f01e",
  "assets/b-type-workbench.css?v=77284898",
  "assets/cloud-backup.css?v=8a7eba1b",
  "assets/design-system.css?v=910f9485",
  "assets/fonts/corporate-logo-bold-subset.woff2?v=b56fa468",
  "assets/fonts/corporate-logo-medium-subset.woff2?v=dbbdb67e",
  "assets/inline-effect-glossary.css?v=f14d3776",
  "assets/items.css?v=1465d658",
  "assets/persona-codex.css?v=d88a1ab0",
  "assets/sections.css?v=0cadeb2c",
  "assets/v52-overlay.css?v=785971b6",
  "assets/v53-overlay.css?v=1b57bfe6",
  "assets/v56-refinements.css?v=99afde4a",
  "assets/v65r29-draft-import.css?v=ab5c4fe7",
  "assets/v65r43-ego-readability.css?v=563284f8",
  "assets/v65r44-ego-quick-detail.css?v=1bb6dfa1",
  "assets/v65r47-ego-card-marks.css?v=aaf12533",
  "assets/v66-accounts.css?v=2c3fe83d",
  "assets/v67-persona-redesign.css?v=4b89da4c",
  "assets/v68-interaction-a11y.css?v=0bbe4495",
  "assets/v69-mobile-ui-audit.css?v=e67e9edc",
  "assets/v70-preview-controls.css?v=ef27f951",
  "assets/workspace.css?v=4ba0022b",
  "data/db.json?v=16b6df9e",
  "data/gacha-theme-packs.json?v=8d4dced2",
  "data/items.json?v=b185394a",
  "data/special-items.json?v=aaa21cfb",
  "js/App.js?v=eabddf71",
  "js/DataQuality.js?v=a8365c72",
  "js/InlineEffectGlossary.js?v=1e5b2a2b",
  "js/ItemCodex.js?v=3c394422",
  "js/LivePreview.js?v=69b4d6d2",
  "js/OtherSections.js?v=82aedb1d",
  "js/PersonaCodex.js?v=7faafae1",
  "js/SkillDeck.js?v=a93f6cb8",
  "js/access-counter.js?v=50689988",
  "js/accounts-ui.js?v=87f5b555",
  "js/cloud-backup.js?v=9f99abb8",
  "js/core.js?v=d79b98be",
  "js/ego-slot-forms.js?v=85aa4887",
  "js/gacha-identity.js?v=25e8fdfa",
  "js/gacha-proof.js?v=516f754a",
  "js/gacha-tickets.js?v=2ecc4e1b",
  "js/gacha.js?v=f58f8a3e",
  "js/garasumado-export-import.js?v=66700d44",
  "js/garasumado-import-ui.js?v=64e2f6bd",
  "js/garasumado-memo-parse.js?v=623e5986",
  "js/garasumado-roster-import.js?v=2fb7726d",
  "js/generator.js?v=ff5f0a15",
  "js/icon-cropper.js?v=20900dc8",
  "js/ledger-import-reconcile.js?v=cd2638b5",
  "js/ledger-provenance.js?v=564bc607",
  "js/name-fuzzy.js?v=d3eb29a1",
  "js/persona-draft-import.js?v=36d1c28a",
  "js/persona-inventory-audit.js?v=4e2ed017",
  "js/result-log-parser.js?v=e1bc2df5",
  "js/result-text-import.js?v=64c4b159",
  "js/roster-resolver.js?v=01dce5a2",
  "js/share-link.js?v=e11a0161",
  "js/share-viewer.js?v=71f2da96",
  "js/state.js?v=e47b7461",
  "js/ui.js?v=6be4646a",
  "vendor/react-dom.min.js?v=35f4f974",
  "vendor/react.min.js?v=d949f1c3",
];
/* ==== /GENERATED ==== */
const PAGE_FILES = ["index.html", "share.html", "mobile-preview.html"];
/* Cache Storage is shared by every application on the same origin, even when a
   Service Worker has a narrower path scope. Identify this app's old caches by
   their own page URLs rather than deleting every cache on the origin. */
const APP_PAGE_URLS = new Set(PAGE_FILES.map((file) => new URL(file, self.location).href));

async function isOwnAppCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    return requests.some((request) => APP_PAGE_URLS.has(new URL(request.url).href));
  } catch (_) {
    // If ownership cannot be confirmed, preserve the cache rather than risk data loss.
    return false;
  }
}
const OPTIONAL_PRECACHE_URLS = new Set(PRECACHE_URLS.filter((url) => url === "mobile-preview.html" || url.startsWith("assets/fonts/")));
const REQUIRED_PRECACHE_URLS = PRECACHE_URLS.filter((url) => !OPTIONAL_PRECACHE_URLS.has(url));
const PRECACHE_ABS = new Set(PRECACHE_URLS.map((u) => new URL(u, self.location).href));

function isPageUrl(url) {
  return url.pathname.endsWith("/") || PAGE_FILES.some((f) => url.pathname.endsWith("/" + f));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      /* アプリ本体・DB・必須CSS/JSは全件キャッシュできる場合だけ更新する。
         必須資産の失敗で install を reject すれば、旧SWと旧キャッシュが残る。
         プレビュー専用ページとフォントだけは任意資産として失敗を許容する。 */
      await Promise.all(REQUIRED_PRECACHE_URLS.map((u) => cache.add(u)));
      await Promise.allSettled([...OPTIONAL_PRECACHE_URLS].map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const staleOwnCaches = (await Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map(async (key) => await isOwnAppCache(key) ? key : null)))
        .filter(Boolean);
      await Promise.all(staleOwnCaches.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && isPageUrl(url)) {
      const cache = await caches.open(CACHE_NAME);
      /* ?cb= 等のクエリは計測・デバッグ用。素の URL をキャッシュキーに
         しておかないと、クエリ違いでキャッシュが増殖する。 */
      cache.put(new Request(url.origin + url.pathname), response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(new URL("index.html", self.location).href));
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, url));
    return;
  }

  if (PRECACHE_ABS.has(url.href)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirstData(request));
});
