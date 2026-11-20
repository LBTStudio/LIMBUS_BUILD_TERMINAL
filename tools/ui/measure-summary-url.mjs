import { readFileSync } from "node:fs";
import vm from "node:vm";

// 共有 URL の長さを、公式人格 145 件すべてについて実測する。
// 比較対象:
//   A. 従来 URL（?s=t:ID,r:ID のみ）
//   B. 現行 URL（summary 付き）
//
// 「短縮」の仕様が保たれているかは、
//   - summary を足しても URL が 1900 文字に収まるか
//   - 従来から大幅缩水していた「88 文字台」が異常なほど増えていないか
// で判断する。

const src = readFileSync("js/share-link.js", "utf8");
const db = JSON.parse(readFileSync("data/db.json", "utf8"));
const window = { DB: db };
vm.runInNewContext(src, {
  window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
  Blob, Response, URL, URLSearchParams, btoa, atob,
});
const S = window.LBT_shareLink;

const GATEWAY = "https://lbt-ogp.lbtstudio-share.workers.dev/s";
const IDS = "s=t%3ALBT-Share-10-01-2%2Cr%3Aocrdvn5e&cv=2";
const BARE = `${GATEWAY}?${IDS}`;
const LIMIT = 1900;

const personas = db.normal_personas || [];
const rows = [];

for (const p of personas) {
  const state = {
    charName: p.name,
    personaMode: "n",
    personaNo: p.no,
    hp: String(p.hp ?? ""),
    san: String(p.san ?? ""),
    speed: String(p.speed ?? ""),
    roster: { personas: [{ no: p.no, mode: "n", syncRank: "000", syncMax: false, equipped: true }] },
  };
  const snap = S.snapshotState(state);
  const preview = S.sharePreview(snap);

  let withSummary = BARE;
  if (preview?.personaName) {
    const params = new URLSearchParams();
    params.set("lbt_n", preview.personaName.slice(0, 72));
    if (preview.hp) params.set("lbt_hp", preview.hp);
    if (preview.san) params.set("lbt_san", preview.san);
    if (preview.syncRank) params.set("lbt_sync", preview.syncRank);
    if (preview.syncMax) params.set("lbt_max", "1");
    withSummary = `${BARE}&${params.toString()}`;
  }
  rows.push({ name: p.name, bare: BARE.length, sum: withSummary.length, has: !!preview?.personaName });
}

const sums = rows.map((r) => r.sum).sort((a, b) => a - b);
const p50 = sums[Math.floor(sums.length * 0.5)];
const p95 = sums[Math.floor(sums.length * 0.95)];
const max = sums[sums.length - 1];
const over = rows.filter((r) => r.sum > LIMIT);
const noSummary = rows.filter((r) => !r.has);

console.log(`公式人格: ${rows.length} 件`);
console.log(`\n=== URL 長 ===`);
console.log(`  従来（summary なし）: ${BARE.length} 文字`);
console.log(`  現行: min=${sums[0]}  p50=${p50}  p95=${p95}  max=${max}`);
console.log(`  増加量: +${p50 - BARE.length}（p50） 〜 +${max - BARE.length}（max）`);
console.log(`\n=== 判定 ===`);
console.log(`  1900 超過: ${over.length} 件`);
console.log(`  summary が空（従来 URL にフォールバック）: ${noSummary.length} 件`);
if (over.length) {
  console.log("\n  超過した例:");
  over.slice(0, 5).forEach((r) => console.log(`    ${r.name}  ${r.sum} 文字`));
}
if (noSummary.length) {
  console.log("\n  summary が空の例:");
  noSummary.slice(0, 5).forEach((r) => console.log(`    ${r.name}`));
}
const longest = rows.reduce((a, b) => (b.sum > a.sum ? b : a));
console.log(`\n  最長: ${longest.name}  ${longest.sum} 文字 / 上限 ${LIMIT} → 余裕 ${LIMIT - longest.sum}`);