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
const migration = read("supabase/migrations/202610260001_lbt_account_vaults.sql");
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
  assert.match(recovery, /async function addHistory\(vault\)/);
  assert.match(recovery, /const HISTORY_LIMIT = 10/);
});

test("バックアップテーブルは所有者単位のRLSで保護される", () => {
  assert.match(migration, /alter table public\.lbt_account_vaults enable row level security/i);
  assert.match(migration, /alter table public\.lbt_account_vault_versions enable row level security/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.lbt_account_vaults from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.lbt_account_vaults to authenticated/i);
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
  assert.match(client, /古いキーは無効になり/);
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
