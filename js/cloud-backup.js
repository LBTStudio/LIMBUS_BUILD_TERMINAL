/* Optional online account backup for LIMBUS BUILD TERMINAL.
   Local storage remains the primary workspace. No account data is uploaded unless the
   user explicitly enables cloud backup or creates a recovery key. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://hobntjcrzybqsiobrpsz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oLFnTRhkTCxTrI6qxHN6HA_4tsP4eCa";
  const RECOVERY_ENDPOINT = SUPABASE_URL + "/functions/v1/lbt-account-recovery";
  const SESSION_KEY = "lbt_cloud_auth_session_v1";
  const RECOVERY_KEY = "lbt_cloud_recovery_key_v1";
  const ENABLED_KEY = "lbt_cloud_sync_enabled";
  const REVISION_KEY = "lbt_cloud_last_revision_v1";
  const PKCE_KEY = "lbt_cloud_oauth_pkce_v1";
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
    hasSession: false,
    hasRecoveryKey: false,
    recoveryKeyEnabled: false,
    syncEnabled: false,
    localMeaningful: false
  };

  function emit(patch = {}) {
    state = { ...state, ...patch };
    state.hasSession = Boolean(readSessionRaw());
    state.hasRecoveryKey = Boolean(readRecoveryKey());
    state.syncEnabled = readStorage(ENABLED_KEY) === "1";
    state.localMeaningful = hasMeaningfulLocalData();
    try { window.dispatchEvent(new CustomEvent("lbt:cloud-backup-status", { detail: { ...state } })); } catch (_) {}
  }
  function getStatus() { return { ...state, hasSession: Boolean(readSessionRaw()), hasRecoveryKey: Boolean(readRecoveryKey()), syncEnabled: readStorage(ENABLED_KEY) === "1", localMeaningful: hasMeaningfulLocalData() }; }
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
    try { snap = payload || collectLocalSnapshot(); } catch (_) { return true; }
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
    downloadText("LBT_" + suffix + "_" + date + ".json", JSON.stringify(value, null, 2));
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
  function readSessionRaw() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : null;
      return session && session.access_token && session.refresh_token ? session : null;
    } catch (_) { return null; }
  }
  async function saveSession(session) {
    const normalized = { ...session, expires_at: Number(session.expires_at) || (Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600)) };
    writeStorage(SESSION_KEY, JSON.stringify(normalized));
    return normalized;
  }
  async function sessionRequest(path, body) {
    const response = await fetch(SUPABASE_URL + path, {
      method: "POST",
      headers: { "apikey": SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || data.msg || data.message || "オンライン認証に失敗しました。");
    return data;
  }
  async function getSession() {
    const session = readSessionRaw();
    if (!session) return null;
    if (Number(session.expires_at) > Math.floor(Date.now() / 1000) + 60) return session;
    try {
      const refreshed = await sessionRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      return await saveSession(refreshed);
    } catch (_) {
      removeStorage(SESSION_KEY);
      return null;
    }
  }
  async function startOAuth(provider) {
    if (!["google", "x"].includes(provider)) throw new Error("未対応のログイン方法です。");
    let verifier;
    try {
      verifier = randomToken(48);
      sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, createdAt: Date.now() }));
    } catch (_) {
      throw new Error("認証準備用の一時保存領域を使えません。ブラウザーのプライベート設定を確認してください。");
    }
    const challenge = randomTokenFromBytes(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const redirectTo = location.origin + location.pathname;
    const url = new URL(SUPABASE_URL + "/auth/v1/authorize");
    url.searchParams.set("provider", provider);
    url.searchParams.set("redirect_to", redirectTo);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "s256");
    location.assign(url.toString());
  }
  function randomTokenFromBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  async function handleOAuthCallback() {
    const url = new URL(location.href);
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (!code && !oauthError) return;
    try {
      if (oauthError) throw new Error(decodeURIComponent(oauthError.replace(/\+/g, " ")));
      let stored;
      try { stored = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "null"); } catch (_) { stored = null; }
      if (!stored?.verifier || Date.now() - Number(stored.createdAt || 0) > 10 * 60 * 1000) {
        throw new Error("認証の一時情報が見つからないか期限切れです。もう一度ログインしてください。");
      }
      const session = await sessionRequest("/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: stored.verifier });
      await saveSession(session);
      try { sessionStorage.removeItem(PKCE_KEY); } catch (_) {}
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
      emit({ mode: "oauth", label: "オンライン連携済み", message: "認証できました。既存データはまだ送信していません。オンライン保全を始める操作を選んでください。" });
    } catch (error) {
      url.searchParams.delete("code");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
      emit({ label: "オンライン認証を完了できませんでした", message: error.message || "認証に失敗しました。" });
    }
  }
  async function callRecovery(payload, accessToken = null) {
    const headers = { "apikey": SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" };
    if (accessToken) headers.authorization = "Bearer " + accessToken;
    const response = await fetch(RECOVERY_ENDPOINT, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "オンライン保全に失敗しました。");
    return data;
  }
  async function getRemote(options = {}) {
    const session = options.useRecoveryOnly ? null : await getSession();
    if (session) {
      const recoveryKey = options.recoveryKey || readRecoveryKey();
      const remote = await callRecovery({ action: "get", ...(recoveryKey ? { recoveryKey } : {}) }, session.access_token);
      if (remote.found || options.useAuthOnly) return { ...remote, session, mode: "oauth" };
    }
    const key = options.recoveryKey || readRecoveryKey();
    if (key) {
      const remote = await callRecovery({ action: "get", recoveryKey: key });
      return { ...remote, session: null, mode: "recovery" };
    }
    return { found: false, revision: 0, payload: null, session, mode: session ? "oauth" : "local" };
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
      const session = await getSession();
      const key = readRecoveryKey();
      if (!session && !key) {
        emit({
          mode: "local",
          label: "ローカル保存",
          message: "オンライン保全は未設定です。データはこの端末内だけに保存され、連携やアップロードは行われていません。",
          remoteExists: false, revision: 0, conflict: false, recoveryKeyEnabled: false
        });
        return getStatus();
      }
      const remote = await getRemote();
      if (!remote.found) {
        emit({
          mode: session ? "oauth" : "recovery",
          label: session ? "オンライン連携済み・未保存" : "復旧キー設定済み・未保存",
          message: "オンラインのバックアップはまだありません。端末データを送信するには「この端末のデータを初回保存」を選んでください。",
          remoteExists: false, revision: 0, conflict: false,
          recoveryKeyEnabled: false
        });
        return getStatus();
      }
      const local = collectLocalSnapshot();
      const localRevision = Number(readStorage(REVISION_KEY) || 0);
      const same = sameData(local, remote.payload);
      const conflict = hasMeaningfulLocalData(local) && !same && localRevision > 0 && localRevision !== Number(remote.revision);
      emit({
        mode: remote.mode,
        label: conflict ? "同期競合あり" : "オンラインバックアップあり",
        message: conflict
          ? "別の端末または別タブでクラウド内容が更新されています。自動上書きは停止しました。復元する内容を選んでください。"
          : remote.mode === "oauth" && key && remote.recoveryKeyMatches === false
            ? "クラウドのGoogle/Xアカウントと、この端末の復旧キーは別の保全先です。自動同期はログイン中のアカウントだけを対象にし、復旧キーの保管庫は変更しません。"
            : same
              ? "この端末とクラウドの内容は一致しています。"
              : "クラウドにバックアップがあります。端末にデータがある場合は、復元またはこの端末からの更新を選んでください。",
        remoteExists: true,
        revision: Number(remote.revision) || 0,
        conflict,
        hasSession: Boolean(session),
        hasRecoveryKey: Boolean(key),
        recoveryKeyEnabled: Boolean(remote.recoveryKeyEnabled)
      });
      if (same) writeStorage(REVISION_KEY, String(remote.revision));
      return getStatus();
    } catch (error) {
      emit({ label: "オンライン保全に接続できません", message: (error.message || "接続に失敗しました。") + " ローカル保存は引き続き利用できます。" });
      return getStatus();
    }
  }
  async function backupLocalToCloud(options = {}) {
    const payload = collectLocalSnapshot();
    const session = await getSession();
    const key = readRecoveryKey();
    if (!session && !key) throw new Error("先にGoogle/Xと連携するか、復旧キーを発行してください。");
    const current = await getRemote();
    if (session && key && current.mode === "oauth" && current.recoveryKeyMatches === false) {
      throw new Error("この端末の復旧キーは、ログイン中のGoogle/Xとは別の保全データを指しています。安全のため同期を止めました。Google/X側を使う場合は「この端末の復旧キーだけ外す」を選んでください。復旧キーのファイルとオンライン保管庫は削除されません。");
    }
    const exists = Boolean(current.found);
    const same = exists && sameData(payload, current.payload);
    if (exists && same) {
      writeStorage(REVISION_KEY, String(current.revision));
      setEnabled(true);
      emit({ remoteExists: true, revision: Number(current.revision), conflict: false, label: "同期済み", message: "この端末とオンラインバックアップの内容は既に一致しています。" });
      return true;
    }
    if (exists) {
      const known = Number(readStorage(REVISION_KEY) || 0);
      if (!options.force && known && known !== Number(current.revision)) {
        emit({ conflict: true, remoteExists: true, revision: Number(current.revision), label: "同期競合あり", message: "クラウド側が別の内容に更新されています。先にクラウドを復元するか、上書きを明示してください。" });
        throw new Error("同期競合のため自動上書きを停止しました。");
      }
      if (!confirm("この端末の全アカウントデータをオンライン保全先へ保存します。クラウドの現行内容は履歴へ残して更新します。続けますか？")) return false;
    } else if (!confirm("この端末に保存された全アカウントデータをオンラインへ初回保存します。これまでのローカル保存も残ります。続けますか？")) {
      return false;
    }
    if (session && key && (current.mode === "recovery" || current.recoveryKeyMatches !== false)) {
      await callRecovery({ action: "create_recovery", recoveryKey: key, payload }, session.access_token);
    }
    const remote = await getRemote();
    if (remote.found && sameData(payload, remote.payload)) {
      writeStorage(REVISION_KEY, String(remote.revision));
      setEnabled(true);
      emit({ remoteExists: true, revision: Number(remote.revision), conflict: false, label: "オンライン保全済み", message: "全アカウントデータをオンラインへ保存しました。以降の変更は自動同期されます。" });
      return true;
    }
    const expectedRevision = remote.found ? Number(remote.revision) : 0;
    const request = { action: "backup", expectedRevision, payload, ...(!remote.session && key ? { recoveryKey: key } : {}) };
    const result = await callRecovery(request, remote.session?.access_token || (session && !key ? session.access_token : null) || null);
    if (!result.found) throw new Error("オンライン保存先を確認できませんでした。復旧キーを再入力するか、もう一度ログインしてください。");
    writeStorage(REVISION_KEY, String(result.revision));
    setEnabled(true);
    emit({ remoteExists: true, revision: Number(result.revision), conflict: false, label: "オンライン保全済み", message: "全アカウントデータをオンラインへ保存しました。以降の変更は自動同期されます。ローカル保存も引き続き使われます。" });
    return true;
  }
  async function linkRecoveryKeyToOAuth() {
    const session = await getSession();
    const key = readRecoveryKey();
    if (!session) throw new Error("先にGoogle/Xと連携してください。");
    if (!key) throw new Error("先に復旧キーを発行するか、復旧キーを使って復元してください。");

    const recoveryVault = await callRecovery({ action: "get", recoveryKey: key });
    if (!recoveryVault.found || !recoveryVault.payload) {
      throw new Error("この復旧キーのオンライン保全データが見つかりません。");
    }
    const authVault = await callRecovery({ action: "get" }, session.access_token);
    if (authVault.found) {
      throw new Error("このGoogle/Xアカウントには既に別のオンライン保全データがあります。安全のため、自動統合は行いません。先にどちらを残すか確認してください。");
    }
    if (!confirm("この復旧キーの保全データを、ログイン中のGoogle/Xアカウントにも結びつけます。クラウド側の保全データはそのまま維持し、今の端末データは変更しません。続けますか？")) return false;

    /* Cloud snapshot is passed unchanged so linking an identity doesn't overwrite
       the cloud with possibly stale local data. Local sync remains disabled unless equal. */
    const local = collectLocalSnapshot();
    const result = await callRecovery({ action: "create_recovery", recoveryKey: key, payload: recoveryVault.payload }, session.access_token);
    const verified = await callRecovery({ action: "get", recoveryKey: key }, session.access_token);
    if (!verified.found || verified.recoveryKeyMatches !== true) {
      throw new Error("Google/Xと復旧キーの結びつきを確認できませんでした。既存データは削除していません。");
    }
    writeStorage(REVISION_KEY, String(verified.revision));
    const matches = sameData(local, verified.payload);
    setEnabled(matches);
    emit({
      mode: "oauth",
      remoteExists: true,
      revision: Number(verified.revision),
      conflict: false,
      label: "Google/Xと復旧キーを連携しました",
      message: matches
        ? "同じ内容の保全データをGoogle/Xと復旧キーの両方から復元できます。自動同期を有効にしました。"
        : "クラウドデータを維持したまま連携しました。端末とクラウドの内容は異なるため、自動同期は停止中です。「クラウドから復元」か「この端末をクラウドへ同期」を選んでください。"
    });
    return result;
  }

  async function rotateRecoveryKey() {
    const session = await getSession();
    if (!session) throw new Error("復旧キーの再発行にはGoogle/X連携が必要です。");
    if (!confirm("新しい復旧キーを発行します。発行すると以前の復旧キーは無効になり、古いキーだけでは復元できなくなります。今のクラウドバックアップ自体は維持されます。続けますか？")) return false;

    const key = "LBT1-" + randomToken(32);
    const result = await callRecovery({ action: "rotate_recovery", recoveryKey: key }, session.access_token);
    const remote = await callRecovery({ action: "get" }, session.access_token);
    if (!remote.found) throw new Error("クラウドバックアップを確認できませんでした。キーは再発行されていません。");
    const local = collectLocalSnapshot();
    const matches = sameData(local, remote.payload);
    writeStorage(RECOVERY_KEY, key);
    writeStorage(REVISION_KEY, String(result.revision || remote.revision));
    setEnabled(matches);
    const fileText = [
      "LIMBUS BUILD TERMINAL — 再発行した復旧キー",
      "",
      "復旧キー: " + key,
      "",
      "このキーを知っている人は、オンライン保全データを復元・更新できます。",
      "この再発行によって以前の復旧キーは無効になりました。",
      "安全な場所へ保管してください。LBTの画面共有や公開チャンネルには貼り付けないでください。",
      "ファイル保管日: " + new Date().toISOString(),
      ""
    ].join("\n");
    downloadText("LBT-recovery-key.txt", fileText, "text/plain;charset=utf-8");
    emit({
      mode: "oauth",
      remoteExists: true,
      revision: Number(remote.revision) || 1,
      recoveryKeyEnabled: true,
      conflict: false,
      label: "復旧キーを再発行しました",
      message: matches
        ? "新しいキーを保存しました。古いキーは無効です。クラウドと端末の内容は一致しているため、自動同期を続けます。"
        : "新しいキーを保存しました。クラウドバックアップは維持されています。端末とクラウドの内容が異なるため、自動同期は停止中です。まずクラウドからの復元または端末からの同期を選んでください。"
    });
    return true;
  }

  async function createRecoveryKey() {
    const session = await getSession();
    const existing = session ? await callRecovery({ action: "get" }, session.access_token) : null;
    const hasExistingCloud = Boolean(existing?.found && existing?.payload);
    if (hasExistingCloud && existing.recoveryKeyEnabled) {
      throw new Error("このオンライン保全には既に復旧キーが登録されています。「復旧キーを再発行」から古いキーを無効化して更新してください。");
    }
    const localPayload = collectLocalSnapshot();
    const payload = hasExistingCloud ? existing.payload : localPayload;
    const prompt = hasExistingCloud
      ? "復旧キーを発行し、既存のクラウドバックアップへ結びつけます。クラウドの保存内容は維持し、端末にある別の内容では上書きしません。続けますか？"
      : "復旧キーを発行し、この端末の全アカウントデータをオンラインへ保存します。キーはファイルにも保存されますが、別の安全な場所に保管してください。キーを失い、ログインもできない場合は復元できません。続けますか？";
    if (!confirm(prompt)) return false;
    const key = "LBT1-" + randomToken(32);
    const result = await callRecovery({ action: "create_recovery", recoveryKey: key, payload }, session?.access_token || null);
    writeStorage(RECOVERY_KEY, key);
    writeStorage(REVISION_KEY, String(result.revision || 1));
    const matches = sameData(localPayload, payload);
    setEnabled(matches);
    const recoveryFile = [
      "LIMBUS BUILD TERMINAL — 復旧キー",
      "",
      "復旧キー: " + key,
      "",
      "このキーを知っている人は、オンライン保全データを復元・更新できます。",
      "安全な場所へ保管してください。LBTの画面共有や公開チャンネルには貼り付けないでください。",
      "キーを失い、連携したGoogle/Xアカウントも利用できない場合は復元できません。",
      "ファイル保管日: " + new Date().toISOString(),
      ""
    ].join("\n");
    downloadText("LBT-recovery-key.txt", recoveryFile, "text/plain;charset=utf-8");
    emit({
      mode: session ? "oauth" : "recovery",
      remoteExists: true,
      revision: Number(result.revision) || 1,
      recoveryKeyEnabled: true,
      conflict: false,
      label: "復旧キーを発行しました",
      message: matches
        ? "復旧キーをファイルへ保存しました。クラウドと端末の内容は一致しているため、自動同期を有効にしました。"
        : "復旧キーをファイルへ保存しました。クラウドの既存データは維持されています。端末とクラウドの内容が異なるため、自動同期は停止中です。復元または端末からの同期を選んでください。"
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
    if (!remote.found || !remote.payload) throw new Error("復元できるオンラインバックアップが見つかりません。");
    let key = readRecoveryKey();
    if (key && remote.mode === "oauth" && remote.recoveryKeyMatches === false) {
      if (!confirm("この端末に保存された復旧キーは別の保全データを指しています。Google/X側から復元し、このブラウザーの復旧キーだけを外します。ダウンロード済みの復旧キーとオンライン保管庫は削除されません。続けますか？")) return false;
      removeStorage(RECOVERY_KEY);
      key = null;
    }
    return await restorePayload(remote.payload, Number(remote.revision), key);
  }
  async function loadHistory() {
    const session = await getSession();
    const key = readRecoveryKey();
    let result = await callRecovery({ action: "history", ...(key ? { recoveryKey: key } : {}) }, session?.access_token || null);
    if (!result.found && session && key) result = await callRecovery({ action: "history", recoveryKey: key });
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
    if (Number(file.size) > MAX_JSON_BACKUP_BYTES) throw new Error("JSONバックアップは100MBまで読み込めます。");
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
    const session = await getSession();
    const key = readRecoveryKey();
    let authToken = session?.access_token || null;
    if (authToken && key) {
      const remote = await callRecovery({ action: "get" }, authToken);
      if (!remote.found) authToken = null;
    }
    const result = await callRecovery({ action: "restore_revision", revision: Number(revision), ...(!authToken && key ? { recoveryKey: key } : {}) }, authToken);
    if (!result.found || !result.payload) throw new Error("指定した世代を復元できませんでした。");
    return await restorePayload(result.payload, Number(result.revision), key);
  }
  async function unlinkRecoveryKeyLocally() {
    if (!readRecoveryKey()) return false;
    if (!confirm("このブラウザーに保存された復旧キーだけを外します。オンラインの復旧データと、ダウンロード済みの復旧キーは削除されません。このブラウザーではGoogle/X側の保全だけを使うようになります。続けますか？")) return false;
    removeStorage(RECOVERY_KEY);
    setEnabled(Boolean(await getSession()));
    await refresh();
    emit({
      label: "このブラウザーから復旧キーを外しました",
      message: "復旧キーのファイルとオンライン保管庫は維持されています。このブラウザーはGoogle/X側の保全を使います。"
    });
    return true;
  }

  async function disableOnline() {
    if (!confirm("このブラウザーでのオンライン連携を停止します。オンラインに保存済みのデータは削除されず、ローカルデータも残ります。続けますか？")) return false;
    removeStorage(SESSION_KEY);
    removeStorage(RECOVERY_KEY);
    removeStorage(ENABLED_KEY);
    removeStorage(REVISION_KEY);
    emit({ mode: "local", label: "ローカル保存のみ", message: "オンライン連携を停止しました。オンライン側のデータは削除されていません。ローカル保存とJSONバックアップは引き続き使えます。", remoteExists: false, revision: 0, conflict: false });
    return true;
  }
  async function syncAutomatically() {
    if (readStorage(ENABLED_KEY) !== "1" || restoring || !navigator.onLine) return;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const session = await getSession();
      const key = readRecoveryKey();
      if (!session && !key) return;
      const payload = collectLocalSnapshot();
      const current = await getRemote();
      if (session && key && current.mode === "oauth" && current.recoveryKeyMatches === false) {
        emit({
          conflict: true,
          remoteExists: Boolean(current.found),
          revision: Number(current.revision) || 0,
          label: "保全先が2つに分かれています",
          message: "Google/Xの保全データと復旧キーの保全データが一致しないため、自動同期を停止しました。どちらかを選ぶまでローカル保存は続きます。"
        });
        return;
      }
      if (!current.found) {
        emit({ label: "同期待ち", message: "オンラインバックアップが見つかりません。手動で初回保存を行ってください。" });
        return;
      }
      const known = Number(readStorage(REVISION_KEY) || 0);
      if (known && known !== Number(current.revision) && !sameData(payload, current.payload)) {
        emit({ conflict: true, remoteExists: true, revision: Number(current.revision), label: "同期競合あり", message: "クラウド側の更新を検出しました。ローカルデータは保存済みですが、上書きを停止しています。" });
        return;
      }
      if (sameData(payload, current.payload)) {
        writeStorage(REVISION_KEY, String(current.revision));
        emit({ conflict: false, remoteExists: true, revision: Number(current.revision), label: "同期済み", message: "この端末とオンラインバックアップの内容は一致しています。" });
        return;
      }
      /* 自動同期は既に結びついている復旧キーだけを使う。復旧専用保管庫と
         別のOAuthアカウントを、本人の明示操作なしに結びつけない。 */
      if (session && key && current.mode === "oauth" && current.recoveryKeyMatches !== false) {
        await callRecovery({ action: "create_recovery", recoveryKey: key, payload }, session.access_token);
      }
      const refreshed = await getRemote();
      if (refreshed.found && sameData(payload, refreshed.payload)) {
        writeStorage(REVISION_KEY, String(refreshed.revision));
        emit({ conflict: false, remoteExists: true, revision: Number(refreshed.revision), label: "自動同期済み", message: "ローカル保存とオンライン保全を同期しました。" });
        return;
      }
      const request = { action: "backup", expectedRevision: Number(refreshed.revision || 0), payload, ...(!refreshed.session && key ? { recoveryKey: key } : {}) };
      const result = await callRecovery(request, refreshed.session?.access_token || (session && !key ? session.access_token : null) || null);
      if (result.found) {
        writeStorage(REVISION_KEY, String(result.revision));
        emit({ conflict: false, remoteExists: true, revision: Number(result.revision), label: "自動同期済み", message: "ローカル保存とオンライン保全を同期しました。" });
      }
    })().catch((error) => {
      emit({ label: "同期待ち", message: (error.message || "同期に失敗しました。") + " ローカルデータは保存済みです。再接続時に再試行します。" });
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
    await handleOAuthCallback();
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
    const button = (label, onClick, extraClass = "") => h("button", {
      type: "button",
      className: "acct-upload-btn lbt-cloud-btn " + extraClass,
      disabled: view.busy,
      onClick,
    }, label);
    const connected = view.hasSession || view.hasRecoveryKey;
    return h("section", { className: "lbt-cloud-panel" + (compact ? " is-compact" : ""), "aria-label": "オンライン保全（任意）" },
      h("div", { className: "lbt-cloud-heading" },
        h("strong", null, "オンライン保全（任意）"),
        h("span", { className: "lbt-cloud-state" }, view.label || "ローカル保存")
      ),
      h("p", { className: "lbt-cloud-description" }, "連携は必須ではありません。ローカル保存は今まで通り継続し、オンラインに送るのは保全を選んだデータだけです。"),
      h("p", { className: "lbt-cloud-message", role: "status", "aria-live": "polite" }, view.message),
      !view.hasSession ? h("div", { className: "lbt-cloud-actions" },
        button("Googleと連携", () => run(() => startOAuth("google"))),
        button("Xと連携", () => run(() => startOAuth("x")))
      ) : h("p", { className: "lbt-cloud-account" }, "オンライン認証済み。このブラウザーからいつでも連携を停止できます。"),
      view.hasSession && view.hasRecoveryKey && view.mode === "recovery" ? button("この復旧キーをGoogle/Xにも結びつける", () => run(linkRecoveryKeyToOAuth)) : null,
      view.hasSession && view.hasRecoveryKey && view.mode === "oauth" && view.recoveryKeyMatches === false ? button("この端末の復旧キーだけ外す", () => run(unlinkRecoveryKeyLocally)) : null,
      view.hasSession && view.remoteExists && view.recoveryKeyEnabled && !view.hasRecoveryKey ? button("復旧キーを再発行（古いキーは無効化）", () => run(rotateRecoveryKey), "is-primary") : null,
      h("div", { className: "lbt-cloud-actions" },
        !view.hasRecoveryKey && !view.recoveryKeyEnabled ? button("復旧キーを発行して保全", () => run(createRecoveryKey), "is-primary") : null,
        button("全アカウントをJSON保存", () => run(async () => exportLocalBackup()))
      ),
      h("div", { className: "lbt-cloud-recovery" },
        h("label", { htmlFor: "lbt-cloud-recovery-key" }, "復旧キーから復元"),
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
      ) : (view.hasSession || view.hasRecoveryKey) && view.localMeaningful ? button("この端末のデータを初回保存", () => run(() => backupLocalToCloud({ force: false })), "is-primary") : null,
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
        connected ? button("オンライン連携を停止", () => run(disableOnline), "is-danger") : null
      ),
      h("p", { className: "lbt-cloud-footnote" }, "クラウドへ保存されるJSON本体はエンドツーエンド暗号化されません。復旧キー自体は保存せずハッシュのみを保持します。復旧キーはオンラインデータへアクセスできる秘密情報なので、安全な場所に保管し、サービス停止に備えてJSONバックアップも別途保存してください。")
    );
  }

  window.LBTCloudBackup = {
    getStatus,
    refresh,
    connect: startOAuth,
    createRecoveryKey,
    rotateRecoveryKey,
    linkRecoveryKeyToOAuth,
    restoreWithKey,
    restoreCloud,
    restoreFromFile,
    restoreRevision,
    loadHistory,
    unlinkRecoveryKeyLocally,
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
