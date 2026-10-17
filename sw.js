/* ---------------------------------------------------------------------------
   LIMBUS BUILD TERMINAL Service Worker（リポジトリ直下に置くこと。位置が scope になる）

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
const CACHE_NAME = "lbt-2c804612";
const PRECACHE_URLS = [
  "index.html",
  "share.html",
  "mobile-preview.html",
  "assets/design-system.css?v=910f9485",
  "assets/items.css?v=7cf01d95",
  "assets/persona-codex.css?v=f7d6f495",
  "assets/sections.css?v=fdd86e81",
  "assets/v52-overlay.css?v=785971b6",
  "assets/v53-overlay.css?v=1b57bfe6",
  "assets/v56-refinements.css?v=973dc2d9",
  "assets/v65r29-draft-import.css?v=26fa07ac",
  "assets/v65r43-ego-readability.css?v=563284f8",
  "assets/v65r44-ego-quick-detail.css?v=1bb6dfa1",
  "assets/v65r47-ego-card-marks.css?v=aaf12533",
  "assets/v66-accounts.css?v=6f06c415",
  "assets/v67-persona-redesign.css?v=458bf9f1",
  "assets/workspace.css?v=253d0319",
  "data/db.json?v=b04a7751",
  "data/gacha-theme-packs.json?v=8d4dced2",
  "data/items.json?v=b47b58ae",
  "js/App.js?v=fea7f70c",
  "js/DataQuality.js?v=a8365c72",
  "js/ItemCodex.js?v=f81cdb3e",
  "js/LivePreview.js?v=911e0b56",
  "js/OtherSections.js?v=0b64adaa",
  "js/PersonaCodex.js?v=cc11f563",
  "js/SkillDeck.js?v=0e7a3640",
  "js/accounts-ui.js?v=59b44784",
  "js/core.js?v=d79b98be",
  "js/ego-slot-forms.js?v=85aa4887",
  "js/gacha-identity.js?v=50e150d6",
  "js/gacha-proof.js?v=568ae912",
  "js/gacha-tickets.js?v=c67b2ac7",
  "js/gacha.js?v=7c84ae89",
  "js/garasumado-import-ui.js?v=518e4803",
  "js/garasumado-memo-parse.js?v=399ac390",
  "js/garasumado-roster-import.js?v=695e13f9",
  "js/generator.js?v=2dca0394",
  "js/icon-cropper.js?v=20900dc8",
  "js/ledger-import-reconcile.js?v=d63c36d5",
  "js/ledger-provenance.js?v=53c12252",
  "js/name-fuzzy.js?v=d3eb29a1",
  "js/persona-draft-import.js?v=37f8afb4",
  "js/result-log-parser.js?v=43c5aa47",
  "js/result-text-import.js?v=8cc0b8d2",
  "js/roster-resolver.js?v=c778eb30",
  "js/share-link.js?v=deb1ab16",
  "js/share-viewer.js?v=9521f675",
  "js/state.js?v=7f220a71",
  "js/ui.js?v=8943eab8",
  "vendor/react-dom.min.js?v=35f4f974",
  "vendor/react.min.js?v=d949f1c3",
];
/* ==== /GENERATED ==== */

const PAGE_FILES = ["index.html", "share.html", "mobile-preview.html"];
const PRECACHE_ABS = new Set(PRECACHE_URLS.map((u) => new URL(u, self.location).href));

function isPageUrl(url) {
  return url.pathname.endsWith("/") || PAGE_FILES.some((f) => url.pathname.endsWith("/" + f));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      /* 1 件の 404 で precache 全体を落とさない。欠けた資産はオンラインの
         network-first 側が復旧経路になる。 */
      await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
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
