/* Optional online account backup for LIMBUS BUILD TERMINAL.
   Local storage remains the primary workspace. No account data is uploaded unless the
   user explicitly enables cloud backup or creates a recovery key. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://hobntjcrzybqsiobrpsz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oLFnTRhkTCxTrI6qxHN6HA_4tsP4eCa";
  const RECOVERY_ENDPOINT = SUPABASE_URL + "/functions/v1/lbt-account-recovery";
  const CLOUDFLARE_RECOVERY_ENDPOINT = "https://lbt-recovery.lbtstudio-share.workers.dev/api/v1/recovery";
  const RECOVERY_KEY = "lbt_cloud_recovery_key_v1";
  const ENABLED_KEY = "lbt_cloud_sync_enabled";
  const REVISION_KEY = "lbt_cloud_last_revision_v1";
  const MAX_LOCAL_BYTES = 12 * 1024 * 1024;
  const MAX_JSON_BACKUP_BYTES = 100 * 1024 * 1024;
  const h = (...args) => React.createElement(...args);
  let restoring = false;
  let syncTimer = null;
  let syncPromise = null;
  let initialized = false;
  let state = {
    mode: "local",
    label: "ローカル保存",
    message: "オンライン保全は任意です。何も連携しなくても、この端末内で今まで通り利用できます。",
    busy: false,
    remoteExists: false,
    revision: 0,
    conflict: false,
    history: [],
    hasRecoveryKey: false,
    recoveryKeyEnabled: false,
    syncEnabled: false,
    localMeaningful: false
  };

  function emit(patch = {}) {
    state = { ...state, ...patch };
    state.hasRecoveryKey = Boolean(readRecoveryKey());
    state.syncEnabled = readStorage(ENABLED_KEY) === "1";
    state.localMeaningful = hasMeaningfulLocalData();
    try { window.dispatchEvent(new CustomEvent("lbt:cloud-backup-status", { detail: { ...state } })); } catch (_) {}
  }
  function getStatus() { return { ...state, hasRecoveryKey: Boolean(readRecoveryKey()), syncEnabled: readStorage(ENABLED_KEY) === "1", localMeaningful: hasMeaningfulLocalData() }; }
  function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  function removeStorage(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function isBackupStorageKey(key) {
    if (key === "lbt_v46_state" || key.startsWith("lbt_v46_state.backup.") || key.startsWith("lbt_v46_state.corrupt.")) return true;
    if (key === "lbt_accounts_index" || key === "lbt_account_active" || key === "lbt_accounts_icons") return true;
    if (key.startsWith("lbt_account_") && key !== "lbt_account_active" && key !== "lbt_accounts_icons" && !key.startsWith("lbt_cloud_")) return true;
    if (key.startsWith("lbt_epoch_account_")) return true;
    return false;
  }
  function collectLocalSnapshot({ enforceCloudLimit = true } = {}) {
    const entries = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && isBackupStorageKey(key)) {
          const value = localStorage.getItem(key);
          if (typeof value === "string") entries.push({ key, value });
        }
      }
    } catch (error) {
      throw new Error("ブラウザーの保存領域を読み取れません。ブラウザーの設定を確認してください。");
    }
    entries.sort((a, b) => a.key.localeCompare(b.key));
    const payload = {
      format: "lbt-account-backup",
      version: 1,
      capturedAt: new Date().toISOString(),
      entries
    };
    const size = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    const limit = enforceCloudLimit ? MAX_LOCAL_BYTES : MAX_JSON_BACKUP_BYTES;
    if (size > limit) {
      throw new Error(enforceCloudLimit
        ? "オンライン保全は12MBまでです。端末内の全アカウントJSONは100MBまで保存できます。"
        : "全アカウントJSONバックアップが100MBを超えています。不要な画像や古いバックアップを整理してください。");
    }
    return payload;
  }
  function validateSnapshot(payload, { enforceCloudLimit = true } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        payload.format !== "lbt-account-backup" || payload.version !== 1 ||
        !Array.isArray(payload.entries) || payload.entries.length > 1500) {
      throw new Error("LBTの全アカウントバックアップ形式ではありません。");
    }
    const size = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    const limit = enforceCloudLimit ? MAX_LOCAL_BYTES : MAX_JSON_BACKUP_BYTES;
    if (size > limit) throw new Error(enforceCloudLimit ? "オンラインバックアップは12MBを超えています。" : "JSONバックアップは100MBを超えています。");
    const seenKeys = new Set();
    for (const item of payload.entries) {
      if (!item || typeof item.key !== "string" || typeof item.value !== "string" || !isBackupStorageKey(item.key)) {
        throw new Error("バックアップ内に許可されていない項目があります。復元を中止しました。");
      }
      if (seenKeys.has(item.key)) throw new Error("バックアップ内で保存キーが重複しています。復元を中止しました。");
      seenKeys.add(item.key);
    }
    return payload;
  }
  function hasMeaningfulLocalData(payload = null) {
    let snap;
    try { snap = payload || collectLocalSnapshot({ enforceCloudLimit: false }); } catch (_) { return true; }
    for (const entry of snap.entries || []) {
      if (!isBackupStorageKey(entry.key)) continue;
      let value;
      try { value = JSON.parse(entry.value); } catch (_) { return true; }
      if (!value || typeof value !== "object") continue;
      if (entry.key === "lbt_v46_state" || entry.key.startsWith("lbt_v46_state.backup.")) {
        if (meaningfulState(value)) return true;
      } else if (entry.key.startsWith("lbt_account_") && entry.key !== "lbt_account_active" && entry.key !== "lbt_accounts_icons") {
        if (meaningfulState(value)) return true;
      } else if (entry.key === "lbt_accounts_icons") {
        if (Object.keys(value).length > 0) return true;
      }
    }
    return false;
  }
  function meaningfulState(value) {
    if (["charName", "plName", "imgUrls"].some((key) => String(value[key] || "").trim())) return true;
    if (value.personaSrc || value.personaNo || value.personaMode) return true;
    const roster = value.roster || {};
    if (["personas", "egos", "supports", "spirits"].some((key) => Array.isArray(roster[key]) && roster[key].length > 0)) return true;
    if (Array.isArray(value.customPersonas) && value.customPersonas.length) return true;
    if (Array.isArray(value.customEgos) && value.customEgos.length) return true;
    if (Array.isArray(value.entries) && value.entries.length) return true;
    if (Array.isArray(value.gachaLog) && value.gachaLog.length) return true;
    return false;
  }
  function sameData(a, b) {
    if (!a || !b || !Array.isArray(a.entries) || !Array.isArray(b.entries)) return false;
    const normalize = (payload) => payload.entries
      .filter((item) => isBackupStorageKey(item.key))
      .slice().sort((x, y) => x.key.localeCompare(y.key))
      .map((item) => [item.key, item.value]);
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }
  function downloadText(name, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadSnapshot(payload = null, suffix = "full-account-backup") {
    const value = validateSnapshot(payload || collectLocalSnapshot({ enforceCloudLimit: false }), { enforceCloudLimit: false });
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    /* Compact JSON keeps exported files importable under the same 100MB limit. */
    downloadText("LBT_" + suffix + "_" + date + ".json", JSON.stringify(value));
  }
  function exportLocalBackup() {
    const snap = collectLocalSnapshot({ enforceCloudLimit: false });
    downloadSnapshot(snap, "all-accounts");
    emit({ message: "全アカウントのJSONバックアップを保存しました。クラウド停止時に備え、別の場所にも保管してください。", label: "JSONバックアップ作成済み" });
    return true;
  }
  function applySnapshot(payload, options = {}) {
    const valid = validateSnapshot(payload, { enforceCloudLimit: options.enforceCloudLimit !== false });
    restoring = true;
    let previousEntries = [];
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && isBackupStorageKey(key)) {
          keysToRemove.push(key);
          previousEntries.push({ key, value: localStorage.getItem(key) });
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      for (const item of valid.entries) localStorage.setItem(item.key, item.value);
      writeStorage(ENABLED_KEY, options.enableSync === false ? "0" : "1");
      if (Number.isSafeInteger(options.revision) && options.revision > 0) writeStorage(REVISION_KEY, String(options.revision));
    } catch (error) {
      /* Roll back to the pre-restore snapshot if quota/privacy restrictions interrupt
         the write. This keeps the old account set coherent instead of half-restored. */
      try {
        const partialKeys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && isBackupStorageKey(key)) partialKeys.push(key);
        }
        partialKeys.forEach((key) => localStorage.removeItem(key));
        previousEntries.forEach((item) => localStorage.setItem(item.key, item.value));
      } catch (_) {}
      throw new Error("端末への復元に失敗しました。元のデータは可能な範囲で元に戻しました。保存容量またはブラウザーの設定を確認してください。");
    } finally {
      restoring = false;
    }
    try { window.dispatchEvent(new CustomEvent("lbt:accounts-changed")); } catch (_) {}
    emit({ remoteExists: true, revision: Number(options.revision) || state.revision, conflict: false, label: "復元済み", message: "アカウントデータを復元しました。次回以降の編集は、オンライン同期が有効なら自動で保全されます。" });
    return true;
  }
  function getActiveAccountId() {
    try { return window.LBT_accounts?.list?.().activeId || null; } catch (_) { return null; }
  }
  function announceRestored() {
    const id = getActiveAccountId();
    try {
      window.dispatchEvent(new CustomEvent("lbt:accounts-changed"));
      window.dispatchEvent(new CustomEvent("lbt:accounts-entered", { detail: { id } }));
    } catch (_) {}
  }
  function randomToken(byteLength = 32) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  async function callProvider(endpoint, payload, provider) {
    const headers = { "content-type": "application/json" };
    if (provider === "supabase") headers.apikey = SUPABASE_PUBLISHABLE_KEY;
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    } catch (cause) {
      const error = new Error("オンライン保全先へ接続できません。");
      error.status = 0;
      error.provider = provider;
      error.cause = cause;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || "オンライン保全に失敗しました。");
      error.status = response.status;
      error.provider = provider;
      throw error;
    }
    return { ...data, _provider: provider };
  }
  function isServiceUnavailable(error) {
    const status = Number(error && error.status || 0);
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  async function replicateTo(provider, recoveryKey, expectedRevision, targetRevision, payload) {
    const endpoint = provider === "supabase" ? RECOVERY_ENDPOINT : CLOUDFLARE_RECOVERY_ENDPOINT;
    return await callProvider(endpoint, {
      action: "replicate", recoveryKey, expectedRevision: Number(expectedRevision) || 0,
      targetRevision: Number(targetRevision), payload
    }, provider);
  }
  async function mirrorMutation(action, source, payload, recoveryKey) {
    const targetProvider = source._provider === "supabase" ? "cloudflare" : "supabase";
    let expectedRevision;
    let targetRevision;
    let nextPayload = payload.payload;
    if (action === "create_recovery") {
      expectedRevision = 0;
      targetRevision = Number(source.revision) || 1;
    } else if (action === "backup") {
      expectedRevision = Number(payload.expectedRevision) || 0;
      targetRevision = Number(source.revision) || (expectedRevision + 1);
    } else if (action === "restore_revision" && source.payload) {
      targetRevision = Number(source.revision);
      expectedRevision = targetRevision - 1;
      nextPayload = source.payload;
    } else {
      return { ok: true, skipped: true };
    }
    try {
      await replicateTo(targetProvider, recoveryKey, expectedRevision, targetRevision, nextPayload);
      return { ok: true, provider: targetProvider };
    } catch (error) {
      return { ok: false, provider: targetProvider, error: error.message || "複製に失敗しました。" };
    }
  }
  async function callRecovery(payload) {
    const key = payload.recoveryKey || readRecoveryKey();
    let result;
    try {
      result = await callProvider(RECOVERY_ENDPOINT, payload, "supabase");
    } catch (primaryError) {
      const canUseFallback = isServiceUnavailable(primaryError) ||
        (payload.action === "restore_revision" && Number(primaryError.status) === 404);
      if (!canUseFallback) throw primaryError;
      result = await callProvider(CLOUDFLARE_RECOVERY_ENDPOINT, payload, "cloudflare");
      result._failover = true;
      /* Best-effort backfill after a failover write. If Supabase is still down,
         the next dual-read will repair it when service returns. */
      if (key && ["create_recovery", "backup", "restore_revision"].includes(payload.action)) {
        result._mirror = await mirrorMutation(payload.action, result, payload, key);
      }
      return result;
    }
    if (key && ["create_recovery", "backup", "restore_revision"].includes(payload.action) &&
        (result.ok || result.found)) {
      result._mirror = await mirrorMutation(payload.action, result, payload, key);
    }
    return result;
  }
  async function getProviderHead(provider, recoveryKey) {
    const endpoint = provider === "supabase" ? RECOVERY_ENDPOINT : CLOUDFLARE_RECOVERY_ENDPOINT;
    return await callProvider(endpoint, { action: "head", recoveryKey }, provider);
  }
  async function getProviderPayload(provider, recoveryKey) {
    const endpoint = provider === "supabase" ? RECOVERY_ENDPOINT : CLOUDFLARE_RECOVERY_ENDPOINT;
    const data = await callProvider(endpoint, { action: "get", recoveryKey }, provider);
    if (!data.found || !data.payload) throw new Error("選択した保全先に復元可能なデータがありません。");
    return data;
  }
  function historyHashForRevision(head, revision) {
    const row = (Array.isArray(head && head.history) ? head.history : [])
      .find((item) => Number(item.revision) === Number(revision));
    return String(row && (row.payloadHash || row.payload_hash) || "");
  }
  async function getRemote(options = {}) {
    const key = options.recoveryKey || readRecoveryKey();
    if (!key) return { found: false, revision: 0, payload: null, mode: "local" };

    // Read metadata first. Payloads up to 12 MiB are transferred only after
    // revisions and SHA-256 fingerprints tell us which provider is needed.
    const results = await Promise.all([
      getProviderHead("supabase", key).then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error })),
      getProviderHead("cloudflare", key).then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error }))
    ]);
    const [primary, fallback] = results;
    if (!primary.ok && !fallback.ok) {
      const error = new Error("SupabaseとCloudflareのどちらからも保全情報を取得できません。接続を確認して再試行してください。");
      error.cause = primary.error || fallback.error;
      throw error;
    }
    if (!primary.ok || !fallback.ok) {
      const available = primary.ok ? primary.data : fallback.data;
      const availableProvider = primary.ok ? "supabase" : "cloudflare";
      const unavailable = primary.ok ? fallback.error : primary.error;
      if (!available.found) {
        throw new Error("一方の保全先に接続できず、もう一方にはデータが見つかりません。バックアップが存在しないとは判断できないため、再接続後に再試行してください。");
      }
      const payload = await getProviderPayload(availableProvider, key);
      return {
        ...payload, mode: "recovery", provider: availableProvider,
        mirrorSynced: false, secondaryUnavailable: true,
        providerError: unavailable && (unavailable.message || String(unavailable))
      };
    }

    const sHead = primary.data;
    const cHead = fallback.data;
    if (!sHead.found && !cHead.found) {
      return { found: false, revision: 0, payload: null, mode: "recovery", mirrorSynced: true };
    }

    // Only one provider has a vault: fetch the current payload once and seed
    // the empty provider at exactly the existing revision.
    if (sHead.found && !cHead.found) {
      const latest = await getProviderPayload("supabase", key);
      const mirrored = await replicateTo("cloudflare", key, 0, Number(sHead.revision), latest.payload)
        .then(() => true).catch(() => false);
      return { ...latest, mode: "recovery", provider: "supabase", mirrorSynced: mirrored, repairPending: !mirrored };
    }
    if (!sHead.found && cHead.found) {
      const latest = await getProviderPayload("cloudflare", key);
      const mirrored = await replicateTo("supabase", key, 0, Number(cHead.revision), latest.payload)
        .then(() => true).catch(() => false);
      return { ...latest, mode: "recovery", provider: "cloudflare", mirrorSynced: mirrored, repairPending: !mirrored };
    }

    const sRevision = Number(sHead.revision) || 0;
    const cRevision = Number(cHead.revision) || 0;
    const sHash = String(sHead.payloadHash || sHead.payload_hash || "");
    const cHash = String(cHead.payloadHash || cHead.payload_hash || "");

    if (sRevision === cRevision) {
      if (sHash && cHash && sHash !== cHash) {
        throw new Error("SupabaseとCloudflareの同じ世代に異なるデータがあります。自動上書きを停止しました。復旧先を選ぶ前にバックアップを退避してください。");
      }
      if (sHash && cHash && sHash === cHash) {
        const latest = await getProviderPayload("supabase", key);
        return { ...latest, mode: "recovery", provider: "supabase", mirrorSynced: true };
      }
      // Legacy records without fingerprints require a one-time full comparison.
      const [sData, cData] = await Promise.all([
        getProviderPayload("supabase", key),
        getProviderPayload("cloudflare", key)
      ]);
      if (!sameData(sData.payload, cData.payload)) {
        throw new Error("SupabaseとCloudflareの同じ世代に異なるデータがあります。安全のため自動同期を停止しました。");
      }
      return { ...sData, mode: "recovery", provider: "supabase", mirrorSynced: true };
    }

    const newerProvider = sRevision > cRevision ? "supabase" : "cloudflare";
    const olderProvider = sRevision > cRevision ? "cloudflare" : "supabase";
    const newerHead = sRevision > cRevision ? sHead : cHead;
    const olderHead = sRevision > cRevision ? cHead : sHead;
    const newerHash = sRevision > cRevision ? sHash : cHash;
    const olderHash = sRevision > cRevision ? cHash : sHash;
    const ancestorHash = historyHashForRevision(newerHead, Number(olderHead.revision));

    // A revision number alone is not proof of ancestry: both stores may have
    // accepted different writes during an outage. Repair only when the newer
    // provider proves that its own history includes this exact older payload.
    if (!newerHash || !olderHash || !ancestorHash || ancestorHash !== olderHash) {
      throw new Error("SupabaseとCloudflareの世代が分岐しているか、古い世代との系譜を検証できません。データを自動上書きせず、JSONバックアップを退避してから手動で復旧先を選んでください。");
    }
    const latest = await getProviderPayload(newerProvider, key);
    const repaired = await replicateTo(
      olderProvider, key, Number(olderHead.revision), Number(newerHead.revision), latest.payload
    ).then(() => true).catch(() => false);
    return {
      ...latest, mode: "recovery", provider: newerProvider,
      mirrorSynced: repaired, repairPending: !repaired
    };
  }
  function readRecoveryKey() {
    const key = readStorage(RECOVERY_KEY);
    return key && /^LBT1-[A-Za-z0-9_-]{40,50}$/.test(key) ? key : null;
  }
  function setEnabled(enabled) {
    writeStorage(ENABLED_KEY, enabled ? "1" : "0");
    if (!enabled) clearTimeout(syncTimer);
    emit({ syncEnabled: Boolean(enabled) });
  }
  async function refresh() {
    try {
      const key = readRecoveryKey();
      if (!key) {
        emit({
          mode: "local",
          label: "ローカル保存",
          message: "復旧キーは未設定です。データはこの端末内だけに保存され、クラウドへの送信は行われていません。",
          remoteExists: false, revision: 0, conflict: false, recoveryKeyEnabled: false
        });
        return getStatus();
      }
      const remote = await getRemote();
      if (!remote.found) {
        emit({
          mode: "recovery",
          label: "復旧キー設定済み・クラウド未検出",
          message: "この端末には復旧キーがありますが、対応するクラウド保全データが見つかりません。キーを確認するか、手動で初回保存してください。",
          remoteExists: false, revision: 0, conflict: false, recoveryKeyEnabled: false,
          hasRecoveryKey: true
        });
        return getStatus();
      }
      const local = collectLocalSnapshot({ enforceCloudLimit: false });
      const localRevision = Number(readStorage(REVISION_KEY) || 0);
      const same = sameData(local, remote.payload);
      const conflict = hasMeaningfulLocalData(local) && !same && localRevision > 0 && localRevision !== Number(remote.revision);
      const dualProtected = remote.mirrorSynced !== false && !remote.secondaryUnavailable && !remote.repairPending;
      emit({
        mode: "recovery",
        label: conflict ? "同期競合あり" : dualProtected ? "二重保全を確認" : "保全先の一部が未確認",
        message: conflict
          ? "別の端末または別タブで保全データが更新されています。自動上書きは停止しました。復元する内容を選んでください。"
          : !dualProtected
            ? "データは取得できましたが、Supabase・Cloudflareの両方への保存を確認できていません。利用は継続できますが、JSONバックアップも別途保管してください。"
            : same
              ? "この端末と保全先の内容は一致しています。SupabaseとCloudflareの双方で同じ世代を確認しました。復旧キーは変わりません。"
              : "保全データがあります。端末に別のデータがある場合は、復元またはこの端末からの更新を選んでください。",
        remoteExists: true,
        revision: Number(remote.revision) || 0,
        conflict,
        hasRecoveryKey: true,
        recoveryKeyEnabled: Boolean(remote.recoveryKeyEnabled),
        mirrorSynced: dualProtected
      });
      if (same) writeStorage(REVISION_KEY, String(remote.revision));
      return getStatus();
    } catch (error) {
      emit({ label: "オンライン保全に接続できません", message: (error.message || "接続に失敗しました。") + " ローカル保存は引き続き利用できます。復旧キー自体は変更されていません。" });
      return getStatus();
    }
  }
  async function backupLocalToCloud(options = {}) {
    const payload = collectLocalSnapshot();
    const key = readRecoveryKey();
    if (!key) throw new Error("先に復旧キーを発行するか、復旧キーを入力してクラウドから復元してください。");
    const current = await getRemote();
    const exists = Boolean(current.found);
    const same = exists && sameData(payload, current.payload);
    if (exists && same) {
      writeStorage(REVISION_KEY, String(current.revision));
      setEnabled(true);
      const dualProtected = current.mirrorSynced !== false && !current.secondaryUnavailable && !current.repairPending;
      emit({ remoteExists: true, revision: Number(current.revision), conflict: false,
        label: dualProtected ? "二重保全・同期済み" : "単一保全先で一致・要確認",
        mirrorSynced: dualProtected,
        message: dualProtected
          ? "この端末とSupabase・Cloudflareの内容が一致しています。復旧キーは変わりません。"
          : "この端末と取得できた保全データは一致していますが、もう一方の保全先は未確認です。JSONバックアップも保管してください。" });
      return true;
    }
    if (exists) {
      const known = Number(readStorage(REVISION_KEY) || 0);
      if (!options.force && known && known !== Number(current.revision)) {
        emit({ conflict: true, remoteExists: true, revision: Number(current.revision), label: "同期競合あり", message: "クラウド側が別の内容に更新されています。先にクラウドを復元するか、上書きを明示してください。" });
        throw new Error("同期競合のため自動上書きを停止しました。");
      }
      if (!confirm("この端末の全アカウントデータを復旧キーに紐づくオンライン保全先へ保存します。クラウドの現行内容は履歴へ残して更新します。復旧キーは変更されません。続けますか？")) return false;
    } else if (!confirm("この端末に保存された全アカウントデータを、復旧キーに紐づくオンライン保全先へ初回保存します。復旧キーは以後のデータ更新でも変わりません。続けますか？")) {
      return false;
    }
    const latest = await getRemote();
    if (latest.found && sameData(payload, latest.payload)) {
      writeStorage(REVISION_KEY, String(latest.revision));
      setEnabled(true);
      const dualProtected = latest.mirrorSynced !== false && !latest.secondaryUnavailable && !latest.repairPending;
      emit({ remoteExists: true, revision: Number(latest.revision), conflict: false,
        label: dualProtected ? "二重保全済み" : "単一保全先で保全済み・要確認",
        mirrorSynced: dualProtected,
        message: dualProtected
          ? "全アカウントデータはSupabase・Cloudflareの双方に保存済みです。復旧キーは変わりません。"
          : "取得できた保全先には全アカウントデータが保存済みですが、もう一方への複製は確認できません。復旧キーは変わりません。" });
      return true;
    }
    const expectedRevision = latest.found ? Number(latest.revision) : 0;
    const result = await callRecovery({ action: "backup", expectedRevision, payload, recoveryKey: key });
    if (!result.found) throw new Error("オンライン保存先を確認できませんでした。復旧キーを確認してもう一度お試しください。");
    writeStorage(REVISION_KEY, String(result.revision));
    setEnabled(true);
    emit({ remoteExists: true, revision: Number(result.revision), conflict: false,
      label: result._mirror && result._mirror.ok ? "二重保全済み" : "主系保全済み・代替系未確認",
      message: result._mirror && result._mirror.ok
        ? "全アカウントデータをSupabase・Cloudflareの両方へ保存しました。復旧キーは変わりません。"
        : "主保全先への保存は完了しましたが、Cloudflareへの複製を確認できません。ローカル保存は維持されています。復旧キーは変わりません。" });
    return true;
  }
  function downloadRecoveryKeyFile(key, suffix = "recovery-key") {
    const recoveryFile = [
      "LIMBUS BUILD TERMINAL — 復旧キー",
      "",
      "復旧キー: " + key,
      "",
      "このキーを知っている人は、オンライン保全データを復元・更新できます。",
      "安全な場所へ保管してください。LBTの画面共有や公開チャンネルには貼り付けないでください。",
      "データを保存・更新しても、このキーは変更・失効しません。",
      "このキーはデータ更新・端末追加・保存先切替で変化しません。LBT内に再発行操作はありません。",
      "ファイル保管日: " + new Date().toISOString(),
      ""
    ].join("\n");
    downloadText("LBT-" + suffix + ".txt", recoveryFile, "text/plain;charset=utf-8");
  }
  async function createRecoveryKey() {
    if (readRecoveryKey()) throw new Error("この端末には復旧キーが設定済みです。既存キーを使ってください。");
    const payload = collectLocalSnapshot();
    if (!confirm("復旧キーを発行し、この端末の全アカウントデータをオンラインへ初回保存します。復旧キーのファイルは別の安全な場所に保管してください。データ更新でキーは変わりませんが、キーを紛失すると復元できません。続けますか？")) return false;
    const key = "LBT1-" + randomToken(32);
    const result = await callRecovery({ action: "create_recovery", recoveryKey: key, payload });
    if (!writeStorage(RECOVERY_KEY, key)) {
      downloadRecoveryKeyFile(key);
      throw new Error("復旧キーのファイルをダウンロードしましたが、この端末の保存領域には保存できませんでした。ファイルを安全に保管し、次回もキーを入力してください。");
    }
    writeStorage(REVISION_KEY, String(result.revision || 1));
    setEnabled(true);
    downloadRecoveryKeyFile(key);
    emit({
      mode: "recovery",
      remoteExists: true,
      revision: Number(result.revision) || 1,
      recoveryKeyEnabled: true,
      conflict: false,
      label: result._mirror && result._mirror.ok ? "二重保全済み" : "主系へ保全済み・代替系未確認",
      message: result._mirror && result._mirror.ok
        ? "復旧キーとデータをSupabase・Cloudflareの両方へ保存しました。同じキーを継続して使えます。"
        : "復旧キーを発行し、主保全先への保存は完了しました。Cloudflareへの複製は確認できていません。復旧キーとJSONバックアップを別の安全な場所にも保管してください。"
    });
    return true;
  }
  async function restoreWithKey(rawKey) {
    const key = String(rawKey || "").trim();
    if (!/^LBT1-[A-Za-z0-9_-]{40,50}$/.test(key)) throw new Error("復旧キーを「LBT1-」から最後まで入力してください。");
    const remote = await getRemote({ recoveryKey: key });
    if (!remote.found || !remote.payload) throw new Error("この復旧キーに対応するバックアップが見つかりません。");
    const restored = await restorePayload(remote.payload, Number(remote.revision), key);
    if (restored && (remote.mirrorSynced === false || remote.secondaryUnavailable || remote.repairPending)) {
      emit({ label: "復元済み・二重保全は未確認", message: "データを復元しましたが、両方の保全先が同じ最新世代であることは確認できていません。JSONバックアップも保管してください。" });
    }
    return Boolean(restored);
  }
  async function restoreCloud() {
    const remote = await getRemote();
    if (!remote.found || !remote.payload) throw new Error("復元できるオンラインバックアップが見つかりません。復旧キーを確認してください。");
    const restored = await restorePayload(remote.payload, Number(remote.revision), readRecoveryKey());
    if (restored && (remote.mirrorSynced === false || remote.secondaryUnavailable || remote.repairPending)) {
      emit({ label: "復元済み・二重保全は未確認", message: "データを復元しましたが、両方の保全先が同じ最新世代であることは確認できていません。JSONバックアップも保管してください。" });
    }
    return Boolean(restored);
  }
  async function loadHistory() {
    const key = readRecoveryKey();
    if (!key) throw new Error("過去のバックアップ世代を取得するには復旧キーが必要です。");
    const results = await Promise.all([
      callProvider(RECOVERY_ENDPOINT, { action: "history", recoveryKey: key }, "supabase")
        .then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error })),
      callProvider(CLOUDFLARE_RECOVERY_ENDPOINT, { action: "history", recoveryKey: key }, "cloudflare")
        .then((data) => ({ ok: true, data })).catch((error) => ({ ok: false, error }))
    ]);
    const usable = results.filter((item) => item.ok && item.data.found).map((item) => item.data);
    if (!usable.length) {
      const present = results.some((item) => item.ok);
      if (present) return [];
      throw new Error("過去のバックアップ世代を取得できませんでした。");
    }
    const byRevision = new Map();
    usable.forEach((data) => (data.history || []).forEach((item) => {
      const revision = Number(item.revision);
      if (Number.isSafeInteger(revision) && revision > 0) {
        const previous = byRevision.get(revision);
        const payloadHash = String(item.payloadHash || item.payload_hash || "");
        const previousHash = String(previous && (previous.payloadHash || previous.payload_hash) || "");
        if (previousHash && payloadHash && previousHash !== payloadHash) {
          throw new Error("同じ世代番号の履歴に異なる内容があります。履歴の自動統合を停止しました。");
        }
        const savedAt = String(item.saved_at || item.updated_at || "");
        if (!previous || (!previousHash && payloadHash) || savedAt > String(previous.saved_at || "")) {
          byRevision.set(revision, { ...item, revision, payloadHash: payloadHash || previousHash });
        }
      }
    }));
    const history = [...byRevision.values()].sort((a, b) => b.revision - a.revision).slice(0, 10);
    emit({ history });
    return history;
  }
  async function restorePayload(payload, revision, recoveryKey = null) {
    const local = collectLocalSnapshot({ enforceCloudLimit: false });
    const hasLocal = hasMeaningfulLocalData(local);
    if (hasLocal && !confirm("現在の端末にもデータがあります。復元前に現在の全アカウントデータをJSONファイルとしてダウンロードし、その後クラウドの内容で端末データを置き換えます。続けますか？")) return false;
    if (hasLocal) downloadSnapshot(local, "before-cloud-restore");
    const valid = validateSnapshot(payload);
    applySnapshot(valid, { revision, enableSync: true });
    if (recoveryKey) writeStorage(RECOVERY_KEY, recoveryKey);
    writeStorage(REVISION_KEY, String(revision));
    setEnabled(true);
    emit({ remoteExists: true, revision, conflict: false, label: "バックアップを復元しました", message: "バックアップを端末へ復元しました。アカウント選択画面から作業を再開できます。" });
    announceRestored();
    return true;
  }
  async function restoreFromFile(file) {
    if (!file) return false;
    if (Number(file.size) > MAX_JSON_BACKUP_BYTES) {
      throw new Error("JSONバックアップは100MBまでです。ファイルの大きさを確認してください。");
    }
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); } catch (_) { throw new Error("JSONファイルを読み取れませんでした。"); }
    validateSnapshot(payload, { enforceCloudLimit: false });
    const local = collectLocalSnapshot({ enforceCloudLimit: false });
    const hasLocal = hasMeaningfulLocalData(local);
    if (hasLocal && !confirm("現在の全アカウントデータをJSONファイルへ退避し、選んだバックアップで置き換えます。続けますか？")) return false;
    if (hasLocal) downloadSnapshot(local, "before-json-restore");
    applySnapshot(payload, { enableSync: false, enforceCloudLimit: false });
    removeStorage(ENABLED_KEY);
    removeStorage(REVISION_KEY);
    emit({ mode: "local", label: "JSONから復元しました", message: "ローカルJSONから復元しました。オンラインへは送信していません。", remoteExists: false, revision: 0, conflict: false });
    announceRestored();
    return true;
  }
  async function restoreRevision(revision) {
    const key = readRecoveryKey();
    if (!key) throw new Error("過去の世代を復元するには復旧キーが必要です。");
    const result = await callRecovery({ action: "restore_revision", revision: Number(revision), recoveryKey: key });
    if (!result.found || !result.payload) throw new Error("指定した世代を復元できませんでした。");
    return await restorePayload(result.payload, Number(result.revision), key);
  }
  async function disableOnline() {
    if (!confirm("この端末の自動同期を停止します。保存済みクラウドデータも復旧キーも削除されません。手動での復元や同期は引き続き利用できます。続けますか？")) return false;
    setEnabled(false);
    emit({
      mode: readRecoveryKey() ? "recovery" : "local",
      label: "自動同期停止中",
      message: "この端末の自動同期を停止しました。復旧キーとクラウドデータはそのまま有効です。復旧キーは変更・再発行されません。データ更新でも同じキーを使い続けます。"
    });
    return true;
  }
  async function syncAutomatically() {
    if (readStorage(ENABLED_KEY) !== "1" || restoring || !navigator.onLine) return;
    if (syncPromise) return syncPromise;
    const key = readRecoveryKey();
    if (!key) return;
    syncPromise = (async () => {
      const payload = collectLocalSnapshot();
      const current = await getRemote();
      if (!current.found) {
        emit({ label: "同期待ち", message: "オンラインバックアップが見つかりません。手動で初回保存を行ってください。復旧キーは変更されていません。" });
        return;
      }
      const known = Number(readStorage(REVISION_KEY) || 0);
      if (known && known !== Number(current.revision) && !sameData(payload, current.payload)) {
        emit({ conflict: true, remoteExists: true, revision: Number(current.revision), label: "同期競合あり", message: "クラウド側の更新を検出しました。ローカルデータは保存済みですが、上書きを停止しています。復旧キーは引き続き有効です。" });
        return;
      }
      if (sameData(payload, current.payload)) {
        writeStorage(REVISION_KEY, String(current.revision));
        const dualProtected = current.mirrorSynced !== false && !current.secondaryUnavailable && !current.repairPending;
        emit({ conflict: false, remoteExists: true, revision: Number(current.revision),
          label: dualProtected ? "二重保全・同期済み" : "単一保全先で同期済み・要確認",
          mirrorSynced: dualProtected,
          message: dualProtected
            ? "この端末とSupabase・Cloudflareの内容は一致しています。復旧キーは変わりません。"
            : "ローカルと取得できた保全先の内容は一致していますが、もう一方の保全先は未確認です。復旧キーは変わりません。" });
        return;
      }
      const result = await callRecovery({ action: "backup", expectedRevision: Number(current.revision), payload, recoveryKey: key });
      if (result.found) {
        writeStorage(REVISION_KEY, String(result.revision));
        emit({ conflict: false, remoteExists: true, revision: Number(result.revision),
          label: result._mirror && result._mirror.ok ? "二重自動同期済み" : "自動同期済み・代替系未確認",
          message: result._mirror && result._mirror.ok
            ? "ローカル保存・Supabase・Cloudflareの内容を同期しました。復旧キーは変わりません。"
            : "主保全先へ自動同期しましたが、Cloudflareへの複製は確認できません。復旧キーは変わりません。" });
      }
    })().catch((error) => {
      emit({ label: "同期待ち", message: (error.message || "同期に失敗しました。") + " ローカルデータは保存済みです。再接続時に再試行します。復旧キーは変更されていません。" });
    }).finally(() => { syncPromise = null; });
    return syncPromise;
  }
  function scheduleSync() {
    if (restoring || readStorage(ENABLED_KEY) !== "1") return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncAutomatically, 1800);
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    await refresh();
  }

  /* React panel: shown in both initial SINNER SELECT and account-management overlay. */
  function CloudBackupPanel({ compact = false } = {}) {
    const [view, setView] = React.useState(getStatus());
    const [recoveryDraft, setRecoveryDraft] = React.useState("");
    const fileInput = React.useRef(null);
    React.useEffect(() => {
      const onStatus = (event) => setView({ ...event.detail });
      window.addEventListener("lbt:cloud-backup-status", onStatus);
      initialize().catch((error) => emit({ label: "オンライン保全を初期化できません", message: error.message || "設定を確認してください。" }));
      return () => window.removeEventListener("lbt:cloud-backup-status", onStatus);
    }, []);
    const run = async (fn) => {
      emit({ busy: true });
      try { await fn(); }
      catch (error) { emit({ busy: false, label: "処理を完了できませんでした", message: error.message || "処理に失敗しました。ローカルデータはそのままです。" }); }
      finally { emit({ busy: false }); }
    };
    const button = (label, onClick, extraClass = "", disabled = false) => h("button", {
      type: "button",
      className: "acct-upload-btn lbt-cloud-btn " + extraClass,
      disabled: view.busy || disabled,
      onClick,
    }, label);
    const hasKey = Boolean(view.hasRecoveryKey);
    return h("section", { className: "lbt-cloud-panel" + (compact ? " is-compact" : ""), "aria-label": "オンライン保全（復旧キー方式）" },
      h("div", { className: "lbt-cloud-heading" },
        h("strong", null, "オンライン保全（復旧キー方式）"),
        h("span", { className: "lbt-cloud-state" }, view.label || "ローカル保存")
      ),
      h("p", { className: "lbt-cloud-description" }, "外部ログインは使用せず、復旧キーだけでクラウドへ保全・復元できます。ローカル保存は常に継続し、初回アップロードは明示的な操作が必要です。"),
      h("p", { className: "lbt-cloud-message", role: "status", "aria-live": "polite" }, view.message),
      !hasKey ? h(React.Fragment, null,
        h("p", { className: "lbt-cloud-provider-note" }, "まだ復旧キーがない場合は発行してください。すでにキーを持っている場合は、下の入力欄から復元できます。")
      ) : h("p", { className: "lbt-cloud-account" }, "復旧キーはこの端末に保存されています。バックアップ内容や更新回数が変わっても、同じキーで最新データを取得できます。"),
      h("div", { className: "lbt-cloud-actions" },
        !hasKey ? button("復旧キーを発行して保全", () => run(createRecoveryKey), "is-primary") : null,
        button("全アカウントをJSON保存", () => run(async () => exportLocalBackup()))
      ),
      h("div", { className: "lbt-cloud-recovery" },
        h("label", { htmlFor: "lbt-cloud-recovery-key" }, "復旧キーからクラウドを復元"),
        h("div", { className: "lbt-cloud-recovery-row" },
          h("input", {
            id: "lbt-cloud-recovery-key",
            type: "text",
            value: recoveryDraft,
            maxLength: 56,
            autoComplete: "off",
            spellCheck: false,
            placeholder: "LBT1-…",
            onChange: (event) => setRecoveryDraft(event.target.value)
          }),
          button("復元", () => run(() => restoreWithKey(recoveryDraft)))
        )
      ),
      view.remoteExists ? h(React.Fragment, null,
        h("div", { className: "lbt-cloud-actions" },
          button("クラウドから復元", () => run(restoreCloud)),
          button(view.conflict ? "この端末でクラウドを更新…" : "この端末をクラウドへ同期", () => run(() => backupLocalToCloud({ force: Boolean(view.conflict) })), view.conflict ? "is-primary" : ""),
          button("過去の世代を確認", () => run(loadHistory))
        ),
        Array.isArray(view.history) && view.history.length ? h("div", { className: "lbt-cloud-history" },
          h("strong", null, "復元できる過去の世代"),
          view.history.map((item) => h("div", { className: "lbt-cloud-history-row", key: item.revision },
            h("span", null, "世代 " + item.revision + "・" + new Date(item.saved_at).toLocaleString()),
            button("この世代を復元", () => run(() => restoreRevision(item.revision)))
          ))
        ) : null
      ) : (hasKey && view.localMeaningful) ? button("この端末のデータを初回保存", () => run(() => backupLocalToCloud({ force: false })), "is-primary") : null,
      h("input", {
        ref: fileInput,
        type: "file",
        accept: "application/json,.json",
        hidden: true,
        onChange: (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) run(() => restoreFromFile(file));
        }
      }),
      h("div", { className: "lbt-cloud-actions" },
        button("JSONファイルから復元", () => fileInput.current?.click()),
        hasKey ? button("この端末の自動同期を停止", () => run(disableOnline), "is-danger") : null
      ),
      h("p", { className: "lbt-cloud-footnote" }, "復旧キー自体は保存せずハッシュのみを保持します。クラウドへ保存されるJSON本体はエンドツーエンド暗号化されません。復旧キーはデータ更新・同期・世代変更・保存先切替で変化しません。LBT内に再発行操作はありません。復旧キーを公開チャンネルへ貼らず、別の安全な場所にもJSONバックアップを保管してください。")
    );
  }

  window.LBTCloudBackup = {
    getStatus,
    refresh,
    createRecoveryKey,
    restoreWithKey,
    restoreCloud,
    restoreFromFile,
    restoreRevision,
    loadHistory,
    backupLocalToCloud,
    exportLocalBackup,
    disableOnline,
    snapshotLocal: collectLocalSnapshot,
    hasMeaningfulLocalData,
    initialize
  };
  window.LBTCloudBackupPanel = CloudBackupPanel;
  window.addEventListener("lbt:backup-source-changed", scheduleSync);
  window.addEventListener("online", () => { if (readStorage(ENABLED_KEY) === "1") scheduleSync(); });
  /* Local-only mode remains available when both cloud providers are unavailable. */
  initialize().catch((error) => emit({ label: "オンライン保全を初期化できません", message: error.message || "ローカル保存は利用できます。" }));
})();
