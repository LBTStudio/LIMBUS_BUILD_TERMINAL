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
const recovery = read("supabase/functions/lbt-account-recovery/index.ts");

test("オンライン保全は任意で、初期化・ローカル保存のみではアップロードしない", () => {
  assert.match(client, /オンライン保全は未設定です/);
  assert.match(client, /function scheduleSync\(\)[\s\S]*?readStorage\(ENABLED_KEY\) !== "1"/);
  assert.match(client, /function setEnabled\(enabled\)/);
  assert.match(client, /window\.LBTCloudBackupPanel = CloudBackupPanel/);
  assert.match(ui, /window\.LBTCloudBackupPanel/);
  assert.match(client, /連携は必須ではありません/);
});

test("クラウドへ送るスナップショットはアカウント保存キーに限定し、認証・復旧キーを含めない", () => {
  assert.match(client, /function isBackupStorageKey\(key\)/);
  assert.match(client, /!key\.startsWith\("lbt_cloud_"\)/);
  assert.match(client, /function collectLocalSnapshot\(\)/);
  assert.match(client, /format: "lbt-account-backup"/);
  assert.match(client, /function validateSnapshot\(payload\)/);
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

test("復旧キーの再発行は以前のキーを明示的に無効化し、保全データを上書きしない", () => {
  assert.match(client, /async function rotateRecoveryKey\(\)/);
  assert.match(client, /以前の復旧キーは無効になり/);
  assert.match(client, /action: "rotate_recovery"/);
  assert.match(client, /const payload = hasExistingCloud \? existing\.payload : localPayload/);
  assert.match(recovery, /if \(action === "rotate_recovery"\)/);
  assert.match(recovery, /const occupied = await getVaultByHash\(hash\)/);
});

test("復旧キーによる保全は匿名の新規保管庫作成をレート制限し、Auth削除時も復旧可能な保管庫を残す", () => {
  assert.match(recovery, /async function enforceAnonymousCreateLimit\(req: Request\)/);
  assert.match(recovery, /p_limit: 10/);
  assert.match(recovery, /handle\(body, accessToken, req\)/);
  assert.match(migration, /lbt_consume_recovery_rate_limit/);
  assert.match(migration, /lbt_prepare_vaults_before_auth_user_delete/);
  assert.match(migration, /recovery_hash is null/);
  assert.match(migration, /recovery_hash is not null/);
  assert.match(migration, /on delete set null/i);
});

test("復旧キーの登録は既存クラウド内容を上書きせず、別の保管庫との誤連結を拒否する", () => {
  const createBlock = recovery.slice(
    recovery.indexOf('if (action === "create_recovery")'),
    recovery.indexOf('const { userId, vault, hash }')
  );
  assert.doesNotMatch(createBlock, /updateVault\(vault, payload/);
  assert.match(createBlock, /vaultByUser && vaultByKey && vaultByUser\.id !== vaultByKey\.id/);
  assert.match(createBlock, /Registering a recovery key is an identity operation, not a backup write/);
  assert.match(client, /この端末の復旧キーは、ログイン中のGoogleとは別の保全データを指しています/);
  assert.match(client, /async function unlinkRecoveryKeyLocally\(\)/);
  assert.match(client, /async function syncAutomatically\(\)[\s\S]*?current\.recoveryKeyMatches === false[\s\S]*?自動同期を停止しました/);
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


test("Google OAuth only starts when Supabase reports the provider enabled; X remains disabled", () => {
  assert.match(client, /async function fetchAuthProviderSettings\(\)/);
  assert.match(client, /settings\.external\.google !== "boolean"/);
  assert.match(client, /if \(provider !== "google"\)/);
  assert.match(client, /url\.searchParams\.set\("scopes", "openid email profile"\)/);
  assert.match(client, /await refreshProviderAvailability\(\)/);
  assert.match(client, /const googleReady = view\.googleProviderStatus === "enabled"/);
  assert.match(client, /button\(googleButtonLabel, \(\) => run\(\(\) => startOAuth\("google"\)\), "is-primary", !googleReady\)/);
  assert.match(client, /button\("Xと連携（未実装）", \(\) => \{\}, "", true\)/);
  assert.match(client, /Google連携のコードは実装済みですが、Supabase側のGoogleプロバイダー設定が未完了です/);
  assert.doesNotMatch(client, /button\("Googleと連携（未実装）"/);
  assert.match(cloudCss, /\.lbt-cloud-btn:disabled \{ opacity: \.6; cursor: not-allowed; \}/);
  assert.match(doc, /Googleの基本的なOAuthログイン設定自体は無料で可能/);
  assert.match(doc, /X APIの利用料金/);
});;
