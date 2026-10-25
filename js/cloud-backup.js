/* Optional online account backup for LIMBUS BUILD TERMINAL.
   Local storage remains the primary workspace. No account data is uploaded unless the
   user explicitly enables cloud backup or creates a recovery key. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://hobntjcrzybqsiobrpsz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oLFnTRhkTCxTrI6qxHN6HA_4tsP4eCa";
  const RECOVERY_ENDPOINT = SUPABASE_URL + "/functions/v1/lbt-account-recovery";
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
  async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function callRecovery(payload) {
    const response = await fetch(RECOVERY_ENDPOINT, {
      method: "POST",
      headers: { "apikey": SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "オンライン保全に失敗しました。");
    return data;
  }
  async function getRemote(options = {}) {
    const key = options.recoveryKey || readRecoveryKey();
    if (!key) return { found: false, revision: 0, payload: null, mode: "local" };
    const remote = await callRecovery({ action: "get", recoveryKey: key });
    return { ...remote, mode: "recovery" };
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
      emit({
        mode: "recovery",
        label: conflict ? "同期競合あり" : "オンラインバックアップあり",
        message: conflict
          ? "別の端末または別タブでクラウド内容が更新されています。自動上書きは停止しました。復元する内容を選んでください。"
          : same
            ? "この端末とクラウドの内容は一致しています。復旧キーはデータ更新によって変更・失効しません。"
            : "クラウドにバックアップがあります。端末にデータがある場合は、復元またはこの端末からの更新を選んでください。",
        remoteExists: true,
        revision: Number(remote.revision) || 0,
        conflict,
        hasRecoveryKey: true,
        recoveryKeyEnabled: Boolean(remote.recoveryKeyEnabled)
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
      emit({ remoteExists: true, revision: Number(current.revision), conflict: false, label: "同期済み", message: "この端末とオンラインバックアップの内容は既に一致しています。復旧キーはそのまま有効です。" });
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
      emit({ remoteExists: true, revision: Number(latest.revision), conflict: false, label: "オンライン保全済み", message: "全アカウントデータをオンラインへ保存しました。以降の変更は自動同期されます。復旧キーは変わりません。" });
      return true;
    }
    const expectedRevision = latest.found ? Number(latest.revision) : 0;
    const result = await callRecovery({ action: "backup", expectedRevision, payload, recoveryKey: key });
    if (!result.found) throw new Error("オンライン保存先を確認できませんでした。復旧キーを確認してもう一度お試しください。");
    writeStorage(REVISION_KEY, String(result.revision));
    setEnabled(true);
    emit({ remoteExists: true, revision: Number(result.revision), conflict: false, label: "オンライン保全済み", message: "全アカウントデータをオンラインへ保存しました。以降の変更は自動同期されます。復旧キーは変わりません。" });
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
      "キーを再発行した場合のみ、以前のキーは無効になります。",
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
      label: "復旧キーを発行しました",
      message: "復旧キーをファイルへ保存しました。クラウドと端末の内容は一致しています。データを更新しても、このキーは変わらず使えます。"
    });
    return true;
  }
  async function rotateRecoveryKey() {
    const currentKey = readRecoveryKey();
    if (!currentKey) throw new Error("キーを再発行するには、最初に現在の復旧キーを入力して復元してください。");
    const remote = await getRemote();
    if (!remote.found) throw new Error("この復旧キーに対応するクラウドデータが見つかりません。");
    const newKey = "LBT1-" + randomToken(32);
    if (!confirm("復旧キーを明示的に再発行します。クラウド内のデータと履歴は維持されますが、再発行後は古いキーでの復元ができなくなります。新しいキーを安全な場所へ保存してください。続けますか？")) return false;
    const result = await callRecovery({ action: "rotate_recovery", recoveryKey: currentKey, newRecoveryKey: newKey });
    if (!writeStorage(RECOVERY_KEY, newKey)) {
      downloadRecoveryKeyFile(newKey, "recovery-key-reissued");
      throw new Error("新しい復旧キーを発行し、ファイルをダウンロードしましたが、端末には保存できませんでした。ファイルを保管し、復旧キー欄へ新しいキーを入力してください。");
    }
    writeStorage(REVISION_KEY, String(result.revision || remote.revision));
    setEnabled(false);
    downloadRecoveryKeyFile(newKey, "recovery-key-reissued");
    emit({
      mode: "recovery",
      remoteExists: true,
      revision: Number(result.revision || remote.revision),
      recoveryKeyEnabled: true,
      conflict: false,
      label: "復旧キーを再発行しました",
      message: "新しい復旧キーをファイルへ保存しました。バックアップ本体は変更していません。以後のデータ更新では新しいキーがそのまま有効です。"
    });
    return true;
  }
  async function restoreWithKey(rawKey) {
    const key = String(rawKey || "").trim();
    if (!/^LBT1-[A-Za-z0-9_-]{40,50}$/.test(key)) throw new Error("復旧キーを「LBT1-」から最後まで入力してください。");
    const remote = await callRecovery({ action: "get", recoveryKey: key });
    if (!remote.found || !remote.payload) throw new Error("この復旧キーに対応するバックアップが見つかりません。");
    await restorePayload(remote.payload, Number(remote.revision), key);
    return true;
  }
  async function restoreCloud() {
    const remote = await getRemote();
    if (!remote.found || !remote.payload) throw new Error("復元できるオンラインバックアップが見つかりません。復旧キーを確認してください。");
    return await restorePayload(remote.payload, Number(remote.revision), readRecoveryKey());
  }
  async function loadHistory() {
    const key = readRecoveryKey();
    if (!key) throw new Error("過去のバックアップ世代を取得するには復旧キーが必要です。");
    const result = await callRecovery({ action: "history", recoveryKey: key });
    if (!result.found) throw new Error("過去のバックアップ世代を取得できませんでした。");
    emit({ history: Array.isArray(result.history) ? result.history : [] });
    return result.history || [];
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
    if (!confirm("この端末の自動同期を停止します。保存済みクラウドデータも復旧キーも削除・無効化されません。手動での復元や同期は引き続き利用できます。続けますか？")) return false;
    setEnabled(false);
    emit({
      mode: readRecoveryKey() ? "recovery" : "local",
      label: "自動同期停止中",
      message: "この端末の自動同期を停止しました。復旧キーとクラウドデータはそのまま有効です。復旧キーを明示的に再発行しない限り、データ更新でキーが変わることはありません。"
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
        emit({ conflict: false, remoteExists: true, revision: Number(current.revision), label: "同期済み", message: "この端末とオンラインバックアップの内容は一致しています。復旧キーは変わりません。" });
        return;
      }
      const result = await callRecovery({ action: "backup", expectedRevision: Number(current.revision), payload, recoveryKey: key });
      if (result.found) {
        writeStorage(REVISION_KEY, String(result.revision));
        emit({ conflict: false, remoteExists: true, revision: Number(result.revision), label: "自動同期済み", message: "ローカル保存とオンライン保全を同期しました。復旧キーは変更されていません。" });
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
      h("p", { className: "lbt-cloud-description" }, "Google／Xログインは使用しません。復旧キーだけでクラウドへ保全・復元できます。ローカル保存は常に継続し、初回アップロードは明示的な操作が必要です。"),
      h("p", { className: "lbt-cloud-message", role: "status", "aria-live": "polite" }, view.message),
      !hasKey ? h(React.Fragment, null,
        h("p", { className: "lbt-cloud-provider-note" }, "まだ復旧キーがない場合は発行してください。すでにキーを持っている場合は、下の入力欄から復元できます。")
      ) : h("p", { className: "lbt-cloud-account" }, "復旧キーはこの端末に保存されています。バックアップ内容や更新回数が変わっても、同じキーで最新データを取得できます。"),
      h("div", { className: "lbt-cloud-actions" },
        !hasKey ? button("復旧キーを発行して保全", () => run(createRecoveryKey), "is-primary") : null,
        hasKey ? button("復旧キーを再発行（古いキーは無効化）", () => run(rotateRecoveryKey), "is-danger") : null,
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
      h("p", { className: "lbt-cloud-footnote" }, "復旧キーはサーバーに平文保存せず、ハッシュだけで照合します。キーはデータ更新・同期・世代変更では変更・失効しません。明示的に再発行した場合のみ古いキーが無効になります。クラウドのJSON本体はエンドツーエンド暗号化されないため、復旧キーを公開チャンネルへ貼らず、別の安全な場所にもJSONバックアップを保管してください。")
    );
  }

  window.LBTCloudBackup = {
    getStatus,
    refresh,
    createRecoveryKey,
    rotateRecoveryKey,
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
  /* The boot is intentionally safe when no auth or recovery method exists: local-only mode is a no-op. */
  initialize().catch((error) => emit({ label: "オンライン保全を初期化できません", message: error.message || "ローカル保存は利用できます。" }));
})();
