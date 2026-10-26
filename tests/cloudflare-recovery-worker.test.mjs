import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(path.join(ROOT, name), "utf8");
const client = read("js/cloud-backup.js");
const worker = read("cloudflare/recovery-worker/worker.js");
const schema = read("cloudflare/recovery-worker/schema.sql");
const indexHtml = read("index.html");
const shareHtml = read("share.html");
const counter = read("js/access-counter.js");
const recovery = read("supabase/functions/lbt-account-recovery/index.ts");

test("復旧キーは不変で、クライアントに再発行導線がない", () => {
  assert.match(client, /CLOUDFLARE_RECOVERY_ENDPOINT/);
  assert.match(client, /async function getRemote\(options = \{\}\)/);
  assert.match(client, /同じ世代番号の異なるデータ/);
  assert.doesNotMatch(client, /rotateRecoveryKey|rotate_recovery|復旧キーを再発行/);
  assert.doesNotMatch(recovery, /rotate_recovery|newRecoveryKey/);
  assert.doesNotMatch(worker, /rotate_recovery|newRecoveryKey/);
});

test("Supabase is primary, Cloudflare fallback is availability-based, and ordinary 4xx errors do not trigger generic fallback", () => {
  assert.match(client, /callProvider\(RECOVERY_ENDPOINT, payload, "supabase"\)/);
  assert.match(client, /isServiceUnavailable\(primaryError\)/);
  assert.match(client, /payload\.action === "restore_revision" && Number\(primaryError\.status\) === 404/);
  assert.match(client, /callProvider\(CLOUDFLARE_RECOVERY_ENDPOINT, payload, "cloudflare"\)/);
  assert.match(client, /action: "replicate"/);
  assert.match(recovery, /action === "replicate"/);
  assert.match(worker, /action === "replicate"/);
});

test("両保管先の世代を照合し、同一世代の異なる内容は自動上書きしない", () => {
  assert.match(client, /Promise\.all\(\[[\s\S]*?getProviderHead\("supabase"[\s\S]*?getProviderHead\("cloudflare"/);
  assert.match(client, /historyHashForRevision/);
  assert.match(client, /const ancestorHash = historyHashForRevision/);
  assert.match(client, /olderProvider, key, Number\(olderHead\.revision\), Number\(newerHead\.revision\)/);
  assert.match(client, /同じ世代に異なるデータがあります/);
  assert.match(client, /olderProvider/);
  assert.match(worker, /currentRevision !== expectedRevision/);
  assert.match(worker, /write_token/);
  assert.match(recovery, /currentRevision !== expectedRevision/);
});

test("Cloudflare D1 stores chunked snapshots and caps history", () => {
  assert.match(worker, /MAX_PAYLOAD_BYTES = 12 \* 1024 \* 1024/);
  assert.match(worker, /CHUNK_CHARS = 350000/);
  assert.match(worker, /vault_version_chunks/);
  assert.match(worker, /HISTORY_LIMIT = 10/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS vault_chunks/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS vault_version_chunks/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS site_counters/);
  assert.match(worker, /\/healthz/);
});

test("アクセスカウンターは累計ページ閲覧数を表示し、識別子をブラウザ保存しない", () => {
  assert.match(counter, /api\/stats\/view/);
  assert.match(counter, /総アクセス/);
  assert.match(worker, /INSERT INTO site_counters \(name, value\) VALUES \('total_views', 1\)/);
  assert.doesNotMatch(worker, /pageViews/);
  assert.doesNotMatch(counter, /\b(?:localStorage|sessionStorage|document\.cookie)\s*[.\[]/);
  assert.match(indexHtml, /access-counter\.js\?v=/);
  assert.match(shareHtml, /access-counter\.js\?v=/);
});

test("D1 schema and failover docs disclose privacy, free-tier limitations, and independent provider behavior", () => {
  assert.match(schema, /site_counters/);
  assert.match(read("cloudflare/recovery-worker/README.md"), /end-to-end encryption/);
  assert.match(read("docs/optional-account-cloud-backup.md"), /Cloudflare D1/);
});
