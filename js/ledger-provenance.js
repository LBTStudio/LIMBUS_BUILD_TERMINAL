/* 所持項目が「なぜ手に入ったか」を表す。

   名前だけでは由来が決められない。同一の E.G.O でも、
     - シナリオ報酬の配布            → 支出ではない
     - チケットでの抽出（ExecutionRule スの無料ガチャ） → 支出ではない
     - ランダムガチャ                 → 支出（欠片）
     - 指定購入                      → 支出
   と、帳簿上の意味がまったく異なる。だから推定は推定として通し、
   利用者が項目ごとに「計算に含めるか」を選べるようにする。 */

(function () {
  const PROVENANCE = [
    { id: "grant", label: "配布・シナリオ報酬", priced: false },
    { id: "gachaTicket", label: "抽出（チケット）", priced: false },
    { id: "gachaPaid", label: "抽出（ランダムガチャ）", priced: true },
    { id: "purchase", label: "指定購入", priced: true }
  ];
  const byId = new Map(PROVENANCE.map((p) => [p.id, p]));

  /* 根拠となる語。見つけたものを「推定の理由」として返す。 */
  const CUES = [
    { id: "gachaTicket", re: /(?:抽出|ガチャ|チケ|チケット)/, weight: 2 },
    { id: "gachaPaid", re: /(?:ガチャ|抽出)/, weight: 1 },
    { id: "purchase", re: /(?:購入|指名|指定|選定)/, weight: 2 },
    { id: "grant", re: /(?:配布|報酬|付与|供与|スキル|獲得)/, weight: 1 }
  ];

  /* 1行から由来を推定する。断定はしない。 */
  function inferProvenance(line, context) {
    const text = String(line || "");
    const scores = new Map();
    for (const cue of CUES) {
      if (cue.re.test(text)) scores.set(cue.id, (scores.get(cue.id) || 0) + cue.weight);
    }
    if (context && context.provenance) {
      scores.set(context.provenance, (scores.get(context.provenance) || 0) + 1);
    }
    let best = null;
    let runnerUp = 0;
    for (const [id, score] of scores) {
      if (!best || score > best.score) { runnerUp = best ? best.score : 0; best = { id, score }; }
      else if (score > runnerUp) runnerUp = score;
    }
    if (!best) return { id: "unknown", confidence: "none", priced: false, label: "", reason: "由来を示す語が無い" };
    const confidence = best.score - runnerUp >= 2 ? "strong" : best.score - runnerUp === 1 ? "weak" : "ambiguous";
    const label = byId.get(best.id);
    return {
      id: best.id,
      confidence,
      label: label ? label.label : "",
      priced: label ? label.priced : false,
      reason: "「" + text.trim().slice(0, 40) + "」から推定"
    };
  }

  /* DB が価格を持つ種別だけ自動計算の対象になる。 */
  const PRICEABLE = new Set(["support", "deathSupport", "spirit", "enhancement", "ego", "persona"]);

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

  /* manifest の各項目に「由来」と「計算に含めるか」を足す。
     既定は自動: 価格が引けて、かつ支出に相当する由来なら含める。 */
  function annotateManifest(manifest, options) {
    const opts = options || {};
    const db = opts.db;
    const context = opts.context || {};
    const groups = (manifest.groups || []).map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const kind = item.kinds.find((k) => PRICEABLE.has(k.kind));
        const kindId = kind ? kind.kind : (item.kinds[0] ? item.kinds[0].kind : "");
        const priceFromDb = kind ? priceOf(item.dbName || item.name, kindId, db) : null;
        const provenance = inferProvenance(item.sourceLine || item.name, context);
        /* DB に価格がある種別はそれを、無ければ公式ルール（抽出/購入）を使う。 */
        const fromDb = priceFromDb;
        const fromRules = acquireCost(kindId, provenance.id, context);
        const price = fromDb || (fromRules && (fromRules.lp || fromRules.shards) ? fromRules : null);
        const auto = Boolean(price && provenance.priced && provenance.id !== "unknown");
        return {
          ...item,
          priceKind: kindId,
          price,
          provenance,
          /* クリックで切り替えられる。初期値は自動判定。 */
          include: opts.force ? Boolean(opts.force) : auto,
          includeIsAuto: auto,
          /* 価格が無く由来も不明なら、利用者に判断を仰が必須。
           人格のように価格が定義されていない種別は、由来が何であれ
           金額が算出できないので必ず判断が要る。 */
          needsDecision: !item.resolved ? "unknown-name" : (!price ? "no-price" : null)
        };
      })
    }));
    return { ...manifest, groups };
  }

  /* core 3章「3. 人格を入手する」P19-20 の価格。
     入手方法は2種類だけ（core:336「人格を入手する方法は2種類あります。『抽出』と『購入』です」）。
       人格抽出: 未所持なら無料 / 1つでも所持なら 100LP（core:338/348）
       人格購入: 未所持なら 20LP  / 1つでも所持なら 200LP（core:355/359）
     制約: 同種人格の複数保有は不可（core:361）/ 既持人格の購入は不可（core:359）。
     注意: 「キャラ作成時に30LPが支給」（core:344）は初期資金であって人格の価格ではない。
     PCは始めから人格を持っておらず（core:335「必ず1つ以上の人格を保有」になるまで）、
     最初の1個は「未所持」の値段 無料/20LP で扱う。支給額の価格はここに入れない。

     E.G.O は core P242「E.G.Oを入手する方法には、以下の二つが存在します」。
       E.G.O抽出: 自我の欠片100個（所持状態に依存しない）
       E.G.O購入: 各E.G.Oの番号横に記載の欠片数（core:7536、DB の shards を読む）
     既に持っているE.G.Oの購入は不可（core:7536）。

      gachaTicket（卓で配られる無料の抽出チケット）はローカルルール。
      ルールブックに記述はないが卓では配られ普通に消費されるので、
      有料の抽出とは別の経路として扱う。 */
  const CORE_RULES = {
    personaGacha: { lp: 100, shards: 0, source: "core:338/348 人格抽出（所持時）" },
    personaPurchase: { lp: 200, shards: 0, source: "core:355/359 人格購入（所持時）" },
    personaPurchaseFirst: { lp: 20, shards: 0, source: "core:359 人格購入（未所持時）" },
    personaGachaFirst: { lp: 0, shards: 0, source: "core:338 人格抽出（未所持時）" },
    /* 卓で配られる無料の抽出チケット。所持状態に依存せず常に0。 */
    personaGachaTicket: { lp: 0, shards: 0, source: "local:卓配布の無料人格抽出チケット" },
    egoGacha: { lp: 0, shards: 100, source: "core:7533 E.G.O抽出" },
    egoGachaTicket: { lp: 0, shards: 0, source: "local:卓配布の無料E.G.O抽出チケット" }
  };

  /* 所持状況が価格を変える。人格は「既に1つでも持っていれば」 wikipedia FEEが跳ね上がる。
     入手方法は抽出/購入の2種類のみ（core:336）。所持0個=未所持は最初の状態。 */
  function acquireCost(kind, provenance, context) {
    const ctx = context || {};
    const ownsOne = ctx.ownsPersona === undefined ? true : Boolean(ctx.ownsPersona);
    if (kind === "persona") {
      /* 配布権利は有料の抽出とは別枠。所持状態でを引き上げる。 */
      if (provenance === "gachaTicket") return { ...CORE_RULES.personaGachaTicket };
      if (provenance === "gachaPaid") {
        return ownsOne ? { ...CORE_RULES.personaGacha } : { ...CORE_RULES.personaGachaFirst };
      }
      if (provenance === "purchase") {
        return ownsOne ? { ...CORE_RULES.personaPurchase } : { ...CORE_RULES.personaPurchaseFirst };
      }
      return { lp: 0, shards: 0, source: "配布" };
    }
    if (kind === "ego") {
      if (provenance === "gachaTicket") return { ...CORE_RULES.egoGachaTicket };
      if (provenance === "gachaPaid") return { ...CORE_RULES.egoGacha };
      /* 購入は各E.G.Oの番号横の欠片数（core:7536）。番号が不明なときは算出しない。 */
      if (provenance === "purchase") {
        const hit = (ctx.db?.egos || window.DB?.egos || []).find((e) =>
          String(e.no) === String(ctx.no) && (!ctx.rank || e.rank === ctx.rank));
        if (!hit) return null;
        const matched = String(hit.shards ?? "").match(/\d+/);
        const shards = matched ? Number.parseInt(matched[0], 10) || 0 : 0;
        return { lp: 0, shards, source: `core:7536 E.G.O購入（${hit.rank} No.${hit.no}）` };
      }
      return null;
    }
    return null;
  }

  /* 価格上限は種別ごとに SOURCE。 */
  const SOURCE = { persona: "core:594-621", ego: "core:9499-9512" };

  /* --- 同期・解析のコスト -------------------------------------------------
     supplement P7「同期化・解析とは、入手した人格・E.G.Oに『PCらしさ』を
     自我の欠片を50個支払うことで…」／ P7「ZAYIN：20欠片 TETH：40欠片
     HE：60欠片 WAW：80欠片 ALEPH：100欠片」
     supplement P23「同期化・解析を行った時と同じ個数だけ、自我の欠片を支払う」
     → MAX は同期化/解析と同額。所持のTEXTUAL価格とは無関係な固定額。 */
  const EGO_ANALYZE_SHARDS = { ZAYIN: 20, TETH: 40, HE: 60, WAW: 80, ALEPH: 100 };
  const OPERATION_COST = {
    sync: { kind: "sync", label: "同期", shards: 50, source: "supplement P7 同期化（自我の欠片50個）" },
    analyze: { kind: "analyze", label: "解析", shardsByRank: EGO_ANALYZE_SHARDS, source: "supplement P7 解析（危険度ランク別の欠片）" },
    syncMax: { kind: "syncMax", label: "同期MAX", shards: 50, source: "supplement P23 同期化と同じ個数（自我の欠片50個）" },
    analyzeMax: { kind: "analyzeMax", label: "解析MAX", shardsByRank: EGO_ANALYZE_SHARDS, source: "supplement P23 解析と同じ個数（危険度ランク別）" }
  };

  const OPERATION_CUES = /(同期(?:化|MAX)?|解析(?:化|MAX)?|浄化|特異化)/;

  function isOperation(line) {
    return OPERATION_CUES.test(String(line || ""));
  }

  /* 操作の金額はルールが定めた固定額。所持した時の価格とは無関係。
     target は E.G.O のとき rank を取り出すためだけ使う。 */
  function operationCost(operationId, target, db) {
    const op = OPERATION_COST[operationId];
    if (!op) return null;
    if (op.shardsByRank) {
      /* 解析/解析MAX は危険度ランクで額が変わる。 */
      const rank = target?.rank || (Array.isArray(db?.egos)
        ? (db.egos.find((e) => String(e.no) === String(target?.no) && (!target?.rank || e.rank === target.rank)) || {}).rank
        : null);
      const shards = rank ? op.shardsByRank[rank] : null;
      if (shards === undefined || shards === null) return null;
      return { lp: 0, shards, source: op.source, operation: op.kind, label: `${op.label}（${rank}）` };
    }
    if (!op.shards) return null;
    return { lp: 0, shards: op.shards, source: op.source, operation: op.kind, label: op.label };
  }

  /* 操作行から対象名を引く。

     同期化／解析の対象は「操作語の直後に括弧書きされた名前」か
     「操作語の前に出た名前」（「鬼門同期」「第四銀同期」）のどちらか。
     どちらにも無ければ対象は不明のままにする（推測しない）。

     CT1ここから／CT解除 のような進行の書き方は対象.Operationの指示ではなく
     費用も発生しないので、対象を求めず null を返す。 */
  const OPERATION_CUE = /同期(?:化|MAX)?|解析(?:化|MAX)?|浄化|特異化/;
  function extractOperationTarget(line) {
    const text = String(line || "");
    if (!OPERATION_CUE.test(text)) return null;
    /* CT の進行は費用も発生しない。対象も決めない。 */
    if (/CT\s*\d|CT解除|ここから/.test(text)) return null;
    const cueAt = text.search(OPERATION_CUE);
    /* 操作語より後ろに括弧書きがあるときだけ対象（CT行の括弧は
       「アイテム「硝子の破片」」のように物資名で、対象ではない）。 */
    const quoted = /[「『]([^」』]+)[」』]/.exec(text);
    if (quoted && quoted.index > cueAt) return quoted[1].replace(/^[θ×※*・\s]+/, "");
    /* 「鬼門同期」「第四銀同期」のように操作語の前に名前が来る書き方。 */
    const before = /([^。「」『』、。\s]{2,20}?)(?:同期|解析|浄化|特異化)\s*(?:化|MAX)?(?:依頼)?/.exec(text.slice(0, cueAt + 2));
    if (before) return before[1].replace(/^[θ×※*・\s]+/, "");
    return null;
  }

  /* 操作は、所持にはないため、金額は独立で物を計算できない。 */
  function annotateOperations(lines, db) {
    const out = [];
    for (const raw of lines || []) {
      const line = String(raw || "");
      if (!isOperation(line)) continue;
      const target = extractOperationTarget(line);
      out.push({
        line,
        operation: (line.match(/解析(?:化|MAX)?/) || [])[0] ? "analyze" : "sync",
        /* CT の進行は対象を持たない。それ以外は名前が出れば，引けるようにする。 */
        target,
        hasTarget: Boolean(target)
      });
    }
    return out;
  }

  const api = {
    PROVENANCE, inferProvenance, priceOf, acquireCost, annotateManifest,
    PRICEABLE, CORE_RULES, OPERATION_COST, operationCost, annotateOperations, isOperation
  };
  if (typeof window !== "undefined") {
    window.LBT_provenance = api;
    window.LBT_inferProvenance = inferProvenance;
    window.LBT_acquireCost = acquireCost;
    window.LBT_annotateManifest = annotateManifest;
    window.LBT_operationCost = operationCost;
    window.LBT_annotateOperations = annotateOperations;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();