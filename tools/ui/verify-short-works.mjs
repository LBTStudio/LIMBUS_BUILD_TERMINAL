import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 実測: 「短縮」は実際に機能しているか。
 *
 * 確認すべき点:
 *   1. 発行される URL に圧縮 token が戻っていないか
 *   2. その URL から実際にシートが復元できるか（round-trip）
 *   3. 短縮前より長くなっていても、実際に復元できるなら「短縮」の目的は達成
 */

// 実通信は行わず、外部保存先の本文・取得応答まで保持するテスト用fetch。
function mockFetch() {
  const store = new Map();
  let seq = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.origin === "https://rentry.co" && url.pathname === "/api/new") {
      const id = "mock-rentry-" + (++seq);
      const text = new URLSearchParams(String(options.body || "")).get("text") || "";
      store.set(`rentry:${id}`, text);
      return new Response(JSON.stringify({ url_short: id }), { status: 200 });
    }
    if (url.origin === "https://api.telegra.ph" && url.pathname === "/createAccount") {
      return new Response(JSON.stringify({ ok: true, result: { access_token: "mock" } }), { status: 200 });
    }
    if (url.origin === "https://api.telegra.ph" && url.pathname === "/createPage") {
      const params = new URLSearchParams(String(options.body || ""));
      const content = JSON.parse(params.get("content") || "[]");
      const id = "LBT-Mock-" + (++seq);
      store.set(`telegraph:${id}`, content);
      return new Response(JSON.stringify({ ok: true, result: { path: id } }), { status: 200 });
    }
    if (url.origin === "https://api.telegra.ph" && url.pathname.startsWith("/getPage/")) {
      const id = decodeURIComponent(url.pathname.slice("/getPage/".length));
      const content = store.get(`telegraph:${id}`);
      if (!content) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ ok: true, result: { content } }), { status: 200 });
    }
    if (url.origin === "https://rentry.co" && url.pathname !== "/api/new") {
      const id = decodeURIComponent(url.pathname.slice(1));
      const text = store.get(`rentry:${id}`);
      return text
        ? new Response(text, { status: 200 })
        : new Response("missing", { status: 404 });
    }
    throw new Error("unexpected " + url);
  };
  fetchImpl.store = store;
  return fetchImpl;
}

const src = readFileSync("js/share-link.js", "utf8");
const db = JSON.parse(readFileSync("data/db.json", "utf8"));
const window = { DB: db, setTimeout, clearTimeout };
vm.runInNewContext(src, {
  window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
  Blob, Response, URL, URLSearchParams, btoa, atob, AbortController, setTimeout, clearTimeout,
});
const S = window.LBT_shareLink;
const BASE = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html";

const persona = db.normal_personas[0];
const state = {
  charName: persona.name, personaMode: "n", personaNo: persona.no,
  hp: "120", san: "50", speed: "3-7",
  inventory: [{ itemId: "itm-001", quantity: 2 }, { itemId: "itm-002", quantity: 5 }],
  skills: ["sk-a", "sk-b", "sk-c"],
  memo: "テストメモ".repeat(20),
  roster: { personas: [{ no: persona.no, mode: "n", syncRank: "000", syncMax: true, equipped: true }] },
};

const snap = S.snapshotState(state);
const token = await S.encodeState(snap);
const selfUrl = await S.createUrl(snap, BASE);
const fetchMock = mockFetch();
const pub = await S.createPublishedUrl(snap, BASE, fetchMock);

console.log("=== 1. 圧縮 token のサイズ ===");
console.log(`  圧縮 token 自体      : ${token.length} 文字`);
console.log(`  自己完結 URL（token 内包）: ${selfUrl.length} 文字`);

console.log("\n=== 2. 発行 URL ===");
console.log(`  長さ: ${pub.length} 文字`);
console.log(`  URL : ${pub.url}`);
console.log(`  戦略: ${pub.strategy}`);

const u = new URL(pub.url);
const sParam = u.searchParams.get("s") || "";
console.log(`\n  s パラメータ: ${sParam}`);
console.log(`  token が含まれていないか: ${!sParam.includes("z.") && !sParam.includes("j.") ? "YES" : "NO ← token が漏れている"}`);

// 圧縮 token が URL に出ているかを機械的に判定
const urlHasToken = /[=?&]z\.|[=?&]j\./.test(pub.url);
console.log(`  URL に base64 token が含まれるか: ${urlHasToken ? "YES（短縮になっていない）" : "NO（短縮されている）"}`);

console.log("\n=== 3. 短縮率 ===");
console.log(`  自己完結 → 分散保存: ${selfUrl.length} → ${pub.length} 文字 (${Math.round((1 - pub.length / selfUrl.length) * 100)}% 短縮)`);
console.log(`  分散保存 vs 上限1900: ${pub.length} / 1900`);

console.log("\n=== 4. 復元可能性（保存先へのmock往復）===");
console.log(`  発行 URL に含まれるもの: 保存先 ID のみ`);
console.log(`  → 実データ（token）はRentry / Telegraphの保存本文へ格納され、URL内には含まれない`);
console.log(`  → 復元は sheet-open 時に share.html が保存先から取得して行う設計`);

// 公開URLから保存先IDを逆引きし、モックの保存先本文から実データtokenを取得して復元する。
const sources = S.shortSourcesFromLocation({ search: u.search });
console.log(`\n  URL から保存先を逆引き: ${JSON.stringify(sources)}`);
let restored = null;
let roundTripError = "";
try {
  const restoredToken = await S.tokenFromExternalSource({ search: u.search }, fetchMock);
  restored = await S.decodeToken(restoredToken);
} catch (error) {
  roundTripError = error?.message || String(error);
}
const roundTripOk = Boolean(
  restored
  && restored.charName === snap.charName
  && String(restored.hp ?? "") === String(snap.hp ?? "")
  && String(restored.san ?? "") === String(snap.san ?? "")
  && String(restored.speed ?? "") === String(snap.speed ?? "")
  && JSON.stringify(restored.inventory || []) === JSON.stringify(snap.inventory || [])
  && JSON.stringify(restored.skills || []) === JSON.stringify(snap.skills || [])
  && JSON.stringify(restored.roster || {}) === JSON.stringify(snap.roster || {})
);
console.log(`  外部保存先からtokenを取得: ${restored ? "YES" : "NO"}`);
console.log(`  共有データのround-trip: ${roundTripOk ? "PASS" : "FAIL"}`);
if (!roundTripOk && roundTripError) console.error(`  復元エラー: ${roundTripError}`);
console.log(`  保存先レコード数: ${fetchMock.store.size}`);

const failed = urlHasToken || !sources.length || pub.length > 1900 || !roundTripOk;
if (failed) {
  console.error("\nFAIL: URL短縮・保存先逆引き・データ復元・1900文字上限のいずれかに問題があります");
  process.exitCode = 1;
} else {
  console.log("\nPASS: 短縮URLから保存先データを読み戻し、主要フィールドが一致しました");
}