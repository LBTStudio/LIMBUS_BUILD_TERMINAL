/* 名前候補を DB に照合して種別を決める。
   「ミートパイ 闘志」のように、前後が名前とは限らない行があるため、
   文面から種別を推測しない。DB に当たったものだけを種別とし、
   当たらなかった自作アイテムと略称は unknown として返す。
   利用者が一度 Alliance した略称は alias に残す。 */
(function () {
  const KINDS = [
    ["persona", (db) => (db.normal_personas || []).map((r) => [r, "n"]).concat((db.tokui_personas || []).map((r) => [r, "t"]))],
    ["ego", (db) => (db.egos || []).map((r) => [r, ""])],
    ["support", (db) => (db.support_passives || []).map((r) => [r, ""])],
    ["enhancement", (db) => (db.normal_enhancements || []).map((r) => [r, ""]).concat((db.special_enhancements || []).map((r) => [r, "special"]))],
    ["deathSupport", (db) => (db.death_passives || []).map((r) => [r, ""])],
    ["spirit", (db) => (db.spirits || []).map((r) => [r, ""])]
  ];

  // 名前ではない語。取り除いてから DB を引く。
  const NOISE = /闘志|同期(?:化|MAX)?|サポ(?:パ|スロ)?(?:解放)?|解放|購入|消費|支払|選定|獲得|抽出|ガチャ|チケット|チケ|人格|精神|現在値?|枠|以上|以下|強化/g;
  const STANDALONE_EGO = /(^|\s)(?:E\.?\s?G\.?\s?O|エゴ)(?=\s|$)/g;
  const PUNCT = /[【】《》「」()（）:：・,，、\/\\|｜\-–—*＊#＃~〜?？!！.。\s]/g;
  const PARTICLE = /[のがをはへ]$/;

  // 照合用の形。表示用とは分ける。
  const fold = (value) => String(value ?? "")
    // 全角英数字は半角に寄せる。DB 名は半角、ログは全角で書かれることがある。
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ":")
    .replace(/　/g, " ")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(PARTICLE, "")
    .trim()
    .toLowerCase();

  // 数字の前後に空白不入きの形。「南部ツヴァイ協会 4 課フィクサー」を「南部ツヴァイ協会4課フィクサー」に寄せる。
  const squeezed = (value) => String(value || "").replace(/\s+/g, "");

  function buildNameIndex(db, aliasMap) {
    const index = new Map();  // 正規化名 -> { name, kinds }
    const keys = [];           // 部分一致の走査用

    const register = (rawName, kind, row, mode) => {
      const key = fold(rawName);
      if (!key) return;
      if (!index.has(key)) {
        const entry = { name: String(rawName).trim(), key, kinds: [] };
        index.set(key, entry);
        keys.push({ key, entry });
      }
      const entry = index.get(key);
      if (!entry.kinds.some((k) => k.kind === kind)) {
        // mode は人格が通常(n)/特異(t) のどちらかを所持側の形へ伝えるためのもの。
        entry.kinds.push({ kind, no: row.no, rank: row.rank, level: row.level, mode });
      }
      // 空白とハイフンの差も同じ物。DB 名の「因子コードG-5」とログの「因子コードG5」を
      // 分别为引けるよう、空白を詰めた形でも登録する。
      const packed = squeezed(key);
      if (packed && packed !== key && !index.has(packed)) {
        index.set(packed, { ...entry, key: packed, packedFrom: entry.name });
      }
    };

    for (const [kind, pick] of KINDS) {
      for (const [row, mode] of pick(db || {})) register(row && row.name, kind, row, mode);
    }

    // 利用者が Alliance した略称。
    const aliases = new Map();
    for (const [short, long] of Object.entries(aliasMap || {})) {
      const target = index.get(fold(long));
      if (!target) continue;
      const key = fold(short);
      if (!key) continue;
      aliases.set(key, target);
      if (!index.has(key)) index.set(key, { name: short, key, kinds: target.kinds, aliasOf: target.name });
    }

    return { index, keys, aliases };
  }

  const MIN_CANDIDATE = 2;   // これ未満の短い名前は照合しない
  const MIN_HEAD = 4;        // 前方切り詰めは 4 文字以上だけ。短いと偶発的に別の名が決まる。
  const MIN_DB_NAME = 5;     // 部分一致は長い名にだけ効く

  /* 一致の確度。exact / alias / unique-substring */
  function tryMatch(idx, candidate) {
    if (!candidate || candidate.length < MIN_CANDIDATE) return null;
    const direct = idx.index.get(candidate);
    if (direct) return { ...direct, confidence: direct.aliasOf ? "alias" : "exact" };

    // 名前の後ろに操作語が続くことがある（「涙剣CT2を短縮」）。
    // 利用者が宣言した別名は推測じゃないので長さ制限に出さない。
    // DB 名の先頭一致は推測なので 4 文字未満に切らない。
    if (candidate.length >= 3) {
      for (let n = candidate.length - 1; n >= MIN_CANDIDATE; n -= 1) {
        const head = candidate.slice(0, n);
        const hit = idx.index.get(head);
        if (!hit) continue;
        if (hit.aliasOf) return { ...hit, confidence: "alias" };
        if (n >= MIN_HEAD) return { ...hit, confidence: "head-prefix" };
      }
    }

    // 部分一致は「DB 内で一意に決まる」ときだけ採用する。
    // 「ミートパイ」-> 「○○のミートパイ厨房長」の類。
    // 4 文字未満は偶然当たる確率が読み太小いので当てない（「G-7」は見落とす）。
    // 静かに違う種別決まるより、ユーザーに選んでもらうほうが安全。
    if (candidate.length >= 4) {
      const hits = [];
      for (const { key, entry } of idx.keys) {
        if (key.length < MIN_DB_NAME) continue;
        if (key.includes(candidate)) hits.push(entry);
      }
      if (hits.length === 1) return { ...hits[0], confidence: "unique-substring" };
    }
    return null;
  }

  /* 空白ありの形と、空白を詰めた形の両方で引く。 */
  function tryMatchLoose(idx, candidate) {
    const direct = tryMatch(idx, candidate);
    if (direct) return direct;
    const packed = squeezed(candidate);
    if (packed === candidate) return null;
    return tryMatch(idx, packed);
  }

  /* 行から名前候補を引き、DB に当てる。 */
  function resolveCandidates(idx, line) {
    const cleaned = fold(String(line || "").replace(STANDALONE_EGO, " ").replace(NOISE, " "));
    if (!cleaned) return [];
    const parts = cleaned.split(" ").filter(Boolean);
    const probes = [];
    for (let n = parts.length; n >= 1; n -= 1) probes.push(parts.slice(0, n).join(" ").trim());
    for (const probe of probes) {
      const hit = tryMatchLoose(idx, probe);
      if (hit) return [{ ...hit, probe }];
    }
    return [];
  }

  // 金額だけの行・節見出しは名前ではない。
  const isAmountOnly = (line) => /^[\d\s.,:/+\-欠片lp現在値･・]*$/i.test(fold(line)) || !/[^\s]/.test(line);
  const SECTION_ONLY = /^(?:・\s*)?(?:支出|支払い|支付|報酬|購入|消費|保管物|所持物| Casi )?$/;

  /* 全文から「誰が・何を得たか」を集める。金額行や見出しは行わない。 */
  function resolveText(idx, text) {
    const found = new Map();
    const unknown = [];
    for (const raw of String(text || "").split("\n")) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (/^[[【《]/.test(trimmed)) continue;
      const line = trimmed.replace(STANDALONE_EGO, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
      if (SECTION_ONLY.test(fold(line))) continue;
      if (isAmountOnly(line)) continue;

      const hits = resolveCandidates(idx, raw);
      if (hits.length) {
        for (const h of hits) {
          const key = h.kinds.map((k) => k.kind).join("/") + "::" + h.name;
          if (!found.has(key)) {
            found.set(key, { name: h.name, kinds: h.kinds, lines: [], confidence: h.confidence });
          }
          found.get(key).lines.push(line);
        }
      } else if (/[^\s]{2,}/.test(line)) {
        if (!unknown.includes(line)) unknown.push(line);
      }
    }
    const items = [...found.values()];
    return { items, byKind: groupByKind(items), unknown };
  }

  function groupByKind(items) {
    const out = {};
    for (const entry of items) {
      for (const k of entry.kinds) {
        const kind = k.kind;
        if (!out[kind]) out[kind] = [];
        if (!out[kind].some((x) => x.name === entry.name)) out[kind].push({ ...entry, ...k });
      }
    }
    return out;
  }

/* 1項目について「変換候補」を作る。 予測変換はここ。
       IME の候補と同じで、一致しうる名前と価格を確度付きで並べる。
       断定はしない。利用者が1つ選ぶと価格が決まる。
       価格は DB が価格を持つ種別なら DB、人格・E.G.O は公式ルールから引く。
       名前が同じでも「抽出」か「購入」かで価格が違うので、両方を別候補として出す。 */
    /* 由来が「支出ではない」と語れるもの。価格を出さない。
         unknown はここに入れない。由来が読めないのと無料のは別なので、
         DB の価格は提示したまま、利用者に選んでもらう。 */
  const FREE_BY_PROVENANCE = new Set(["gachaTicket", "grant"]);

  function candidatesFor(item, idx) {
      const out = [];
      const line = String(item.sourceLine || item.name || "");
      /* 由来が「抽出チケット」「配布」なら支出ではない。core:9502 の抽出は
         100欠片だが、チケットなら 0、配布も 0。
         ここを見ないと、チケットで得た E.G.O を core:9510 の購入価格で
         請求してしまう。 */
      const prov = typeof window !== "undefined" && typeof window.LBT_inferProvenance === "function"
        ? window.LBT_inferProvenance(line)
        : null;
      const freeByProvenance = prov && FREE_BY_PROVENANCE.has(prov.id);
      const push = (name, kindEntry, confidence, probe, extra) => {
        if (!name || !kindEntry) return;
        const acquisition = (extra && extra.acquisition) || "db";
        if (out.some((o) => o.name === name && o.kind === kindEntry.kind && o.acquisition === acquisition)) return;
        const fromDb = priceOf(name, kindEntry.kind, (typeof window !== "undefined" && window.DB) || {});
        /* チケット/配布なら 0 ではなく、支払いが発生していない状態。0 を書くと
           「0 で購入した」ように見えるので、null のまま出す。
           候補そのものは消さない。消すと利用者が所持へ追加する手段を失う。 */
        const price = freeByProvenance ? null : (fromDb || (extra && extra.price) || null);
        out.push({
          key: "cand:" + kindEntry.kind + ":" + acquisition + ":" + name,
          name,
          kind: kindEntry.kind,
          kindLabel: kindLabel(kindEntry.kind),
          price,
          acquisition,
          acquisitionLabel: (extra && extra.acquisitionLabel) || (freeByProvenance ? prov.label : ""),
          free: freeByProvenance || undefined,
          source: (extra && extra.source) || (fromDb ? "DB" : ""),
          confidence,
          probe
        });
      };

      /* 人格・E.G.O は DB に価格が無いが公式ルールに価格がある。 */
      const RULE_KINDS = new Set(["persona", "ego"]);
      function ruleCandidates(kindEntry, ownsOne) {
        if (!kindEntry || !RULE_KINDS.has(kindEntry.kind)) return;
        if (kindEntry.kind === "persona") {
          push("指定購入", kindEntry, "rule", "ルール", {
            acquisition: "purchase", acquisitionLabel: "指定購入",
            price: ownsOne ? { lp: 200, shards: 0 } : { lp: 20, shards: 0 },
            source: ownsOne ? "core:621 人格購入" : "core:620 人格購入"
          });
          push("抽出", kindEntry, "rule", "ルール", {
            acquisition: "gacha", acquisitionLabel: "ランダム抽出",
            price: ownsOne ? { lp: 100, shards: 0 } : { lp: 0, shards: 0 },
            source: ownsOne ? "core:607 人格抽出" : "core:606 人格抽出"
          });
          return;
        }
        /* E.G.O購入は各E.G.O番号の横の欠片数を消費する（core:9509-9512）。
     抽出は一律100欠片（core:9502）。既に持っているものは購入できない。 */
        const egoEntry = kindEntry.rank && kindEntry.no
          ? (window.DB?.egos || []).find((e) => e.rank === kindEntry.rank && e.no === kindEntry.no)
          : null;
        push("指定購入", kindEntry, "rule", "ルール", {
          acquisition: "purchase", acquisitionLabel: "指定購入",
          price: { lp: 0, shards: Number.parseInt(egoEntry?.shards, 10) || 0 },
          source: "core:9510 E.G.O購入"
        });
        push("抽出", kindEntry, "rule", "ルール", {
          acquisition: "gacha", acquisitionLabel: "ランダム抽出",
          price: { lp: 0, shards: 100 }, source: "core:9502 E.G.O抽出"
        });
      }

      /* 1. 完全一致 */
      for (const k of item.kinds || []) push(item.name, k, "exact", item.name);

      /* 2. DB 名そのもの */
      if (item.dbName) {
        const entry = idx.index.get(item.dbName);
        if (entry) for (const k of entry.kinds) push(entry.name, k, "exact", item.dbName);
      }

      /* 3. 行中から候補を拾う（前後込みで DB を引き直す） */
      const raw = resolveCandidates(idx, line)[0];
      if (raw) for (const k of raw.kinds) push(raw.name, k, raw.confidence, raw.probe);

      /* 4. 所属（affiliation）やプレフィックスも候補に出す */
      if (raw?.kinds?.length) {
        const name = raw.name;
        const pieces = name.split(/[:：・]/).map((p) => p.trim()).filter(Boolean);
        for (const piece of pieces) {
          if (piece.length < 3) continue;
          const hit = tryMatchLoose(idx, piece);
          if (hit) for (const k of hit.kinds) push(hit.name, k, hit.confidence, piece);
        }
      }

      /* 5. 価格が DB に無い種別は、公式ルールの入手手段を候補に足す。
            名前だけでは抽出か購入か決められないので、両方を出して利用者に選んでもらう。 */
      if (!out.some((o) => o.price)) {
        const ownsOne = item.context && item.context.ownsPersona === false ? false : true;
        for (const k of (raw ? raw.kinds : item.kinds) || []) ruleCandidates(k, ownsOne);
      }

      /* 確度順。exact が最初に見えるようにする。 */
      const order = { exact: 0, alias: 1, suffix: 2, "unique-substring": 3, "head-prefix": 4, rule: 5 };
      return out.sort((a, b) => (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9));
    }

  /* 候補の価格は購入由来のときだけ成り立つ。 */
  function priceOf(name, kind, db) {
    const data = db || {};
    if (kind === "ego") {
      const hit = (data.egos || []).find((e) => e.name === name);
      const shards = Number.parseInt(hit && hit.shards, 10) || 0;
      return shards ? { lp: 0, shards } : null;
    }
    if (kind === "spirit") {
      const hit = (data.spirits || []).find((s) => s.name === name);
      const shards = Number.parseInt(hit && hit.price, 10) || 0;
      return shards ? { lp: 0, shards } : null;
    }
    if (kind === "support") {
      const hit = (data.support_passives || []).find((s) => s.name === name);
      const lp = Number.parseInt(hit && hit.lp, 10) || 0;
      return lp ? { lp, shards: 0 } : null;
    }
    if (kind === "deathSupport") {
      const hit = (data.death_passives || []).find((s) => s.name === name);
      const shards = Number.parseInt(hit && hit.shards, 10) || 0;
      return shards ? { lp: 0, shards } : null;
    }
    if (kind === "enhancement") {
      const all = [...(data.normal_enhancements || []), ...(data.special_enhancements || [])];
      const hit = all.find((e) => e.name === name);
      const shards = Number.parseInt(hit && hit.shards, 10) || 0;
      return shards ? { lp: 0, shards } : null;
    }
    /* 人格には価格が定義されていない。算出できないのは欠落ではなく仕様。 */
    return null;
  }

  /* DB が価格を持つ種別だけ自動計算の対象になる。 */
  const PRICEABLE = new Set(["support", "deathSupport", "spirit", "enhancement", "ego"]);

  /* DB が価格を持つのは confirmed。価格は一意な種別ごとに引く。 */
  function kindLabel(kind) {
    const labels = {
      persona: "人格", ego: "E.G.O", support: "サポートパッシブ",
      deathSupport: "死亡後パッシブ", spirit: "精神", enhancement: "強化"
    };
    return labels[kind] || kind || "不明";
  }

  const api = { buildNameIndex, resolveCandidates, resolveText, tryMatch, tryMatchLoose, fold, candidatesFor, kindLabel };
  if (typeof window !== "undefined") {
    window.LBT_buildNameIndex = buildNameIndex;
    window.LBT_resolveCandidates = resolveCandidates;
    window.LBT_resolveText = resolveText;
    window.LBT_rosterResolver = api;
    window.LBT_candidatesFor = candidatesFor;
    window.LBT_kindLabel = kindLabel;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();