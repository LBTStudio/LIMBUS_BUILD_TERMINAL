/* 硝子窓（garasumado）の共有URLから、このアカウントへ取り込む。

   共有URL 1 つ = そのキャラクターの所持がすべて入った 1 ドキュメント。
   Firestore は一覧取得を拒否する（403）ので、一覧を引く経路は存在しない。
   つまり「所持をまるごと取る」は「その URL のドキュメントを読む」だけで足りる。 */
(function () {
  const PROJECT = "lbt-garasumado";
  const DOC_ROOT = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";

  /* 共有バンドルに載っている公開読み取りキー。 Firestore のルールで
     許可された操作（単一ドキュメントの読み出し）だけが通る。
     このキーは garasumado 自身の公開バンドルに平文で載っているもので、
     単一ドキュメントの公開読み出しにしか使えない。 */
  const PUBLIC_API_KEY = "AIzaSyCzpUWr3EBQMLLEBXAixCMSl0abxSZCgY4";

  function publicApiKey() {
    return PUBLIC_API_KEY;
  }

  /* Remove Japanese particles and full-width punctuation pasted around a URL.
     Hostname and path validation still runs after trimming. ASCII ID characters
     are never removed because they may be part of the share ID. */
  function trimPastedUrlSuffix(value) {
    let clean = String(value || "").trim();
    for (let i = 0; i < 3; i++) {
      const next = clean
        .replace(/(?:から|まで|について|です|でした|の共有URL|のリンク)$/u, "")
        .replace(/[)\],.;:!?）］｝}〉》」』】、。，．，；：！？]+$/u, "");
      if (next === clean) break;
      clean = next;
    }
    return clean;
  }

  /* URL からドキュメント ID とコレクションを抜く。
     利用者が貼るのは「コピーの結果」であって正規の URL ではない。
     前後に文字が付いていても、スキームが抜けていても、末尾に
     スラッシュ・検索語・フラグメントが付いていても同じ ID を取り出せるようにする。 */
  function parseShareUrl(raw) {
    const text = trimPastedUrlSuffix(raw);
    const invalid = { ok: false, error: "硝子窓の共有URLを貼り付けてください（…/view/ID の形式）" };
    if (!text) return { ok: false, error: "URL を入力してください" };

    const bare = text.match(/^[A-Za-z0-9_-]{20}$/);
    if (bare) return { ok: true, id: text, collection: "characters" };

    const officialHost = "lbt-garasumado.vercel.app";
    let candidate = "";
    /* URL wrappers such as rd.nan7.net may have the official URL embedded in their path.
       Extract only a URL on the official host, then still run the normal hostname validation. */
    const embeddedOfficial = text.match(/https?:\/\/(?:www\.)?lbt-garasumado\.vercel\.app\/(?:persona\/)?view\/[A-Za-z0-9_-]{6,}\/?(?:[?#][^\s]*)?/i);
    const absolute = text.match(/https?:\/\/[^\s]+/i);
    if (embeddedOfficial) {
      candidate = trimPastedUrlSuffix(embeddedOfficial[0]);
    } else if (absolute) {
      candidate = trimPastedUrlSuffix(absolute[0]);
    } else {
      const hostless = text.match(/(?:^|[\s"'(<\[:（［｛〈《「『【])((?:www\.)?lbt-garasumado\.vercel\.app(?:\/[^\s]*)?)/i);
      if (!hostless) return invalid;
      candidate = trimPastedUrlSuffix("https://" + hostless[1]);
    }

    let url;
    try {
      url = new URL(candidate);
    } catch (_) {
      return invalid;
    }
    const hostname = String(url.hostname || "").toLowerCase();
    if (hostname !== officialHost && hostname !== "www." + officialHost) return invalid;

    const full = url.pathname.match(/^\/(persona\/)?view\/([A-Za-z0-9_-]{6,})\/?$/);
    if (!full) return invalid;
    return { ok: true, id: full[2], collection: full[1] ? "personas" : "characters" };
  }

  /* 複数URLを含む貼り付けからリンクを全件抽出する。周辺に説明文があっても、
     硝子窓の正式ホスト以外は読み込まず、同一ドキュメントは1回だけ取得する。 */
  function parseShareUrls(raw) {
    const text = String(raw || "");
    const links = text.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const candidates = [];
    const seenCandidates = new Set();
    const addCandidate = (value) => {
      const clean = trimPastedUrlSuffix(value);
      if (!clean || seenCandidates.has(clean)) return;
      seenCandidates.add(clean);
      candidates.push(clean);
    };

    /* 絶対URLが一つでもあると他の入力を無視する、という形にしない。
       共有URLの間に裸IDやスキームなしURLが混ざる入力も扱う。 */
    links.forEach(addCandidate);
    for (const line of lines) {
      if (/^[A-Za-z0-9_-]{20}$/.test(line)) {
        addCandidate(line);
        continue;
      }
      const hostlessUrl = /(?:^|[\s"'(<\[:（［｛〈《「『【])((?:www\.)?lbt-garasumado\.vercel\.app(?:\/[^\s]*)?)/gi;
      let hostlessMatch;
      while ((hostlessMatch = hostlessUrl.exec(line)) !== null) addCandidate(hostlessMatch[1]);
    }
    /* URLを一つも検出できない場合も、生入力を理由付きで返す。 */
    if (!candidates.length) lines.forEach(addCandidate);

    const urls = [];
    const invalid = [];
    const seen = new Set();
    for (const candidate of candidates) {
      /* 裸IDは抽出APIの互換性のため parseShareUrl では引き続き受理するが、
         複数URL取込では /view/ と /persona/view/ の種別が失われるため選択候補にしない。 */
      if (/^[A-Za-z0-9_-]{20}$/.test(candidate)) {
        invalid.push({
          text: candidate,
          reason: "共有IDだけではキャラクター共有か人格共有か判別できません。/view/ または /persona/view/ を含む共有URLを貼り付けてください"
        });
        continue;
      }
      const parsed = parseShareUrl(candidate);
      if (!parsed.ok) {
        invalid.push({ text: candidate, reason: parsed.error || "URL形式が不正です" });
        continue;
      }
      const key = parsed.collection + ":" + parsed.id;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push({ url: candidate, id: parsed.id, collection: parsed.collection });
    }
    return { urls, invalid };
  }

  /* 複数の共有スナップショットを1つの移行用文書へ統合する。
     履歴は同名シナリオの別記録を保ちつつ、同じ行が複数スナップショットに
     重複する分だけ重ねて数えない。所持数はスナップショット間で加算せず、
     最大値を採る（同じ在庫をURLの数だけ増やさない）。 */
  function mergeGarasumadoDocuments(sources) {
    const rows = (Array.isArray(sources) ? sources : [])
      .filter((source) => source && source.doc && typeof source.doc === "object")
      .map((source, index) => ({ ...source, _order: index }))
      .sort((a, b) => {
        const ta = Date.parse(a.updateTime || "");
        const tb = Date.parse(b.updateTime || "");
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        if (Number.isFinite(ta) && !Number.isFinite(tb)) return 1;
        if (!Number.isFinite(ta) && Number.isFinite(tb)) return -1;
        return a._order - b._order;
      });
    if (!rows.length) return null;

    /* PL名が揃っていれば、同じPLが別キャラクターの共有URLを持つ場合も履歴を統合できる。
       PL名が無い／一部欠ける場合は、キャラクター名が違うURLを誤って束ねないよう停止する。 */
    const plNames = new Set(rows.map((row) => nameKey(String(row.doc.plName || "").trim())).filter(Boolean));
    const characterNames = new Set(rows.map((row) => nameKey(String(row.doc.name || "").trim())).filter(Boolean));
    const missingPlName = rows.some((row) => !String(row.doc.plName || "").trim());
    const missingCharacterName = rows.some((row) => !String(row.doc.name || "").trim());
    /* 複数URLを履歴として統合できるのは、キャラクター名とPL名の両方が
       全スナップショットで確認でき、同一である場合だけ。PLが同じでも別キャラは混ぜない。 */
    const identityVerified = rows.length === 1 || (
      !missingPlName && !missingCharacterName && plNames.size === 1 && characterNames.size === 1
    );
    const mixedIdentity = plNames.size > 1 || characterNames.size > 1 || (rows.length > 1 && !identityVerified);
    if (mixedIdentity) {
      return {
        error: "異なるキャラクター／PL名のURL、または同一キャラクターか確認できないURLが混在しています。同じキャラクターかつPL名を確認できる過去スナップショットだけをまとめてください。",
        identities: { plNames: [...plNames], characterNames: [...characterNames] },
        count: rows.length
      };
    }

    const newestSource = rows[rows.length - 1];
    const newest = newestSource.doc;
    const sourceIds = [...new Set(rows.map((source) => String(source.id
      || (source.url ? (parseShareUrl(source.url).id || "") : "")).trim())
      .filter((sourceId) => /^[A-Za-z0-9_-]{6,}$/.test(sourceId)))];
    const newestSourceId = String(newestSource.id
      || (newestSource.url ? (parseShareUrl(newestSource.url).id || "") : "")).trim();
    /* 人格・E.G.O・特殊資源の現所持は最新スナップショットが正。
       古い所持を和集合にしたり、アイテム数量を最大値にすると、消費済み在庫を復活させる。
       自由メモも最新スナップショットを正として、その共有元IDを内部メタデータに残す。 */
    const merged = {
      ...newest,
      ...(newestSourceId ? { __lbtFreeNotesSourceId: newestSourceId } : {}),
      ...(sourceIds.length ? { __lbtFreeNotesSourceIds: sourceIds } : {})
    };

    /* 同じ履歴が複数スナップショットにあるときは、重複する出現数だけ除く。
       同名・同本文のシナリオを実際に複数回通過したケースは、出現回数分を残す。 */
    const previousOccurrences = new Map();
    const history = [];
    for (const source of rows) {
      const localOccurrences = new Map();
      const sourceHistory = Array.isArray(source.doc.scenarioHistory) ? source.doc.scenarioHistory : [];
      const sourceId = String(source.id || (source.url ? (parseShareUrl(source.url).id || "") : "")).trim();
      for (let sourceIndex = 0; sourceIndex < sourceHistory.length; sourceIndex += 1) {
        const scenario = sourceHistory[sourceIndex];
        if (!scenario || typeof scenario !== "object") continue;
        const signature = JSON.stringify([
          String(scenario.name || "").trim(),
          String(scenario.memo || "").trim(),
          String(scenario.date || scenario.createdAt || scenario.at || "")
        ]);
        const occurrence = (localOccurrences.get(signature) || 0) + 1;
        localOccurrences.set(signature, occurrence);
        if (occurrence <= (previousOccurrences.get(signature) || 0)) continue;
        /* 取り込み元を文書内だけのメタデータとして残す。元の硝子窓文書は変更しない。
           同一URLから再取込したとき、メモの誤記修正や再解析後も同じリザルトを特定できる。 */
        history.push(sourceId
          ? { ...scenario, __lbtShareSourceId: sourceId, __lbtShareSourceIndex: sourceIndex }
          : scenario);
      }
      for (const [signature, count] of localOccurrences) {
        previousOccurrences.set(signature, Math.max(previousOccurrences.get(signature) || 0, count));
      }
    }
    if (rows.some((source) => Array.isArray(source.doc.scenarioHistory))) merged.scenarioHistory = history;

    /* 自由メモも最新文書を正とする。履歴を足すことでシステムメモを二重に実行しない。 */
    return merged;
  }
  /* Firestore の値表現を素の値へ。 */
  function unwrapFirestore(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "object") return value;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("nullValue" in value) return null;
    if (value.mapValue) {
      return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, unwrapFirestore(v)]));
    }
    if (value.arrayValue) return (value.arrayValue.values || []).map(unwrapFirestore);
    const known = ["stringValue", "arrayValue", "mapValue", "integerValue", "booleanValue", "doubleValue", "timestampValue", "nullValue"];
    if (!known.some((k) => k in value)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unwrapFirestore(v)]));
    }
    return value;
  }

  /* キャラクター列挙。 personas を先に試す（persona ドキュメントもあるため）。 */
  async function fetchGarasumadoDocument(url, options) {
    const opts = options || {};
    const parsed = parseShareUrl(url);
    if (!parsed.ok) return parsed;

    const request = opts.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (typeof request !== "function") return { ok: false, error: "ネットワーク（fetch）がありません" };

    const order = parsed.collection === "personas" ? ["personas", "characters"] : ["characters", "personas"];
    const attempts = [];
    for (const collection of order) {
      const url = `${DOC_ROOT}/${collection}/${parsed.id}?key=${opts.apiKey || PUBLIC_API_KEY}`;
      try {
        const response = await request(url, { headers: { Accept: "application/json" } });
        if (response && response.ok) {
          const body = await response.json();
          return { ok: true, id: parsed.id, collection, updateTime: body.updateTime || "", doc: unwrapFirestore(body.fields) };
        }
        attempts.push(collection + ": " + (response ? response.status : "no response"));
      } catch (error) {
        attempts.push(collection + ": " + (error && error.message ? error.message : "network"));
      }
    }
    return { ok: false, error: "取得できませんでした（" + attempts.join(" / ") + "）。共有ONになっているか確認してください" };
  }

  const nameOf = (row) => (typeof row === "string" ? String(row).trim() : row && row.name ? String(row.name).trim() : "");

  const GROUPS = [
    { id: "personas", label: "所持人格" },
    { id: "egos", label: "所持 E.G.O" },
{ id: "supportPassives", label: "所持パッシブ" },
   { id: "spirits", label: "所持精神" },
   { id: "items", label: "所持アイテム" }
   ];

  /* 人名照合用のキー。共有データの人名は体裁が揺れるため、
     空白・全角英数字・大小文字を吸収する。 */
  function nameKey(s) {
    return String(s || "")
      .replace(/[\s\u3000]/g, "")
      .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  }

  /* 共有ドキュメントの旧略称／範囲表記をDBの強化へ正規化する。
     DB照合できない文字列は効果や価格を作らず、unresolved として呼び出し元へ返す。 */
  function resolveImportedEnhancements(values, db) {
    const rows = [
      ...(Array.isArray(db?.normal_enhancements) ? db.normal_enhancements : []),
      ...(Array.isArray(db?.special_enhancements) ? db.special_enhancements : [])
    ].filter((row) => row && String(row.name || "").trim());
    const keyOf = (value) => nameKey(value)
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/[〜～]/g, "~");
    const byName = new Map(rows.map((row) => [keyOf(row.name), row]));
    const groups = [...new Set(rows.map((row) => String(row.group || "").trim()).filter(Boolean))]
      .sort((a, b) => keyOf(b).length - keyOf(a).length);
    const aliases = new Map([
      ["闘志", "燃え上がる闘志"],
      ["自生", "自生する肉体"],
      ["サポートスロット", "サポートスロット追加"],
      ["サポートスロット解放", "サポートスロット追加"],
      ["サポートスロット拡張", "サポートスロット追加"],
    ].map(([from, to]) => [keyOf(from), keyOf(to)]));
    const selected = [];
    const selectedKeys = new Set();
    const unresolved = [];
    const add = (row) => {
      if (!row) return;
      const key = keyOf(row.name) + "|" + keyOf(row.group || "");
      if (selectedKeys.has(key)) return;
      selectedKeys.add(key);
      selected.push(row);
    };
    const resolveOne = (raw) => {
      const whole = nameOf(raw);
      if (!whole) return false;
      const labels = [whole, whole.split(/[：:]/, 1)[0].trim()].filter(Boolean);
      for (const label of labels) {
        const key = keyOf(label);
        const aliasTarget = aliases.get(key);
        if (aliasTarget && byName.has(aliasTarget)) {
          add(byName.get(aliasTarget));
          return true;
        }
        const exact = byName.get(key);
        if (exact) {
          add(exact);
          return true;
        }
        for (const group of groups) {
          const groupKey = keyOf(group);
          if (!key.startsWith(groupKey)) continue;
          const suffix = key.slice(groupKey.length);
          const groupRows = rows.filter((row) => keyOf(row.group || "") === groupKey);
          if (!suffix) {
            if (groupRows.length) {
              groupRows.forEach(add);
              return true;
            }
            continue;
          }
          const range = suffix.match(/^-?(\d+)~(?:[a-z])?(\d+)$/i);
          if (!range) continue;
          const low = Number(range[1]);
          const high = Number(range[2]);
          if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low < 1 || high < low || high - low > 20) continue;
          const matches = groupRows.filter((row) => {
            const rowKey = keyOf(row.name);
            const match = rowKey.match(/-(\d+)$/);
            if (!match || !rowKey.startsWith(groupKey + "-")) return false;
            const level = Number(match[1]);
            return level >= low && level <= high;
          });
          if (matches.length) {
            matches.forEach(add);
            return true;
          }
        }
      }
      return false;
    };
    for (const value of Array.isArray(values) ? values : []) {
      if (!resolveOne(value)) {
        const label = nameOf(value) || String(value || "").trim();
        if (label && !unresolved.some((item) => keyOf(item) === keyOf(label))) unresolved.push(label);
      }
    }
    return {
      rows: selected.map((row) => ({
        group: String(row.group || ""),
        name: String(row.name || ""),
        effect: String(row.effect || ""),
        shards: Number.isSafeInteger(Number(row.shards)) && Number(row.shards) >= 0 ? Number(row.shards) : 0,
        category: String(row.category || "")
      })),
      unresolved
    };
  }

  /* 所持側の品目名には装飾（【…】/[…]/（…）/MAX/の人格）が付く。
      メモ側は正式名で書かれることが多いので、装飾を除いた形でも照合する。
      E.G.O は「演出名：本体名」なので、：より前の演出名も剥がす。
      メモは本体名だけ（蒼羽蝶）で書くことが多い。重複は照合側の
      一意性検査（looseCounts===1）で弾く。 */
  const looseKey = (s) => nameKey(String(s || "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/MAX|max|専用|の人格/g, "")
    .replace(/^[^：:]{1,24}[：:]/, ""));

  /* 支出行は「名前 金額通貨（消費/購入）」の 1 行なので、照合には
     末尾の金額通貨と動詞を落とした名前を使う。
     「切り伏せる斬撃 150LP消費」「握る者闘志 210欠片」→ 名前だけ。 */
  function spendNameOf(spend) {
    let text = String((spend && spend.name) || "").trim();
    for (let i = 0; i < 3; i += 1) {
      const cleaned = text
        .replace(/[0-9０-９]+\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|枚)\s*(?:消費|購入|使用)?\s*へ?\s*$/i, "")
        .trim();
      if (!cleaned || cleaned === text) break;
      text = cleaned;
    }
    return text.replace(/(?:消費|購入|使用|行使|要した|支出|支払|補充|回復|切替)+$/g, "").trim();
  }

  /* 所持一覧とシナリオ履歴を突き合わせて、どのシナリオで手に入れたかを求める。
     共有データの owned には入手元の列が無く、シナリオ履歴の獲得記述（獲得行と
     支出行）だけが手掛かりになる。引けなかったものを消す・推測で埋めることはしない。
     件数を返して、利用者に「判別できなかった」を通知する。 */
  function attributeOwned(groups, scenarios) {
    const byKey = new Map();
    const slotOf = (key) => {
      if (!byKey.has(key)) byKey.set(key, { via: [], wins: [], spends: [] });
      return byKey.get(key);
    };
    /* 表示ゆれの照合。所持側の名前は【同期000】や [MAX] などの装飾を
       持ち、獲得行は素の名前で書かれがち。装飾を落とした鍵でも引く。
       ゆれ一致は衝突しやすいので、所持側で鍵が重複するときは決めない。 */

    const byLoose = new Map();
    const looseSlotOf = (key) => {
      if (!byLoose.has(key)) byLoose.set(key, { via: [], wins: [], spends: [] });
      return byLoose.get(key);
    };
    for (const scenario of scenarios) {
      const name = String(scenario.name || "").trim();
      if (!name) continue;
      for (const win of scenario.wins || []) {
        const rawName = win.raw || win.name;
        const key = nameKey(rawName);
        const loose = looseKey(rawName);
        if (key) {
          const slot = slotOf(key);
          if (!slot.via.includes(name)) slot.via.push(name);
          slot.wins.push({ scenario: name, raw: rawName, via: win.via || "", bought: Boolean(win.bought) });
        }
        if (loose) {
          const slot = looseSlotOf(loose);
          if (!slot.via.includes(name)) slot.via.push(name);
          if (!slot.wins.some((w) => w.raw === rawName)) {
            slot.wins.push({ scenario: name, raw: rawName, via: win.via || "", bought: Boolean(win.bought) });
          }
        }
      }
      /* 支出行も入手の痕跡。買ったものは所持一覧に載る。 */
      for (const spend of scenario.spends || []) {
        const spendName = spendNameOf(spend);
        const key = nameKey(spendName);
        const loose = looseKey(spendName);
        if (!key && !loose) continue;
        const evidence = {
          scenario: name,
          name: String(spend.name || "").trim(),
          lp: Number(spend.lp || 0),
          shards: Number(spend.shards || 0)
        };
        if (key) {
          const slot = slotOf(key);
          if (!slot.via.includes(name)) slot.via.push(name);
          slot.spends.push(evidence);
        }
        if (loose) {
          const slot = looseSlotOf(loose);
          if (!slot.via.includes(name)) slot.via.push(name);
          if (!slot.spends.some((s) => s.name === evidence.name)) slot.spends.push(evidence);
        }
      }
    }
    /* 所持側のゆれ鍵の重複数（同期0とMAXなど）。重複した鍵は決めない。 */
    const looseCounts = new Map();
    for (const group of groups) {
      for (const item of group.items) {
        const loose = looseKey(item.name);
        if (loose) looseCounts.set(loose, (looseCounts.get(loose) || 0) + 1);
      }
    }
    /* 本文言及の照合。勝ち／支出行が無くても、シナリオの本文に
       項目名がそのまま書かれていれば帰属できる（「本文言及」階級）。
       DB で解決済みの人格・E.G.O・サポパだけに限る。名前の無い所持
       （未解決）や短い語（精神・逸失の欠片）は、文章の名前とたまたま
       一致する事故があるので勝手に当てない。 */
    const mentions = (scenarios || [])
      .filter((s) => s.key !== "scenario:purchases" && String(s.memo || "").trim())
      .map((s) => ({ name: String(s.name || "").trim(), text: String(s.memo) }))
      .filter((m) => m.name);
    const mentionGroups = new Set(["personas", "egos", "supportPassives"]);
    let matchedByMention = 0;
    let matched = 0;
    let unmatched = 0;
    let matchedBySpend = 0;
    let matchedByLoose = 0;
    let needsIdentity = 0;
    const unmatchedNames = [];
    /* 帰属先として選ばせるシナリオ名。重複と空文字は落とす。 */
    const scenarioNames = [...new Set((scenarios || []).map((s) => String(s?.name || "").trim()).filter(Boolean))];
    for (const group of groups) {
      for (const item of group.items) {
        let hit = byKey.get(nameKey(item.name));
        let tier = hit ? "exact" : "";
        if (!hit) {
          const loose = looseKey(item.name);
          if (loose && looseCounts.get(loose) === 1 && byLoose.has(loose)) {
            hit = byLoose.get(loose);
            tier = "loose";
          }
        }
        if (!hit && mentionGroups.has(group.id) && item.resolved && String(item.name || "").trim().length >= 3) {
          for (const m of mentions) {
            if (m.text.includes(String(item.name).trim())) {
              hit = { via: [m.name], wins: [], spends: [] };
              tier = "mention";
              break;
            }
          }
        }
        item.via = hit ? hit.via : [];
        item.wins = hit ? hit.wins : [];
        item.spends = hit ? hit.spends : [];
        item.matchTier = tier;
        item.source = guessSource(item.wins, item.spends);
        if (tier === "loose") matchedByLoose += 1;
        if (tier === "mention") matchedByMention += 1;
        if (item.wins.length === 0 && item.spends.length > 0) matchedBySpend += 1;
        if (item.needsIdentity) needsIdentity += 1;
        if (item.via.length) matched += 1;
        else {
          unmatched += 1;
          unmatchedNames.push(item.name);
          /* シナリオに記載が無いので、自動では紐付けない。
             帰属先そのものが未決なので、利用者が選ぶまで登録しない。
             選ばせるには選択肢が要る。ここでシナリオ名一覧を候補として持たせる。
             シナリオ履歴が1件も無い文書には帰属先が存在しないので、
             未決扱いにしない（選ばせる対象が無いまま「選んでください」で
             詰める形になる）。その場合は帰属なしの未分類として通す。 */
          if (scenarioNames.length) {
            item.needsAttribution = true;
            item.pickedScenario = "";
            item.scenarioOptions = [...scenarioNames];
          }
        }
      }
    }
    return { matched, unmatched, matchedBySpend, matchedByLoose, matchedByMention, needsIdentity, unmatchedNames };
  }

  /* 入手方法の初期値。履歴の書き方から分かるものはそのまま入れ、
     分からないものは空欄（=利用者が設定する）にして推測しない。 */
const SOURCES = [
    { id: "ticket", label: "チケット" },
    { id: "buy", label: "購入（LP/欠片）" },
    { id: "given", label: "配布" }
  ];

  function guessSource(wins, spends) {
    /* 「ルサンチマン購入-7」のような購入の短文。名前が勝ちの中にあり、
       購入の事実を伴うなら購入。 */
    if ((wins || []).some((win) => win.bought)) return "buy";
    for (const win of wins || []) {
      const text = `${win.via || ""} ${win.raw || ""}`;
      if (/抽選|チケット/.test(text)) return "ticket";
    }
    /* 獲得行に無く支出行にあるなら購入。 */
    if ((spends || []).length) return "buy";
    return "";
  }

/* 名前から DB の行を列挙する。索引の resolve は「1 つに絞った答え」しか
   返さないため、所持項目のように同名・異種が混在しうる場面では
   候補そのものを利用者に選ばせる必要がある。
   候補を 0 件のまま確定にはしない（推測はしない）。
   索引の候補を「1 行 = 利用者が選べる項目」へ平坦化する。
   resolve は先頭 1 件しか返さないため、同名複数があると名前だけでは
   区別できない。 */
function toIdentityChoices(hits) {
  const out = [];
  for (const hit of hits || []) {
    for (const k of hit.kinds || []) {
      if (!k || !k.kind) continue;
      const key = [k.kind, k.rank || "", k.no ?? k.spp ?? k.id ?? "", k.mode || ""].join(":");
      if (out.some((o) => o.key === key)) continue;
      out.push({ ...k, key, name: hit.name || k.name || String(hit.probe || "") });
    }
  }
  return out;
}
  /* 取込候補の一覧を作る。利用者が「何を取り込むか」を選べるようにするため、
     ここではまだ何も state へ入れない。 */
  function buildManifest(doc, nameIndex, db) {
    /* Firestore の外部文書はスキーマが古い／破損していることがある。
       配列でない欄を map/filter に渡すと、取り込み全体が例外で止まる。 */
    const owned = doc && doc.owned && typeof doc.owned === "object" && !Array.isArray(doc.owned)
      ? doc.owned : {};
    
    const resolve = typeof nameIndex?.resolve === "function" ? nameIndex.resolve : null;
    /* 候補を全部返す解決器。1 件に絞らないので、同名複数をユーザーに見せられる。 */
    const resolveMany = typeof nameIndex?.candidates === "function" ? nameIndex.candidates : null;
    /* 強化は人格行の子データなので、名前だけに正規化する前に別途保持する。 */
    const personaEnhancementsByName = new Map();
    for (const row of Array.isArray(owned.personas) ? owned.personas : []) {
      if (!row || typeof row !== "object" || Array.isArray(row) || !Array.isArray(row.enhancements)) continue;
      const personaName = nameOf(row);
      if (!personaName) continue;
      const key = nameKey(personaName);
      const names = row.enhancements.map(nameOf).filter(Boolean);
      const existing = personaEnhancementsByName.get(key);
      if (existing) existing.names = [...new Set([...existing.names, ...names])];
      else personaEnhancementsByName.set(key, { names: [...new Set(names)] });
    }

    const groups = GROUPS.map((group) => {
      /* アイテムだけは owned ではなく共有ドキュメントのトップレベルにある。
         個数が 0 のものは所持ではないので落とさない（残すと「持っていないのに
         計上」になるため、個数で除外する）。 */
      const source = group.id === "items"
        ? (Array.isArray(doc && doc.items) ? doc.items : []).filter((it) => Number(it && it.count) > 0)
        : (Array.isArray(owned[group.id]) ? owned[group.id] : []);
      /* サポパは文書のトップレベルにも sheet の真実がある（name/condition/effect）。
         owned.supportPassives が空文字スロットだけの文書（mMIb）や、
         owned に列が無い 11 文書 19 件の実名がここにしか無い。
         owned と同名のものは重ねない。 */
      const sheetSupports = group.id === "supportPassives"
        ? (Array.isArray(doc && doc.supportPassives) ? doc.supportPassives : [])
          .map((row) => (row && String(row.name || "").trim()) || "")
          .filter(Boolean)
        : [];
      const knownNames = new Set(source.map(nameOf).map(nameKey));
      const sheetOnly = sheetSupports.filter((nm) => !knownNames.has(nameKey(nm)));
      const names = [...new Set([...source.map(nameOf).filter(Boolean), ...sheetOnly])];
      /* 精神も計上する。DB の spirits 48件のうち無料は初期精神の3件
         （パニック/圧倒/萎縮）で、残り45件は 50〜1000 LP の有料品。
         以前は「48件すべて無料」と誤認して所持から落としていたが、
         そのせいで有料の精神まで購入記録ごと消えていた。 */
      const listed = names;
      const sourceByName = new Map(source.map((row) => [nameKey(nameOf(row)), row]));
      /* アイテムは個数を持つ（包帯x2 等）。取り込みで数を落とさない。 */
      const itemQty = group.id === "items"
        ? new Map(source.map((it) => [nameKey(nameOf(it)), Number(it && it.count) || 1]))
        : null;
      return {
        id: group.id,
        label: group.label,
        items: listed.map((name) => {
          const sourceEntry = sourceByName.get(nameKey(name));
          const hit = resolve ? resolve(name) : null;
          const candidates = toIdentityChoices(resolveMany ? resolveMany(name) : null);
          const sharedEnhancements = group.id === "personas" ? personaEnhancementsByName.get(nameKey(name)) : null;
          return {
            key: group.id + ":" + name,
            ...(sharedEnhancements ? { importedEnhancementNames: sharedEnhancements.names } : {}),
            group: group.id,
            name,
            ...(group.id === "egos" && sourceEntry && sourceEntry.rank ? { sourceRank: String(sourceEntry.rank) } : {}),
            quantity: itemQty ? (itemQty.get(nameKey(name)) || 1) : undefined,
            resolved: Boolean(hit),
            dbName: hit ? hit.name : "",
            kinds: hit ? hit.kinds : [],
            confidence: hit ? hit.confidence : "",
/* どのDB行と一致するか。複数あれば利用者に選ばせる。 */
            candidates,
            identityCandidates: candidates,

            /* 候補が 1 つに決まらない、または 0 件（DBに無い）場合は選択が必要。 */
            needsIdentity: candidates.length !== 1,
            picked: null,
            /* 入手方法（抽出/チケット/配布）。シナリオ履歴の記載から
               推定できるものは初期値にし、違うものは利用者が変える。 */
            source: "",
            /* 照合で見つかった獲得の明細（シナリオ名と書き方）。 */
            wins: []
          };
        })
      };
    });

    /* シナリオ履歴。memo を専用パーサにかけ、収入・チケット・支出へ分解する。
       ここで初めて「シナリオ1件 = リザルト1件 + その支出明細」になる。

       wins（シナリオで直接払い出された人格/E.G.O）は名前だけでは
       取り込み先に決まらないので、既存の名前索引で DB へ引く。
       引けなかったものは利用者に渡し、勝手に埋めずに残す。 */
    const memoApi = (typeof window !== "undefined" && window.LBT_garaMemo) || null;
    /* wins の照合は、既存の nameIndex.resolve と同じ形の索引を使う。
       resolve が無ければ名前だけで種別を見分ける（番号は取れない）。 */
    const indexForWins = resolve ? { resolve } : (nameIndex || null);
    /* 明示された取引種別と、DB内での一意な同種別部分一致が両方成立するときだけ
       短縮名を補う。一般の名前解決へ別名を登録しないため、他の場面では推測しない。 */
    const resolveWinByContext = (raw, kindHint) => {
      if (kindHint !== "persona" || !db || typeof db !== "object") return null;
      const query = nameKey(raw);
      if (query.length < 4) return null;
      const rows = [
        ...(Array.isArray(db.normal_personas) ? db.normal_personas.map((row) => ({ row, mode: "n" })) : []),
        ...(Array.isArray(db.tokui_personas) ? db.tokui_personas.map((row) => ({ row, mode: "t" })) : [])
      ].filter(({ row }) => {
        const full = nameKey(row && row.name);
        return full.length > query.length && full.includes(query);
      });
      const unique = new Map(rows.map((entry) => [
        String(entry.mode) + ":" + String(entry.row && entry.row.no),
        entry
      ]));
      if (unique.size !== 1) return null;
      const [{ row, mode }] = [...unique.values()];
      if (!row || row.no == null || !String(row.name || "").trim()) return null;
      return {
        name: String(row.name).trim(),
        confidence: "context-kind-unique-substring",
        kinds: [{ kind: "persona", no: row.no, mode }]
      };
    };
    const resolveWins = (list) => (list || []).map((w) => {
      const raw = String(w.name || "").trim();
      if (!raw) return null;
      const contextualHit = resolveWinByContext(raw, w.entityKindHint);
      const hit = contextualHit || (indexForWins && typeof indexForWins.resolve === "function"
        ? indexForWins.resolve(raw)
        : null);
      const kinds = hit ? hit.kinds || [] : [];
      /* 引けなかった wins に種別を捏造しない。以前は「人格」を既定で
         埋めていたため、ラベルや叙述の断片が獲得として記録に入った。
         番号が無ければ所持には入らない（原本と食い違う記録を作らない）。 */
      return {
        raw,
        name: raw,
        kinds,
        via: w.via || "",
        bought: Boolean(w.bought),
        ...(w.entityKindHint ? { entityKindHint: w.entityKindHint } : {}),
        ...(contextualHit ? { resolution: contextualHit.confidence } : {}),
        resolved: Boolean(hit)
      };
    }).filter(Boolean);

    const history = Array.isArray(doc && doc.scenarioHistory) ? doc.scenarioHistory : [];
    const scenarioOccurrences = new Map();
    const scenarios = history
      .filter((row) => row && (row.name || row.memo))
      .map((row, index) => {
        const name = String(row.name || "").trim() || "無題";
        const sourceId = String(row.__lbtShareSourceId || "").trim();
        const sourceDate = String(row.date || row.createdAt || row.at || "").trim().slice(0, 10);
        const occurrenceScope = JSON.stringify([sourceId, sourceDate, nameKey(name)]);
        const occurrence = (scenarioOccurrences.get(occurrenceScope) || 0) + 1;
        scenarioOccurrences.set(occurrenceScope, occurrence);
        /* memo は修正対象なのでキーに含めない。同名の反復記録は出現順で区別する。 */
        const importSourceKey = sourceId
          ? ("gara1:" + sourceId + ":" + (sourceDate || "undated") + ":" + nameKey(name).slice(0, 64) + ":" + occurrence)
          : "";
        const base = {
          key: "scenario:" + index,
          name,
          group: "scenarios",
          ...(row.date ? { date: String(row.date).slice(0, 10) } : {}),
          ...(importSourceKey ? { importSourceKey } : {})
        };
        if (!memoApi) return { ...base, memo: String(row.memo || ""), income: { lp: 0, shards: 0 }, tickets: {}, pack: {}, spends: [], wins: [], reasons: [{ reason: "メモパーサが読み込まれていない" }], currencyDiscrepancies: [] };
        const parsed = memoApi.parseMemo(row.memo);
        const wins = resolveWins(parsed.wins);
        return {
          ...base,
          memo: String(row.memo || ""),
          income: parsed.income,
          tickets: parsed.tickets,
          pack: parsed.pack,
          spends: parsed.spends,
          consumedItems: parsed.consumedItems || [],
          ticketSpends: parsed.ticketSpends || [],
          reasons: parsed.reasons,
          currencyDiscrepancies: parsed.currencyDiscrepancies || [],
          sourceAudits: parsed.sourceAudits || [],
          financialCoverage: parsed.financialCoverage || [],
          /* シナリオで直接払い出された人格/E.G.O。 */
          wins,
          /* 金額が入らなかったシナリオも一覧には出す。利用者が
             「読み取れなかった」ことを知情できるようにするためで、
             取り込みの判断は利用者に返す。
             支出だけのシナリオもある（収入が 0 だったもの）ので、
             支出がある場合も残す。 */
          hasData: parsed.income.lp > 0 || parsed.income.shards > 0 ||
            (parsed.tickets.persona + parsed.tickets.ego + parsed.tickets.choice) > 0 ||
            Object.keys(parsed.pack || {}).length > 0 ||
            (parsed.spends || []).length > 0 ||
            (parsed.ticketSpends || []).length > 0 ||
            (parsed.reasons || []).length > 0 ||
            wins.length > 0 ||
            (parsed.sourceAudits || []).some((entry) => entry && entry.severity !== "info")
        };
      });

    /* 自由メモの購入記録。secret/history 等に「LP-20 サポートパッシブ
       「人生一発」購入」「ルサンチマン購入-7」のような短文を書くユーザーが
       実データにいる。文章全体を解析すると物語の名前まで拾うので、
       購入の短文の形の行だけを購入履歴として読む。シナリオの一覧には
       載せない（リザルトの実体ではない）。帰属の証跡だけに使う。 */
    const freeNotes = (doc && doc.freeNotes) || {};
    const purchaseMemo = ["secret", "history", "memo", "setting"]
      .flatMap((field) => String(freeNotes[field] || "").split(/\r?\n/))
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .filter((line) => memoApi && memoApi.purchaseRowOf && memoApi.purchaseRowOf(line))
      .join("\n");
    const freeNotesSourceId = String(doc && doc.__lbtFreeNotesSourceId || "").trim();
    const freeNotesSourceIds = [...new Set((Array.isArray(doc && doc.__lbtFreeNotesSourceIds)
      ? doc.__lbtFreeNotesSourceIds : [freeNotesSourceId])
      .map((sourceId) => String(sourceId || "").trim())
      .filter((sourceId) => /^[A-Za-z0-9_-]{6,}$/.test(sourceId)))];
    let purchaseScenario = null;
    if (purchaseMemo && memoApi) {
      const parsed = memoApi.parseMemo(purchaseMemo);
      const purchaseOccurrences = new Map();
      const purchaseSpends = (parsed.spends || []).map((row) => {
        /* 金額は修正対象なのでキーに含めず、購入品名＋同名出現順で識別する。
           source単位の置換を先に行うため、削除・改名された古い行も残らない。 */
        const purchaseNameKey = nameKey(String(row.name || "購入")).slice(0, 64) || "purchase";
        const occurrence = (purchaseOccurrences.get(purchaseNameKey) || 0) + 1;
        purchaseOccurrences.set(purchaseNameKey, occurrence);
        const importSourceKey = /^[A-Za-z0-9_-]{6,}$/.test(freeNotesSourceId)
          ? ("gara-free:" + freeNotesSourceId + ":" + purchaseNameKey + ":" + occurrence).slice(0, 180)
          : "";
        return { ...row, ...(importSourceKey ? { importSourceKey } : {}) };
      });
      purchaseScenario = {
        key: "scenario:purchases",
        name: "購入履歴",
        group: "scenarios",
        memo: purchaseMemo,
        income: { lp: 0, shards: 0 },
        tickets: { persona: 0, ego: 0, choice: 0 },
        pack: {},
        spends: purchaseSpends,
        wins: resolveWins(parsed.wins),
        reasons: [],
        currencyDiscrepancies: parsed.currencyDiscrepancies || []
      };
    }

    /* 購入記述を所持証跡に載せる。所持列が名前を持たない文書（mMIb は
       サポパ 11 枠が全て空文字、憎悪・倍返しの準備・因子コードG-5 は
       リザルトの購入行にしか出てこない）では、リザルトの購入行が
       実質の所持記録になる。そこで wins のうち DB で 1 種別にだけ
       解ける support/spirit の名を所持に補充する。解けない名前は
       所持に載せない（勝った番号も無い行からの捏造をしない）。 */
    for (const sc of purchaseScenario
      ? [...scenarios, purchaseScenario]
      : scenarios) {
      for (const win of (sc.wins || [])) {
        if (!win.resolved || win.kinds.length !== 1) continue;
        const kind = win.kinds[0].kind;
        const gid = kind === "support" ? "supportPassives" : kind === "spirit" ? "spirits" : "";
        if (!gid) continue;
        const targetGroup = groups.find((g) => g.id === gid);
        if (!targetGroup) continue;
        const nkey = nameKey(win.name);
        if (targetGroup.items.some((it) => nameKey(it.name) === nkey)) continue;
        targetGroup.items.push({
          key: gid + ":" + win.name,
          group: gid,
          name: win.name,
          resolved: true,
          dbName: win.name,
          kinds: win.kinds,
          confidence: "index",
          candidates: [],
          identityCandidates: [],
          needsIdentity: false,
          picked: null,
          source: "",
          fromResults: true,
          wins: []
        });
      }
    }

    const attribution = attributeOwned(groups, purchaseScenario ? [...scenarios, purchaseScenario] : scenarios);

    /* 初期精神は、DB で価格 0 が明示されたものだけ。価格の欠落・null・空欄・
       不正値を無料と混同しない。共有文書に価格不明の精神があっても所持一覧には
       残すが、初期所持数の判定には使わない。 */
    const spiritPrices = new Map(
      ((db && db.spirits) || [])
        .filter((s) => s && s.name && (
          (typeof s.price === "number" && Number.isFinite(s.price))
          || (typeof s.price === "string" && s.price.trim() !== "" && Number.isFinite(Number(s.price)))
        ))
        .map((s) => [nameKey(s.name), Number(s.price)])
    );
    const initialSpiritNames = ((groups[3] && groups[3].items) || [])
      .filter((item) => spiritPrices.get(nameKey(item.name)) === 0)
      .map((item) => item.name);
    const INITIAL_SPIRIT_MAX = 3;

    return {
      character: {
        name: String((doc && doc.name) || ""),
        ownerName: String((doc && doc.ownerName) || (doc && doc.plName) || "")
      },
      currency: {
        lp: String(((doc && doc.currency) || {}).lp ?? ""),
        shards: String(((doc && doc.currency) || {}).fragment ?? "")
      },
      groups,
      scenarios,
      freeNotesSourceId: /^[A-Za-z0-9_-]{6,}$/.test(freeNotesSourceId) ? freeNotesSourceId : "",
      freeNotesSourceIds,
      purchaseHistory: purchaseScenario ? (purchaseScenario.spends || []).map((row) => ({ ...row, source: "freeNotes" })) : [],
      /* 所持品の帰属照合結果。matched=どのシナリオか判明、unmatched=履歴に記載なし。 */
      attribution,
      counts: {
        personas: groups[0].items.length,
        egos: groups[1].items.length,
        supportPassives: groups[2].items.length,
        spirits: groups[3].items.length,
        items: (groups[4] && groups[4].items.length) || 0,
        scenarios: scenarios.length,
        /* 初期精神（DB で無料扱いの3件）。件数を残して黙って消さない。 */
        initialSpirits: initialSpiritNames.length,
        initialSpiritsOwned: initialSpiritNames,
        /* 3件を超えたら壊れたデータ。取り込み前にエラーとして出す。 */
        initialSpiritOverflow: initialSpiritNames.length > INITIAL_SPIRIT_MAX,
        unresolved: groups.reduce((n, g) => n + g.items.filter((i) => !i.resolved).length, 0),
        attributed: attribution.matched,
        unattributed: attribution.unmatched,
        /* 支出行（購入）との照合で帰属が決まった数。 */
        boughtViaSpend: attribution.matchedBySpend,
        /* 表記ゆれ照合で帰属が決まった数（完全一致は含まない）。 */
        matchedByLoose: attribution.matchedByLoose,
        /* 本文言及（シナリオの本文に名前がそのまま書かれていた）で帰属した数。 */
        attributedByMention: attribution.matchedByMention
      }
    };
  }

  /* 利用者が「どのDB行か」「どう手に入れたか」を決めた結果を優先する。
     決まっていなければ確定させず、理由つきで skipped へ渡す。 */
  function chosenKind(item) {
    if (item.picked) return item.picked;
    if (item.candidates && item.candidates.length === 1) return item.candidates[0];
    return null;
  }

  /* 帰属先。シナリオに載っていないものは自動では付けず、
     利用者が選んだシナリオを 1 件だけ使う（未決なら null）。
     定めるのはコート時だけ。他の利用者は従来通り通す。
     カードから戻された所持は照合より戻しを優先し、帰属先未決に戻る。 */
  function chosenVia(item, scenarios, scenarioKeyOverride) {
    const chosenKey = String(item.pickedScenarioKey || scenarioKeyOverride || "").trim();
    if (item.returned && !chosenKey && !item.pickedScenario) return [];
    if (chosenKey) {
      const hit = (scenarios || []).find((scenario) => String(scenario && scenario.key || "") === chosenKey);
      return hit ? [String(hit.name || "")] : [];
    }
    if (item.pickedScenario) return [item.pickedScenario];
    if (item.via && item.via.length) return item.via;
    if (item.needsAttribution) return null;
    return [];
  }

  function chosenViaKeys(item, scenarios, scenarioKeyOverride) {
    const chosenKey = String(item.pickedScenarioKey || scenarioKeyOverride || "").trim();
    if (item.returned && !chosenKey && !item.pickedScenario) return [];
    if (chosenKey) return [chosenKey];
    if (item.viaKeys && item.viaKeys.length) return [...new Set(item.viaKeys.map(String).filter(Boolean))];
    const names = item.pickedScenario ? [item.pickedScenario] : (Array.isArray(item.via) ? item.via : []);
    const keys = [];
    for (const name of names) {
      const matches = (scenarios || []).filter((scenario) => String(scenario && scenario.name || "") === String(name || ""));
      if (matches.length === 1 && matches[0].key) keys.push(String(matches[0].key));
    }
    return [...new Set(keys)];
  }

  /* 選択された manifest を、実際に投げる action の一覧にする。
     ここでは state 触らない。redux と同じ純粋な変換にしておくと、
     「何を入れるか」を取り込み前に検証できる。 */
  function toDispatchActions(manifest, selectedKeys, options) {
    const opts = options || {};
    const selected = new Set(selectedKeys || []);
    const actions = [];
    const skipped = [];
    /* 所持アイテムの名前を DB（items.json）の id へ引く。引けない名前は
       捏造せず、理由つきで落とす。 */
    const itemDb = opts.db || (typeof window !== "undefined" && window.DB) || {};
    const parseImportQuantity = (value) => {
      if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
      if (typeof value !== "string") return null;
      const text = value.trim();
      if (!/^\d+$/.test(text)) return null;
      const parsed = Number(text);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    };
    const itemIdOf = (name) => {
      /* 所持列のアイテム名には個数が付く（バラのスパナ工房の外付け強化義足×1）。 */
      const key = nameKey(String(name || "").replace(/[×xX]\s*\d+\s*$/, ""));
      if (!key) return "";
      const hit = (itemDb.items || []).find((row) => nameKey(row && row.name) === key);
      return hit ? String(hit.id || "") : "";
    };
    /* 所持ループで既に納入した品目。シナリオの獲得ループが同じ人格・E.G.O を
       二重に登録しないためのもの（所持一覧と獲得行の両方に出る品目は 1 件だけ）。 */
    const taken = new Set();
    /* memo の支出明細に既に購入費が載っている所持は、ADD で二重に課帳しない
       （リザルトに書かれた購入費が真実。DB の価格は memo が無いときの照合値）。 */
    const memoPaid = (item) => (item.spends || []).length > 0;

    for (const group of (manifest && manifest.groups) || []) {
      for (const item of group.items) {
        if (!selected.has(item.key)) continue;
        /* 種別は取込側が決まったので、ここでは「どれとして入れるか」を選ぶ。
           利用者の選択（picked）が最優先。決まっていなければ補わない。 */
        /* シナリオに記載が無い所持品は、帰属先を選んでから入れる。
           ただし利用者が「入れる」と選んだ品目は、帰属先が未決でも
           入れたくなる（チェックしたのに何も入らないのは操作としても嘘）。
           そのときは所属が決められないので、帰属なしの所持として入れる
           （明細は「未分類＝待機項目」の欄に入るのが既存仕様）。 */
        const scenarios = (manifest && manifest.scenarios) || [];
        const scenarioKeyOverride = (opts.scenarioKeyByItem && opts.scenarioKeyByItem[item.key]) || "";
        const via = chosenVia(item, scenarios, scenarioKeyOverride) || (selected.has(item.key) ? [] : null);
        const viaKeys = chosenViaKeys(item, scenarios, scenarioKeyOverride);
        if (!via) {
          skipped.push({ key: item.key, reason: "どのシナリオのものか選んでください" });
          continue;
        }
        /* チェックした品目は必ず入れる（チェック＝入れるへの同意）。
           入手方法が未決なら配布（purchase=false）として入れるので
           帳が吹くことはない。チケット・購入は三分類が決めてから課す。 */        const chosen = chosenKind(item);
        /* 同名候補が複数あるときは、索引の先頭で決めつけず選ばせる。 */
        const ambiguous = (item.identityCandidates || []).length > 1;
        /* 利用者が pick したなら、その種別だけを使う。章立て（グループ）の
           種別が item.kinds にあっても pick を上書きしてはいけない
           （「利用者の選択が最優先」の契約）。pick が無いときだけ補う。 */
        const kinds = (f) => (ambiguous || chosen ? null : item.kinds.find(f));
        const persona = (chosen && chosen.kind === "persona") ? chosen : kinds((k) => k.kind === "persona");
        const ego = (chosen && chosen.kind === "ego") ? chosen : kinds((k) => k.kind === "ego");
        const support = (chosen && (chosen.kind === "support" || chosen.kind === "deathSupport")) ? chosen
          : kinds((k) => k.kind === "support" || k.kind === "deathSupport");
        const spirit = (chosen && chosen.kind === "spirit") ? chosen : kinds((k) => k.kind === "spirit");

        if (group.id === "personas") {
          if (!persona || !persona.no) {
            skipped.push({
              key: item.key,
              reason: (item.identityCandidates || item.candidates || []).length > 1
                ? "DB番号が複数あります。候補を選んでください"
                : "DB番号が引けない"
            });
            continue;
          }
          const personaMode = persona.mode || "n";
          taken.add(`persona:${personaMode}:${persona.no}`);
          /* 人格はDB価格を持たない。source:"buy" は入手方法であって金額ではない。
             金額の根拠は scenario.spends / purchasePlan 側の ADD_ENTRY だけから記帳する。
             ここで purchase:true にすると action.cost 未指定のため 0LP の購入明細が増える。 */
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: personaMode, via, viaKeys, ...(via.length ? {} : { unclassified: true }), source: item.source || "", purchase: item.source === "buy" && !memoPaid(item), skipInitialTicketConsumption: true });
          if (Array.isArray(item.importedEnhancementNames)) {
            const imported = resolveImportedEnhancements(item.importedEnhancementNames, itemDb);
            if (imported.rows.length || item.importedEnhancementNames.length === 0) {
              actions.push({ type: "IMPORT_PERSONA_ENHANCEMENTS", no: String(persona.no), mode: personaMode, enhancements: imported.rows });
            }
            for (const name of imported.unresolved) {
              skipped.push({ key: item.key, reason: "共有データの強化「" + name + "」はDBと一致しないため、推測で取り込みません" });
            }
          }
        } else if (group.id === "egos") {
          if (!ego || !ego.no || !ego.rank) {
            const rank = String(item.sourceRank || "").toUpperCase();
            const validRanks = new Set(["ZAYIN", "TETH", "HE", "WAW", "ALEPH"]);
            const rawName = String((item.picked && item.picked.name) || item.name || "").trim();
            const knownExact = (itemDb.egos || []).find((row) =>
              validRanks.has(rank) && row && String(row.rank || "").toUpperCase() === rank
              && nameKey(row.name) === nameKey(rawName));
            if (knownExact) {
              const key = `ego:${knownExact.rank}:${knownExact.no}`;
              if (!taken.has(key)) {
                taken.add(key);
                actions.push({ type: "ADD_ROSTER_EGO", no: String(knownExact.no), rank: knownExact.rank, via, viaKeys, ...(via.length ? {} : { unclassified: true }) });
              }
              continue;
            }
            if (validRanks.has(rank) && !(item.identityCandidates || []).length && !(item.candidates || []).length) {
              actions.push({ type: "ADD_CUSTOM_ROSTER_EGO", name: rawName, rank, via, viaKeys, ...(via.length ? {} : { unclassified: true }), source: item.source || "" });
              continue;
            }
            skipped.push({ key: item.key, reason: "DB番号かランクが引けない（独自E.G.Oは元データのランクが必要）" });
            continue;
          }
          taken.add(`ego:${ego.rank}:${ego.no}`);
          actions.push({ type: "ADD_ROSTER_EGO", no: String(ego.no), rank: ego.rank, via, viaKeys, ...(via.length ? {} : { unclassified: true }), source: item.source || "", purchase: item.source === "buy" && !memoPaid(item) });
        } else if (group.id === "supportPassives") {
          if (!support) {
            /* メモの章立てと実体の種別が違うことがある（同一品目が
               サポパ「賭博師」と精神「ギャンブラー」として别名で登録
               されている）。存在する種別のほうへ入れる。
               賭博師を精神の章に書いた文書が support 軒の DB行を持つ
               ため、捨てると所持が消える。 */
            if (spirit) {
              actions.push({
                type: "ADD_ROSTER_SPIRIT",
                spirit: { name: spirit.name || item.dbName || item.name },
                via,
                viaKeys,
                ...(via.length ? {} : { unclassified: true }),
                purchase: item.source === "buy" && !memoPaid(item)
              });
              continue;
            }
            skipped.push({ key: item.key, reason: "DB番号が引けない" });
            continue;
          }
          /* サポートパッシブは三分類の対象外（同期/解析と同じ「そのまま確定」）。
             課帳の有無は purchase フラグ（source === "buy"）だけが決める。 */
          /* 購入だったときだけ課帳する（ADD_ROSTER と同じ契約）。
             配布・シナリオ報酬で得たパッシブに 7LP を課すと帳が膨らむ。 */
          actions.push({
            type: "ADD_ROSTER_SUPPORT",
            spp: { name: support.name || item.dbName || item.name },
            via,
            viaKeys,
            ...(via.length ? {} : { unclassified: true }),
            purchase: item.source === "buy" && !memoPaid(item)
          });
        } else if (group.id === "spirits") {
          if (!spirit) {
            /* 逆方向: 精神の章に賭博師（=サポパ行）と書いた文書も通す。 */
            if (support) {
              actions.push({
                type: "ADD_ROSTER_SUPPORT",
                spp: { name: support.name || item.dbName || item.name },
                via,
                viaKeys,
                ...(via.length ? {} : { unclassified: true }),
                purchase: item.source === "buy" && !memoPaid(item)
              });
              continue;
            }
            skipped.push({ key: item.key, reason: "DB番号が引けない" });
            continue;
          }
          actions.push({
            type: "ADD_ROSTER_SPIRIT",
            spirit: { name: spirit.name || item.dbName || item.name },
            via,
            viaKeys,
            ...(via.length ? {} : { unclassified: true }),
            purchase: item.source === "buy" && !memoPaid(item)
          });
        } else if (group.id === "items") {
          /* 所持アイテム。支出はメモ（リザルトの支出行）が持つので、取得だけを
             足す。ADD_ITEM は購入として DB 価格を課すため、ここで使うと
             二重計上になる。DB 候補がアイテムで一意ならそれを使う（所持列の
             名前は ×1 が付いたり、カタログ表記と一字違うことがある）。
             マニフェスト段階の candidates は人格・E.G.O の索引なので、
             kind が item のものだけを信用する。 */
          const itemCand = (item.candidates || []).length === 1 && item.candidates[0].kind === "item"
            ? item.candidates[0].name
            : "";
          const itemName = (item.picked && item.picked.name) || itemCand || item.name;
          const itemId = itemIdOf(itemName);
          if (!itemId) { skipped.push({ key: item.key, reason: "アイテム名が DB に無い" }); continue; }
          const quantity = item.quantity === undefined || item.quantity === null || item.quantity === ""
            ? 1 : parseImportQuantity(item.quantity);
          if (quantity === null) {
            skipped.push({ key: item.key, reason: "アイテムの個数が正の整数ではない" });
            continue;
          }
          actions.push({ type: "ADD_ITEM_INVENTORY", itemId, quantity });
        } else {
          skipped.push({ key: item.key, reason: "未知のグループ" });
        }
      }
    }

    /* シナリオ履歴。選択した分を「結果」として作り、そのシナリオの
       購入候補（選ばれたもの）を支出明細として続ける。
       順序が意味を持つ: ADD_ENTRY は直前の ADD_RESULT に帰属する。

       収入と支出は scenarioHistory[].memo から読む。memo は自由記述なので
       専用パーサに任せる（LBT_garaMemo.parseMemo）。読めなかった行は
       金額を入れず、理由だけを利用者へ返す。 */
    const purchases = opts.purchases || {};
    /* 帰属先として選ばれたシナリオは、利用者が「ここから取り込む」と決めたシナリオ。
       所持品のチェック状態に依らず ADD_RESULT を作る。選ばないまま取り込むと
       帰属先となるリザトが1件も無く、明細だけが宙に浮いて照合できない。 */
    const attributedScenarioKeys = new Set();
    for (const group of (manifest && manifest.groups) || []) {
      for (const item of group.items) {
        if (!selected.has(item.key)) continue;
        for (const name of chosenVia(item, (manifest && manifest.scenarios) || []) || []) {
          const hit = ((manifest && manifest.scenarios) || []).find((s) => s && s.name === name);
          if (hit) attributedScenarioKeys.add(hit.key);
        }
      }
    }
    /* 除外指定（Cyclades/履歴Noise で明示的に落としたもの）だけが外れる。 */
    const excluded = new Set(opts.excludeScenarios || []);
    for (const scenario of (manifest && manifest.scenarios) || []) {
      /* シナリオはそれ自体が 1 リザルト。帰属する所持が 1 件もなくても、
         記録があれば必ず作る（収入のあるシナリオが黙って消えると、
         履歴としては「その日对美国记录が存在しなかった」ことになってしまう）。 */
      if (excluded.has(scenario.key)) continue;
      const income = scenario.income || { lp: "", shards: "" };
      const tickets = scenario.tickets || {};
      const pack = scenario.pack || {};
      /* チケットは income.tickets に入る。reducer は action.income.tickets を読む
         （normalizeTickets）。incomeTickets という別キーは見てくれない。 */
      const legacyResultId = String(opts.legacyResultTargets?.[scenario.key] || "").trim();
      actions.push({
        type: "ADD_RESULT",
        batchKey: String(scenario.key || ""),
        name: scenario.name || "無題",
        ...(scenario.date ? { date: scenario.date } : {}),
        ...(scenario.importSourceKey ? { importSourceKey: scenario.importSourceKey } : {}),
        ...(legacyResultId ? { legacyResultId, replaceLegacyEntries: true } : {}),
        income: {
          lp: income.lp || 0,
          shards: income.shards || 0,
          tickets: {
            persona: tickets.persona || 0,
            ego: tickets.ego || 0,
            choice: tickets.choice || 0,
            pack
          }
        },
        personaAcquisitions: (scenario.wins || []).flatMap((win) => (win.kinds || [])
          .filter((kind) => kind.kind === "persona" && kind.no !== undefined && kind.no !== null && (kind.mode === "n" || kind.mode === "t"))
          .map((kind) => ({ mode: kind.mode, no: String(kind.no), name: String(win.name || win.raw || ""), source: "garasumado" }))),
        consumedItems: Array.isArray(scenario.consumedItems) ? scenario.consumedItems : []
      });

      /* チケット消費は収入に加算しない。履歴に使用と明記された分だけ消費アクションにする。 */
      for (const spend of scenario.ticketSpends || []) {
        if (!spend) continue;
        if (!["persona", "ego", "choice", "pack"].includes(spend.kind)) {
          skipped.push({ key: scenario.key, reason: "チケットの種別が曖昧なため消費記録を確定できません: " + String(spend.raw || "") });
          continue;
        }
        if (spend.kind === "pack" && !String(spend.pack || "").trim()) {
          skipped.push({ key: scenario.key, reason: "パックチケットの使用先が特定できないため消費記録を保留" });
          continue;
        }
        /* 履歴上の使用は残高不足でも監査明細に残す。SPEND_TICKET は所持残数0だと
           action自体が無視されるので、履歴取込では明細に記録し残数計算に委ねる。 */
        const count = spend.count || 1;
        const ticketUse = { persona: 0, ego: 0, choice: 0, pack: {} };
        let ticketName = "";
        if (spend.kind === "pack") {
          Object.defineProperty(ticketUse.pack, String(spend.pack), {
            value: count, enumerable: true, configurable: true, writable: true
          });
          ticketName = "パックチケット「" + String(spend.pack) + "」";
        } else {
          ticketUse[spend.kind] = count;
          ticketName = ({ persona: "人格抽出チケット", ego: "E.G.O抽出チケット", choice: "選択抽出チケット" })[spend.kind] || "抽出チケット";
        }
        actions.push({
          type: "ADD_ENTRY",
          kind: "other",
          name: "履歴上の使用：" + ticketName + (count > 1 ? " ×" + count : ""),
          cost: { lp: 0, shards: 0 },
          tickets: ticketUse,
          note: "硝子窓の履歴に使用と記載。取得元・残数が不明な場合も使用記録は保持"
        });
      }

      /* シナリオで直接払い出された人格/E.G.O。所持へ足す。
         チケット由来なら「どのチケット由来か」を使って
         消費記録を 1 件残し、直近のリザルトに帰属させる。
         金額ゼロの明細なので、帳簿の収支は乱れない。 */
      for (const win of scenario.wins || []) {
        const kinds = win.kinds || [];
        const persona = kinds.find((k) => k && k.kind === "persona" && k.no != null);
        const ego = kinds.find((k) => k && k.kind === "ego" && k.no != null && k.rank);
        if (persona) {
          const key = `persona:${persona.mode || "n"}:${persona.no}`;
          if (taken.has(key)) continue;
          taken.add(key);
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n", skipInitialTicketConsumption: true });
        } else if (ego) {
          const key = `ego:${ego.rank}:${ego.no}`;
          if (taken.has(key)) continue;
          taken.add(key);
          actions.push({ type: "ADD_ROSTER_EGO", no: String(ego.no), rank: ego.rank });
        } else if (kinds.some((k) => k && k.kind === "ego")) {
          /* 番号が引けない E.G.O。所持には入れず、理由だけ残す。 */
          skipped.push({ key: win.raw, reason: "E.G.O の番号が引けないため所持へ入れない" });
          continue;
        }
        /* 由来の記録は、実際に所持へ入った獲得にだけ付ける。解決できない
           wins に明細を作ると帳簿に幻の行が残る（「人格抽出チケットで
           獲得：1枚」等の実害が出ていた）。 */
        if (win.via && (persona || ego)) {
          actions.push({
            type: "ADD_ENTRY",
            kind: "other",
            name: `${win.via}で獲得：${win.raw}`.slice(0, 120),
            cost: { lp: 0, shards: 0 }
          });
        }
      }

      /* 同期化・解析は人格の獲得とは別の費用記録として計上する（supplement P7/P23）。
         操作キーワードで種別が決まる（同期→人格、解析→E.G.O）。名前で対象を引き、
         引けなかったものは勝手に当てない。uid は APPLY_IMPORT_BATCH が解決する。
         獲得（wins）の後に置くのは、このシナリオで新しく所持へ入る人格/E.G.O も
         同期・解析の対象にできるようにするため（所持一覧に無い獲得を先に反映する）。 */
      const opLines = String(scenario.memo || "").split(/[\n\r]/).map((t) => t.trim()).filter(Boolean);
      for (const op of (window.LBT_annotateOperations || (() => []))(opLines, opts.db || window.DB || {})) {
        if (!op.hasTarget || !op.target) continue;
        const hit = (opts.resolve || (() => null))(op.target);
        if (!hit) continue;
        const isAnalyze = op.operation === "analyze";
        const isMax = /MAX/.test(op.line);
        const persona = (hit.kinds || []).find((k) => k.kind === "persona");
        const ego = (hit.kinds || []).find((k) => k.kind === "ego");
        if (isAnalyze && ego) {
          actions.push({ type: "APPLY_EGO_ANALYZE", egoName: hit.name, analyzeMax: isMax });
        } else if (persona) {
          actions.push({ type: "APPLY_PERSONA_SYNC", personaName: hit.name, syncMax: isMax, synced: true });
        }
      }

      /* memo の「・支出」「・支払い」以下が支出明細。
         「LPを欠片に変換：+11欠片 -22LP」のように両通貨が 1 行に並ぶことがある。
         片方だけ取ると帳尻が合わなくなるので両方を拾う。
         読み取れなかった金額は 0 のままにして名前だけ残す。
         勝手に埋めれば、原本と食い違う数字が残る。 */
      const normalizeUncertainSpendLine = (value) => String(value || "")
        .normalize("NFKC")
        .replace(/現座/g, "現在")
        .replace(/\s+/g, "")
        .trim();
      for (const spend of scenario.spends || []) {
        const lp = Number(spend && spend.lp || 0);
        const shards = Number(spend && spend.shards || 0);
        const rawLine = String(spend && (spend.raw || spend.name) || "").trim();
        const rawLineKey = normalizeUncertainSpendLine(rawLine);
        const uncertain = (!lp && !shards) && (scenario.reasons || []).find((row) =>
          rawLineKey && normalizeUncertainSpendLine(row && row.line) === rawLineKey
          && /(?:支出金額|支出額|金額).*(?:読み取れない|未確定|未計上|確定できない|要確認)|通貨単位.*(?:不明|無い|ない|ありません)/.test(String(row && row.reason || ""))
        );
        if (uncertain) {
          skipped.push({ key: scenario.key, reason: "金額未確定の支出候補は確定明細へ登録せず保留しました。原文を確認してください。" });
          continue;
        }
        actions.push({
          type: "ADD_ENTRY",
          kind: "other",
          name: String(spend.name || "（明細）").slice(0, 120),
          cost: { lp: lp || 0, shards: shards || 0 }
        });
      }

      /* 利用者が選んだ購入分。memo の支出と二重にならないよう、
         それは選択されたものだけ足す。 */
      for (const pick of purchases[scenario.key] || []) {
        actions.push({
          type: "ADD_ENTRY",
          kind: pick.kind === "spirit" ? "spirit"
            : pick.kind === "enhancement" ? "enhancement"
            : pick.kind === "deathSupport" ? "deathSupport" : "support",
          name: pick.name,
          cost: pick.cost
        });
      }
    }

    /* 自由メモは最新スナップショットを正として再構築する。
       先に同一共有元の旧インポート行を消すマーカーを送り、シナリオには紐付けない。
       購入行が削除／改名された場合も、古い明細だけが残るのを防ぐ。 */
    for (const sourceId of (manifest && manifest.freeNotesSourceIds) || []) {
      actions.push({
        type: "REFRESH_GARASUMADO_FREE_NOTES",
        sourceId
      });
    }

    /* 自由メモの購入履歴は架空のリザルトを作らず、金額のある明細だけを残す。
       日時・元シナリオが不明なので明示的に未分類にし、残高計算には含める。 */
    for (const purchase of (manifest && manifest.purchaseHistory) || []) {
      const cost = { lp: Number(purchase.lp) || 0, shards: Number(purchase.shards) || 0 };
      if (!cost.lp && !cost.shards) {
        skipped.push({ key: "purchase-history:" + String(purchase.name || ""), reason: "自由メモの購入額が確定できないため支出に計上しない" });
        continue;
      }
      const hit = typeof opts.resolve === "function" ? opts.resolve(purchase.name) : null;
      const sourceKind = (hit?.kinds || []).find((k) => ["support", "deathSupport", "spirit", "enhancement"].includes(k.kind))?.kind;
      const kind = sourceKind === "deathSupport" ? "deathSupport"
        : ["support", "spirit", "enhancement"].includes(sourceKind) ? sourceKind : "other";
      actions.push({
        type: "ADD_ENTRY",
        kind,
        name: String(purchase.name || "自由メモの購入").slice(0, 120),
        cost,
        resultId: null,
        ...(purchase.importSourceKey ? { importResultKey: purchase.importSourceKey } : {}),
        note: "硝子窓の自由メモ由来。日時・シナリオ未特定"
      });
    }

    return { actions, skipped };
  }

/* --- 割当の下書き -------------------------------------------------------
   画面に出る「どのリザルトに何が入っているか」を、UI とは独立に作る。
   1シナリオ＝1リザルト。所持は照合できたAutomaticで割り当て、できないものだけ
   未割当に残す。利用者が個別に決めた分（identity）はここで被せる。

   照合の階級:
     A  構造化された獲得行と完全一致        自動・確定
     C  支出行と一致                      自動・確定（入手=購入）
     D  シナリオのメモ本文中に出現          自動・本文言及
     F  文字一致で候補が1件に絞れた        自動・要確認
     F? 文字一致で候補が複数              未割当（利用者が選ぶ）
     E  どこにも出ない                    未割当

   同期/解析とサポートパッシブは、帰属と入手方法をそのまま Automaticで確定する。
   人格と E.G.O は、証跡が無いと購入か抽選かを区別できないので入手方法は
   利用者に選ばせる。                                        */

  /* 照合に使う文字集合。装飾や記号を落としてIntersectionの土台にする。 */
  function overlapChars(s) {
    return [...new Set([...String(s || "")].filter((c) => /[\u4e00-\u9fffA-Za-z0-9]/.test(c)))];
  }
  const F_MATCH_RATIO = 0.5;
  const F_MAX_CANDIDATES = 8;
  const F_MIN_DB_NAME = 5;

  /* 文字一致の候補を一致率の降順で並べる。上限は表示と操作の項数。
     一意に絞れたときだけ自動割り当てに使う（複数なら利用者が選ぶ）。 */
  function overlapCandidates(name, db, options) {
    const opts = options || {};
    /* アイテムは items.json にしか無い。他の種別と混ぜると、たまたま名前が
       近いだけの人格・E.G.O を候補に出してしまうので、アイテム行では
       アイテムだけを見る。 */
    const onlyItems = opts.only === "items";
    const want = overlapChars(name);
    const key = nameKey(String(name || "").replace(/[×xX]\s*\d+\s*$/, ""));
    /* カタカナ・ひらがなだけの名前は overlapChars が拾わない（照合は漢字と
       英数だけを見る）。それでも本人（同名の DB 行）は選べないと困るので、
       完全一致の判定だけは文字種に依らず行う。 */
    if (!want.length && !key) return [];
    const out = [];
    const seen = new Set();
    const push = (row, kind) => {
      const rowName = row && row.name;
      /* DB 行と同名なら本人。下限（文字数・一致数・一致率）を課さない。
         憎悪(2文字)・肩慣らし(4文字)のような短い名前は下限で落ち、
         本人を選べなくなっていた。同名なら誤爆ではないので必ず出す。 */
      const isExact = Boolean(key) && nameKey(rowName) === key;
      if (!isExact && !want.length) return;
      const dbChars = overlapChars(rowName);
      if (!isExact && dbChars.length < F_MIN_DB_NAME) return;
      const hit = want.filter((c) => dbChars.includes(c)).length;
      if (!isExact && hit < 2) return;
      const ratio = isExact ? 1 : (want.length ? hit / want.length : 0);
      if (!isExact && ratio < F_MATCH_RATIO) return;
      const dedupe = kind + ":" + nameKey(rowName);
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push({ kind, name: rowName, no: row.no, rank: row.rank, mode: row.mode, ratio, hit, exact: isExact });
    };
    if (onlyItems) {
      /* アイテム行はアイテムカタログ（items.json）だけを引く。 */
      for (const row of (db && db.items) || []) push(row, "item");
    } else {
      for (const row of (db && db.normal_personas) || []) push(row, "persona");
      for (const row of (db && db.tokui_personas) || []) push(row, "persona");
      for (const row of (db && db.egos) || []) push(row, "ego");
      for (const row of (db && db.support_passives) || []) push(row, "support");
      for (const row of (db && db.death_passives) || []) push(row, "deathSupport");
      /* 精神（混乱効果）も所持の対象。以前はここに無く、憎悪を照会できなかった。 */
      for (const row of (db && db.spirits) || []) push(row, "spirit");
      /* 強化も所持の対象（欠片で買う）。同じく走査から漏れていた。 */
      for (const row of (db && db.normal_enhancements) || []) push(row, "enhancement");
      for (const row of (db && db.special_enhancements) || []) push(row, "enhancement");
    }
    out.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.ratio - a.ratio || b.hit - a.hit);
    return out.slice(0, F_MAX_CANDIDATES);
  }

  /* シナリオごとの証拠索引。完全一致・ゆれ一致・本文出現を1回で判定する。 */
  /* シナリオのメモから、同期・解析の対象名を捨てる。 */
  function syncTargetsOf(memo) {
    const lines = String(memo || "").split(/[\n\r]/).map((t) => t.trim()).filter(Boolean);
    const annotate = window.LBT_annotateOperations;
    if (!annotate) return [];
    return annotate(lines, window.DB || {})
      .filter((op) => op.hasTarget && op.target)
      .map((op) => op.target);
  }

  function buildEvidence(scenarios) {
    const list = [];
    for (const scenario of scenarios || []) {
      const name = String(scenario.name || "");
      if (!name) continue;
      list.push({
        key: scenario.key,
        name,
        exact: new Set([
          ...(scenario.wins || []).map((w) => nameKey(w.name)),
          ...(scenario.spends || []).map((s) => nameKey(spendNameOf(s)))
        ]),
        spend: new Set((scenario.spends || []).map((s) => nameKey(spendNameOf(s)))),
        /* 同期・解析の対象名。同期できない品目は書けないので、
           「ここに同期の記載がある」= その品目が既に所持に存在した証拠になる。
           単なる本文での言及より強い根拠として、獲得行と同列に扱う。 */
        synced: new Set(syncTargetsOf(scenario.memo).map(nameKey).filter(Boolean)),
        text: nameKey(scenario.memo || "")
      });
    }
    return list;
  }

  /* 1件の所持が、どのシナリオ帰属ならAutomaticで決まるかを返す。 */
  /* 本文中にその名前が現れるシナリオを探す。 */
  function scenarioMentioning(name, evidence) {
    const key = nameKey(name);
    if (!key) return null;
    const hits = evidence.filter((e) => e.text.includes(key));
    if (hits.length > 1) return { ambiguous: true, candidateScenarioKeys: hits.map((hit) => hit.key) };
    if (hits.length !== 1) return null;
    return { tier: "D", scenario: hits[0].name, scenarioKey: hits[0].key, unique: true, hits: 1 };
  }

  /* 1件の所持が、どのシナリオ帰属なら自動確定できるかを返す。
     names は照合に使う名前の追加候補（所持名が略称なら正式名を足す）。
     略称（鬼門、ロジアトなど）は本文照合力度が弱いので、正式名でも試す。 */
  function attributionOf(item, evidence, names) {
    /* 所持側の品目名は「剣契殺手Aの人格」「N社E.G.O:ねばつき」のように
       装飾が付く。メモ側の同期対象は正式名（剣契殺手A）なので、
       装飾を除いた形でも照合する（両方のキーを見る）。 */
    const raw = [item.name, ...(names || [])];
    const keys = [...new Set(raw.flatMap((n) => [nameKey(n), looseKey(n)]).filter(Boolean))];
    if (!keys.length) return null;
    /* 構造化された証拠（獲得行・支出行）を先に照合する。 */
    for (const key of keys) {
      const exact = evidence.filter((e) => e.exact.has(key));
      if (exact.length) {
        /* 支出行にあれば購入。複数シナリオにあれば上（シナリオ順）。 */
        if (exact.length !== 1) return { ambiguous: true, candidateScenarioKeys: exact.map((hit) => hit.key) };
        const bought = exact.find((e) => e.spend.has(key));
        const hit = bought || exact[0];
        return { tier: bought ? "C" : "A", scenario: hit.name, scenarioKey: hit.key, unique: true };
      }
    }
    /* 同期・解析の記載がある。它的対象は既に所持に存在した品目なので、
       獲得行に載っていなくても帰属が決まる（本文言及より強い）。 */
    for (const key of keys) {
      const synced = evidence.filter((e) => e.synced.has(key));
      if (synced.length > 1) return { ambiguous: true, candidateScenarioKeys: synced.map((hit) => hit.key) };
      if (synced.length === 1) {
        return { tier: "S", scenario: synced[0].name, scenarioKey: synced[0].key, unique: true };
      }
    }
    /* 証拠が無くても本文に書いてあれば帰属は決まる（本文言及）。 */
    for (const name of [item.name, ...(names || [])]) {
      const hit = scenarioMentioning(name, evidence);
      if (hit) return hit;
    }
    return null;
  }

  /* 自動分類できるグループか。人格（personas）と E.G.O（egos）は証跡が無いと
     購入か抽選かを区別できないので、入手方法を利用者に選ばせる。
     同期/解析とサポートパッシブはそのまま確定できる。 */
  const AUTO_GROUPS = new Set(["supportPassives"]);

  function buildResultDraft(manifest, options) {
    const opts = options || {};
    const db = opts.db || null;
    const identity = opts.identity || {};
    /* 選択されている品目だけを見る。指定が無ければ全部が対象。
       画面が「チェックされている分だけ」でシミュレーションを出才不会、
       実際に取り込む内容と数字がずれる。 */
    const selected = Array.isArray(opts.selected) ? new Set(opts.selected) : null;
    const scenarios = (manifest && manifest.scenarios) || [];
    const evidence = buildEvidence(scenarios);

    /* 同名のシナリオが別々に存在する（同じ卓を二度やった、或いは「無題」が多い）。
       名前で Map を作ると潰れてカードが減る（実測で 74件 → 13件）ので、シナリオの key で並べる。 */
    const blocks = scenarios.map((scenario) => ({
      key: scenario.key,
      name: scenario.name,
      memo: String(scenario.memo || ""),
      income: scenario.income || { lp: 0, shards: 0 },
      tickets: scenario.tickets || {},
      reasons: Array.isArray(scenario.reasons) ? scenario.reasons : [],
      /* 監査結果を画面の ResultCard まで必ず引き継ぐ。
         manifest に存在するだけでは、利用者が警告を見られる保証にならない。 */
      sourceAudits: Array.isArray(scenario.sourceAudits) ? scenario.sourceAudits : [],
      financialCoverage: Array.isArray(scenario.financialCoverage) ? scenario.financialCoverage : [],
      currencyDiscrepancies: Array.isArray(scenario.currencyDiscrepancies) ? scenario.currencyDiscrepancies : [],
      items: []
    }));
    const blockOfKey = new Map(blocks.filter((b) => b.key != null).map((b) => [String(b.key), b]));
    const blocksByName = new Map();
    for (const b of blocks) blocksByName.set(String(b.name || ""), [...(blocksByName.get(String(b.name || "")) || []), b]);
    const unassigned = [];

    for (const group of (manifest && manifest.groups) || []) {
      for (const raw of group.items || []) {
        const patch = identity[raw.key] || {};
        if (selected && !selected.has(raw.key)) continue;
        const item = { ...raw, ...patch };
        /* 略称（鬼門、ロジアトなど）は正式名を引いてから本文照合する。
           名前索引の文字一致を使い、一意に絞れるものだけ名前解決に使う。 */
        const cands = db ? overlapCandidates(item.name, db, group.id === "items" ? { only: "items" } : null) : [];
        const names = cands.length === 1 ? [cands[0].name] : [];
        /* カードから戻された所持は照合結果より戻しを優先して未割当に返す。
           帰属先を選び直せば（pickedScenario が入れば）戻しは解ける。 */
        const returned = Boolean(patch.returned) && !item.pickedScenario && !item.pickedScenarioKey;
        const found = returned ? null : attributionOf(item, evidence, names);
        let chosenBlock = null;
        if (!returned && item.pickedScenarioKey) {
          chosenBlock = blockOfKey.get(String(item.pickedScenarioKey)) || null;
        } else if (!returned && item.pickedScenario) {
          const nameMatches = blocksByName.get(String(item.pickedScenario)) || [];
          if (nameMatches.length === 1) chosenBlock = nameMatches[0];
        } else if (!returned && found && found.scenarioKey) {
          chosenBlock = blockOfKey.get(String(found.scenarioKey)) || null;
        } else if (!returned && found && found.scenario) {
          const nameMatches = blocksByName.get(String(found.scenario)) || [];
          if (nameMatches.length === 1) chosenBlock = nameMatches[0];
        }
        const chosenName = chosenBlock ? chosenBlock.name : "";
        const tier = (item.pickedScenario || item.pickedScenarioKey) ? "M" : found ? found.tier : "";
        const source = item.source || "";

        const record = {
          key: item.key,
          name: item.name,
          group: group.id,
          tier,
          source,
          /* 選んだ DB 候補を行にも写す。画面のセレクトは行の picked を見て値を
             決めるので、写さないと選んだ直後に「選んでください」へ戻り、
             選択できないように見える。 */
          picked: item.picked || null,
          pickedCandidate: item.pickedCandidate || "",
          automatic: AUTO_GROUPS.has(group.id),
          candidates: cands,
          auto: Boolean(!item.pickedScenario && cands.length === 1 && AUTO_GROUPS.has(group.id))
        };

        if (chosenBlock) {
          /* E.G.O と人格は証跡が無いと購入か抽選かが決まらないので、入手方法を
             選ばせる。同期/解析とサポートパッシブはそのまま確定できる。 */
          record.needsSource = !record.automatic && !source;
          record.scenarioKey = chosenBlock.key;
          chosenBlock.items.push(record);
          continue;
        }
        if (found && found.tier === "F") { /* 下の else と同じ扱い */ }
        record.reason = returned
          ? "カードから戻しました（帰属先を選び直してください）"
          : found && found.ambiguous
            ? "複数のシナリオに証跡があるため、帰属先を選んでください"
            : !found
              ? (cands.length ? "候補が複数あります（選んでください）" : "照合できるシナリオがありません")
              : "シナリオが決まっていません";
        unassigned.push(record);
      }
    }

    const simulation = simulateDraft(manifest, blocks, unassigned, identity, opts);
    return { blocks, unassigned, simulation };
  }

  /* 画面に出る数字と実際に入る action を一致させる。simulation は
     toDispatchActions と同じ変換を覗くだけにして、另有計算しない。 */
  function simulateDraft(manifest, blocks, unassigned, identity, opts) {
    const db = opts && opts.db;
    /* 選択は呼び出し側が渡したものをそのまま使う。ここで blocks から作り直すと
       「シミュレーションに出す品目」と「実際に入る品目」がずれる（実測4文書でずれた）。
       入手方法が未決の品目は toDispatchActions 側で skip される。ここでは，特别是在手を出さない。 */
    const selected = Array.isArray(opts.selected) ? opts.selected.slice() : [];
    /* 利用者が選択した品目は「入れる」と決めたもの。入手方法を決めて
       いないなら配布として扱う（配布は費用ゼロなので、勝手に購入にはしない）。
       そうしないと「チェックしたのに何も入らない」状態になる。 */
    const chosenKeys = new Set(opts.selected || []);
    /* 選ばれた品目は toDispatchActions の契約で入る（チェック＝入れる、
       未決なら配布）。ここで source を差し替える二重実装は持たない
       （実測2文書で画面の数字と実際が食い違った）。 */
    const overlay = {
      ...manifest,
      groups: (manifest.groups || []).map((g) => ({
        ...g,
        items: g.items.map((i) => ({ ...i, ...(identity[i.key] || {}) }))
      }))
    };
    const actions = toDispatchActions(overlay, selected, { purchases: (opts && opts.purchases) || {} }).actions;
    let lp = 0;
    let shards = 0;
    const bySource = { ticket: 0, buy: 0, given: 0, other: 0 };
    let held = 0;
    for (const action of actions) {
      if (action.type === "ADD_RESULT") {
        lp += Number(action.income && action.income.lp) || 0;
        shards += Number(action.income && action.income.shards) || 0;
        continue;
      }
      if (action.type === "ADD_ENTRY") {
        lp -= Number(action.cost && action.cost.lp) || 0;
        shards -= Number(action.cost && action.cost.shards) || 0;
        continue;
      }
      if (String(action.type || "").startsWith("ADD_ROSTER") || action.type === "ADD_CUSTOM_ROSTER_EGO") {
        held += 1;
        const source = action.source || (action.type === "ADD_CUSTOM_ROSTER_EGO"
          ? "unclassified"
          : action.purchase ? "buy" : "given");
        bySource[source] = (bySource[source] || 0) + 1;
      }
    }
    return {
      results: actions.filter((a) => a.type === "ADD_RESULT").length,
      held,
      lp,
      shards,
      bySource,
      unassigned: unassigned.length,
      awaitingSource: blocks.reduce(
        (n, b) => n + b.items.filter((i) => i.needsSource).length, 0
      )
    };
  }

/* 共有ドキュメントの金額は半角・全角の数字／カンマを同じ形式へそろえる。 */
function normalizeCurrencyText(value) {
  return String(value ?? "")
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, " ");
}

/* 未入力・null・不正値を 0 と混同しない。 */
function parseCurrencyBalance(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string") {
    const raw = normalizeCurrencyText(value).trim();
    if (!raw || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return null;
    value = Number(raw.replace(/,/g, ""));
  } else if (typeof value !== "number") {
    return null;
  }
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/* 最初の明示的な残高表記（現在・残高・残りなど）はスナップショット。
   行頭に書かれた収入や支出はその残高へ既に反映されているため、
   その位置より前の流れを合計から差し引く。 */
function findBalanceAnchor(memo, currency) {
  const normalized = String(memo || "").replace(/\r\n/g, "\n");
  const shardWords = "(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか)";
  const marker = currency === "lp" ? /(?:LP|ＬＰ)/i : new RegExp(shardWords);
  const balanceCue = /(?:現在|現座|残高|残額|残量|残り|所持|保有)/g;
  const amountAfterCue = currency === "lp"
    ? /(?:(?:LP|ＬＰ)\s*)?[：:]?\s*([0-9][0-9,]*)\s*(?:LP|ＬＰ)?(?:\s*[→⇒]\s*([0-9][0-9,]*))?/i
    : new RegExp("(?:(?:" + shardWords + ")\\s*)?[：:]?\\s*([0-9][0-9,]*)\\s*(?:" + shardWords + ")?(?:\\s*[→⇒]\\s*([0-9][0-9,]*))?");
  const amountBeforeCue = currency === "lp"
    ? /(?:(?:LP|ＬＰ)\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*(?:LP|ＬＰ))\s*$/i
    : new RegExp("(?:(?:" + shardWords + ")\\s*([0-9][0-9,]*)|([0-9][0-9,]*)\\s*(?:" + shardWords + "))\\s*$");
  let offset = 0;
  for (const line of normalized.split("\n")) {
    const lineForParsing = normalizeCurrencyText(line);
    if (/^\s*(?:[▶►▷]\s*|(?:効果(?:説明)?|パッシブ効果|アイテム効果|説明)\s*[:：])/.test(lineForParsing)) {
      offset += line.length + 1;
      continue;
    }
    if (marker.test(lineForParsing)) {
      /* 全角数字と英字は1コード単位で半角化されるので、現在の位置は変わらない。 */
      balanceCue.lastIndex = 0;
      for (const cueMatch of lineForParsing.matchAll(balanceCue)) {
        const cueAt = cueMatch.index;
        let anchorAt = cueAt;
        let match = lineForParsing.slice(cueAt + cueMatch[0].length).match(amountAfterCue);
        let rawValue = match && (match[2] ?? match[1]);
        if (!match) {
          /* 「150欠片 現在184」は150が支出額かもしれない。
             数値先行をスナップショットとみなすのは「残高・残り」等の明示語だけ。 */
          if (/^(?:現在|現座)$/.test(cueMatch[0])) continue;
          match = lineForParsing.slice(0, cueAt).match(amountBeforeCue);
          if (!match) continue;
          anchorAt = match.index;
          rawValue = match[2] ?? match[1];
          const afterCueArrow = lineForParsing.slice(cueAt + cueMatch[0].length)
            .match(/^\s*[→⇒]\s*([0-9][0-9,]*)/);
          if (afterCueArrow) rawValue = afterCueArrow[1];
        }
        const value = parseCurrencyBalance(rawValue);
        if (value !== null) {
          return { value, prefix: normalized.slice(0, offset + anchorAt) };
        }
      }
    }
    offset += line.length + 1;
  }
  return null;
}

function flowOf(record, currency) {
  const income = Number(record && record.income && record.income[currency]);
  if (!Number.isSafeInteger(income) || income < 0) return null;
  const spends = Array.isArray(record && record.spends) ? record.spends : [];
  let spent = 0;
  for (const item of spends) {
    const amount = Number(item && item[currency]) || 0;
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    const next = spent + amount;
    if (!Number.isSafeInteger(next)) return null;
    spent = next;
  }
  const flow = income - spent;
  return Number.isSafeInteger(flow) ? flow : null;
}

/* 残高照合。表示残高（doc.currency）とリザルト計算（開始残高＋収入−消費）を
   突き合わせる。ただし「残高変動を1件も記載していないユーザー」には
   エラーを返さない。最初の残高が履歴内の収入後に書かれている場合、
   その収入を再加算しないよう、スナップショット以前の純変動を控除する。 */
function reconcileBalance(manifest, doc, options) {
  const reconcileOptions = options || {};
  const approvedPurchases = reconcileOptions.purchases || {};
  const cur = (doc && doc.currency) || {};
  const shownLp = parseCurrencyBalance(cur.lp);
  const shownSh = parseCurrencyBalance(cur.fragment);
  const out = {
    checked: false, ok: true,
    openingLp: null, openingShards: null,
    computedLp: null, computedShards: null,
    shownLp, shownShards: shownSh,
    historyNetLp: 0, historyNetShards: 0,
    impliedOpeningLp: null, impliedOpeningShards: null,
    hasManualReference: shownLp !== null || shownSh !== null,
    message: ""
  };
  const scenarios = (manifest && manifest.scenarios) || [];
  out.currencyDiscrepancies = scenarios.flatMap((scenario) =>
    Array.isArray(scenario && scenario.currencyDiscrepancies) ? scenario.currencyDiscrepancies : []
  );
  const memoApi = (typeof window !== "undefined" && window.LBT_garaMemo) || null;
  let openingLp = null, openingSh = null;
  let openingOffsetLp = 0, openingOffsetSh = 0;
  let incLp = 0, incSh = 0, spLp = 0, spSh = 0;
  const cumulativeBefore = { lp: 0, shards: 0 };
  let unsafeCurrency = "";

  const safeAdd = (left, right, currency) => {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
      unsafeCurrency ||= currency;
      return null;
    }
    const result = left + right;
    if (!Number.isSafeInteger(result)) {
      unsafeCurrency ||= currency;
      return null;
    }
    return result;
  };
  const safeSubtract = (left, right, currency) => {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
      unsafeCurrency ||= currency;
      return null;
    }
    const result = left - right;
    if (!Number.isSafeInteger(result)) {
      unsafeCurrency ||= currency;
      return null;
    }
    return result;
  };
  const safeSpendSum = (spends, currency) => {
    let sum = 0;
    for (const item of spends || []) {
      const amount = Number(item && item[currency]) || 0;
      if (!Number.isSafeInteger(amount) || amount < 0) {
        unsafeCurrency ||= currency;
        return null;
      }
      sum = safeAdd(sum, amount, currency);
      if (sum === null) return null;
    }
    return sum;
  };
  const holdUnsafe = () => {
    out.checked = true;
    out.ok = false;
    out.errorCode = "unsafe-history-total";
    out.unsafeCurrency = unsafeCurrency || "unknown";
    out.computedLp = null;
    out.computedShards = null;
    out.historyNetLp = null;
    out.historyNetShards = null;
    out.impliedOpeningLp = null;
    out.impliedOpeningShards = null;
    out.message = "複数シナリオの収支合計が安全整数の範囲を超えたため、残高照合を保留しました。金額は丸めず、自動修正していません。";
    return out;
  };

  for (const s of scenarios) {
    const memo = String(s.memo || "");
    const income = s.income || {};
    const scenarioPurchases = Array.isArray(approvedPurchases[s.key]) ? approvedPurchases[s.key] : [];
    const scenarioSpends = (Array.isArray(s.spends) ? s.spends : parseSpends(memo)).slice();
    /* 同じシナリオに確定 action として入る、明示承認済み購入だけを照合にも加える。
       費用の不正値を 0 に丸めず、残高照合そのものを保留する。 */
    for (const purchase of scenarioPurchases) {
      const cost = purchase && purchase.cost || {};
      const lp = Number(cost.lp ?? 0);
      const shards = Number(cost.shards ?? 0);
      if (!Number.isSafeInteger(lp) || lp < 0) unsafeCurrency ||= "lp";
      if (!Number.isSafeInteger(shards) || shards < 0) unsafeCurrency ||= "shards";
      scenarioSpends.push({ lp, shards });
    }
    if (unsafeCurrency) return holdUnsafe();
    const incomeLp = Number(income.lp ?? 0);
    const incomeSh = Number(income.shards ?? 0);
    if (!Number.isSafeInteger(incomeLp) || incomeLp < 0) unsafeCurrency ||= "lp";
    if (!Number.isSafeInteger(incomeSh) || incomeSh < 0) unsafeCurrency ||= "shards";
    const spendLp = safeSpendSum(scenarioSpends, "lp");
    const spendSh = safeSpendSum(scenarioSpends, "shards");
    if (unsafeCurrency || spendLp === null || spendSh === null) return holdUnsafe();
    const scenarioFlowLp = safeSubtract(incomeLp, spendLp, "lp");
    const scenarioFlowSh = safeSubtract(incomeSh, spendSh, "shards");
    if (scenarioFlowLp === null || scenarioFlowSh === null) return holdUnsafe();

    incLp = safeAdd(incLp, incomeLp, "lp");
    incSh = safeAdd(incSh, incomeSh, "shards");
    spLp = safeAdd(spLp, spendLp, "lp");
    spSh = safeAdd(spSh, spendSh, "shards");
    if (unsafeCurrency || incLp === null || incSh === null || spLp === null || spSh === null) return holdUnsafe();

    for (const currency of ["lp", "shards"]) {
      const hasOpening = currency === "lp" ? openingLp !== null : openingSh !== null;
      if (hasOpening) continue;
      const anchor = findBalanceAnchor(memo, currency);
      if (!anchor) continue;
      const prefix = memoApi && typeof memoApi.parseMemo === "function"
        ? memoApi.parseMemo(anchor.prefix)
        : { income: {}, spends: [] };
      let prefixFlow = flowOf(prefix, currency);
      if (prefixFlow === null) {
        unsafeCurrency ||= currency;
        return holdUnsafe();
      }
      /* 「現在残高」より前の候補購入は、そのスナップショットへ既に反映済み。
         行番号が分かる承認候補だけ prefixFlow 側にも反映し、二重控除を避ける。 */
      const anchorPrefixText = String(anchor.prefix);
      const anchorLineNo = (anchorPrefixText.match(/\n/g) || []).length + 1;
      const anchorPrefixLineKey = anchorPrefixText.slice(anchorPrefixText.lastIndexOf("\n") + 1)
        .normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
      let preAnchorPurchase = 0;
      for (const purchase of scenarioPurchases) {
        const lineNo = Number(purchase && purchase.lineNo);
        const nameKey = String(purchase && purchase.name || "")
          .normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
        const appearsBeforeAnchorOnSameLine = lineNo === anchorLineNo
          && nameKey && anchorPrefixLineKey.includes(nameKey);
        if (!Number.isSafeInteger(lineNo) || lineNo < 1
          || !(lineNo < anchorLineNo || appearsBeforeAnchorOnSameLine)) continue;
        const cost = purchase && purchase.cost || {};
        const amount = Number(cost[currency] ?? 0);
        if (!Number.isSafeInteger(amount) || amount < 0) {
          unsafeCurrency ||= currency;
          return holdUnsafe();
        }
        preAnchorPurchase = safeAdd(preAnchorPurchase, amount, currency);
        if (preAnchorPurchase === null) return holdUnsafe();
      }
      prefixFlow = safeSubtract(prefixFlow, preAnchorPurchase, currency);
      if (prefixFlow === null) return holdUnsafe();
      if (currency === "lp") {
        openingLp = anchor.value;
        openingOffsetLp = safeAdd(cumulativeBefore.lp, prefixFlow, "lp");
        if (openingOffsetLp === null) return holdUnsafe();
      } else {
        openingSh = anchor.value;
        openingOffsetSh = safeAdd(cumulativeBefore.shards, prefixFlow, "shards");
        if (openingOffsetSh === null) return holdUnsafe();
      }
    }
    cumulativeBefore.lp = safeAdd(cumulativeBefore.lp, scenarioFlowLp, "lp");
    cumulativeBefore.shards = safeAdd(cumulativeBefore.shards, scenarioFlowSh, "shards");
    if (unsafeCurrency || cumulativeBefore.lp === null || cumulativeBefore.shards === null) return holdUnsafe();
  }

  out.openingLp = openingLp;
  out.openingShards = openingSh;
  const untimedPurchases = { lp: 0, shards: 0 };
  for (const row of (manifest && manifest.purchaseHistory) || []) {
    const lp = Number(row && row.lp) || 0;
    const shards = Number(row && row.shards) || 0;
    if (!Number.isSafeInteger(lp) || lp < 0) unsafeCurrency ||= "lp";
    if (!Number.isSafeInteger(shards) || shards < 0) unsafeCurrency ||= "shards";
    if (unsafeCurrency) return holdUnsafe();
    untimedPurchases.lp = safeAdd(untimedPurchases.lp, lp, "lp");
    untimedPurchases.shards = safeAdd(untimedPurchases.shards, shards, "shards");
    if (unsafeCurrency || untimedPurchases.lp === null || untimedPurchases.shards === null) return holdUnsafe();
  }
  out.historyNetLp = safeSubtract(safeSubtract(incLp, spLp, "lp"), untimedPurchases.lp, "lp");
  out.historyNetShards = safeSubtract(safeSubtract(incSh, spSh, "shards"), untimedPurchases.shards, "shards");
  if (unsafeCurrency || out.historyNetLp === null || out.historyNetShards === null) return holdUnsafe();

  if (openingLp === null && openingSh === null) {
    out.impliedOpeningLp = shownLp === null ? null : safeSubtract(shownLp, out.historyNetLp, "lp");
    out.impliedOpeningShards = shownSh === null ? null : safeSubtract(shownSh, out.historyNetShards, "shards");
    if (unsafeCurrency) return holdUnsafe();
    out.message = "履歴に開始残高の基準が無いため、手入力の現在値との一致判定は保留しています。";
    return out;
  }
  out.checked = true;
  if (openingLp !== null) {
    out.computedLp = safeSubtract(safeSubtract(safeAdd(openingLp, incLp, "lp"), spLp, "lp"), openingOffsetLp, "lp");
  }
  if (openingSh !== null) {
    out.computedShards = safeSubtract(safeSubtract(safeAdd(openingSh, incSh, "shards"), spSh, "shards"), openingOffsetSh, "shards");
  }
  if (unsafeCurrency || (openingLp !== null && out.computedLp === null) || (openingSh !== null && out.computedShards === null)) return holdUnsafe();
  const badLp = out.computedLp !== null && out.shownLp !== null && out.computedLp !== out.shownLp;
  const badSh = out.computedShards !== null && out.shownShards !== null && out.computedShards !== out.shownShards;
  out.ok = !(badLp || badSh);
  if (!out.ok) {
    const parts = [];
    if (badLp) parts.push("LP 計算 " + out.computedLp + " / 表示 " + out.shownLp);
    if (badSh) parts.push("欠片 計算 " + out.computedShards + " / 表示 " + out.shownShards);
    out.message = parts.join("、") + " が一致しません。";
  }
  return out;
}

const api = {
   parseShareUrl,
   parseShareUrls,
   mergeGarasumadoDocuments,
   reconcileBalance,
    fetchGarasumadoDocument,
    buildManifest,
    toDispatchActions,
    attributeOwned,
    nameKey,
    toIdentityChoices,
    SOURCES,
    unwrapFirestore,
    publicApiKey,
    GROUPS,
    buildResultDraft,
    overlapCandidates
  };
  function parseSpends(memo) {
    if (window.LBT_garaMemo && window.LBT_garaMemo.parseMemo) {
      return window.LBT_garaMemo.parseMemo(String(memo || "")).spends || [];
    }
    return [];
  }

  if (typeof window !== "undefined") {
  window.LBT_garasumado = api;
    window.LBT_parseShareUrl = parseShareUrl;
    window.LBT_parseShareUrls = parseShareUrls;
    window.LBT_mergeGarasumadoDocuments = mergeGarasumadoDocuments;
    window.LBT_fetchGarasumadoDocument = fetchGarasumadoDocument;
    window.LBT_buildGarasumadoManifest = buildManifest;
    window.LBT_toDispatchActions = toDispatchActions;
    window.LBT_buildResultDraft = buildResultDraft;
    /* 所持アイテムの候補を UI で出すため。名前索引はアイテムを持たない。 */
    window.LBT_overlapCandidates = overlapCandidates;
   window.LBT_reconcileBalance = reconcileBalance;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
