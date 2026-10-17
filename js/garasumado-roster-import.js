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
    const owned = (doc && doc.owned) || {};
    
    const resolve = typeof nameIndex?.resolve === "function" ? nameIndex.resolve : null;
    /* 候補を全部返す解決器。1 件に絞らないので、同名複数をユーザーに見せられる。 */
    const resolveMany = typeof nameIndex?.candidates === "function" ? nameIndex.candidates : null;

    const groups = GROUPS.map((group) => {
      /* アイテムだけは owned ではなく共有ドキュメントのトップレベルにある。
         個数が 0 のものは所持ではないので落とさない（残すと「持っていないのに
         計上」になるため、個数で除外する）。 */
      const source = group.id === "items"
        ? ((doc && doc.items) || []).filter((it) => Number(it && it.count) > 0)
        : (owned[group.id] || []);
      const names = [...new Set(source.map(nameOf).filter(Boolean))];
      /* 精神も計上する。DB の spirits 48件のうち無料は初期精神の3件
         （パニック/圧倒/萎縮）で、残り45件は 50〜1000 LP の有料品。
         以前は「48件すべて無料」と誤認して所持から落としていたが、
         そのせいで有料の精神まで購入記録ごと消えていた。 */
      const listed = names;
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
        /* 購入の短文（「ルサンチマン購入-7」等）で読めた勝ちは購入 */
        bought: Boolean(w.bought),
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
    let purchaseScenario = null;
    if (purchaseMemo && memoApi) {
      const parsed = memoApi.parseMemo(purchaseMemo);
      purchaseScenario = {
        key: "scenario:purchases",
        name: "購入履歴",
        group: "scenarios",
        memo: purchaseMemo,
        income: { lp: 0, shards: 0 },
        tickets: { persona: 0, ego: 0, choice: 0 },
        pack: {},
        spends: parsed.spends,
        wins: resolveWins(parsed.wins),
        reasons: []
      };
    }

    const attribution = attributeOwned(groups, purchaseScenario ? [...scenarios, purchaseScenario] : scenarios);

    /* 初期精神は「無料（DB で price が無い）」の3件だけ。それ以上は原理的に存在しない
       ので、4件目が現れたら共有データかDBのどちらかが壊れている。 */
    const spiritPrices = new Map(
      ((db && db.spirits) || []).map((s) => [nameKey(s.name), Number(s.price) || 0])
    );
    const initialSpiritNames = ((groups[3] && groups[3].items) || [])
      .filter((it) => !(spiritPrices.get(nameKey(it.name)) > 0))
      .map((it) => it.name);
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
    /* 所持ループで既に納入した品目。シナリオの獲得ループが同じ人格・E.G.O を
       二重に登録しないためのもの（所持一覧と獲得行の両方に出る品目は 1 件だけ）。 */
    const taken = new Set();

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
        const via = chosenVia(item) || (selected.has(item.key) ? [] : null);
        if (!via) {
          skipped.push({ key: item.key, reason: "どのシナリオのものか選んでください" });
          continue;
        }
        /* チェックした品目は必ず入れる（チェック＝入れるへの同意）。
           入手方法が未決なら配布（purchase=false）として入れるので
           帳が吹くことはない。チケット・購入は三分類が決めてから課す。 */        const chosen = chosenKind(item);
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
          taken.add(`persona:${persona.mode || "n"}:${persona.no}`);
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n", via, source: item.source || "", purchase: item.source === "buy" });
        } else if (group.id === "egos") {
          if (!ego || !ego.no || !ego.rank) {
            skipped.push({ key: item.key, reason: "DB番号かランクが引けない" });
            continue;
          }
          taken.add(`ego:${ego.rank}:${ego.no}`);
          actions.push({ type: "ADD_ROSTER_EGO", no: String(ego.no), rank: ego.rank, via, source: item.source || "", purchase: item.source === "buy" });
        } else if (group.id === "supportPassives") {
          if (!support) { skipped.push({ key: item.key, reason: "DB番号が引けない" }); continue; }
          /* サポートパッシブは三分類の対象外（同期/解析と同じ「そのまま確定」）。
             課帳の有無は purchase フラグ（source === "buy"）だけが決める。 */
          /* 購入だったときだけ課帳する（ADD_ROSTER と同じ契約）。
             配布・シナリオ報酬で得たパッシブに 7LP を課すと帳が膨らむ。 */
          actions.push({
            type: "ADD_ROSTER_SUPPORT",
            spp: { name: support.name || item.dbName || item.name },
            via,
            purchase: item.source === "buy"
          });
        } else if (group.id === "spirits") {
          if (!spirit) { skipped.push({ key: item.key, reason: "DB番号が引けない" }); continue; }
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

      /* 同期化・解析は人格の獲得とは別の費用記録として計上する（supplement P7/P23）。
         操作キーワードで種別が決まる（同期→人格、解析→E.G.O）。名前で対象を引き、
         引けなかったものは勝手に当てない。uid は APPLY_IMPORT_BATCH が解決する。 */
      const opLines = String(scenario.memo || "").split(/[\n\r]/).map((t) => t.trim()).filter(Boolean);
      for (const op of (window.LBT_annotateOperations || (() => []))(opLines, opts.db || window.DB || {})) {
        if (!op.hasTarget || !op.target) continue;
        const hit = (opts.resolve || (() => null))(op.target);
        if (!hit) continue;
        const isAnalyze = op.operation === "analyze";
        const isMax = /MAX/.test(op.line);
        const target = op.operation === "analyze"
          ? (isMax ? "analyzeMax" : "analyze")
          : (isMax ? "syncMax" : "sync");
        const persona = (hit.kinds || []).find((k) => k.kind === "persona");
        const ego = (hit.kinds || []).find((k) => k.kind === "ego");
        if (isAnalyze && ego) {
          actions.push({ type: "APPLY_EGO_ANALYZE", egoName: egoNameOf(ego), analyzeMax: isMax, resultId: null });
        } else if (persona) {
          actions.push({ type: "APPLY_PERSONA_SYNC", personaName: personaNameOf(persona), syncMax: isMax, synced: true, resultId: null });
        }
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
          actions.push({ type: "ADD_ROSTER", no: String(persona.no), mode: persona.mode || "n" });
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
  function overlapCandidates(name, db) {
    const want = overlapChars(name);
    if (!want.length) return [];
    const out = [];
    const push = (row, kind) => {
      const dbChars = overlapChars(row && row.name);
      if (dbChars.length < F_MIN_DB_NAME) return;
      const hit = want.filter((c) => dbChars.includes(c)).length;
      if (hit < 2) return;
      const ratio = hit / want.length;
      if (ratio < F_MATCH_RATIO) return;
      out.push({ kind, name: row.name, no: row.no, rank: row.rank, mode: row.mode, ratio, hit });
    };
    for (const row of (db && db.normal_personas) || []) push(row, "persona");
    for (const row of (db && db.tokui_personas) || []) push(row, "persona");
    for (const row of (db && db.egos) || []) push(row, "ego");
    for (const row of (db && db.support_passives) || []) push(row, "support");
    for (const row of (db && db.death_passives) || []) push(row, "deathSupport");
    out.sort((a, b) => b.ratio - a.ratio || b.hit - a.hit);
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
           単なる本文 언급より強い根拠として、獲得行と同列に扱う。 */
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
    return hits.length ? { tier: "D", scenario: hits[0].name, unique: hits.length === 1, hits: hits.length } : null;
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
        const bought = exact.find((e) => e.spend.has(key));
        return { tier: bought ? "C" : "A", scenario: (bought || exact[0]).name, unique: exact.length === 1 };
      }
    }
    /* 同期・解析の記載がある。它的対象は既に所持に存在した品目なので、
       獲得行に載っていなくても帰属が決まる（本文言及より強い）。 */
    for (const key of keys) {
      const synced = evidence.filter((e) => e.synced.has(key));
      if (synced.length) {
        return { tier: "S", scenario: synced[0].name, unique: synced.length === 1 };
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
      items: []
    }));
    const blockOfName = new Map();
    for (const b of blocks) if (!blockOfName.has(b.name)) blockOfName.set(b.name, b);
    const unassigned = [];

    for (const group of (manifest && manifest.groups) || []) {
      for (const raw of group.items || []) {
        const patch = identity[raw.key] || {};
        if (selected && !selected.has(raw.key)) continue;
        const item = { ...raw, ...patch };
        /* 略称（鬼門、ロジアトなど）は正式名を引いてから本文照合する。
           名前索引の文字一致を使い、一意に絞れるものだけ名前解決に使う。 */
        const cands = db ? overlapCandidates(item.name, db) : [];
        const names = cands.length === 1 ? [cands[0].name] : [];
        const found = attributionOf(item, evidence, names);
        /* 归属 Override があれば、照合より優先する。 */
        const chosenName = item.pickedScenario || (found ? found.scenario : "");
        const chosenBlock = chosenName ? (blockOfName.get(chosenName) || null) : null;
        const tier = item.pickedScenario ? "M" : found ? found.tier : "";
        const source = item.source || "";

        const record = {
          key: item.key,
          name: item.name,
          group: group.id,
          tier,
          source,
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
        record.reason = !found
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
      if (String(action.type || "").startsWith("ADD_ROSTER")) {
        held += 1;
        const s = action.source || (action.purchase ? "buy" : "given");
        bySource[s] = (bySource[s] || 0) + 1;
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

/* 残高照合。表示残高（doc.currency）とリザルト計算（開始残高＋収入−消費）を
   突き合わせる。ただし「残高変動を1件も記載していないユーザー」には
   エラーを返さない：何を書けば良いか分からない人を責めることになる。 */
  function reconcileBalance(manifest, doc) {
    const cur = (doc && doc.currency) || {};
    const shownLp = Number(cur.lp);
    const shownSh = Number(cur.fragment);
    const out = {
      checked: false, ok: true,
      openingLp: null, openingShards: null,
      computedLp: null, computedShards: null,
      shownLp: Number.isFinite(shownLp) ? shownLp : null,
      shownShards: Number.isFinite(shownSh) ? shownSh : null,
      message: ""
    };
    const scenarios = (manifest && manifest.scenarios) || [];
    let openingLp = null, openingSh = null;
    let incLp = 0, incSh = 0, spLp = 0, spSh = 0;
    for (const s of scenarios) {
      const memo = String(s.memo || "");
      const income = s.income || {};
      incLp += Number(income.lp) || 0;
      incSh += Number(income.shards) || 0;
      for (const sp of parseSpends(memo)) { spLp += Number(sp.lp) || 0; spSh += Number(sp.shards) || 0; }
      /* 最初に見つかった現在値が開始残高。scenarioHistory は時系列。 */
      const lp = memo.match(/(?:LP|ＬＰ)?\s*(?:[:：]\s*)?現在\s*(\d+)/);
      if (lp && openingLp === null) openingLp = Number(lp[1]);
      const sh = memo.match(/(?:欠片|かけら|欠けら|カケラ)[\s\S]{0,8}?現在\s*(\d+)/);
      if (sh && openingSh === null) openingSh = Number(sh[1]);
    }
    out.openingLp = openingLp;
    out.openingShards = openingSh;
    if (openingLp === null && openingSh === null) {
      out.message = "残高変動の記載が無いので照合しません。";
      return out;
    }
    out.checked = true;
    out.computedLp = openingLp === null ? null : openingLp + incLp - spLp;
    out.computedShards = openingSh === null ? null : openingSh + incSh - spSh;
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
    window.LBT_fetchGarasumadoDocument = fetchGarasumadoDocument;
    window.LBT_buildGarasumadoManifest = buildManifest;
    window.LBT_toDispatchActions = toDispatchActions;
    window.LBT_buildResultDraft = buildResultDraft;
   window.LBT_reconcileBalance = reconcileBalance;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
