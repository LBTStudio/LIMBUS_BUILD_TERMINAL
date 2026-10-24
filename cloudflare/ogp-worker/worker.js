const DEFAULT_APP_ORIGIN = "https://lbtstudio.github.io";
const DEFAULT_VIEWER_URL = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html";
const DEFAULT_OG_IMAGE = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/assets/lbt-share-card.png";
const API_PATH = "/api/r2-share/v1";
const MAX_TOKEN_LENGTH = 160002;
const MAX_REQUEST_BYTES = 200000;
const SHARE_TTL_SECONDS = 86400;
const RESPONSE_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-src https://lbtstudio.github.io; img-src https://lbtstudio.github.io data:; style-src 'unsafe-inline'";

function jsonResponse(body, status, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function corsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.APP_ORIGIN || DEFAULT_APP_ORIGIN;
  return origin === allowed ? origin : "";
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function sanitizePreview(value) {
  const raw = value && typeof value === "object" ? value : {};
  const cleanText = (entry, max) => String(entry ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return {
    personaName: cleanText(raw.personaName, 72),
    hp: cleanText(raw.hp, 8).replace(/[^0-9?—-]/g, ""),
    san: cleanText(raw.san, 8).replace(/[^0-9?—-]/g, ""),
    speed: cleanText(raw.speed, 16),
    syncRank: ["0", "00", "000"].includes(String(raw.syncRank || "")) ? String(raw.syncRank) : "",
    syncMax: raw.syncMax === true,
    hasShareImage: raw.hasShareImage === true,
  };
}

function previewFromUrl(url) {
  return sanitizePreview({
    personaName: url.searchParams.get("lbt_n") || "",
    hp: url.searchParams.get("lbt_hp") || "",
    san: url.searchParams.get("lbt_san") || "",
    speed: url.searchParams.get("lbt_spd") || "",
    syncRank: url.searchParams.get("lbt_sync") || "",
    syncMax: url.searchParams.get("lbt_max") === "1",
    hasShareImage: url.searchParams.get("lbt_img") === "1",
  });
}

function sourceCode(source) {
  return source === "telegraph" ? "t" : source === "rentry" ? "r" : "";
}

function normalizeSources(values) {
  if (!Array.isArray(values)) return [];
  const accepted = [];
  for (const value of values) {
    const source = value?.source;
    const id = String(value?.id || "");
    const validId = source === "rentry"
      ? /^[A-Za-z0-9_-]{3,64}$/.test(id)
      : source === "telegraph" && /^[A-Za-z0-9_-]{1,256}$/.test(id);
    if (!validId) continue;
    if (!accepted.some((entry) => entry.source === source && entry.id === id)) {
      accepted.push({ source, id });
    }
  }
  return accepted.slice(0, 2);
}

function parseSourceList(value) {
  return normalizeSources(String(value || "").split(",").map((segment) => {
    const separator = segment.indexOf(":");
    if (separator < 1) return null;
    const code = segment.slice(0, separator);
    return {
      source: code === "t" ? "telegraph" : code === "r" ? "rentry" : "",
      id: segment.slice(separator + 1),
    };
  }));
}

function compactSourceList(sources) {
  return sources.map((entry) => sourceCode(entry.source) + ":" + entry.id).join(",");
}

function viewerUrlForSources(sources, preview, env) {
  if (!sources.length) return "";
  const params = new URLSearchParams();
  params.set("s", compactSourceList(sources));
  if (preview.personaName) params.set("lbt_n", preview.personaName);
  if (preview.hp) params.set("lbt_hp", preview.hp);
  if (preview.san) params.set("lbt_san", preview.san);
  if (preview.speed) params.set("lbt_spd", preview.speed);
  if (preview.syncRank) params.set("lbt_sync", preview.syncRank);
  if (preview.syncMax) params.set("lbt_max", "1");
  params.set("lbt_img", preview.hasShareImage ? "1" : "0");
  return (env.SHARE_VIEWER_URL || DEFAULT_VIEWER_URL) + "?" + params.toString();
}

function renderShell({ preview, iframeUrl = "", legacyUrl = "", canonicalUrl = "", error = "" }, env) {
  const p = sanitizePreview(preview);
  const name = p.personaName || "キャラクターシート";
  const title = "【人格】" + name + "｜LIMBUS BUILD TERMINAL";
  const detail = [
    p.hp ? "HP " + p.hp : "",
    p.san ? "SAN " + p.san : "",
    p.speed ? "速度 " + p.speed : "",
    p.syncRank ? "同期 " + p.syncRank : "",
    p.syncMax ? "MAX" : "",
  ].filter(Boolean).join(" / ");
  const description = (detail ? detail + "。 " : "") + "LIMBUS BUILD TERMINALで作成された共有キャラクターシートです。";
  const fallbackLink = legacyUrl
    ? '<a class="fallback-link" rel="noreferrer" href="' + htmlEscape(legacyUrl) + '">予備URL</a>'
    : "";
  const frame = iframeUrl
    ? '<iframe class="sheet" title="共有キャラクターシート" src="' + htmlEscape(iframeUrl) + '" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"></iframe>' + fallbackLink
    : '<main><h1>共有シートを読み込めませんでした</h1><p>' + htmlEscape(error || "共有データの取得に失敗しました。") + '</p>' + (legacyUrl ? '<p><a rel="noreferrer" href="' + htmlEscape(legacyUrl) + '">既存の共有方式で開く</a></p>' : "") + '</main>';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="' + htmlEscape(RESPONSE_CSP) + '">'
    + '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">'
    + '<title>' + htmlEscape(title) + '</title>'
    + '<link rel="canonical" href="' + htmlEscape(canonicalUrl || DEFAULT_VIEWER_URL) + '">'
    + '<meta name="description" content="' + htmlEscape(description) + '">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="LIMBUS BUILD TERMINAL">'
    + '<meta property="og:locale" content="ja_JP"><meta property="og:url" content="' + htmlEscape(canonicalUrl || DEFAULT_VIEWER_URL) + '">'
    + '<meta property="og:title" content="' + htmlEscape(title) + '"><meta property="og:description" content="' + htmlEscape(description) + '">'
    + '<meta property="og:image" content="' + htmlEscape(env.OG_IMAGE_URL || DEFAULT_OG_IMAGE) + '">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<style>html,body{margin:0;min-height:100%;background:#17100d;color:#f2ece1;font-family:system-ui,sans-serif}body{height:100dvh;overflow:hidden}.sheet{display:block;width:100%;height:100dvh;border:0}main{box-sizing:border-box;max-width:760px;margin:10vh auto;padding:24px;line-height:1.6}a{color:#e4c16e}.fallback-link{position:fixed;right:8px;bottom:8px;z-index:5;padding:6px 9px;border:1px solid #6a5b3e;border-radius:5px;background:#17100df0;font-size:11px;opacity:.82}</style>'
    + '</head><body>' + frame + '</body></html>';
}

function buildResponse(html, options = {}) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": options.cacheControl || ("public, max-age=0, s-maxage=" + SHARE_TTL_SECONDS),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": RESPONSE_CSP,
  });
  if (options.status) return new Response(html, { status: options.status, headers });
  return new Response(html, { headers });
}

function extractToken(text) {
  const content = String(text || "");
  const single = /LBT_SHARE_TOKEN=(z|j)\.([A-Za-z0-9_-]+)/.exec(content);
  if (single) return single[1] + "." + single[2];

  const parts = [...content.matchAll(/LBT_SHARE_TOKEN_PART=(\d{1,4})\/(\d{1,4}):([A-Za-z0-9_.-]+)/g)]
    .map((match) => ({ index: Number(match[1]), total: Number(match[2]), value: match[3] }))
    .filter((entry) => entry.total > 0 && entry.total <= 2000 && entry.index > 0 && entry.index <= entry.total);
  if (!parts.length) return "";
  const total = parts[0].total;
  if (parts.some((entry) => entry.total !== total) || parts.length !== total) return "";
  parts.sort((a, b) => a.index - b.index);
  if (parts.some((entry, index) => entry.index !== index + 1)) return "";
  const token = parts.map((entry) => entry.value).join("");
  return /^(z|j)\.[A-Za-z0-9_-]+$/.test(token) ? token : "";
}

async function tokenFromLegacySource(source) {
  if (source.source === "rentry") {
    const response = await fetch("https://rentry.co/" + encodeURIComponent(source.id), {
      headers: { "Accept": "text/html,text/plain;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) throw new Error("Rentry HTTP " + response.status);
    const token = extractToken(await response.text());
    if (token) return token;
    throw new Error("Rentry token missing");
  }
  if (source.source === "telegraph") {
    const response = await fetch("https://api.telegra.ph/getPage/" + encodeURIComponent(source.id) + "?return_content=true");
    if (!response.ok) throw new Error("Telegraph HTTP " + response.status);
    const data = await response.json();
    const token = extractToken(JSON.stringify(data?.result?.content || data?.content || []));
    if (token) return token;
    throw new Error("Telegraph token missing");
  }
  throw new Error("Unsupported legacy source");
}

async function tokenFromLegacySources(sources) {
  for (const source of sources) {
    try {
      return await tokenFromLegacySource(source);
    } catch (_) {
      // Continue through the second independently published backup.
    }
  }
  return "";
}

function applyPreviewToUrl(url, preview) {
  const p = sanitizePreview(preview);
  if (p.personaName) url.searchParams.set("lbt_n", p.personaName);
  if (p.hp) url.searchParams.set("lbt_hp", p.hp);
  if (p.san) url.searchParams.set("lbt_san", p.san);
  if (p.speed) url.searchParams.set("lbt_spd", p.speed);
  if (p.syncRank) url.searchParams.set("lbt_sync", p.syncRank);
  if (p.syncMax) url.searchParams.set("lbt_max", "1");
  url.searchParams.set("lbt_img", p.hasShareImage ? "1" : "0");
}

function getPublicOrigin(request, env) {
  const candidate = String(env.SHARE_PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) return new URL(request.url).origin;
    return url.origin;
  } catch (_) {
    return new URL(request.url).origin;
  }
}

async function publishShare(request, env) {
  const allowedOrigin = corsOrigin(request, env);
  if (!allowedOrigin) return jsonResponse({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  const corsHeaders = { origin: allowedOrigin };

  if (request.method === "OPTIONS") {
    const response = new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    } });
    return response;
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, allowedOrigin);
  }
  if (!env.SHARES || typeof env.SHARES.put !== "function") {
    return jsonResponse({ ok: false, error: "KV_NOT_CONFIGURED" }, 503, allowedOrigin);
  }

  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (declaredSize > MAX_REQUEST_BYTES) return jsonResponse({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413, allowedOrigin);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.SHARE_PUBLISH_LIMIT && typeof env.SHARE_PUBLISH_LIMIT.limit === "function") {
    try {
      const result = await env.SHARE_PUBLISH_LIMIT.limit({ key: ip });
      if (!result?.success) return jsonResponse({ ok: false, error: "RATE_LIMITED" }, 429, allowedOrigin);
    } catch (_) {
      return jsonResponse({ ok: false, error: "RATE_LIMIT_UNAVAILABLE" }, 503, allowedOrigin);
    }
  }

  let payload;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) return jsonResponse({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413, allowedOrigin);
    payload = JSON.parse(text);
  } catch (_) {
    return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400, allowedOrigin);
  }

  const token = String(payload?.token || "");
  if (token.length < 3 || token.length > MAX_TOKEN_LENGTH || !/^(z|j)\.[A-Za-z0-9_-]+$/.test(token)) {
    return jsonResponse({ ok: false, error: "INVALID_SHARE_TOKEN" }, 400, allowedOrigin);
  }
  const preview = sanitizePreview(payload.preview);
  const fallbacks = normalizeSources(payload.fallbacks);
  const publicOrigin = getPublicOrigin(request, env);

  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const shareUrl = publicOrigin + "/s/" + id;
  const legacyUrl = viewerUrlForSources(fallbacks, preview, env);
  const viewerBase = env.SHARE_VIEWER_URL || DEFAULT_VIEWER_URL;
  const iframeUrl = viewerBase + "#lbt=" + token;
  const html = renderShell({ preview, iframeUrl, legacyUrl, canonicalUrl: shareUrl }, env);

  try {
    await env.SHARES.put("s/" + id, html);
  } catch (_) {
    return jsonResponse({ ok: false, error: "KV_WRITE_FAILED" }, 503, allowedOrigin);
  }

  return jsonResponse({ ok: true, id, url: shareUrl }, 201, allowedOrigin);
}

async function getShare(request, env, id) {
  const url = new URL(request.url);
  const queryFallbacks = parseSourceList(url.searchParams.get("b") || "");
  const queryPreview = previewFromUrl(url);
  if (env.SHARES && typeof env.SHARES.get === "function") {
    try {
      const html = await env.SHARES.get("s/" + id, "text");
      if (typeof html === "string" && html.length > 0) {
        return buildResponse(html, { cacheControl: "public, max-age=0, s-maxage=" + SHARE_TTL_SECONDS });
      }
    } catch (_) {
      // R2 read failure: try the independently stored Rentry/Telegraph copy below.
    }
  }

  const fallbackToken = await tokenFromLegacySources(queryFallbacks);
  const legacyUrl = viewerUrlForSources(queryFallbacks, queryPreview, env);
  if (fallbackToken) {
    const html = renderShell({
      preview: queryPreview,
      iframeUrl: (env.SHARE_VIEWER_URL || DEFAULT_VIEWER_URL) + "#lbt=" + fallbackToken,
      legacyUrl,
      canonicalUrl: request.url,
    }, env);
    return buildResponse(html, { cacheControl: "public, max-age=0, s-maxage=300" });
  }
  const html = renderShell({
    preview: queryPreview,
    legacyUrl,
    canonicalUrl: request.url,
    error: "Cloudflare保存データを取得できませんでした。下の既存共有リンクを試してください。",
  }, env);
  return buildResponse(html, { status: queryFallbacks.length ? 503 : 404, cacheControl: "no-store" });
}

function handleLegacyOgp(request, env) {
  const url = new URL(request.url);
  const sources = parseSourceList(url.searchParams.get("s") || "");
  if (!sources.length) return buildResponse(renderShell({ preview: previewFromUrl(url), error: "共有IDが見つかりません。" }, env), { status: 400, cacheControl: "no-store" });
  const preview = previewFromUrl(url);
  const viewerUrl = viewerUrlForSources(sources, preview, env);
  return buildResponse(renderShell({
    preview,
    iframeUrl: viewerUrl,
    legacyUrl: viewerUrl,
    canonicalUrl: url.origin + url.pathname + url.search,
  }, env), { cacheControl: "public, max-age=0, s-maxage=86400" });
}

async function handleLegacyDownload(request, env) {
  const url = new URL(request.url);
  const sources = parseSourceList(url.searchParams.get("s") || "");
  const token = await tokenFromLegacySources(sources);
  const origin = "*";
  if (!token) return new Response("LBT share token unavailable", { status: 404, headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
  } });
  return new Response(token, { headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === API_PATH) return publishShare(request, env);
    if (url.pathname === "/healthz") return jsonResponse({ ok: true, kvConfigured: Boolean(env.SHARES) }, 200);
    if (url.pathname === "/d" && request.method === "GET") return handleLegacyDownload(request, env);
    if (url.pathname === "/s" && request.method === "GET") return handleLegacyOgp(request, env);
    const shareMatch = /^\/s\/([A-Za-z0-9_-]{16})$/.exec(url.pathname);
    if (shareMatch && request.method === "GET") return getShare(request, env, shareMatch[1]);
    return new Response("Not found", { status: 404, headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  },
};
