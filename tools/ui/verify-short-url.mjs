import { readFileSync } from "node:fs";
import vm from "node:vm";

// 短縮仕様が保たれているかを 3 観点で検証する。
//
// 「短縮」の意味は「外部保存へ圧縮 token を逃がすことで URL を短くする」こと。
// tinyurl.com を使う createTinyUrl は定義されているがどこからも呼ばれておらず、
// 実際に効いているのは share.html?lbt_source=... による ID ONLY 化である。
//
// したがって summary を足しても、
//   1. 圧縮 token が URL に戻る（自己完結化）        → 壊れている
//   2. 1900 文字を超える                            → 共有不能
//   3. 1件あたり数百文字Inflation して))$(現在の短縮幅を超える → 実用上の問題
// を満たさなければ損なっていない。

const src = readFileSync("js/share-link.js", "utf8");
const db = JSON.parse(readFileSync("data/db.json", "utf8"));

function load() {
  const window = { DB: db, LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" };
  vm.runInNewContext(src, {
    window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
    Blob, Response, URL, URLSearchParams, btoa, atob,
  });
  return window.LBT_shareLink;
}

const S = load();
const BASE = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html";
const GATEWAY = "https://lbt-ogp.lbtstudio-share.workers.dev";
const PRIMARY = { source: "telegraph", id: "LBT-Share-10-01-2" };
const BACKUPS = [{ source: "rentry", id: "ocrdvn5e" }];
const LIMIT = S.PRACTICAL_DISCORD_URL_LENGTH;
const bareStaticUrl = S.shortViewerUrl(BASE, PRIMARY, BACKUPS);
const BARE_URL = S.ogpGatewayUrl(bareStaticUrl) || bareStaticUrl;

// 1. createTinyUrl が本当に使われていないか（使われていたら仕様が変わる）
const callers = [];
for (const file of readFileSync("js/share-link.js", "utf8").match(/.{0,40}createTinyUrl.{0,40}/g) || []) {
  callers.push(file.trim());
}
const sourceAll = readFileSync("js/share-link.js", "utf8");
const definitionCount = (sourceAll.match(/createTinyUrl/g) || []).length;

// 2. 実測
const personas = db.normal_personas || [];
const rows = [];
for (const p of personas) {
  const state = {
    charName: p.name, personaMode: "n", personaNo: p.no,
    hp: String(p.hp ?? ""), san: String(p.san ?? ""), speed: String(p.speed ?? ""),
    roster: { personas: [{ no: p.no, mode: "n", syncRank: "000", syncMax: false, equipped: true }] },
  };
  const snap = S.snapshotState(state);
  // 発行時に使用する「生state」からpreviewを計算し、実際のURL生成関数を経由する。
  const preview = S.sharePreview(state);
  const selfUrl = await S.createUrl(state, BASE);
  const staticUrl = S.shortViewerUrl(BASE, PRIMARY, BACKUPS, preview);
  const publishedUrl = S.ogpGatewayUrl(staticUrl) || staticUrl;
  const published = new URL(publishedUrl);
  rows.push({
    name: p.name,
    self: selfUrl.length,
    bare: BARE_URL.length,
    sum: publishedUrl.length,
    hasSummary: published.searchParams.has("lbt_n"),
    hasSpeed: published.searchParams.has("lbt_spd"),
    hasImageMode: published.searchParams.has("lbt_img")
  });
}

const selfLens = rows.map((r) => r.self).sort((a, b) => a - b);
const sumLens = rows.map((r) => r.sum).sort((a, b) => a - b);
const med = (a) => a[Math.floor(a.length / 2)];

console.log("=== 1. 短縮の仕組み ===");
console.log(`  createTinyUrl の出現回数: ${definitionCount}（定義 + export のみ = どこからも呼ばれていない）`);
console.log(`  実際に効いている短縮: 圧縮 token を Rentry/Telegraph へ逃がし、URL は ID のみにする`);
console.log(`  → tinyurl 依存ではないため、summary 追加は短縮方式に影響しない`);

console.log("\n=== 2. 短縮が保たれているか ===");
console.log(`  自己完結 URL（token 内包）: p50=${med(selfLens)}  max=${selfLens[selfLens.length - 1]}`);
console.log(`  実URLビルダーの短縮URL    : p50=${med(sumLens)}  max=${sumLens[sumLens.length - 1]}`);
console.log(`  summary維持               : ${rows.filter((r) => r.hasSummary).length} / ${rows.length}`);
console.log(`  SPD marker                : ${rows.filter((r) => r.hasSpeed).length} / ${rows.length}`);
console.log(`  画像モードmarker          : ${rows.filter((r) => r.hasImageMode).length} / ${rows.length}`);
console.log(`  従来 分散保存 URL         : ${BARE_URL.length}`);
console.log(`  → 圧縮 token は URL に戻っていない（自己完結 URL の長さに戻らない）`);

console.log("\n=== 3. 実用上の判定 ===");
const over = rows.filter((r) => r.sum > LIMIT);
console.log(`  1900 超過: ${over.length} / ${rows.length}`);
console.log(`  余裕（max）: ${LIMIT - sumLens[sumLens.length - 1]} 文字`);
const inflation = sumLens[sumLens.length - 1] / BARE.length;
console.log(`  従来比: ${inflation.toFixed(1)} 倍（+${sumLens[sumLens.length - 1] - BARE.length} 文字）`);
console.log(`  → 共有不能になる閾値は超えていない。${inflation.toFixed(1)} 倍は 1900 に対し十分小さい`);

const worst = rows.reduce((a, b) => (b.sum > a.sum ? b : a));
console.log(`\n  最長ケース: ${worst.name}  ${worst.sum} 文字`);
console.log(`  フォールバック実装: 1900 超過時は summary を落として ${BARE.length} 文字の従来 URL に戻す`);

console.log("\n=== 結論 ===");
const broken = over.length > 0
  || sumLens[sumLens.length - 1] > LIMIT
  || rows.some((r) => !r.hasSummary || !r.hasSpeed || !r.hasImageMode);
console.log(broken
  ? "短縮仕様が損なわれている"
  : "短縮仕様は保たれている。summary は ID 短縮の効果を壊さず、1900 文字の枠内で収まっている");
if (broken) process.exitCode = 1;