// LBT optional account backup/recovery endpoint.
// This function is intentionally public at the transport level (verify_jwt=false) so
// recovery-key-only users can restore data. Every request is authorized by either a
// verified Supabase access token or a 256-bit user-held recovery key.
// Never return or accept a Supabase service key from the client.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const VAULT = "lbt_account_vaults";
const VERSIONS = "lbt_account_vault_versions";
const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;
const MAX_ENTRIES = 1500;
const HISTORY_LIMIT = 10;
const ALLOWED_PREFIXES = ["lbt_account_", "lbt_accounts_", "lbt_epoch_account_"];

function json(data: unknown, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type",
      "vary": "Origin"
    }
  });
}

function normalizeRecoveryKey(value: unknown): string {
  const key = String(value ?? "").trim();
  if (!/^LBT1-[A-Za-z0-9_-]{40,50}$/.test(key)) {
    throw new Error("復旧キーの形式が正しくありません。");
  }
  return key;
}

async function hashRecoveryKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validatePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("バックアップデータの形式が正しくありません。");
  }
  const encoded = JSON.stringify(payload);
  if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error("バックアップが大きすぎます（上限12MB）。画像を減らすか、JSONファイルで保存してください。");
  }
  const entries = (payload as Record<string, unknown>).entries;
  if ((payload as Record<string, unknown>).format !== "lbt-account-backup"
      || (payload as Record<string, unknown>).version !== 1
      || !Array.isArray(entries)
      || entries.length > MAX_ENTRIES) {
    throw new Error("LBTのバックアップ形式が一致しません。");
  }
  for (const item of entries) {
    if (!item || typeof item !== "object") throw new Error("バックアップ項目を確認できません。");
    const key = String((item as Record<string, unknown>).key ?? "");
    const value = (item as Record<string, unknown>).value;
    const allowed = key === "lbt_v46_state"
      || key.startsWith("lbt_v46_state.backup.")
      || key.startsWith("lbt_v46_state.corrupt.")
      || key === "lbt_accounts_index"
      || key === "lbt_account_active"
      || key === "lbt_accounts_icons"
      || (key.startsWith("lbt_account_") && key !== "lbt_account_active" && !key.startsWith("lbt_cloud_"))
      || key.startsWith("lbt_epoch_account_");
    if (!allowed || typeof value !== "string") throw new Error("バックアップに許可されていない保存キーがあります。");
  }
  return payload as Record<string, unknown>;
}

async function rest(table: string, method: string, query = "", body?: unknown, prefer = "return=representation") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      "apikey": SERVICE_KEY,
      "authorization": `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      "accept": "application/json",
      "prefer": prefer
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let value: any = null;
  try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  if (!response.ok) {
    const error = new Error(typeof value === "object" ? String(value?.message ?? value?.details ?? response.statusText) : String(value));
    (error as any).status = response.status;
    throw error;
  }
  return value;
}

async function verifiedUser(accessToken: string): Promise<string> {
  if (!accessToken || !PUBLIC_KEY) throw new Error("ログインセッションを確認できません。もう一度ログインしてください。");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": PUBLIC_KEY, "authorization": `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error("ログインの有効期限が切れています。もう一度ログインしてください。");
  const user = await response.json();
  if (!user?.id) throw new Error("ログインユーザーを確認できません。");
  return String(user.id);
}

async function getVaultByHash(hash: string) {
  const rows = await rest(VAULT, "GET", `select=id,user_id,recovery_hash,payload,revision,updated_at,created_at&recovery_hash=eq.${hash}&limit=1`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function getVaultByUser(userId: string) {
  const rows = await rest(VAULT, "GET", `select=id,user_id,recovery_hash,payload,revision,updated_at,created_at&user_id=eq.${userId}&limit=1`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function getVaultForRequest(body: any, accessToken: string) {
  if (accessToken) {
    const userId = await verifiedUser(accessToken);
    return { userId, vault: await getVaultByUser(userId), hash: null };
  }
  const key = normalizeRecoveryKey(body.recoveryKey);
  const hash = await hashRecoveryKey(key);
  return { userId: null, vault: await getVaultByHash(hash), hash };
}

async function addHistory(vault: any) {
  if (!vault?.id || !vault?.payload || !vault?.revision) return;
  await rest(VERSIONS, "POST", "on_conflict=vault_id,revision", {
    vault_id: vault.id,
    user_id: vault.user_id,
    revision: Number(vault.revision),
    payload: vault.payload
  }, "resolution=ignore-duplicates,return=minimal");
  const older = await rest(VERSIONS, "GET",
    `select=id,revision&vault_id=eq.${vault.id}&order=revision.desc&offset=${HISTORY_LIMIT}&limit=1000`);
  if (Array.isArray(older) && older.length) {
    const ids = older.map((item: any) => String(item.id)).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));
    if (ids.length) {
      const inList = `(${ids.join(",")})`;
      await rest(VERSIONS, "DELETE", `id=in.${encodeURIComponent(inList)}`, undefined, "return=minimal");
    }
  }
}

async function createVault(userId: string | null, recoveryHash: string | null, payload: Record<string, unknown>) {
  const rows = await rest(VAULT, "POST", "select=id,user_id,recovery_hash,payload,revision,updated_at,created_at", {
    user_id: userId,
    recovery_hash: recoveryHash,
    payload,
    revision: 1,
    updated_at: new Date().toISOString()
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error("バックアップ領域を作成できませんでした。");
  return rows[0];
}

async function updateVault(vault: any, payload: Record<string, unknown>, expectedRevision: number) {
  const currentRevision = Number(vault?.revision ?? 0);
  if (!vault || !Number.isSafeInteger(expectedRevision) || expectedRevision !== currentRevision) {
    return { conflict: true, vault };
  }
  await addHistory(vault);
  const rows = await rest(VAULT, "PATCH",
    `id=eq.${vault.id}&revision=eq.${currentRevision}&select=id,user_id,recovery_hash,payload,revision,updated_at,created_at`,
    { payload, revision: currentRevision + 1, updated_at: new Date().toISOString() });
  if (!Array.isArray(rows) || !rows[0]) {
    const latest = vault.user_id ? await getVaultByUser(String(vault.user_id)) :
      (vault.recovery_hash ? await getVaultByHash(String(vault.recovery_hash)) : null);
    return { conflict: true, vault: latest };
  }
  return { conflict: false, vault: rows[0] };
}

async function handle(body: any, accessToken: string) {
  const action = String(body?.action ?? "");
  if (!["get", "backup", "create_recovery", "history", "restore_revision"].includes(action)) {
    throw new Error("未対応の操作です。");
  }

  if (action === "create_recovery") {
    const payload = validatePayload(body.payload);
    const key = normalizeRecoveryKey(body.recoveryKey);
    const hash = await hashRecoveryKey(key);
    const userId = accessToken ? await verifiedUser(accessToken) : null;
    let vault = userId ? await getVaultByUser(userId) : await getVaultByHash(hash);
    if (userId && vault?.recovery_hash && vault.recovery_hash !== hash) {
      throw new Error("このアカウントには既に復旧キーがあります。既存キーを保管したうえで利用してください。");
    }
    /* 復旧キーだけで先に保全した利用者が、後からGoogle/X連携を追加できる。
       ユーザーIDの所有確認後、未連携の保管庫だけを結びつける。 */
    if (!vault && userId) {
      const occupied = await getVaultByHash(hash);
      if (occupied) {
        if (occupied.user_id && String(occupied.user_id) !== userId) {
          throw new Error("この復旧キーは別のオンラインアカウントに結びついています。");
        }
        if (!occupied.user_id) {
          const existingForUser = await getVaultByUser(userId);
          if (existingForUser) throw new Error("このオンラインアカウントには別の保全データがあります。先にクラウドの内容を確認してください。");
          const attached = await rest(VAULT, "PATCH",
            `id=eq.${occupied.id}&user_id=is.null&select=id,user_id,recovery_hash,payload,revision,updated_at,created_at`,
            { user_id: userId });
          vault = Array.isArray(attached) && attached[0] ? attached[0] : await getVaultByHash(hash);
        } else {
          vault = occupied;
        }
      }
    }
    if (!vault) {
      vault = await createVault(userId, hash, payload);
    } else if (!vault.recovery_hash && userId) {
      const rows = await rest(VAULT, "PATCH", `id=eq.${vault.id}&select=id,user_id,recovery_hash,payload,revision,updated_at,created_at`,
        { recovery_hash: hash });
      vault = rows?.[0] ?? vault;
    }
    if (JSON.stringify(vault.payload) !== JSON.stringify(payload)) {
      const result = await updateVault(vault, payload, Number(vault.revision));
      if (result.conflict) return { conflict: true, revision: result.vault?.revision, message: "オンラインデータが同時に更新されています。最新状態を読み直してください。" };
      vault = result.vault;
    }
    return { ok: true, revision: Number(vault.revision), updatedAt: vault.updated_at };
  }

  const { userId, vault, hash } = await getVaultForRequest(body, accessToken);
  if (!vault) {
    if (action === "backup" && Number(body.expectedRevision) === 0) {
      const payload = validatePayload(body.payload);
      const created = await createVault(userId, hash, payload);
      return { found: true, revision: Number(created.revision), updatedAt: created.updated_at };
    }
    return { found: false, revision: 0, payload: null };
  }

  if (action === "get") {
    return { found: true, revision: Number(vault.revision), payload: vault.payload, updatedAt: vault.updated_at, recoveryKeyEnabled: Boolean(vault.recovery_hash) };
  }

  if (action === "history") {
    const rows = await rest(VERSIONS, "GET",
      `select=revision,payload,saved_at&vault_id=eq.${vault.id}&order=revision.desc&limit=${HISTORY_LIMIT}`);
    return { found: true, revision: Number(vault.revision), updatedAt: vault.updated_at, history: rows ?? [] };
  }

  if (action === "restore_revision") {
    const wanted = Number(body.revision);
    if (!Number.isSafeInteger(wanted) || wanted < 1) throw new Error("復元する世代を選んでください。");
    const rows = await rest(VERSIONS, "GET",
      `select=revision,payload&vault_id=eq.${vault.id}&revision=eq.${wanted}&limit=1`);
    const previous = Array.isArray(rows) ? rows[0] : null;
    if (!previous) throw new Error("その世代は保管されていません。");
    const result = await updateVault(vault, validatePayload(previous.payload), Number(vault.revision));
    if (result.conflict) return { conflict: true, revision: result.vault?.revision };
    return { found: true, revision: Number(result.vault.revision), payload: result.vault.payload, updatedAt: result.vault.updated_at };
  }

  const payload = validatePayload(body.payload);
  const expectedRevision = Number(body.expectedRevision);
  const result = await updateVault(vault, payload, expectedRevision);
  if (result.conflict) return { conflict: true, revision: Number(result.vault?.revision ?? 0), payload: result.vault?.payload ?? null, updatedAt: result.vault?.updated_at ?? null };
  return { found: true, revision: Number(result.vault.revision), updatedAt: result.vault.updated_at };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "*";
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) return json({ error: "バックアップサービスの設定が不足しています。" }, 503, origin);
  try {
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_PAYLOAD_BYTES + 1024 * 100) return json({ error: "リクエストが大きすぎます。" }, 413, origin);
    const body = await req.json();
    const accessToken = String(req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const result = await handle(body, accessToken);
    if ((result as any).conflict) return json({ ...result, error: "同期先が別の内容に更新されています。データを比較してから再試行してください。" }, 409, origin);
    return json(result, 200, origin);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    return json({ error: error instanceof Error ? error.message : "バックアップ処理に失敗しました。" }, status >= 400 && status < 500 ? status : 500, origin);
  }
});
