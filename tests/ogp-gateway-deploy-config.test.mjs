import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

// OGP ゲートウェイの配備設定が、実装と食い違っていないことを固定する。
//
// 実際の cache 設定は wrangler.toml の [cache] に集約する。
// スクリプト上書き（modules upload）は既存の cache_options を初期化するため、
// 単にスクリプトをアップロードし直すと cache が消える事故が起きうる。
// 設定がファイルに残っている限り、その事故を検出できる。

const wrangler = readFileSync(new URL("../ogp-gateway/wrangler.toml", import.meta.url), "utf8");
const worker = readFileSync(new URL("../ogp-gateway/worker.mjs", import.meta.url), "utf8");

test("wrangler.toml が Workers Cache を明示的に有効化している", () => {
  assert.match(wrangler, /^\[cache\]\s*$/m);
  assert.match(wrangler, /^enabled\s*=\s*true\s*$/m);
  // 実装を差し替えても既存キャッシュを引き継ぐために必要
  assert.match(wrangler, /^cross_version_cache\s*=\s*true\s*$/m);
});

test("cache 用の Cache-Control がコードと設定の両方で定義されている", () => {
  // /s と /i が使う長期キャッシュ（7日fresh + 30日 stale）
  assert.match(worker, /const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=2592000, stale-if-error=2592000"/);
  assert.match(worker, /"Cache-Control": CACHE_CONTROL/);
  // /d の token キャッシュは別ポリシー（1日）
  assert.match(worker, /const TOKEN_CACHE_CONTROL = "public, max-age=86400/);
  // 障害時フォールバックはさらに短い negative cache
  assert.match(worker, /const FALLBACK_CACHE_CONTROL = "public, max-age=30, stale-if-error=300"/);
});

test("bogus な paid binding が混ざっていない（Free 固定の維持）", () => {
  // KV / R2 / D1 / Durable Objects は使わない意図。混入 regressions を防ぐ。
  for (const binding of ["kv_namespaces", "r2_buckets", "d1_databases", "durable_objects", "queues", "vars"]) {
    assert.doesNotMatch(wrangler, new RegExp(`^\\[${binding}\\]`, "m"), `${binding} は定義されていないこと`);
  }
});

test("Worker の公開先は workers.dev のままである", () => {
  assert.match(wrangler, /^workers_dev\s*=\s*true\s*$/m);
  assert.doesNotMatch(wrangler, /^route\s*=/m, "独自ドメインの route は定義しないこと");
});