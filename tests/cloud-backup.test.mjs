import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(path.join(ROOT, name), "utf8");
const client = read("js/cloud-backup.js");
const storage = read("js/state.js");
const ui = read("js/accounts-ui.js");
const html = read("index.html");
const cloudCss = read("assets/cloud-backup.css");
const doc = read("docs/optional-account-cloud-backup.md");
const migration = read("supabase/migrations/20261025211015_lbt_account_vaults.sql");
const hardeningMigration = read("supabase/migrations/20261025212903_lbt_account_vault_access_hardening.sql");
const anonymousMigration = read("supabase/migrations/202610260002_reject_anonymous_vault_access.sql");
const recovery = read("supabase/functions/lbt-account-recovery/index.ts");
const fallbackWorker = read("cloudflare/recovery-worker/worker.js");
const fallbackSchema = read("cloudflare/recovery-worker/schema.sql");
const accessCounter = read("js/access-counter.js");
const shareHtml = read("share.html");

test("復旧キーは任意で、初期化・ローカル保存だけではアップロードしない", () => {
  assert.match(client, /復旧キーは未設定です/);
  assert.match(client, /function scheduleSync\(\)[\s\S]*?readStorage\(ENABLED_KEY\) !== "1"/);
  assert.match(client, /function setEnabled\(enabled\)/);
  assert.match(client, /window\.LBTCloudBackupPanel = CloudBackupPanel/);
  assert.match(ui, /window\.LBTCloudBackupPanel/);
  assert.match(client, /初回アップロードは明示的な操作が必要です/);
});

test("クラウドへ送るスナップショットはアカウント保存キーに限定し、認証・復旧キーを含めない", () => {
  assert.match(client, /function isBackupStorageKey\(key\)/);
  assert.match(client, /!key\.startsWith\("lbt_cloud_"\)/);
  assert.match(client, /function collectLocalSnapshot\(\{ enforceCloudLimit = true \} = \{\}\)/);
  assert.match(client, /format: "lbt-account-backup"/);
  assert.match(client, /function validateSnapshot\(payload, \{ enforceCloudLimit = true \} = \{\}\)/);
  assert.doesNotMatch(client, /localStorage\.clear\(/);
  assert.match(storage, /announceBackupSourceChanged\(key, "write"\)/);
  assert.match(storage, /announceBackupSourceChanged\(key, "remove"\)/);
});

test("クラウド復元・JSON復元はいずれも現在のデータを確認して保護する", () => {
  assert.match(client, /現在の端末にもデータがあります[\s\S]*?JSONファイルとしてダウンロード/);
  assert.match(client, /downloadSnapshot\(local, "before-cloud-restore"\)/);
  assert.match(client, /downloadSnapshot\(local, "before-json-restore"\)/);
  assert.match(client, /async function restoreWithKey/);
  assert.match(client, /async function restoreCloud/);
  assert.match(client, /async function restoreFromFile/);
});

test("同期競合では古いデータを自動上書きせず、更新履歴を復元できる", () => {
  assert.match(client, /const known = Number\(readStorage\(REVISION_KEY\) \|\| 0\)/);
  assert.match(client, /getRemote\(\{ metadataOnly: true \}\)/);
  assert.match(client, /async function hashSnapshot\(payload\)/);
  assert.match(client, /同期競合のため自動上書きを停止しました/);
  assert.match(client, /async function loadHistory\(\)/);
  assert.match(client, /async function restoreRevision\(revision\)/);
  assert.match(recovery, /expectedRevision/);
  assert.match(recovery, /async function addHistory\(vault(?:: any)?\)/);
  assert.match(recovery, /const HISTORY_LIMIT = 10/);
});

test("バックアップテーブルは所有者単位のRLSで保護される", () => {
  assert.match(migration, /alter table public\.lbt_account_vaults enable row level security/i);
  assert.match(migration, /alter table public\.lbt_account_vault_versions enable row level security/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.lbt_account_vaults from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.lbt_account_vaults to service_role/i);
  assert.doesNotMatch(migration, /grant [^;]+ on table public\.lbt_account_vaults to authenticated/i);
});

test("オンライン保全の説明はローカル保存とクラウド保存を混同せず、暗号化範囲を開示する", () => {
  assert.match(ui, /ローカル保存はこの端末のブラウザに残ります/);
  assert.doesNotMatch(ui, /データはこの端末のブラウザ内にのみ保存されます/);
  assert.match(client, /クラウドへ保存されるJSON本体はエンドツーエンド暗号化されません/);
  assert.match(client, /復旧キー自体は保存せずハッシュのみを保持します/);
  assert.match(doc, /クラウドへ保存されるJSON本体は、アプリ独自のエンドツーエンド暗号化を行いません/);
  assert.match(doc, /端末内JSONの保存・読込はオンライン容量と分離し/);
});

test("復旧キーは十分な乱数を使い、サーバー側ではSHA-256だけを検索キーとして保存する", () => {
  assert.match(client, /function randomToken\(byteLength = 32\)/);
  assert.match(client, /"LBT1-" \+ randomToken\(32\)/);
  assert.match(recovery, /async function hashRecoveryKey\(key: string\)/);
  assert.match(recovery, /recovery_hash=eq/);
  assert.match(recovery, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(recovery, /MAX_PAYLOAD_BYTES = 12 \* 1024 \* 1024/);
});

test("アカウント選択ゲートと管理画面の双方に保全UIを提供する", () => {
  assert.equal((ui.match(/h\(window\.LBTCloudBackupPanel \|\| "div"/g) || []).length, 2);
  assert.match(html, /assets\/cloud-backup\.css\?v=[a-f0-9]{8}/);
  assert.match(html, /js\/cloud-backup\.js\?v=[a-f0-9]{8}/);
  assert.ok(html.indexOf("js/state.js") < html.indexOf("js/cloud-backup.js"));
  assert.ok(html.indexOf("js/cloud-backup.js") < html.indexOf("js/accounts-ui.js"));
});

test("復旧キーは不変で、再発行APIを公開せず、保存先間の複製を許可する", () => {
  assert.doesNotMatch(client, /rotateRecoveryKey|rotate_recovery|復旧キーを再発行/);
  assert.doesNotMatch(recovery, /rotate_recovery|newRecoveryKey/);
  assert.doesNotMatch(fallbackWorker, /rotate_recovery|newRecoveryKey/);
  assert.match(client, /async function getRemote\(options = \{\}\)/);
  assert.match(client, /同じ世代に異なるデータがあります/);
  assert.match(recovery, /action === "replicate"/);
  assert.match(fallbackWorker, /action === "replicate"/);
});

test("復旧キーだけでの保管庫作成にはレート制限を設ける", () => {
  assert.match(recovery, /async function enforceRecoveryCreateLimit\(req: Request\)/);
  assert.match(recovery, /p_limit: 10/);
  assert.match(recovery, /async function handle\(body: any, req: Request\)/);
  assert.match(migration, /lbt_consume_recovery_rate_limit/);
  assert.match(anonymousMigration, /lbt_account_recovery_rate_limits_service_role/);
  assert.match(anonymousMigration, /for all to service_role/);
});

test("復旧キーはデータ更新・履歴復元で失効せず、同じキーから最新版を取得できる", () => {
  const updateBlock = recovery.slice(recovery.indexOf("async function updateVault"), recovery.indexOf("async function handle"));
  assert.match(recovery, /recovery_hash=eq/);
  assert.match(recovery, /async function getVaultByHash\(hash: string\)/);
  assert.doesNotMatch(updateBlock, /recovery_hash\s*:/);
  assert.match(updateBlock, /payload_hash: payloadHash/);
  assert.match(updateBlock, /revision: currentRevision \+ 1/);
  assert.match(updateBlock, /async function updateVault/);
  assert.match(client, /復旧キーはデータ更新・同期・世代変更・保存先切替で変化しません/);
  assert.match(client, /const result = await callRecovery\(\{ action: "backup", expectedRevision, payload, recoveryKey: key \}\)/);
  assert.match(client, /async function restoreRevision\(revision\)[\s\S]*?recoveryKey: key/);
  assert.doesNotMatch(client, /startOAuth|handleOAuthCallback|access_token|Googleと連携|Xと連携/);
});

test("DB移行SQLの関数・トリガーが完結しており、レート制限関数の実行権限を制限する", () => {
  assert.equal((migration.match(/\$\$/g) || []).length % 2, 0);
  assert.match(migration, /create or replace function public\.lbt_consume_recovery_rate_limit/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.lbt_consume_recovery_rate_limit\(text, integer, integer\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.lbt_consume_recovery_rate_limit\(text, integer, integer\) to service_role/i);
  assert.match(migration, /create trigger lbt_prepare_vaults_before_auth_user_delete/i);
});


test("オンライン保管庫テーブルをブラウザーから直接アクセスできず、Edge Function経由に限定する", () => {
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vaults_select_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vaults_insert_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vaults_update_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vaults_delete_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vault_versions_select_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vault_versions_insert_own/i);
  assert.match(hardeningMigration, /drop policy if exists lbt_account_vault_versions_delete_own/i);
  assert.match(doc, /20261025212903_lbt_account_vault_access_hardening\.sql/);
});


test("オンライン保全UIはGoogle/Xではなく復旧キーだけに一本化する", () => {
  assert.match(client, /button\("復旧キーを発行して保全", \(\) => run\(createRecoveryKey\), "is-primary"\)/);
  assert.match(client, /h\("label", \{ htmlFor: "lbt-cloud-recovery-key" \}, "復旧キーからクラウドを復元"\)/);
  assert.match(client, /復旧キー方式/);
  assert.doesNotMatch(client, /startOAuth|handleOAuthCallback|Googleと連携|Xと連携|signInWithOAuth/);
  assert.doesNotMatch(client, /古いキーは無効化|キーを再発行した場合/);
  assert.match(client, /復旧キー自体は保存せずハッシュのみを保持します/);
  assert.match(doc, /GoogleアカウントやXアカウントとの連携は実装しません/);
  assert.match(doc, /復旧キーは初回発行後、利用者の操作・データ更新・履歴復元・保存先切替によって変化しません/);
});

test("端末内JSONバックアップはクラウド12MB上限と分離し、100MBまで扱える", () => {
  assert.match(client, /const MAX_LOCAL_BYTES = 12 \* 1024 \* 1024/);
  assert.match(client, /const MAX_JSON_BACKUP_BYTES = 100 \* 1024 \* 1024/);
  assert.match(client, /function collectLocalSnapshot\(\{ enforceCloudLimit = true \} = \{\}\)/);
  assert.match(client, /function validateSnapshot\(payload, \{ enforceCloudLimit = true \} = \{\}\)/);
  assert.match(client, /collectLocalSnapshot\(\{ enforceCloudLimit: false \}\)/);
  assert.match(client, /validateSnapshot\(payload, \{ enforceCloudLimit: false \}\)/);
  assert.match(client, /applySnapshot\(payload, \{ enableSync: false, enforceCloudLimit: false \}\)/);
  assert.match(client, /Number\(file\.size\) > MAX_JSON_BACKUP_BYTES/);
  assert.match(client, /async function restorePayload\(payload, revision, recoveryKey = null\)[\s\S]*?collectLocalSnapshot\(\{ enforceCloudLimit: false \}\)/);
  assert.match(client, /downloadText\("LBT_" \+ suffix \+ "_" \+ date \+ "\.json", JSON\.stringify\(value\)\)/);
});

test("保全APIはOAuthセッションではなく復旧キーのみを受け付ける", () => {
  assert.match(recovery, /async function getVaultForRequest\(body: any\)/);
  assert.match(recovery, /const key = normalizeRecoveryKey\(body\.recoveryKey\)/);
  assert.doesNotMatch(recovery, /verifiedUser|accessToken|rotate_recovery|newRecoveryKey|\/auth\/v1\/user/);
  assert.match(anonymousMigration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.equal((anonymousMigration.match(/coalesce\(\(select auth\.jwt\(\) ->> 'is_anonymous'\), 'false'\) <> 'true'/g) || []).length, 8);
  assert.match(anonymousMigration, /lbt_account_recovery_rate_limits_service_role/);
  assert.match(anonymousMigration, /for all to service_role/);
});


test("Cloudflareの独立保管先は12MiBのチャンク保存・10世代履歴・アクセス集計を備える", () => {
  assert.match(fallbackWorker, /MAX_PAYLOAD_BYTES = 12 \* 1024 \* 1024/);
  assert.match(fallbackWorker, /CHUNK_CHARS = 350000/);
  assert.match(fallbackWorker, /HISTORY_LIMIT = 10/);
  assert.match(fallbackSchema, /CREATE TABLE IF NOT EXISTS vault_chunks/);
  assert.match(fallbackSchema, /CREATE TABLE IF NOT EXISTS vault_version_chunks/);
  assert.match(fallbackSchema, /CREATE TABLE IF NOT EXISTS site_counters/);
  assert.match(fallbackWorker, /\/api\/stats\/view/);
  assert.match(fallbackWorker, /payload_hash/);
  assert.match(fallbackWorker, /history: \(ancestors\.results/);
  assert.match(recovery, /history: lineage\.map/);
  assert.match(recovery, /payload_hash: payloadHash/);
});

test("アクセスカウンターはアプリ本体・共有ページに設置し、個人識別子をローカル保存しない", () => {
  assert.match(html, /js\/access-counter\.js\?v=[a-f0-9]{8}/);
  assert.match(shareHtml, /js\/access-counter\.js\?v=[a-f0-9]{8}/);
  assert.match(accessCounter, /総アクセス/);
  assert.doesNotMatch(accessCounter, /\b(?:localStorage|sessionStorage|document\.cookie)\s*[.\[]/);
  assert.match(fallbackWorker, /INSERT INTO site_counters \(name, value\) VALUES \('total_views', 1\)/);
  assert.doesNotMatch(fallbackWorker, /pageViews/);
});
