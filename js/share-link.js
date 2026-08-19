/*
 * LBT共有リンク（v64r76）
 * URLの#fragmentに圧縮した共有スナップショットを格納する。fragmentはHTTP要求へ送信されず、
 * GitHub Pagesで公開する静的share.htmlのOGPと、共有者のビルドデータを分離できる。
 */
(function () {
  const SHARE_SCHEMA = 1;
  const MAX_TOKEN_LENGTH = 160000;
  const PRACTICAL_DISCORD_URL_LENGTH = 1900;
  const SHARE_IMAGE_TARGET_BYTES = 32 * 1024;
  // Telegraphのページ本文は64KB上限。フォームエンコードとプレフィックス分を見込み、
  // 画像入りトークンを安全にそのまま保存できる上限を60KBに置く。
  const TELEGRAPH_SAFE_TOKEN_LENGTH = 60000;
  const TINYURL_CREATE_ENDPOINT = "https://tinyurl.com/api-create.php";
  const EXTERNAL_TOKEN_MARKER = "LBT_SHARE_TOKEN=";
  const EXTERNAL_TOKEN_PART_MARKER = "LBT_SHARE_TOKEN_PART=";
  const RENTRY_TOKEN_PART_LENGTH = 180;
  const RENTRY_READ_PROXY = "https://r.jina.ai/http://rentry.co/";
  const EXTERNAL_READ_TIMEOUT_MS = 6000;
  // 共有内容は発行後に不変なので、Workerの実装更新とカード内容の世代を分ける。
  // Worker Cacheをバージョン横断で共有しても、この値を上げた時だけOGPカードを確実に再生成できる。
  const OGP_CARD_CACHE_VERSION = "1";
  // 設定時だけ短縮共有を無状態OGPゲートウェイへ渡す。未設定または配備失敗時は、
  // 従来どおりGitHub Pagesのshare.htmlを直接使うため、共有機能を止めない。
  const OGP_GATEWAY_FALLBACK_ORIGIN = "";
  const LAST_PUBLISHED_SHARE_KEY = "lbt:last-published-share:v1";
  const pendingPublishedStates = new Map();
  const SHARE_KEYS = new Set([
    "charName", "plName", "shareImageData", "personaMode", "personaNo", "personaSrc",
    "hp", "san", "speed", "bullets", "resS", "resP", "resB",
    "pas", "pas2Enabled", "pas2", "spirit", "spiritAlways", "spiritMorale", "spiritConfuse",
    "skills", "egoSlots", "supports", "deathSupport", "uniqueBuffs", "customStatuses", "enhancements",
    "inventory", "customItems", "shareOptions"
  ]);

  function cloneJSON(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function localStorageLike() {
    try {
      return window.localStorage && typeof window.localStorage.getItem === "function" ? window.localStorage : null;
    } catch (_) {
      return null;
    }
  }

  function reuseLastPublishedUrl(token) {
    const storage = localStorageLike();
    if (!storage) return null;
    try {
      const cached = JSON.parse(storage.getItem(LAST_PUBLISHED_SHARE_KEY) || "null");
      if (!cached || cached.token !== token || !/^https:\/\//.test(String(cached.url || ""))) return null;
      return {
        url: cached.url,
        length: Number(cached.length) || String(cached.url).length,
        strategy: cached.strategy || "self",
        backups: Array.isArray(cached.backups) ? cached.backups : [],
        preview: cached.preview || null,
        warning: "共有内容に変更がないため、直近の共有リンクを再利用しています。",
        reused: true
      };
    } catch (_) {
      return null;
    }
  }

  function rememberPublishedUrl(token, result) {
    const storage = localStorageLike();
    if (!storage) return;
    try {
      storage.setItem(LAST_PUBLISHED_SHARE_KEY, JSON.stringify({
        token,
        url: result.url,
        length: result.length,
        strategy: result.strategy,
        backups: result.backups || [],
        preview: result.preview || null,
        savedAt: Date.now()
      }));
    } catch (_) {
      // プライベートモード等で保存できない場合でも、現在の共有発行を妨げない。
    }
  }

  function shareImageBytes(value) {
    const match = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/i.exec(String(value || ""));
    if (!match) return 0;
    const payload = match[2];
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  }

  function validateShareImageForPublish(state) {
    const blockedMessage = String(state?.shareImageBlockedReason || "").trim();
    if (blockedMessage) return {
      ok: false,
      bytes: 0,
      maxBytes: SHARE_IMAGE_TARGET_BYTES,
      message: blockedMessage
    };
    const data = String(state?.shareImageData || "");
    if (!data) return { ok: true, bytes: 0, maxBytes: SHARE_IMAGE_TARGET_BYTES };
    const bytes = shareImageBytes(data);
    if (!bytes) return {
      ok: false,
      bytes: 0,
      maxBytes: SHARE_IMAGE_TARGET_BYTES,
      message: "共有画像の形式を確認できませんでした。Base infoでPNG・JPEG・WebP画像を再アップロードしてください"
    };
    if (bytes > SHARE_IMAGE_TARGET_BYTES) return {
      ok: false,
      bytes,
      maxBytes: SHARE_IMAGE_TARGET_BYTES,
      message: `共有画像の圧縮見込みが規定量を超えています（${Math.ceil(bytes / 1024)}KB / 32KB）。共有リンクは発行しません。Base infoで別の画像を再アップロードしてください`
    };
    return { ok: true, bytes, maxBytes: SHARE_IMAGE_TARGET_BYTES };
  }

  function personaPool(db, mode) {
    return mode === "n" ? (db?.normal_personas || []) : mode === "t" ? (db?.tokui_personas || []) : [];
  }

  function findPersonaSource(db, mode, no, name) {
    const pool = personaPool(db, mode);
    return pool.find((entry) => String(entry?.no) === String(no) && (!name || entry?.name === name)) || null;
  }

  function selectedPersonaRecord(state) {
    const personas = Array.isArray(state?.roster?.personas) ? state.roster.personas : [];
    const key = `${state?.personaMode ?? ""}:${state?.personaNo ?? ""}`;
    const selected = personas.find((entry) => `${entry?.mode ?? ""}:${entry?.no ?? ""}` === key)
      || personas.find((entry) => entry?.equipped)
      || null;
    if (!selected) return null;
    const rawSyncRank = String(selected.syncRank || "");
    return {
      no: selected.no,
      mode: selected.mode,
      syncRank: ["0", "00", "000"].includes(rawSyncRank) ? rawSyncRank : null,
      syncMax: selected.syncMax === true
    };
  }

  function compactValue(value) {
    if (Array.isArray(value)) {
      const compacted = value.map(compactValue).filter((entry) => entry !== undefined);
      return compacted.length ? compacted : undefined;
    }
    if (!value || typeof value !== "object") return value === "" ? undefined : value;
    const compacted = {};
    Object.entries(value).forEach(([key, entry]) => {
      const normalized = compactValue(entry);
      if (normalized !== undefined) compacted[key] = normalized;
    });
    return Object.keys(compacted).length ? compacted : undefined;
  }

  function sheetSkill(skill, index) {
    return compactValue({
      rank: skill?.rank || `スキル${index}`,
      type: skill?.type || "",
      sin: skill?.sin || "",
      aoe: skill?.aoe || "",
      aoeCount: skill?.aoeCount || "",
      name: skill?.name || "",
      effect: skill?.effect || "",
      dice: (skill?.dice || []).map((die) => compactValue({ roll: die?.roll || "", effect: die?.effect || "" }))
    });
  }

  function sheetUniqueBuff(buff) {
    return compactValue({
      name: buff?.name || "",
      type: buff?.type || "バフ",
      initial: buff?.initial ?? 0,
      max: buff?.max || 20,
      desc: buff?.desc || "",
      place: buff?.place || "status"
    });
  }

  function sourceSheetFields(source) {
    return {
      hp: String(source?.hp || ""),
      san: String(source?.san || ""),
      speed: source?.speed || "",
      bullets: source?.bullets || "×",
      resS: source?.res_slash || "普通",
      resP: source?.res_pierce || "普通",
      resB: source?.res_blunt || "普通",
      pas: compactValue({ name: source?.passive_name || "", cond: source?.passive_cond || "", always: source?.passive_always || "", effect: source?.passive_effect || "" }),
      skills: (source?.skills || []).map(sheetSkill),
      uniqueBuffs: (source?.unique_buffs || []).map(sheetUniqueBuff)
    };
  }

  function normalizeSheetFields(snapshot) {
    if (Array.isArray(snapshot.skills)) snapshot.skills = snapshot.skills.map(sheetSkill);
    if (Array.isArray(snapshot.uniqueBuffs)) snapshot.uniqueBuffs = snapshot.uniqueBuffs.map(sheetUniqueBuff);
    if (snapshot.pas) snapshot.pas = compactValue({ name: snapshot.pas.name || "", cond: snapshot.pas.cond || "", always: snapshot.pas.always || "", effect: snapshot.pas.effect || "" });
    return snapshot;
  }

  function sameJSON(left, right) {
    return JSON.stringify(compactValue(left) ?? null) === JSON.stringify(compactValue(right) ?? null);
  }

  function stripOfficialTransient(value) {
    if (Array.isArray(value)) return value.map(stripOfficialTransient);
    if (!value || typeof value !== "object") return value;
    const next = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (["id", "slotVariants", "kind", "originSlot", "selectedByUser"].includes(key)) return;
      next[key] = stripOfficialTransient(entry);
    });
    return compactValue(next);
  }

  function officialNameReference(value, rows) {
    if (!value?.name) return null;
    const source = (rows || []).find((entry) => entry?.name === value.name && sameJSON(stripOfficialTransient(entry), stripOfficialTransient(value)));
    return source?.name || null;
  }

  function officialEgoReference(rank, value, db) {
    if (!value?.name || value?.no === undefined) return null;
    const source = (db?.egos || []).find((entry) => entry?.rank === rank && String(entry?.no) === String(value.no) && entry?.name === value.name);
    return source && sameJSON(stripOfficialTransient(source), stripOfficialTransient(value)) ? source.no : null;
  }

  function comparableItem(value) {
    return {
      name: value?.name || "",
      category: value?.category || "その他",
      tags: Array.isArray(value?.tags) ? value.tags : [],
      effect: value?.effect || "",
      palette: value?.palette || "",
      price: value?.price || "",
      maxOwned: value?.maxOwned ?? null
    };
  }

  function officialItemReference(value, items) {
    const source = (items || []).find((entry) => sameJSON(comparableItem(entry), comparableItem(value)));
    return source?.id || null;
  }

  function compactOfficialReferences(snapshot, db) {
    const refs = {};
    if (snapshot.egoSlots) {
      refs.e = Object.fromEntries(Object.entries(snapshot.egoSlots).map(([rank, slot]) => {
        if (!slot) return [rank, null];
        return [rank, officialEgoReference(rank, slot, db) ?? slot];
      }));
      delete snapshot.egoSlots;
    }
    if (Array.isArray(snapshot.supports)) {
      refs.s = snapshot.supports.map((support) => officialNameReference(support, db?.support_passives) || support);
      delete snapshot.supports;
    }
    if (snapshot.deathSupport) {
      refs.d = officialNameReference(snapshot.deathSupport, db?.death_passives) || snapshot.deathSupport;
      delete snapshot.deathSupport;
    }
    if (Array.isArray(snapshot.enhancements)) {
      const rows = [...(db?.normal_enhancements || []), ...(db?.special_enhancements || [])];
      refs.h = snapshot.enhancements.map((enhancement) => officialNameReference(enhancement, rows) || enhancement);
      delete snapshot.enhancements;
    }
    const spirit = (db?.spirits || []).find((entry) => entry?.name === snapshot.spirit
      && String(entry?.always_effect || "") === String(snapshot.spiritAlways || "")
      && String(entry?.morale_effect || "") === String(snapshot.spiritMorale || "")
      && String(entry?.confuse_effect || "") === String(snapshot.spiritConfuse || ""));
    if (spirit) {
      refs.p = spirit.name;
      ["spirit", "spiritAlways", "spiritMorale", "spiritConfuse"].forEach((key) => delete snapshot[key]);
    }
    if (Array.isArray(snapshot.customItems)) {
      refs.c = snapshot.customItems.map((item) => {
        const officialId = officialItemReference(item, db?.items);
        return officialId ? [item.id, officialId] : item;
      });
      delete snapshot.customItems;
    }
    if (Object.keys(refs).length) snapshot._r = refs;
    return snapshot;
  }

  function normalizeShareState(data) {
    const state = data && typeof data === "object" ? data : {};
    const shareImageData = String(state.shareImageData || "");
    state.shareImageData = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(shareImageData) && shareImageData.length <= 48000
      ? shareImageData : "";
    state.skills = Array.isArray(state.skills) ? state.skills : [];
    state.supports = Array.isArray(state.supports) ? state.supports : [];
    state.uniqueBuffs = Array.isArray(state.uniqueBuffs) ? state.uniqueBuffs : [];
    state.customStatuses = Array.isArray(state.customStatuses) ? state.customStatuses : [];
    state.enhancements = Array.isArray(state.enhancements) ? state.enhancements : [];
    state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
    state.customItems = Array.isArray(state.customItems) ? state.customItems : [];
    state.egoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null, ...(state.egoSlots || {}) };
    state.pas = { name: "", cond: "", always: "", effect: "", ...(state.pas || {}) };
    state.roster = { personas: [], egos: [], ...(state.roster || {}) };
    state.roster.personas = Array.isArray(state.roster.personas) ? state.roster.personas : [];
    state.roster.egos = [];
    return state;
  }

  function hydratePersonaReference(state, db) {
    const refs = state?._r;
    if (refs?.e) {
      state.egoSlots = Object.fromEntries(Object.entries(refs.e).map(([rank, value]) => {
        if (value === null) return [rank, null];
        if (typeof value === "number" || typeof value === "string") {
          const source = (db?.egos || []).find((entry) => entry?.rank === rank && String(entry?.no) === String(value));
          return [rank, source ? cloneJSON(source) : null];
        }
        return [rank, value];
      }));
    }
    if (Array.isArray(refs?.s)) state.supports = refs.s.map((value) => typeof value === "string"
      ? cloneJSON((db?.support_passives || []).find((entry) => entry?.name === value) || { name: value }) : value);
    if (refs?.d) state.deathSupport = typeof refs.d === "string"
      ? cloneJSON((db?.death_passives || []).find((entry) => entry?.name === refs.d) || { name: refs.d }) : refs.d;
    if (Array.isArray(refs?.h)) {
      const rows = [...(db?.normal_enhancements || []), ...(db?.special_enhancements || [])];
      state.enhancements = refs.h.map((value) => typeof value === "string"
        ? cloneJSON(rows.find((entry) => entry?.name === value) || { name: value }) : value);
    }
    if (typeof refs?.p === "string") {
      const spirit = (db?.spirits || []).find((entry) => entry?.name === refs.p);
      if (spirit) {
        state.spirit = spirit.name;
        state.spiritAlways = spirit.always_effect || "";
        state.spiritMorale = spirit.morale_effect || "";
        state.spiritConfuse = spirit.confuse_effect || "";
      }
    }
    if (Array.isArray(refs?.c)) state.customItems = refs.c.map((value) => {
      if (!Array.isArray(value)) return value;
      const [customId, officialId] = value;
      const source = (db?.items || []).find((item) => item?.id === officialId);
      return source ? { ...cloneJSON(source), id: customId, custom: true, maxOwned: source.maxOwned ?? null } : { id: customId, name: officialId, custom: true };
    });
    delete state._r;
    const ref = state?.personaRef;
    if (!ref) return normalizeShareState(state);
    const source = findPersonaSource(db, ref.mode, ref.no, ref.name);
    if (!source) return normalizeShareState(state);
    Object.entries(sourceSheetFields(source)).forEach(([key, baseValue]) => {
      if (state[key] === undefined) state[key] = cloneJSON(baseValue);
    });
    state.personaSrc = { name: state.personaSrc?.name || source.name };
    delete state.personaRef;
    return normalizeShareState(state);
  }

  function snapshotState(state) {
    const source = state && typeof state === "object" ? state : {};
    const snapshot = { _lbtShare: SHARE_SCHEMA };
    Object.entries(source).forEach(([key, value]) => {
      if (SHARE_KEYS.has(key) && value !== undefined) snapshot[key] = cloneJSON(value);
    });
    if (snapshot.shareOptions?.showSyncRank !== false) delete snapshot.shareOptions;
    else snapshot.shareOptions = { showSyncRank: false };
    const ownedItemIds = new Set((snapshot.inventory || []).map((entry) => String(entry?.itemId || "")).filter(Boolean));
    snapshot.customItems = (snapshot.customItems || []).filter((item) => ownedItemIds.has(String(item?.id || "")));
    const selected = selectedPersonaRecord(source);
    snapshot.roster = { personas: selected ? [selected] : [] };
    const personaSource = findPersonaSource(window.DB, source.personaMode, source.personaNo, source.personaSrc?.name);
    if (!personaSource && (source.personaMode === "n" || source.personaMode === "t")) {
      snapshot.personaSrc = source.personaSrc?.name ? { name: String(source.personaSrc.name) } : undefined;
    }
    if (personaSource) {
      // 公式人格だけはDBから復元できるため、表示に不要な編集用一時値を除いた形で比較・参照化する。
      // DB外のオリジナル人格は入力されたオブジェクトを一切縮約せず、そのまま共有する。
      normalizeSheetFields(snapshot);
      snapshot.personaSrc = source.personaSrc?.name ? { name: String(source.personaSrc.name) } : undefined;
      snapshot.personaRef = { mode: source.personaMode, no: source.personaNo, name: personaSource.name };
      Object.entries(sourceSheetFields(personaSource)).forEach(([key, baseValue]) => {
        if (sameJSON(snapshot[key], baseValue)) delete snapshot[key];
      });
      delete snapshot.personaSrc;
      snapshot.personaRef = { mode: source.personaMode, no: source.personaNo };
    }
    compactOfficialReferences(snapshot, window.DB);
    return compactValue(snapshot) || { _lbtShare: SHARE_SCHEMA };
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    if (!value || value.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("共有リンクのデータ形式が不正です");
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function transform(bytes, stream) {
    const transformed = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(transformed).arrayBuffer());
  }

  async function encodeState(state) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshotState(state)));
    if (typeof CompressionStream === "function") {
      const compressed = await transform(bytes, new CompressionStream("deflate-raw"));
      return `z.${bytesToBase64Url(compressed)}`;
    }
    return `j.${bytesToBase64Url(bytes)}`;
  }

  async function decodeToken(token) {
    const match = /^(z|j)\.([A-Za-z0-9_-]+)$/.exec(String(token || ""));
    if (!match) throw new Error("共有リンクの形式が不正です");
    let bytes = base64UrlToBytes(match[2]);
    if (match[1] === "z") {
      if (typeof DecompressionStream !== "function") throw new Error("このブラウザは圧縮共有リンクに対応していません");
      bytes = await transform(bytes, new DecompressionStream("deflate-raw"));
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data._lbtShare !== SHARE_SCHEMA) throw new Error("この共有リンクはLBTの対応形式ではありません");
    delete data._lbtShare;
    // 人格参照型は共有ページがDBから基礎データを補う前に空配列等を補完すると、
    // 「未格納」と「意図して空」を区別できなくなる。復元後にのみ正規化する。
    return data.personaRef || data._r ? data : normalizeShareState(data);
  }

  async function createUrl(state, baseUrl) {
    const token = await encodeState(state);
    return createUrlFromToken(token, baseUrl);
  }

  function createUrlFromToken(token, baseUrl) {
    const target = String(baseUrl || window.LBT_SHARE_CANONICAL_URL || new URL("share.html", window.location.href).href).replace(/#.*/, "");
    const url = `${target}#lbt=${token}`;
    return {
      url,
      length: url.length,
      warning: url.length > PRACTICAL_DISCORD_URL_LENGTH
        ? "URLが長いためDiscord本文の文字数上限に収まらない可能性があります。共有HTMLのダウンロードを併用してください。"
        : ""
    };
  }

  function shareBaseUrl(baseUrl) {
    return String(baseUrl || window.LBT_SHARE_CANONICAL_URL || new URL("share.html", window.location.href).href).replace(/[?#].*/, "");
  }

  function displayStatus(state, field) {
    const value = state?.[field];
    const fallback = field === "hp" ? 100 : field === "san" ? 50 : "";
    const base = value === "" || value == null ? fallback : parseInt(value, 10);
    const enhancementText = (state?.enhancements || []).map((entry) => String(entry?.effect || "")).join("\n");
    const target = field === "hp" ? /HP(?:を|\+)(\d+)(?:上昇)?/g : /SAN(?:を|\+)(\d+)(?:上昇)?/g;
    let bonus = 0;
    let match;
    while ((match = target.exec(enhancementText)) !== null) bonus += parseInt(match[1], 10) || 0;
    return String((Number.isFinite(base) ? base : fallback) + bonus);
  }

  function sharePreview(state) {
    const selected = selectedPersonaRecord(state);
    const personaName = String(state?.personaSrc?.name || "").trim();
    return {
      personaName,
      hp: displayStatus(state, "hp"),
      san: displayStatus(state, "san"),
      syncRank: selected?.syncRank || "",
      syncMax: selected?.syncMax === true
    };
  }

  function appendPreviewParams(params, preview) {
    if (!preview?.personaName) return;
    params.set("lbt_n", preview.personaName.slice(0, 72));
    if (preview.hp) params.set("lbt_hp", preview.hp);
    if (preview.san) params.set("lbt_san", preview.san);
    if (preview.syncRank) params.set("lbt_sync", preview.syncRank);
    if (preview.syncMax) params.set("lbt_max", "1");
  }

  function externalViewerUrl(baseUrl, source, id, fallbacks = [], preview = null) {
    const target = shareBaseUrl(baseUrl);
    const params = new URLSearchParams({ lbt_source: source, lbt_id: id });
    const backup = (fallbacks || []).find((entry) => entry && entry.source && entry.id);
    if (backup) {
      params.set("lbt_fallback_source", backup.source);
      params.set("lbt_fallback_id", backup.id);
    }
    appendPreviewParams(params, preview);
    return `${target}?${params.toString()}`;
  }

  function sourceCode(source) {
    return source === "telegraph" ? "t" : source === "rentry" ? "r" : "";
  }

  function sourceFromCode(code) {
    return code === "t" ? "telegraph" : code === "r" ? "rentry" : "";
  }

  // 外部保存先のIDだけをURLへ残す。保存先名・事前サマリー・長いクエリ名は
  // 共有データの読み込み後に補えるため、閲覧URLの短縮対象にする。
  function shortViewerUrl(baseUrl, primary, fallbacks = []) {
    const targets = [primary, ...(fallbacks || [])].filter((entry) => entry?.source && entry?.id);
    const segments = targets.map((entry) => {
      const code = sourceCode(entry.source);
      return code ? `${code}:${encodeURIComponent(entry.id)}` : "";
    }).filter(Boolean);
    return `${shareBaseUrl(baseUrl)}?s=${segments.join(",")}`;
  }

  function ogpGatewayOrigin() {
    const candidate = String(window.LBT_OGP_GATEWAY_ORIGIN || OGP_GATEWAY_FALLBACK_ORIGIN || "").replace(/\/$/, "");
    try {
      const url = new URL(candidate);
      return url.protocol === "https:" && /^lbt-ogp\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname) ? url.origin : "";
    } catch (_) {
      return "";
    }
  }

  function ogpGatewayUrl(viewerUrl) {
    const origin = ogpGatewayOrigin();
    if (!origin) return "";
    try {
      const params = new URLSearchParams(new URL(viewerUrl).search);
      if (!params.get("s")) return "";
      params.set("cv", OGP_CARD_CACHE_VERSION);
      return `${origin}/s?${params.toString()}`;
    } catch (_) {
      return "";
    }
  }

  async function responseJson(response, context) {
    if (!response?.ok) throw new Error(`${context}に失敗しました（HTTP ${response?.status || "?"}）`);
    const data = await response.json();
    if (data?.ok === false) throw new Error(data.error || `${context}に失敗しました`);
    return data?.result || data;
  }

  async function createTinyUrl(url, fetchImpl = window.fetch?.bind(window)) {
    if (typeof fetchImpl !== "function") throw new Error("短縮URLの通信機能を利用できません");
    const endpoint = `${TINYURL_CREATE_ENDPOINT}?${new URLSearchParams({ url }).toString()}`;
    const response = await fetchImpl(endpoint);
    const shortUrl = String(await response.text()).trim();
    if (!response.ok || !/^https:\/\/tinyurl\.com\/[A-Za-z0-9_-]+$/i.test(shortUrl)) {
      throw new Error("短縮URLを発行できませんでした");
    }
    return shortUrl;
  }

  async function publishRentryToken(token, baseUrl, fetchImpl, preview) {
    const storedLines = [];
    if (token.length <= RENTRY_TOKEN_PART_LENGTH) {
      storedLines.push(`${EXTERNAL_TOKEN_MARKER}${token}`);
    } else {
      const total = Math.ceil(token.length / RENTRY_TOKEN_PART_LENGTH);
      for (let index = 0; index < total; index += 1) {
        storedLines.push(`${EXTERNAL_TOKEN_PART_MARKER}${index + 1}/${total}:${token.slice(index * RENTRY_TOKEN_PART_LENGTH, (index + 1) * RENTRY_TOKEN_PART_LENGTH)}`);
      }
    }
    const body = [
      "PAGE_TITLE = LBT Share",
      "SHARE_TITLE = LBT Share",
      "OPTION_DISABLE_SEARCH_ENGINE = true",
      "",
      "```text",
      ...storedLines,
      "```"
    ].join("\n");
    const response = await fetchImpl("https://rentry.co/api/new", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ text: body }).toString()
    });
    const result = await responseJson(response, "Rentryへの保存");
    const id = String(result?.url_short || new URL(String(result?.url || "")).pathname.replace(/^\//, ""));
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) throw new Error("Rentryの共有IDを取得できませんでした");
    return { source: "rentry", id, url: externalViewerUrl(baseUrl, "rentry", id, [], preview) };
  }

  async function publishTelegraphToken(token, baseUrl, fetchImpl, preview, includesShareImage = false) {
    const accountResponse = await fetchImpl("https://api.telegra.ph/createAccount", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ short_name: "LBTShare", author_name: "LIMBUS BUILD TERMINAL" }).toString()
    });
    const account = await responseJson(accountResponse, "Telegraphアカウントの作成");
    const accessToken = String(account?.access_token || "");
    if (!accessToken) throw new Error("Telegraphの発行権限を取得できませんでした");
    const content = JSON.stringify([{ tag: "pre", children: [`${EXTERNAL_TOKEN_MARKER}${token}`] }]);
    const pageResponse = await fetchImpl("https://api.telegra.ph/createPage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        access_token: accessToken,
        // 人格名は最終LBTシートで表示する。保存先IDを短く安定させるため、
        // Telegraph側のページタイトルは固定する。
        title: "LBT Share",
        author_name: "LIMBUS BUILD TERMINAL",
        content
      }).toString()
    });
    const page = await responseJson(pageResponse, "Telegraphへの保存");
    const id = String(page?.path || new URL(String(page?.url || "")).pathname.replace(/^\//, ""));
    if (!id || id.length > 256) throw new Error("Telegraphの共有IDを取得できませんでした");
    return {
      source: "telegraph",
      id,
      url: externalViewerUrl(baseUrl, "telegraph", id, [], preview),
      includesShareImage
    };
  }

  async function publishExternalTokens(token, baseUrl, fetchImpl = window.fetch?.bind(window), preview = null, telegraphToken = token) {
    if (typeof fetchImpl !== "function") return [];
    const results = await Promise.allSettled([
      publishRentryToken(token, baseUrl, fetchImpl, preview),
      publishTelegraphToken(telegraphToken, baseUrl, fetchImpl, preview, telegraphToken === token)
    ]);
    return results.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);
  }

  async function createPublishedUrl(state, baseUrl, fetchImpl = window.fetch?.bind(window)) {
    const pendingKey = JSON.stringify(snapshotState(state));
    if (pendingPublishedStates.has(pendingKey)) return pendingPublishedStates.get(pendingKey);
    const task = createPublishedUrlOnce(state, baseUrl, fetchImpl);
    pendingPublishedStates.set(pendingKey, task);
    try {
      return await task;
    } finally {
      pendingPublishedStates.delete(pendingKey);
    }
  }

  async function createPublishedUrlOnce(state, baseUrl, fetchImpl = window.fetch?.bind(window)) {
    const shareImageCheck = validateShareImageForPublish(state);
    if (!shareImageCheck.ok) throw new Error(shareImageCheck.message);
    const token = await encodeState(state);
    const reused = reuseLastPublishedUrl(token);
    if (reused) return reused;
    const direct = createUrlFromToken(token, baseUrl);
    const target = shareBaseUrl(baseUrl);
    const canKeepShareImageInTelegraph = !state?.shareImageData || token.length <= TELEGRAPH_SAFE_TOKEN_LENGTH;
    const telegraphToken = canKeepShareImageInTelegraph ? token : await encodeState({ ...state, shareImageData: "" });
    const preview = sharePreview(state);
    const published = await publishExternalTokens(token, target, fetchImpl, preview, telegraphToken);
    let result;
    if (published.length) {
      const primary = state?.shareImageData
        ? published.find((entry) => entry.source === "rentry")
          || published.find((entry) => entry.source === "telegraph" && entry.includesShareImage)
          || published[0]
        : published.find((entry) => entry.source === "telegraph") || published[0];
      const backups = published.filter((entry) => entry !== primary);
      const staticUrl = shortViewerUrl(target, primary, backups);
      const url = ogpGatewayUrl(staticUrl) || staticUrl;
      result = {
        ...direct, url, length: url.length, strategy: primary.source, backups, preview,
        warning: "短いLBT共有URLです。外部保存先は内部で自動復元し、利用者へ中間ページは表示しません。"
      };
    } else {
      result = { ...direct, strategy: "self", backups: [], preview, warning: "分散保存を発行できなかったため、自己完結URLを表示しています。" };
    }
    rememberPublishedUrl(token, result);
    return result;
  }

  function externalSourceFromLocation(locationLike) {
    const params = new URLSearchParams(String(locationLike?.search || ""));
    const source = params.get("lbt_source") || "";
    const id = params.get("lbt_id") || "";
    if (source === "rentry" && /^[A-Za-z0-9_-]{3,64}$/.test(id)) return { source, id };
    if (source === "telegraph" && id && id.length <= 256) return { source, id };
    return null;
  }

  function shortSourcesFromLocation(locationLike) {
    const params = new URLSearchParams(String(locationLike?.search || ""));
    const compact = String(params.get("s") || "");
    if (!compact) return [];
    return compact.split(",").map((segment) => {
      const match = /^([tr]):(.+)$/.exec(segment);
      if (!match) return null;
      const source = sourceFromCode(match[1]);
      const id = match[2];
      if (source === "rentry" && /^[A-Za-z0-9_-]{3,64}$/.test(id)) return { source, id };
      if (source === "telegraph" && id && id.length <= 256) return { source, id };
      return null;
    }).filter(Boolean).filter((entry, index, entries) => entries.findIndex((other) => other.source === entry.source && other.id === entry.id) === index);
  }

  function externalSourcesFromLocation(locationLike) {
    const compact = shortSourcesFromLocation(locationLike);
    if (compact.length) return compact;
    const params = new URLSearchParams(String(locationLike?.search || ""));
    const primary = externalSourceFromLocation(locationLike);
    const fallbackSource = params.get("lbt_fallback_source") || "";
    const fallbackId = params.get("lbt_fallback_id") || "";
    const fallback = externalSourceFromLocation({ search: `?lbt_source=${encodeURIComponent(fallbackSource)}&lbt_id=${encodeURIComponent(fallbackId)}` });
    return [primary, fallback].filter(Boolean).filter((entry, index, entries) => entries.findIndex((other) => other.source === entry.source && other.id === entry.id) === index);
  }

  function tokenFromExternalText(text) {
    const source = String(text || "");
    const match = new RegExp(`${EXTERNAL_TOKEN_MARKER}(z|j)\\.([A-Za-z0-9_-]+)`).exec(source);
    if (match) return `${match[1]}.${match[2]}`;
    const parts = [...source.matchAll(new RegExp(`${EXTERNAL_TOKEN_PART_MARKER}(\\d{1,4})/(\\d{1,4}):([A-Za-z0-9_.-]+)`, "g"))]
      .map((entry) => ({ index: Number(entry[1]), total: Number(entry[2]), value: entry[3] }))
      .filter((entry) => entry.total > 0 && entry.total <= 2000 && entry.index > 0 && entry.index <= entry.total);
    if (!parts.length) return "";
    const total = parts[0].total;
    if (parts.some((entry) => entry.total !== total) || parts.length !== total) return "";
    parts.sort((a, b) => a.index - b.index);
    if (parts.some((entry, index) => entry.index !== index + 1)) return "";
    const token = parts.map((entry) => entry.value).join("");
    return /^(z|j)\.[A-Za-z0-9_-]+$/.test(token) ? token : "";
  }

  async function verifiedExternalToken(text, sourceLabel) {
    const token = tokenFromExternalText(text);
    if (!token) throw new Error(`${sourceLabel}の共有データにLBTトークンがありません`);
    try {
      await decodeToken(token);
    } catch (_) {
      throw new Error(`${sourceLabel}の共有トークンが破損しているため、予備保存先を確認します`);
    }
    return token;
  }

  async function tokenFromExternalTarget(target, fetchImpl) {
    if (target.source === "rentry") {
      const id = encodeURIComponent(target.id);
      const directUrl = `https://rentry.co/${id}`;
      const readToken = async (url, context) => {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timer = controller ? window.setTimeout(() => controller.abort(), EXTERNAL_READ_TIMEOUT_MS) : null;
        let response;
        try {
          response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
        } finally {
          if (timer !== null) window.clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`${context}（HTTP ${response.status || "?"}）`);
        return verifiedExternalToken(await response.text(), "Rentry");
      };
      try {
        return await readToken(directUrl, "Rentryの共有データを取得できませんでした");
      } catch (directError) {
        // RentryがブラウザのCORS要求を拒む環境だけ、HTMLをテキストとして読む公開互換経路を使う。
        // 閲覧者はどちらの場合もLBT共有ページを開いたままであり、中間ページへ遷移しない。
        try {
          return await readToken(`${RENTRY_READ_PROXY}${id}`, "Rentry予備共有データを取得できませんでした");
        } catch (proxyError) {
          throw new Error(`${directError?.message || "Rentryの共有データを取得できませんでした"} / ${proxyError?.message || "Rentry予備共有データを取得できませんでした"}`);
        }
      }
    }
    const response = await fetchImpl(`https://api.telegra.ph/getPage/${encodeURIComponent(target.id)}?return_content=true`);
    const page = await responseJson(response, "Telegraphの共有データ取得");
    return verifiedExternalToken(JSON.stringify(page?.content || []), "Telegraph");
  }

  async function tokenFromExternalSource(locationLike, fetchImpl = window.fetch?.bind(window)) {
    const targets = externalSourcesFromLocation(locationLike);
    if (!targets.length) return "";
    if (typeof fetchImpl !== "function") throw new Error("外部共有データの通信機能を利用できません");
    const failures = [];
    for (const target of targets) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await tokenFromExternalTarget(target, fetchImpl);
        } catch (error) {
          failures.push(error?.message || `${target.source}の共有データを取得できませんでした`);
        }
      }
    }
    throw new Error(`共有データを取得できませんでした。${failures.join(" / ")}`);
  }

  async function tokenFromOgpGateway(locationLike, fetchImpl = window.fetch?.bind(window)) {
    const origin = ogpGatewayOrigin();
    const sources = externalSourcesFromLocation(locationLike);
    if (!origin || !sources.length || typeof fetchImpl !== "function") return "";
    const compact = sources.map((source) => `${sourceCode(source.source)}:${source.id}`).join(",");
    const response = await fetchImpl(`${origin}/d?s=${encodeURIComponent(compact)}`, { headers: { Accept: "text/plain" } });
    if (!response.ok) throw new Error(`共有データの予備復元に失敗しました（HTTP ${response.status || "?"}）`);
    const token = String(await response.text()).trim();
    if (!/^(z|j)\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("共有データの予備復元形式が不正です");
    return token;
  }

  function tokenFromLocation(locationLike) {
    const hash = String(locationLike?.hash || "").replace(/^#/, "");
    return new URLSearchParams(hash).get("lbt") || "";
  }

  function previewFromLocation(locationLike) {
    const params = new URLSearchParams(String(locationLike?.search || ""));
    const personaName = String(params.get("lbt_n") || "").trim().slice(0, 72);
    const hp = String(params.get("lbt_hp") || "").trim().replace(/[^0-9?—-]/g, "").slice(0, 8);
    const san = String(params.get("lbt_san") || "").trim().replace(/[^0-9?—-]/g, "").slice(0, 8);
    const syncRank = ["0", "00", "000"].includes(params.get("lbt_sync") || "") ? params.get("lbt_sync") : "";
    return { personaName, hp, san, syncRank, syncMax: params.get("lbt_max") === "1" };
  }

  window.LBT_shareLink = {
    snapshotState, encodeState, decodeToken, hydratePersonaReference, createUrl, createPublishedUrl,
    createTinyUrl, publishExternalTokens, externalViewerUrl, shortViewerUrl, ogpGatewayUrl, externalSourceFromLocation, shortSourcesFromLocation, externalSourcesFromLocation,
    tokenFromLocation, tokenFromExternalSource, tokenFromOgpGateway, previewFromLocation, sharePreview, PRACTICAL_DISCORD_URL_LENGTH,
    SHARE_IMAGE_TARGET_BYTES, shareImageBytes, validateShareImageForPublish
  };
})();
