/**
 * LBT OGP Gateway
 *
 * Workers Free 向けの無状態ゲートウェイ。KV/R2/D1/Queues/Images等の
 * 課金対象サービスを使わず、既存のRentry/Telegraph共有トークンだけから
 * OGP HTMLと共有画像を都度復元する。
 */

const LBT_SHARE_PAGE = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html";
const STATIC_FALLBACK_IMAGE = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/assets/lbt-share-card.png";
const OFFICIAL_DB_URL = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/data/db.json";
const EXTERNAL_TOKEN_MARKER = "LBT_SHARE_TOKEN=";
const EXTERNAL_TOKEN_PART_MARKER = "LBT_SHARE_TOKEN_PART=";
const MAX_TOKEN_CHARS = 160000;
const MAX_DECOMPRESSED_BYTES = 256000;
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function bytesFromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value || "") || value.length > MAX_TOKEN_CHARS) throw new Error("不正な共有トークンです");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function inflateRaw(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_DECOMPRESSED_BYTES) throw new Error("共有データが大きすぎます");
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => { joined.set(chunk, offset); offset += chunk.byteLength; });
  return joined;
}

export async function decodeToken(token) {
  const match = /^(z|j)\.([A-Za-z0-9_-]+)$/.exec(String(token || ""));
  if (!match) throw new Error("共有トークンの形式が不正です");
  let bytes = bytesFromBase64Url(match[2]);
  if (match[1] === "z") bytes = await inflateRaw(bytes);
  if (bytes.byteLength > MAX_DECOMPRESSED_BYTES) throw new Error("共有データが大きすぎます");
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data._lbtShare !== 1) throw new Error("LBT形式の共有データではありません");
  return data;
}

export function parseSources(url) {
  const raw = String(url.searchParams.get("s") || "");
  if (!raw || raw.length > 700) return [];
  return raw.split(",").map((segment) => {
    const match = /^([tr]):(.+)$/.exec(segment);
    if (!match) return null;
    const source = match[1] === "t" ? "telegraph" : "rentry";
    const id = match[2];
    const valid = source === "rentry"
      ? /^[A-Za-z0-9_-]{3,64}$/.test(id)
      : /^[A-Za-z0-9_-]{1,256}$/.test(id);
    return valid ? { source, id } : null;
  }).filter(Boolean).filter((entry, index, entries) => entries.findIndex((other) => other.source === entry.source && other.id === entry.id) === index);
}

function findToken(text) {
  const source = String(text || "");
  const match = new RegExp(`${EXTERNAL_TOKEN_MARKER}(z|j)\\.([A-Za-z0-9_-]{1,${MAX_TOKEN_CHARS}})`).exec(source);
  if (match) return `${match[1]}.${match[2]}`;
  const parts = [...source.matchAll(new RegExp(`${EXTERNAL_TOKEN_PART_MARKER}(\\d{1,4})/(\\d{1,4}):([A-Za-z0-9_.-]+)`, "g"))]
    .map((entry) => ({ index: Number(entry[1]), total: Number(entry[2]), value: entry[3] }))
    .filter((entry) => entry.total > 0 && entry.total <= 2000 && entry.index > 0 && entry.index <= entry.total);
  if (!parts.length) return "";
  const total = parts[0].total;
  if (parts.some((entry) => entry.total !== total) || parts.length !== total) return "";
  parts.sort((a, b) => a.index - b.index);
  if (parts.some((entry, index) => entry.index !== index + 1)) return "";
  const token = parts.map((entry) => entry.value).join("");
  return new RegExp(`^(z|j)\\.[A-Za-z0-9_-]{1,${MAX_TOKEN_CHARS}}$`).test(token) ? token : "";
}

async function tokenFromSource(source, fetchImpl) {
  if (source.source === "rentry") {
    const response = await fetchImpl(`https://rentry.co/${encodeURIComponent(source.id)}`, { redirect: "follow" });
    if (!response.ok) throw new Error(`Rentry HTTP ${response.status}`);
    const token = findToken(await response.text());
    if (!token) throw new Error("Rentry内に共有トークンがありません");
    return token;
  }
  const response = await fetchImpl(`https://api.telegra.ph/getPage/${encodeURIComponent(source.id)}?return_content=true`);
  if (!response.ok) throw new Error(`Telegraph HTTP ${response.status}`);
  const payload = await response.json();
  const token = findToken(JSON.stringify(payload?.result?.content || payload?.content || []));
  if (!token) throw new Error("Telegraph内に共有トークンがありません");
  return token;
}

export async function loadToken(sources, fetchImpl = fetch) {
  const failures = [];
  for (const source of sources) {
    try {
      const token = await tokenFromSource(source, fetchImpl);
      await decodeToken(token);
      return token;
    } catch (error) {
      failures.push(error?.message || "共有データの取得に失敗しました");
    }
  }
  throw new Error(failures.join(" / ") || "共有データが見つかりません");
}

export async function loadSnapshot(sources, fetchImpl = fetch) {
  return decodeToken(await loadToken(sources, fetchImpl));
}

function selectedSync(snapshot) {
  const selected = Array.isArray(snapshot?.roster?.personas) ? snapshot.roster.personas[0] : null;
  const rank = ["0", "00", "000"].includes(String(selected?.syncRank || "")) ? selected.syncRank : "";
  return [rank ? `同期${rank}` : "", selected?.syncMax === true ? "MAX" : ""].filter(Boolean).join(" ｜ ");
}

export function previewFromSnapshot(snapshot) {
  const rawPersonaName = String(snapshot?.personaSrc?.name || snapshot?.charName || "LBT キャラクターシート").trim();
  const personaName = Array.from(rawPersonaName).slice(0, 48).join("") + (Array.from(rawPersonaName).length > 48 ? "…" : "");
  const hp = String(snapshot?.hp ?? "?").trim().slice(0, 12) || "?";
  const san = String(snapshot?.san ?? "?").trim().slice(0, 12) || "?";
  const sync = selectedSync(snapshot);
  return {
    personaName,
    title: personaName,
    description: [`HP ${hp}`, `SAN ${san}`, sync].filter(Boolean).join(" ｜ "),
    shareImageData: String(snapshot?.shareImageData || "")
  };
}

async function enrichOfficialPersona(snapshot, fetchImpl) {
  const ref = snapshot?.personaRef;
  const mode = String(ref?.mode || snapshot?.personaMode || "");
  const needsName = !String(snapshot?.personaSrc?.name || snapshot?.charName || "").trim();
  const needsHp = snapshot?.hp === undefined || snapshot?.hp === null || snapshot?.hp === "";
  const needsSan = snapshot?.san === undefined || snapshot?.san === null || snapshot?.san === "";
  if ((!needsName && !needsHp && !needsSan) || !["n", "t"].includes(mode) || ref?.no === undefined || ref?.no === null) return snapshot;
  try {
    const response = await fetchImpl(OFFICIAL_DB_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) return snapshot;
    const db = await response.json();
    const rows = mode === "t" ? db?.tokui_personas : db?.normal_personas;
    const persona = Array.isArray(rows) ? rows.find((entry) => String(entry?.no) === String(ref.no)) : null;
    if (!persona) return snapshot;
    return {
      ...snapshot,
      personaSrc: snapshot?.personaSrc?.name ? snapshot.personaSrc : { name: persona.name },
      hp: needsHp ? persona.hp : snapshot.hp,
      san: needsSan ? persona.san : snapshot.san
    };
  } catch (_) {
    return snapshot;
  }
}

function imageResponse(dataUri, method) {
  const match = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUri || ""));
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Response(method === "HEAD" ? null : bytes, {
    headers: {
      "Content-Type": `image/${match[1]}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function shareTarget(url) {
  const compact = String(url.searchParams.get("s") || "");
  return compact ? `${LBT_SHARE_PAGE}?s=${encodeURIComponent(compact)}` : LBT_SHARE_PAGE;
}

function fallbackHtml(url, detail = "") {
  const target = shareTarget(url);
  const safeTarget = htmlEscape(target);
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${safeTarget}"><title>LIMBUS BUILD TERMINAL</title><meta property="og:title" content="LIMBUS BUILD TERMINAL — キャラクターシート"><meta property="og:description" content="LBT キャラクターシート共有リンク"><meta property="og:image" content="${STATIC_FALLBACK_IMAGE}"><script>location.replace(${JSON.stringify(target)})</script></head><body><a href="${safeTarget}">LBT共有シートを開く</a>${detail ? `<small>${htmlEscape(detail)}</small>` : ""}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function ogpHtml(requestUrl, snapshot) {
  const url = new URL(requestUrl);
  const preview = previewFromSnapshot(snapshot);
  const target = shareTarget(url);
  const image = /^data:image\/(webp|jpeg);base64,/.test(preview.shareImageData)
    ? `${url.origin}/i?${url.searchParams.toString()}`
    : STATIC_FALLBACK_IMAGE;
  const safeTarget = htmlEscape(target);
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${htmlEscape(url.href)}"><title>${htmlEscape(preview.title)}</title><meta property="og:type" content="website"><meta property="og:site_name" content="LIMBUS BUILD TERMINAL"><meta property="og:url" content="${htmlEscape(url.href)}"><meta property="og:title" content="${htmlEscape(preview.title)}"><meta property="og:description" content="${htmlEscape(preview.description)}"><meta property="og:image" content="${htmlEscape(image)}"><meta property="og:image:alt" content="${htmlEscape(preview.personaName)} の共有画像"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(preview.title)}"><meta name="twitter:description" content="${htmlEscape(preview.description)}"><meta name="twitter:image" content="${htmlEscape(image)}"><meta http-equiv="refresh" content="0;url=${safeTarget}"><script>location.replace(${JSON.stringify(target)})</script></head><body><a href="${safeTarget}">LBT共有シートを開く</a></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleRequest(request, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("LBT OGP gateway: free/stateless", { headers: { "Cache-Control": "no-store" } });
  if (!["/s", "/i", "/d"].includes(url.pathname)) return fallbackHtml(url);
  const sources = parseSources(url);
  if (!sources.length) return new Response("共有IDが不正です", { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    if (url.pathname === "/d") {
      const token = await loadToken(sources, fetchImpl);
      return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
    }
    const snapshot = await loadSnapshot(sources, fetchImpl);
    if (url.pathname === "/i") return imageResponse(snapshot.shareImageData, request.method) || new Response("共有画像は設定されていません", { status: 404, headers: { "Cache-Control": "no-store" } });
    return ogpHtml(request.url, await enrichOfficialPersona(snapshot, fetchImpl));
  } catch (error) {
    return fallbackHtml(url, error?.message || "共有データの取得に失敗しました");
  }
}

export default { fetch: handleRequest };
