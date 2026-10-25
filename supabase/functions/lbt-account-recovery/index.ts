// LBT optional account backup/recovery endpoint.
// This function is intentionally public at the transport level (verify_jwt=false) so
// recovery-key-only users can restore data. Every request is authorized only by a
// high-entropy user-held recovery key; OAuth sessions are not accepted.
// Never return or accept a Supabase service key from the client.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

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
      "access-control-allow-headers": "apikey, content-type",
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

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const entries = Array.isArray(payload.entries)
    ? (payload.entries as Array<Record<string, unknown>>).slice()
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((item) => [item.key, item.value])
    : [];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entries)));
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
  const seenKeys = new Set<string>();
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
    if (seenKeys.has(key)) throw new Error("バックアップ内で保存キーが重複しています。");
    seenKeys.add(key);
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

async function enforceRecoveryCreateLimit(req: Request) {
  const forwarded = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]
    ?? "unknown";
  const ip = String(forwarded).trim().slice(0, 200) || "unknown";
  const digest = await hashRecoveryKey("LBT-account-recovery-create:" + ip);
  const allowed = await rest("rpc/lbt_consume_recovery_rate_limit", "POST", "", {
    p_ip_digest: digest,
    p_limit: 10,
    p_window_seconds: 3600
  });
  if (allowed !== true) {
    const error = new Error("この接続元からの復旧データ作成が多すぎます。1時間ほど空けてから再試行してください。");
    (error as any).status = 429;
    throw error;
  }
}

async function getVaultByHash(hash: string) {
  const rows = await rest(VAULT, "GET", `select=id,user_id,recovery_hash,payload,payload_hash,revision,updated_at,created_at&recovery_hash=eq.${hash}&limit=1`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function getVaultMetaByHash(hash: string) {
  const rows = await rest(VAULT, "GET", `select=id,user_id,recovery_hash,payload_hash,revision,updated_at,created_at&recovery_hash=eq.${hash}&limit=1`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function getVaultForRequest(body: any) {
  const key = normalizeRecoveryKey(body.recoveryKey);
  const hash = await hashRecoveryKey(key);
  return { vault: await getVaultByHash(hash), hash };
}

async function addHistory(vault: any) {
  if (!vault?.id || !vault?.payload || !vault?.revision) return;
  const payloadHash = String(vault.payload_hash || await hashPayload(vault.payload));
  await rest(VERSIONS, "POST", "on_conflict=vault_id,revision", {
    vault_id: vault.id,
    user_id: vault.user_id,
    revision: Number(vault.revision),
    payload: vault.payload,
    payload_hash: payloadHash
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

async function createVault(userId: string | null, recoveryHash: string | null, payload: Record<string, unknown>, revision = 1) {
  const payloadHash = await hashPayload(payload);
  const rows = await rest(VAULT, "POST", "select=id,user_id,recovery_hash,payload,payload_hash,revision,updated_at,created_at", {
    user_id: userId,
    recovery_hash: recoveryHash,
    payload,
    payload_hash: payloadHash,
    revision,
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
  const payloadHash = await hashPayload(payload);
  const rows = await rest(VAULT, "PATCH",
    `id=eq.${vault.id}&revision=eq.${currentRevision}&select=id,user_id,recovery_hash,payload,payload_hash,revision,updated_at,created_at`,
    { payload, payload_hash: payloadHash, revision: currentRevision + 1, updated_at: new Date().toISOString() });
  if (!Array.isArray(rows) || !rows[0]) {
    const latest = vault.recovery_hash ? await getVaultByHash(String(vault.recovery_hash)) : null;
    return { conflict: true, vault: latest };
  }
  return { conflict: false, vault: rows[0] };
}

async function handle(body: any, req: Request) {
  const action = String(body?.action ?? "");
  if (!["head", "get", "backup", "create_recovery", "replicate", "history", "restore_revision"].includes(action)) {
    throw new Error("未対応の操作です。復旧キーは固定されており、サーバー側から変更する操作はありません。");
  }

  if (action === "create_recovery") {
    const payload = validatePayload(body.payload);
    const key = normalizeRecoveryKey(body.recoveryKey);
    const hash = await hashRecoveryKey(key);
    const existing = await getVaultByHash(hash);
    if (existing) {
      throw new Error("この復旧キーは既に保全データに使われています。既存データを上書きせず、復旧キー欄から復元してください。");
    }
    await enforceRecoveryCreateLimit(req);
    const vault = await createVault(null, hash, payload);
    return { ok: true, revision: Number(vault.revision), updatedAt: vault.updated_at };
  }

  if (action === "head") {
    const key = normalizeRecoveryKey(body.recoveryKey);
    const hash = await hashRecoveryKey(key);
    const meta = await getVaultMetaByHash(hash);
    if (!meta) return { found: false, revision: 0, payloadHash: null, history: [] };
    let payloadHash = String(meta.payload_hash || "");
    if (!payloadHash) {
      const legacy = await getVaultByHash(hash);
      if (legacy?.payload) payloadHash = await hashPayload(legacy.payload);
    }
    const historyRows = await rest(VERSIONS, "GET",
      `select=revision,payload_hash&vault_id=eq.${meta.id}&order=revision.desc&limit=${HISTORY_LIMIT}`);
    const lineage = Array.isArray(historyRows) ? historyRows : [];
    const missingHashes = lineage.filter((item: any) => !String(item.payload_hash || ""));
    if (missingHashes.length) {
      const revisions = missingHashes.map((item: any) => Number(item.revision)).filter((n: number) => Number.isSafeInteger(n) && n > 0);
      if (revisions.length) {
        const rows = await rest(VERSIONS, "GET",
          `select=revision,payload&vault_id=eq.${meta.id}&revision=in.(${revisions.join(",")})&limit=${revisions.length}`);
        if (Array.isArray(rows)) {
          const byRevision = new Map(rows.map((item: any) => [Number(item.revision), item]));
          for (const item of missingHashes) {
            const legacy = byRevision.get(Number(item.revision));
            if (legacy?.payload) item.payload_hash = await hashPayload(legacy.payload);
          }
        }
      }
    }
    return {
      found: true,
      revision: Number(meta.revision),
      updatedAt: meta.updated_at,
      payloadHash: payloadHash || null,
      history: lineage.map((item: any) => ({
        revision: Number(item.revision),
        payloadHash: String(item.payload_hash || "")
      }))
    };
  }

  const { vault, hash } = await getVaultForRequest(body);
  if (!vault) {
    if (action === "backup" && Number(body.expectedRevision) === 0) {
      const payload = validatePayload(body.payload);
      await enforceRecoveryCreateLimit(req);
      const created = await createVault(null, hash, payload);
      return { found: true, revision: Number(created.revision), updatedAt: created.updated_at };
    }
    if (action === "replicate" && Number(body.expectedRevision) === 0) {
      const payload = validatePayload(body.payload);
      const targetRevision = Number(body.targetRevision);
      if (!Number.isSafeInteger(targetRevision) || targetRevision < 1) throw new Error("複製先の世代番号が不正です。");
      await enforceRecoveryCreateLimit(req);
      const created = await createVault(null, hash, payload, targetRevision);
      return { found: true, revision: Number(created.revision), updatedAt: created.updated_at };
    }
    return { found: false, revision: 0, payload: null };
  }

  if (action === "get") {
    let recoveryKeyMatches: boolean | null = null;
    if (body.recoveryKey) {
      const requestKeyHash = await hashRecoveryKey(normalizeRecoveryKey(body.recoveryKey));
      recoveryKeyMatches = Boolean(vault.recovery_hash) && vault.recovery_hash === requestKeyHash;
    }
    return { found: true, revision: Number(vault.revision), payload: vault.payload, payloadHash: String(vault.payload_hash || await hashPayload(vault.payload)), updatedAt: vault.updated_at, recoveryKeyEnabled: Boolean(vault.recovery_hash), recoveryKeyMatches };
  }

  if (action === "history") {
    const rows = await rest(VERSIONS, "GET",
      `select=revision,payload_hash,saved_at&vault_id=eq.${vault.id}&order=revision.desc&limit=${HISTORY_LIMIT}`);
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

  if (action === "replicate") {
    const payload = validatePayload(body.payload);
    const expectedRevision = Number(body.expectedRevision);
    const targetRevision = Number(body.targetRevision);
    const currentRevision = Number(vault.revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        !Number.isSafeInteger(targetRevision) || targetRevision < 1) {
      throw new Error("複製する世代番号が不正です。");
    }
    if (currentRevision === targetRevision) {
      if (String(vault.payload_hash || await hashPayload(vault.payload)) === await hashPayload(payload)) {
        return { found: true, revision: currentRevision, updatedAt: vault.updated_at, payloadHash: await hashPayload(payload), unchanged: true };
      }
      return { conflict: true, revision: currentRevision, payload: vault.payload, updatedAt: vault.updated_at };
    }
    if (currentRevision !== expectedRevision || targetRevision <= expectedRevision) {
      return { conflict: true, revision: currentRevision, payload: vault.payload, updatedAt: vault.updated_at };
    }
    await addHistory(vault);
    const rows = await rest(VAULT, "PATCH",
      `id=eq.${vault.id}&revision=eq.${expectedRevision}&recovery_hash=eq.${hash}&select=id,revision,updated_at,payload`,
      { payload, payload_hash: await hashPayload(payload), revision: targetRevision, updated_at: new Date().toISOString() });
    if (!Array.isArray(rows) || !rows[0]) {
      const latest = await getVaultByHash(hash);
      return { conflict: true, revision: Number(latest?.revision ?? 0), payload: latest?.payload ?? null, updatedAt: latest?.updated_at ?? null };
    }
    return { found: true, revision: Number(rows[0].revision), payloadHash: await hashPayload(payload), updatedAt: rows[0].updated_at };
  }

  const payload = validatePayload(body.payload);
  const expectedRevision = Number(body.expectedRevision);
  const result = await updateVault(vault, payload, expectedRevision);
  if (result.conflict) return { conflict: true, revision: Number(result.vault?.revision ?? 0), payload: result.vault?.payload ?? null, updatedAt: result.vault?.updated_at ?? null };
  return { found: true, revision: Number(result.vault.revision), payloadHash: String(result.vault.payload_hash || await hashPayload(payload)), updatedAt: result.vault.updated_at };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "*";
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "バックアップサービスの設定が不足しています。" }, 503, origin);
  try {
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_PAYLOAD_BYTES + 1024 * 100) return json({ error: "リクエストが大きすぎます。" }, 413, origin);
    const body = await req.json();
    const result = await handle(body, req);
    if ((result as any).conflict) return json({ ...result, error: "同期先が別の内容に更新されています。データを比較してから再試行してください。" }, 409, origin);
    return json(result, 200, origin);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    return json({ error: error instanceof Error ? error.message : "バックアップ処理に失敗しました。" }, status >= 400 && status < 500 ? status : 500, origin);
  }
});
