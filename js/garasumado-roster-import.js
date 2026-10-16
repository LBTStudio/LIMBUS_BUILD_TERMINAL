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

  /* 人名照合用のキー。共有データの人名は体裁が揺れるため、
     空白・全角英数字・大小文字を吸収する。 */
  function nameKey(s) {
    return String(s || "")
      .replace(/[\s\u3000]/g, "")
      .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  }

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
    const looseKey = (s) => nameKey(String(s || "")
      .replace(/【[^】]*】/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/（[^）]*）|\([^)]*\)/g, "")
      .replace(/MAX|max|専用|の人格/g, ""));
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
          slot.wins.push({ scenario: name, raw: rawName, via: win.via || "" });
        }
        if (loose) {
          const slot = looseSlotOf(loose);
          if (!slot.via.includes(name)) slot.via.push(name);
          if (!slot.wins.some((w) => w.raw === rawName)) {
            slot.wins.push({ scenario: name, raw: rawName, via: win.via || "" });
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
        item.via = hit ? hit.via : [];
        item.wins = hit ? hit.wins : [];
        item.spends = hit ? hit.spends : [];
        item.matchTier = tier;
        item.source = guessSource(item.wins, item.spends);
        if (tier === "loose") matchedByLoose += 1;
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
    return { matched, unmatched, matchedBySpend, matchedByLoose, needsIdentity, unmatchedNames };
  }

  /* 入手方法の初期値。履歴の書き方から分かるものはそのまま入れ、
     分からないものは空欄（=利用者が設定する）にして推測しない。 */
const SOURCES = [
    { id: "ticket", label: "チケット" },
    { id: "buy", label: "購入（LP/欠片）" },
    { id: "given", label: "配布" }
  ];

  function guessSource(wins, spends) {
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
    const owned = (doc && doc.owned) || {};
    let spiritsExcluded = 0;
    const resolve = typeof nameIndex?.resolve === "function" ? nameIndex.resolve : null;
    /* 候補を全部返す解決器。1 件に絞らないので、同名複数をユーザーに見せられる。 */
    const resolveMany = typeof nameIndex?.candidates === "function" ? nameIndex.candidates : null;

    const groups = GROUPS.map((group) => {
      const names = [...new Set((owned[group.id] || []).map(nameOf).filter(Boolean))];
      /* 精神は全て初期精神系（DB の spirits は48件すべて無料）。
         初めから持っているものとして数えるもので、クリア側から
         所持へ登録すると明細のない支出だけが増える。計上対象から外す。 */
      const listed = group.id === "spirits" ? [] : names;
      if (group.id === "spirits") spiritsExcluded = names.length;
      return {
        id: group.id,
        label: group.label,
        items: listed.map((name) => {
          const hit = resolve ? resolve(name) : null;
          const candidates = toIdentityChoices(resolveMany ? resolveMany(name) : null);
          return {
            key: group.id + ":" + name,
            group: group.id,
            name,
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
    const resolveWins = (list) => (list || []).map((w) => {
      const raw = String(w.name || "").trim();
      if (!raw) return null;
      let kinds = [];
      const hit = indexForWins && typeof indexForWins.resolve === "function"
        ? indexForWins.resolve(raw)
        : null;
      if (hit) kinds = hit.kinds || [];
      /* 引けなかった wins に種別を捏造しない。以前は「人格」を既定で
         埋めていたため、ラベルや叙述の断片が獲得として記録に入った。
         番号が無ければ所持には入らない（原本と食い違う記録を作らない）。 */
      return {
        raw,
        name: raw,
        kinds,
        /* チケット由来なら via に入っている（例: 人格抽出チケット） */
        via: w.via || "",
        resolved: Boolean(hit)
      };
    }).filter(Boolean);

    const history = (doc && doc.scenarioHistory) || [];
    const scenarios = history
      .filter((row) => row && (row.name || row.memo))
      .map((row, index) => {
        const base = { key: "scenario:" + index, name: String(row.name || "").trim() || "無題", group: "scenarios" };
        if (!memoApi) return { ...base, memo: String(row.memo || ""), income: { lp: 0, shards: 0 }, tickets: {}, pack: {}, spends: [], wins: [], reasons: [{ reason: "メモパーサが読み込まれていない" }] };
        const parsed = memoApi.parseMemo(row.memo);
        const wins = resolveWins(parsed.wins);
        return {
          ...base,
          memo: String(row.memo || ""),
          income: parsed.income,
          tickets: parsed.tickets,
          pack: parsed.pack,
          spends: parsed.spends,
          reasons: parsed.reasons,
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
            wins.length > 0
        };
      });

    const attribution = attributeOwned(groups, scenarios);

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
      /* 所持品の帰属照合結果。matched=どのシナリオか判明、unmatched=履歴に記載なし。 */
      attribution,
      counts: {
        personas: groups[0].items.length,
        egos: groups[1].items.length,
        supportPassives: groups[2].items.length,
        spirits: groups[3].items.length,
        scenarios: scenarios.length,
        /* 初期精神系（全て無料）は計上対象外。件数を残して黙って消さない。 */
        spiritsExcluded,
        unresolved: groups.reduce((n, g) => n + g.items.filter((i) => !i.resolved).length, 0),
        attributed: attribution.matched,
        unattributed: attribution.unmatched,
        /* 支出行（購入）との照合で帰属が決まった数。 */
        boughtViaSpend: attribution.matchedBySpend,
        /* 表記ゆれ照合で帰属が決まった数（完全一致は含まない）。 */
        matchedByLoose: attribution.matchedByLoose
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
     定めるのはコート時だけ。他の利用者は従来通り通す。 */
  function chosenVia(item) {
    if (item.via && item.via.length) return item.via;
    if (item.pickedScenario) return [item.pickedScenario];
    if (item.needsAttribution) return null;
    return [];
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
        /* 種別は取込側が決まったので、ここでは「どれとして入れるか」を選ぶ。
           利用者の選択（picked）が最優先。決まっていなければ補わない。 */
        /* シナリオに記載が無い所持品は、帰属先を選んでから入れる。 */
        const via = chosenVia(item);
        if (!via) {
          skipped.push({ key: item.key, reason: "どのシナリオのものか選んでください" });
          continue;
        }
        /* 入手方法（チケット／購入／配布）は三分類で、利用者が選ぶ。
           空欄を「配布」と勝手に解釈すると、抽出でも購入でも無料計入になり
           帳が狂う。由来が明確で無料と確定しているものだけ通す。
           番号が引けない項目は利用者が直せないので、その理由を先に言う。 */
        const sourceOk = Boolean(item.source) || (item.provenance && item.provenance.priced === false);
        const holdOnSource = () => skipped.push({ key: item.key, reason: "入手方法を選んでください" });
        const chosen = chosenKind(item);
        /* 同名候補が複数あるときは、索引の先頭で決めつけず選ばせる。 */
        const ambiguous = (item.identityCandidates || []).length > 1;
        const kinds = (f) => (ambiguous ? null : item.kinds.find(f));
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
          if (!sourceOk) { holdOnSource(); continue; }
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n", via, source: item.source || "", purchase: item.source === "buy" });
        } else if (group.id === "egos") {
          if (!ego || !ego.no || !ego.rank) {
            skipped.push({ key: item.key, reason: "DB番号かランクが引けない" });
            continue;
          }
          if (!sourceOk) { holdOnSource(); continue; }
          actions.push({ type: "ADD_ROSTER_EGO", no: String(ego.no), rank: ego.rank, via, source: item.source || "", purchase: item.source === "buy" });
        } else if (group.id === "supportPassives") {
          if (!support) { skipped.push({ key: item.key, reason: "DB番号が引けない" }); continue; }
          if (!sourceOk) { holdOnSource(); continue; }
          actions.push({ type: "ADD_ROSTER_SUPPORT", spp: { name: support.name || item.dbName || item.name }, via });
        } else if (group.id === "spirits") {
          if (!spirit) { skipped.push({ key: item.key, reason: "DB番号が引けない" }); continue; }
          if (!sourceOk) { holdOnSource(); continue; }
          actions.push({ type: "ADD_ROSTER_SPIRIT", spirit: { name: spirit.name || item.dbName || item.name }, via });
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
        for (const name of chosenVia(item) || []) {
          const hit = ((manifest && manifest.scenarios) || []).find((s) => s && s.name === name);
          if (hit) attributedScenarioKeys.add(hit.key);
        }
      }
    }
    for (const scenario of (manifest && manifest.scenarios) || []) {
      if (!selected.has(scenario.key) && !attributedScenarioKeys.has(scenario.key)) continue;
      const income = scenario.income || { lp: "", shards: "" };
      const tickets = scenario.tickets || {};
      const pack = scenario.pack || {};
      /* チケットは income.tickets に入る。reducer は action.income.tickets を読む
         （normalizeTickets）。incomeTickets という別キーは見てくれない。 */
      actions.push({
        type: "ADD_RESULT",
        name: scenario.name || "無題",
        income: {
          lp: income.lp || 0,
          shards: income.shards || 0,
          tickets: {
            persona: tickets.persona || 0,
            ego: tickets.ego || 0,
            choice: tickets.choice || 0,
            pack
          }
        }
      });

      /* シナリオで直接払い出された人格/E.G.O。所持へ足す。
         チケット由来なら「どのチケット由来か」を使って
         消費記録を 1 件残し、直近のリザルトに帰属させる。
         金額ゼロの明細なので、帳簿の収支は乱れない。 */
      for (const win of scenario.wins || []) {
        const kinds = win.kinds || [];
        const persona = kinds.find((k) => k && k.kind === "persona" && k.no != null);
        const ego = kinds.find((k) => k && k.kind === "ego" && k.no != null && k.rank);
        if (persona) {
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n" });
        } else if (ego) {
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

      /* memo の「・支出」「・支払い」以下が支出明細。
         「LPを欠片に変換：+11欠片 -22LP」のように両通貨が 1 行に並ぶことがある。
         片方だけ取ると帳尻が合わなくなるので両方を拾う。
         読み取れなかった金額は 0 のままにして名前だけ残す。
         勝手に埋めれば、原本と食い違う数字が残る。 */
      for (const spend of scenario.spends || []) {
        actions.push({
          type: "ADD_ENTRY",
          kind: "other",
          name: String(spend.name || "（明細）").slice(0, 120),
          cost: { lp: spend.lp || 0, shards: spend.shards || 0 }
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

    return { actions, skipped };
  }

  const api = {
    parseShareUrl,
    fetchGarasumadoDocument,
    buildManifest,
    toDispatchActions,
    attributeOwned,
    nameKey,
    toIdentityChoices,
    SOURCES,
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
