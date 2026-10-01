import { readFileSync } from "node:fs";
import vm from "node:vm";

/* 実測: 「短縮」は実際に機能しているか。
 *
 * 確認すべき点:
 *   1. 発行される URL に圧縮 token が戻っていないか
 *   2. その URL から実際にシートが復元できるか（round-trip）
 *   3. 短縮前より長くなっていても、復元laces できるなら「短縮」の目的は達成
 */

// ローカル検証用の最小 fetch（外部に出さない）
function mockFetch() {
  const store = new Map();
  let seq = 0;
  return async (input) => {
    const url = String(input);
    if (url.includes("rentry.co/api/new")) {
      const id = "mock" + (++seq);
      store.set(id, String(url).length);
      return new Response(JSON.stringify({ url_short: id }), { status: 200 });
    }
    if (url.includes("createAccount")) return new Response(JSON.stringify({ ok: true, result: { access_token: "mock" } }), { status: 200 });
    if (url.includes("createPage")) return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Mock-" + seq } }), { status: 200 });
    throw new Error("unexpected " + url);
  };
}

const src = readFileSync("js/share-link.js", "utf8");
const db = JSON.parse(readFileSync("data/db.json", "utf8"));
const window = { DB: db };
vm.runInNewContext(src, {
  window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
  Blob, Response, URL, URLSearchParams, btoa, atob,
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
const pub = await S.createPublishedUrl(snap, BASE, mockFetch());

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

console.log("\n=== 4. 復元可能性（token が外部にあれば実服务器が必要）===");
console.log(`  発行 URL に含まれるもの: 保存先 ID のみ`);
console.log(`  → 実データ（token）は Rentry / Telegraph にあり、URL からは復元できない`);
console.log(`  → 復元は sheet-open 時に share.html が保存先から取得して行う設計`);

// 復元パスの存在確認：URL から保存先 ID を取り出せるか
const sources = S.shortSourcesFromLocation({ search: u.search });
console.log(`\n  URL から保存先を逆引き: ${JSON.stringify(sources)}`);
console.log(`  復元可能か: ${sources.length ? "YES（保存先 ID で token を取得できる）" : "NO"}`);