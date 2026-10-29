#!/usr/bin/env node
/**
 * Verify the actual GitHub Pages deployment, not the local source-tree server
 * used by Playwright screenshot jobs.
 */
const baseArg = process.argv[2] || "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/";
const base = new URL(baseArg.endsWith("/") ? baseArg : baseArg + "/");
if (base.protocol !== "https:" || base.hostname !== "lbtstudio.github.io" || !base.pathname.includes("/LIMBUS_BUILD_TERMINAL/")) {
  throw new Error("Unexpected Pages URL: " + base.href);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function get(url, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "follow" });
      if (response.ok) return response;
      last = new Error(\`HTTP \${response.status} for \${url}\`);
    } catch (error) { last = error; }
    if (i + 1 < attempts) await sleep(1500 * (i + 1));
  }
  throw last;
}
const pageResponse = await get(base.href);
const html = await pageResponse.text();
if (!html.includes('id="b-type-production-rollout"')) throw new Error("Published index is missing the B-type production rollout.");
const appRef = html.match(/js\/App\.js\?v=[a-f0-9]+/)?.[0];
if (!appRef) throw new Error("Published index has no versioned React application entry.");
const swResponse = await get(new URL("sw.js", base));
const sw = await swResponse.text();
if (!sw.includes(appRef)) throw new Error("Published Service Worker does not precache the published App.js reference.");
const match = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
if (!match) throw new Error("Could not read the generated Service Worker precache list.");
const precache = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (!precache.includes("index.html") || !precache.includes(appRef)) throw new Error("Precache list is missing index.html or the current App.js.");
const localRefs = [
  ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]),
  ...[...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]),
].filter((ref) => !/^(?:https?:|data:|\/\/|#)/i.test(ref));
const missingFromPrecache = localRefs.filter((ref) => !precache.includes(ref));
if (missingFromPrecache.length) throw new Error("Local page assets absent from Service Worker precache: " + missingFromPrecache.join(", "));
const unique = [...new Set(precache)];
let next = 0;
const failures = [];
async function worker() {
  while (next < unique.length) {
    const ref = unique[next++];
    try {
      const response = await get(new URL(ref.replace(/^\/+/, ""), base).href);
      const type = response.headers.get("content-type") || "";
      if (/\.(?:js|css|json)$/i.test(new URL(ref, base).pathname) && /text\/html/i.test(type)) {
        throw new Error("HTML fallback returned for an asset (" + type + ")");
      }
      await response.arrayBuffer();
    } catch (error) { failures.push({ ref, error: String(error) }); }
  }
}
await Promise.all(Array.from({ length: Math.min(8, unique.length) }, worker));
if (failures.length) throw new Error("Published precache contains unavailable assets: " + JSON.stringify(failures));
console.log("[production-pages] " + JSON.stringify({
  url: base.href,
  htmlStatus: pageResponse.status,
  precacheAssets: unique.length,
  localScriptAndStylesheetRefs: localRefs.length,
  missingAssets: 0,
  bTypeMarker: true,
  serviceWorkerMatchesApp: true,
}));
