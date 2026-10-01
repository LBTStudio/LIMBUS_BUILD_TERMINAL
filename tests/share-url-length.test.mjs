import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// 共有 URL の短縮仕様が壊れていないことを固定する。
//
// ここで守りたいのは「圧縮 token を外部保存へ逃がし、URL は保存先 ID だけにする」
// という短縮の考え方である。summary を URL に足しても、その考え方は変えてはいけない。
// 実際に効いているのはこの方式で、createTinyUrl（tinyurl.com）は定義されているが
// どこからも呼ばれていない。

const shareLink = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
const gatewayHost = "https://lbt-ogp.lbtstudio-share.workers.dev/s";

test("createTinyUrl は定義されているだけで、発行経路からは呼ばれていない", () => {
  // 定義と export のみ。発行経路からの呼び出しがあれば 3 回目になる。
  const occurrences = (shareLink.match(/createTinyUrl/g) || []).length;
  assert.equal(occurrences, 2, "定義 + export の 2 回のみ");
  // 発行に使われていたら、その呼び出しが残っているはず
  assert.doesNotMatch(shareLink, /await\s+createTinyUrl\(/);
});

test("短縮は外部保存 ID だけに依存し、圧縮 token を URL に戻さない", () => {
  // 分散保存経路の URL は ?s=<保存先ID> の形
  assert.match(shareLink, /const base = `\$\{shareBaseUrl\(baseUrl\)\}\?s=\$\{segments\.join\(","\)\}`/);
  // 自己完結 token（createUrlFromToken）は別経路で、分散保存が失敗したときだけ使われる
  assert.match(shareLink, /strategy:\s*"self"/);
});

test("summary は 1900 文字を超えたら落到し、従来 URL に戻す", () => {
  // fallback 実装があること
  assert.match(shareLink, /if \(withSummary\.length > PRACTICAL_DISCORD_URL_LENGTH\)/);
  assert.match(shareLink, /for \(const key of \["lbt_n", "lbt_hp", "lbt_san", "lbt_sync", "lbt_max"\]\) url\.searchParams\.delete\(key\)/);
  // 切り詰めてもなお長ければ、summary なしの base へ
  assert.match(shareLink, /return trimmed\.length <= PRACTICAL_DISCORD_URL_LENGTH \? trimmed : base;/);
});

test("発行済みの URL は token を埋め込まない（保存 ID のみ）", () => {
  // createPublishedUrlOnce の範囲を切り出して、圧縮 token が URL に載っていないことを確認する
  const start = shareLink.indexOf("async function createPublishedUrlOnce");
  const end = shareLink.indexOf("\n  }\n", start);
  const once = shareLink.slice(start, end);
  assert.ok(once.length > 0, "createPublishedUrlOnce の範囲を取得できる");
  assert.doesNotMatch(once, /encodeURIComponent\(token\)/, "圧縮 token が URL に含まれない");
  // 保存先 ID を渡している
  assert.match(once, /shortViewerUrl\(target, primary, backups, preview\)/);
});

test("実際には：summary 付き URL も保存 ID ベースである（長さの診断は別スクリプトで）", () => {
  // summary 由来の query が 붙어도、元の ?s= の値は保存先 ID のままである
  const withSummary = shareLink.match(/const withSummary = `\$\{base\}&\$\{params\.toString\(\)\}`/);
  assert.ok(withSummary, "summary は base（保存 ID の URL）に連結される");
  // base は保存 ID のみなので、summary を足しても保存の仕組みは変わらない
  assert.match(shareLink, /const base = `\$\{shareBaseUrl\(baseUrl\)\}\?s=\$\{segments\.join\(","\)\}`/);
  assert.ok(gatewayHost.length > 0);
});