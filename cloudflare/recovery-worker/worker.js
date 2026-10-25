/**
 * LBT recovery failover + privacy-minimal page-view counter.
 * Deploy only after creating the D1 database and setting its ID in wrangler.toml.
 * Does not call Supabase: it is an independent fallback provider.
 */
const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;
const MAX_ENTRIES = 1500;
const HISTORY_LIMIT = 10;
const CHUNK_CHARS = 350000; // <= 1.05 MB UTF-8 even for Japanese text.
const ALLOWED_ORIGINS = new Set([
  "https://lbtstudio.github.io",
  "https://lbt-garasumado.vercel.app"
]);

function response(data, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
    "x-content-type-options": "nosniff"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  else if (!origin) headers["access-control-allow-origin"] = "*";
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

function corsOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return "";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function jsonError(message, status) {
  const error = new Error(message);
  error.status = status || 400;
  return error;
}

function normalizeKey(value) {
  const key = String(value || "").trim();
  if (!/^LBT1-[A-Za-z0-9_-]{40,50}$/.test(key)) {
    throw jsonError("復旧キーの形式が正しくありません。", 400);
  }
  return key;
}

async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPayload(payload) {
  const entries = (payload.entries || []).slice()
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .map((item) => [item.key, item.value]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entries)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || payload.format !== "lbt-account-backup" || payload.version !== 1
      || !Array.isArray(payload.entries) || payload.entries.length > MAX_ENTRIES) {
    throw jsonError("LBTのバックアップ形式が一致しません。", 400);
  }
  const encoded = JSON.stringify(payload);
  if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) {
    throw jsonError("バックアップが大きすぎます（上限12MB）。", 413);
  }
  const seen = new Set();
  for (const entry of payload.entries) {
    if (!entry || typeof entry.key !== "string" || typeof entry.value !== "string") {
      throw jsonError("バックアップ項目の形式が正しくありません。", 400);
    }
    const key = entry.key;
    const allowed = key === "lbt_v46_state"
      || key.startsWith("lbt_v46_state.backup.")
      || key.startsWith("lbt_v46_state.corrupt.")
      || key === "lbt_accounts_index"
      || key === "lbt_account_active"
      || key === "lbt_accounts_icons"
      || (key.startsWith("lbt_account_") && key !== "lbt_account_active"
        && key !== "lbt_accounts_icons" && !key.startsWith("lbt_cloud_"))
      || key.startsWith("lbt_epoch_account_");
    if (!allowed || seen.has(key)) throw jsonError("バックアップに許可されていない項目、または重複キーがあります。", 400);
    seen.add(key);
  }
  return payload;
}

function splitText(value) {
  const chunks = [];
  for (let offset = 0; offset < value.length;) {
    let end = Math.min(offset + CHUNK_CHARS, value.length);
    if (end < value.length) {
      const last = value.charCodeAt(end - 1);
      if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
    }
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  return chunks;
}

async function throttle(binding, key, limit, period) {
  if (!binding || typeof binding.limit !== "function") return;
  const result = await binding.limit({ key, limit, period });
  if (!result.success) throw jsonError("操作が多すぎます。少し待ってから再試行してください。", 429);
}

async function getManifest(db, hash) {
  return await db.prepare(
    "SELECT recovery_hash, revision, updated_at, payload_bytes, chunk_count, payload_hash, write_token FROM vaults WHERE recovery_hash = ?"
  ).bind(hash).first();
}

async function getChunks(db, hash, revision, history) {
  const table = history ? "vault_version_chunks" : "vault_chunks";
  const rows = await db.prepare(
    "SELECT chunk_index, chunk_text FROM " + table + " WHERE recovery_hash = ? AND revision = ? ORDER BY chunk_index"
  ).bind(hash, revision).all();
  return rows.results || [];
}

async function getPayload(db, hash, revision, history) {
  const rows = await getChunks(db, hash, revision, history);
  if (!rows.length) throw jsonError("バックアップのデータ断片が見つかりません。", 500);
  let encoded = "";
  for (let i = 0; i < rows.length; i += 1) {
    if (Number(rows[i].chunk_index) !== i) throw jsonError("バックアップのデータ断片が欠落しています。", 500);
    encoded += rows[i].chunk_text;
  }
  let payload;
  try { payload = JSON.parse(encoded); } catch (_) { throw jsonError("保存データが破損しています。", 500); }
  validatePayload(payload);
  const meta = history
    ? await db.prepare("SELECT payload_hash FROM vault_versions WHERE recovery_hash = ? AND revision = ?").bind(hash, revision).first()
    : await getManifest(db, hash);
  const expectedHash = String(meta?.payload_hash || "");
  if (expectedHash && await hashPayload(payload) !== expectedHash) {
    throw jsonError("バックアップの整合性チェックに失敗しました。", 500);
  }
  return payload;
}

function buildCommitStatements(db, hash, current, payload, payloadHash, targetRevision, expectedRevision, writeToken, updatedAt) {
  const encoded = JSON.stringify(payload);
  const chunks = splitText(encoded);
  const payloadBytes = new TextEncoder().encode(encoded).byteLength;
  const statements = [];

  // Preserve the exact previous generation before mutating the current manifest.
  if (current && Number(current.revision) > 0) {
    statements.push(db.prepare(
      "INSERT OR IGNORE INTO vault_versions (recovery_hash, revision, saved_at, payload_bytes, chunk_count, payload_hash) " +
      "SELECT recovery_hash, revision, updated_at, payload_bytes, chunk_count, payload_hash FROM vaults "+
      "WHERE recovery_hash = ? AND revision = ?"
    ).bind(hash, Number(current.revision)));
    statements.push(db.prepare(
      "INSERT OR IGNORE INTO vault_version_chunks (recovery_hash, revision, chunk_index, chunk_text) " +
      "SELECT recovery_hash, revision, chunk_index, chunk_text FROM vault_chunks " +
      "WHERE recovery_hash = ? AND revision = ?"
    ).bind(hash, Number(current.revision)));
  }

  // The compare-and-swap is the concurrency gate. Every subsequent statement is
  // guarded by the unique write token installed only by the winner.
  if (current) {
    statements.push(db.prepare(
      "UPDATE vaults SET revision = ?, updated_at = ?, payload_bytes = ?, chunk_count = ?, payload_hash = ?, write_token = ? " +
      "WHERE recovery_hash = ? AND revision = ?"
    ).bind(targetRevision, updatedAt, payloadBytes, chunks.length, payloadHash, writeToken, hash, expectedRevision));
  } else {
    statements.push(db.prepare(
      "INSERT OR IGNORE INTO vaults (recovery_hash, revision, updated_at, payload_bytes, chunk_count, payload_hash, write_token) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(hash, targetRevision, updatedAt, payloadBytes, chunks.length, payloadHash, writeToken));
  }

  statements.push(db.prepare(
    "DELETE FROM vault_chunks WHERE recovery_hash = ? AND EXISTS " +
    "(SELECT 1 FROM vaults WHERE recovery_hash = ? AND write_token = ?)"
  ).bind(hash, hash, writeToken));

  for (let i = 0; i < chunks.length; i += 1) {
    statements.push(db.prepare(
      "INSERT INTO vault_chunks (recovery_hash, revision, chunk_index, chunk_text) " +
      "SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM vaults WHERE recovery_hash = ? AND write_token = ?)"
    ).bind(hash, targetRevision, i, chunks[i], hash, writeToken));
  }

  statements.push(db.prepare(
    "DELETE FROM vault_versions WHERE recovery_hash = ? AND revision NOT IN " +
    "(SELECT revision FROM vault_versions WHERE recovery_hash = ? ORDER BY revision DESC LIMIT ?)"
  ).bind(hash, hash, HISTORY_LIMIT));
  statements.push(db.prepare(
    "DELETE FROM vault_version_chunks WHERE recovery_hash = ? AND revision NOT IN " +
    "(SELECT revision FROM vault_versions WHERE recovery_hash = ?)"
  ).bind(hash, hash));

  return { statements, payloadBytes, chunkCount: chunks.length };
}

async function commitPayload(db, hash, payload, expectedRevision, targetRevision) {
  const validated = validatePayload(payload);
  const current = await getManifest(db, hash);
  const actualRevision = current ? Number(current.revision) : 0;
  if (actualRevision !== expectedRevision) {
    if (current && actualRevision === targetRevision) {
      const existing = await getPayload(db, hash, actualRevision, false);
      if (await hashPayload(existing) === await hashPayload(validated)) {
        return { found: true, revision: actualRevision, updatedAt: current.updated_at, payloadHash: current.payload_hash, unchanged: true };
      }
    }
    return { conflict: true, revision: actualRevision };
  }
  if (!Number.isSafeInteger(targetRevision) || targetRevision < 1 || targetRevision <= expectedRevision) {
    throw jsonError("新しい世代番号が不正です。", 400);
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  const payloadHash = await hashPayload(validated);
  const { statements, payloadBytes, chunkCount } = buildCommitStatements(
    db, hash, current, validated, payloadHash, targetRevision, expectedRevision, token, now
  );
  await db.batch(statements);
  const latest = await getManifest(db, hash);
  if (!latest || latest.write_token !== token || Number(latest.revision) !== targetRevision) {
    return { conflict: true, revision: Number(latest && latest.revision || 0) };
  }
  const check = await getChunks(db, hash, targetRevision, false);
  if (check.length !== chunkCount) throw jsonError("保存後のバックアップ検証に失敗しました。", 500);
  return { found: true, revision: targetRevision, updatedAt: latest.updated_at, payloadBytes, payloadHash };
}

async function findVault(body, db) {
  const key = normalizeKey(body.recoveryKey);
  const hash = await hashKey(key);
  return { key, hash, vault: await getManifest(db, hash) };
}

async function handleRecovery(req, env) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_PAYLOAD_BYTES + 200000) throw jsonError("リクエストが大きすぎます。", 413);
  let body;
  try { body = await req.json(); } catch (_) { throw jsonError("JSONリクエストを読み取れません。", 400); }
  const action = String(body.action || "");
  const supported = new Set(["head", "get", "backup", "create_recovery", "replicate", "history", "restore_revision"]);
  if (!supported.has(action)) throw jsonError("未対応の操作です。", 400);

  const foundKey = normalizeKey(body.recoveryKey);
  const hash = await hashKey(foundKey);
  await throttle(env.RECOVERY_RATE_LIMIT, hash, 120, 60);
  const db = env.BACKUP_DB;
  if (!db) throw jsonError("Cloudflare D1が構成されていません。", 503);
  let vault = await getManifest(db, hash);

  if (action === "head") {
    if (!vault) return { found: false, revision: 0, payloadHash: null };
    let payloadHash = String(vault.payload_hash || "");
    if (!payloadHash) {
      // Compatibility path for records written before payload hash metadata existed.
      const payload = await getPayload(db, hash, Number(vault.revision), false);
      payloadHash = await hashPayload(payload);
    }
    const ancestors = await db.prepare(
      "SELECT revision, payload_hash FROM vault_versions WHERE recovery_hash = ? ORDER BY revision DESC LIMIT ?"
    ).bind(hash, HISTORY_LIMIT).all();
    return {
      found: true,
      revision: Number(vault.revision),
      updatedAt: vault.updated_at,
      payloadHash,
      history: (ancestors.results || []).map((item) => ({ revision: Number(item.revision), payloadHash: String(item.payload_hash || "") })),
      payloadBytes: Number(vault.payload_bytes || 0)
    };
  }

  if (action === "create_recovery") {
    const payload = validatePayload(body.payload);
    if (vault) throw jsonError("この復旧キーは既に使用されています。既存の保全データを復元してください。", 409);
    const saved = await commitPayload(db, hash, payload, 0, 1);
    if (saved.conflict) throw jsonError("同じキーの保管領域が同時に作成されました。読み直してください。", 409);
    return saved;
  }

  if (action === "get") {
    if (!vault) return { found: false, revision: 0, payload: null };
    const payload = await getPayload(db, hash, Number(vault.revision), false);
    const payloadHash = String(vault.payload_hash || await hashPayload(payload));
    return {
      found: true, revision: Number(vault.revision), payload, updatedAt: vault.updated_at,
      payloadHash, recoveryKeyEnabled: true, recoveryKeyMatches: true
    };
  }

  if (action === "history") {
    if (!vault) return { found: false, revision: 0, history: [] };
    const rows = await db.prepare(
      "SELECT revision, saved_at, payload_hash FROM vault_versions WHERE recovery_hash = ? ORDER BY revision DESC LIMIT ?"
    ).bind(hash, HISTORY_LIMIT).all();
    return { found: true, revision: Number(vault.revision), updatedAt: vault.updated_at, history: rows.results || [] };
  }

  if (action === "restore_revision") {
    if (!vault) return { found: false, revision: 0, payload: null };
    const wanted = Number(body.revision);
    if (!Number.isSafeInteger(wanted) || wanted < 1) throw jsonError("復元する世代を指定してください。", 400);
    const row = await db.prepare(
      "SELECT revision FROM vault_versions WHERE recovery_hash = ? AND revision = ?"
    ).bind(hash, wanted).first();
    if (!row) throw jsonError("その世代は保管されていません。", 404);
    const previous = await getPayload(db, hash, wanted, true);
    const saved = await commitPayload(db, hash, previous, Number(vault.revision), Number(vault.revision) + 1);
    if (saved.conflict) throw jsonError("同期競合が発生しました。最新状態を再読込してください。", 409);
    return { found: true, revision: saved.revision, payload: previous, updatedAt: saved.updatedAt };
  }

  const payload = validatePayload(body.payload);
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw jsonError("期待する世代番号が不正です。", 400);
  }

  if (action === "backup") {
    if (!vault && expectedRevision !== 0) return { found: false, revision: 0, payload: null };
    const next = vault ? Number(vault.revision) + 1 : 1;
    const saved = await commitPayload(db, hash, payload, expectedRevision, next);
    if (saved.conflict) return saved;
    return { found: true, revision: saved.revision, updatedAt: saved.updatedAt };
  }

  // Used only to copy a confirmed canonical generation between providers.
  // It can jump revisions only when the target's current revision matches the
  // caller's expectedRevision. Equal-generation content conflicts are rejected.
  if (action === "replicate") {
    const targetRevision = Number(body.targetRevision);
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 1) throw jsonError("複製先の世代番号が不正です。", 400);
    if (vault && Number(vault.revision) === targetRevision) {
      const existing = await getPayload(db, hash, targetRevision, false);
      if (await hashPayload(existing) === await hashPayload(payload)) {
        return { found: true, revision: targetRevision, updatedAt: vault.updated_at, unchanged: true };
      }
      throw jsonError("同じ世代番号に異なるデータがあります。自動同期を停止しました。", 409);
    }
    const saved = await commitPayload(db, hash, payload, expectedRevision, targetRevision);
    if (saved.conflict) return saved;
    return { found: true, revision: saved.revision, updatedAt: saved.updatedAt };
  }

  throw jsonError("未対応の操作です。", 400);
}

async function handleCounter(url, req, env) {
  if (url.pathname !== "/api/stats/view" || req.method !== "GET") throw jsonError("Not found", 404);
  const rawPath = url.searchParams.get("path") || "app";
  const page = ["app", "share", "view"].includes(rawPath) ? rawPath : "app";
  const ip = req.headers.get("cf-connecting-ip") || "anonymous";
  await throttle(env.COUNTER_RATE_LIMIT, ip, 60, 60);
  const db = env.BACKUP_DB;
  if (!db) throw jsonError("Cloudflare D1が構成されていません。", 503);
  await db.batch([
    db.prepare("INSERT INTO site_counters (name, value) VALUES ('total_views', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"),
    db.prepare("INSERT INTO site_counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1").bind("page_" + page)
  ]);
  const total = await db.prepare("SELECT value FROM site_counters WHERE name = 'total_views'").first();
  const current = await db.prepare("SELECT value FROM site_counters WHERE name = ?").bind("page_" + page).first();
  return { ok: true, totalViews: Number(total && total.value || 0), pageViews: Number(current && current.value || 0), scope: "page_views_not_unique_visitors" };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = corsOrigin(req);
    if (origin === null) return response({ error: "Origin is not allowed." }, 403, "");
    if (req.method === "OPTIONS") {
      return response({ ok: true }, 200, origin);
    }
    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        return response({ ok: true, provider: "cloudflare-d1", configured: Boolean(env.BACKUP_DB) }, 200, origin);
      }
      let result;
      if (url.pathname === "/api/v1/recovery" && req.method === "POST") {
        result = await handleRecovery(req, env);
      } else if (url.pathname === "/api/stats/view" && req.method === "GET") {
        result = await handleCounter(url, req, env);
      } else {
        return response({ error: "Not found" }, 404, origin);
      }
      if (result && result.conflict) {
        return response({ ...result, error: "同期先が別の内容に更新されています。データを比較してから再試行してください。" }, 409, origin);
      }
      return response(result, 200, origin);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      return response({ error: error instanceof Error ? error.message : "処理に失敗しました。" }, status >= 400 && status < 600 ? status : 500, origin);
    }
  }
};
