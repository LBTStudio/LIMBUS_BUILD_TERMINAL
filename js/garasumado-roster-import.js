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

  /* URL からドキュメント ID とコレクションを抜く。
     利用者が貼るのは「コピーの結果」であって正規の URL ではない。
     前後に文字が付いていても、スキームが抜けていても、末尾に
     スラッシュ・検索語・フラグメントが付いていても同じ ID を取り出せるようにする。 */
  function parseShareUrl(raw) {
    const text = String(raw || "").trim();
    if (!text) return { ok: false, error: "URL を入力してください" };

    // -domain が硝子窓であることを先に確かめる。異なるドメインの /view/ を
    // 受け入れると、別サービスの ID を硝子窓として引いてしまう。
    if (!/garasumado/i.test(text)) {
      // ただし ID だけの貼り付けは許す（コピー結果に URL が含まれることがある）。
      const bare = text.match(/^[A-Za-z0-9_-]{20}$/);
      if (bare) return { ok: true, id: text, collection: "characters" };
      return { ok: false, error: "硝子窓の共有URLを貼りってください（…/view/ID の形式）" };
    }

    // 本来の形式。persona 配置は先に見る（characters にも同じ語がある）。
    const full = text.match(/(persona)?\/view\/([A-Za-z0-9_-]{6,})/);
    if (full) return { ok: true, id: full[2], collection: full[1] ? "personas" : "characters" };

    // スキームだけ落ちた形式。
    const hostless = text.match(/garasumado[^\s/]*\/view\/([A-Za-z0-9_-]{6,})/);
    if (hostless) return { ok: true, id: hostless[1], collection: "characters" };

    return { ok: false, error: "硝子窓の共有URLを貼りってください（…/view/ID の形式）" };
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
          return { ok: true, id: parsed.id, collection, doc: unwrapFirestore(body.fields) };
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
    { id: "spirits", label: "所持精神" }
  ];

  /* 取込候補の一覧を作る。利用者が「何を取り込むか」を選べるようにするため、
     ここではまだ何も state へ入れない。 */
  function buildManifest(doc, nameIndex) {
    const owned = (doc && doc.owned) || {};
    const resolve = typeof nameIndex?.resolve === "function" ? nameIndex.resolve : null;

    const groups = GROUPS.map((group) => {
      const names = [...new Set((owned[group.id] || []).map(nameOf).filter(Boolean))];
      return {
        id: group.id,
        label: group.label,
        items: names.map((name) => {
          const hit = resolve ? resolve(name) : null;
          return {
            key: group.id + ":" + name,
            group: group.id,
            name,
            resolved: Boolean(hit),
            dbName: hit ? hit.name : "",
            kinds: hit ? hit.kinds : [],
            confidence: hit ? hit.confidence : ""
          };
        })
      };
    });

    const scenarios = (doc && doc.scenarioHistory ? doc.scenarioHistory : [])
      .filter((row) => row && (row.memo || row.name))
      .map((row, index) => ({
        key: "scenario:" + index,
        name: String(row.name || "").trim(),
        memo: String(row.memo || ""),
        group: "scenarios"
      }));

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
      counts: {
        personas: groups[0].items.length,
        egos: groups[1].items.length,
        supportPassives: groups[2].items.length,
        spirits: groups[3].items.length,
        scenarios: scenarios.length,
        unresolved: groups.reduce((n, g) => n + g.items.filter((i) => !i.resolved).length, 0)
      }
    };
  }

  /* 選択された manifest を、実際に投げる action の一覧にする。
     ここでは state 触らない。redux と同じ純粋な変換にしておくと、
     「何を入れるか」を取り込み前に検証できる。 */
  function toDispatchActions(manifest, selectedKeys, options) {
    const opts = options || {};
    const selected = new Set(selectedKeys || []);
    const actions = [];
    const skipped = [];

    for (const group of (manifest && manifest.groups) || []) {
      for (const item of group.items) {
        if (!selected.has(item.key)) continue;
        // 種別は取込側が決まったので、ここでは「どれとして入れるか」を選ぶ。
        const persona = item.kinds.find((k) => k.kind === "persona");
        const ego = item.kinds.find((k) => k.kind === "ego");
        const support = item.kinds.find((k) => k.kind === "support" || k.kind === "deathSupport");
        const spirit = item.kinds.find((k) => k.kind === "spirit");

        if (group.id === "personas") {
          if (!persona || !persona.no) { skipped.push({ key: item.key, reason: "DB番号が引けない" }); continue; }
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n" });
        } else if (group.id === "egos") {
          if (!ego || !ego.no || !ego.rank) { skipped.push({ key: item.key, reason: "DB番号かランクが引けない" }); continue; }
          actions.push({ type: "ADD_ROSTER_EGO", no: String(ego.no), rank: ego.rank });
        } else if (group.id === "supportPassives") {
          actions.push({ type: "ADD_ROSTER_SUPPORT", spp: { name: item.dbName || item.name } });
        } else if (group.id === "spirits") {
          actions.push({ type: "ADD_ROSTER_SPIRIT", spirit: { name: item.dbName || item.name } });
        } else {
          skipped.push({ key: item.key, reason: "未知のグループ" });
        }
      }
    }

    /* シナリオ履歴。選択した分を「結果」として作り、そのシナリオの
       購入候補（選ばれたもの）を支出明細として続ける。
       順序が意味を持つ: ADD_ENTRY は直前の ADD_RESULT に歸属する。 */
    const purchases = opts.purchases || {};
    for (const scenario of (manifest && manifest.scenarios) || []) {
      if (!selected.has(scenario.key)) continue;
      actions.push({ type: "ADD_RESULT", name: scenario.name || "無題", income: opts.income || { lp: "", shards: "" } });
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

    return { actions, skipped };
  }

  const api = {
    parseShareUrl,
    fetchGarasumadoDocument,
    buildManifest,
    toDispatchActions,
    unwrapFirestore,
    publicApiKey,
    GROUPS
  };
  if (typeof window !== "undefined") {
    window.LBT_garasumado = api;
    window.LBT_parseShareUrl = parseShareUrl;
    window.LBT_fetchGarasumadoDocument = fetchGarasumadoDocument;
    window.LBT_buildGarasumadoManifest = buildManifest;
    window.LBT_toDispatchActions = toDispatchActions;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();