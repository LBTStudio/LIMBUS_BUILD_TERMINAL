/* 抽出全般。ショップの「ガチャ」タブが使う単体の機能。
   ルールブック core 3章 P19-20（人格）/ P203（特異人格）/ P242（E.G.O）と
   『特定抽出パック第一弾』P.7-18 が定義する抽出を全部ここに集める。

   抽出の方法（route）
     persona  人格抽出      … 1d(人格の総数) の出目的人格。core:348
                             最大値を引き当てた場合（= 対応する番号が無い）は
                             特異人格抽出へ分岐する（core:6344-6345）。
                             既に持っている場合は再度人格抽出ダイスを振る（core:6346）。
     ego      E.G.O抽出     … 1d(E.G.Oの総数)。core:7533-7534
     pack     特定抽出パック … パックの lp を払って、そのパックの中からだけ引く

   特異人格抽出は単独のルートではなく人格抽出の分岐として扱う。
   ルールブック上も「人格抽出の結果として発生する」もので、
   1d（特異人格の総数）で振った出目に対応する特異人格を入手する（core:6337/6345）。

   支払いは route ごとに2択。所持している通貨か、対応する抽出チケットのどちらか。
   どちらの経路でも「どのリザルトで手に入れたか」は resultId で帰属を持つ。 */
(function () {
  "use strict";

  const ROUTES = [
    { id: "persona", label: "人格抽出", rule: "core:346-349", pool: "persona" },
    { id: "ego", label: "E.G.O抽出", rule: "core:7533-7534 / P242", pool: "ego" },
    { id: "pack", label: "特定抽出パック", rule: "特定抽出パック第一弾 P.7-18", pool: "pack" }
  ];

  const KINDS = ["persona", "ego", "choice", "pack"];

  /* --- プール ---------------------------------------------------------- */
  /* 所持済みは引かない。同種の複数保有は認められない（core:361 / core:7536）。 */
  function ownedSets(state) {
    const roster = state.roster || {};
    return {
      normal: new Set((roster.personas || []).filter((p) => p.mode !== "t").map((p) => String(p.no))),
      special: new Set((roster.personas || []).filter((p) => p.mode === "t").map((p) => String(p.no))),
      ego: new Set((roster.egos || []).map((e) => `${e.rank}:${e.no}`))
    };
  }

  function buildPool(kind, state, opts) {
    const owned = ownedSets(state);
    const db = window.DB || {};
    if (kind === "ego") {
      return (db.egos || [])
        .filter((e) => !owned.ego.has(`${e.rank}:${e.no}`))
        .map((e) => ({ type: "ego", rank: e.rank, no: e.no, name: e.name }));
    }
    if (kind === "special") {
      return (db.tokui_personas || [])
        .filter((p) => !owned.special.has(String(p.no)))
        .map((p) => ({ type: "persona", mode: "t", no: p.no, name: p.name }));
    }
    /* 通常人格の抽出は special を含めない。該当番号が無くた时应移る（core:348）。 */
    return (db.normal_personas || [])
      .filter((p) => !owned.normal.has(String(p.no)))
      .map((p) => ({ type: "persona", mode: "n", no: p.no, name: p.name }));
  }

  /* 特定抽出パックのデータ（P.7-18）。die は「何面体で振るか」。
     index.html が data/gacha-theme-packs.json を fetch して window に置く。 */
  function themePacks() {
    const data = window.LBT_GACHA_PACKS || null;
    if (data && Array.isArray(data.packs)) return data.packs;
    return [];
  }
  function findPack(name) {
    return themePacks().find((p) => p.name === name) || null;
  }
  function buildPackPool(packName, state) {
    const pack = findPack(packName);
    if (!pack || !Array.isArray(pack.entries)) return [];
    return pack.entries.map((entry) => ({ type: "themePack", pack: pack.name, no: entry.no, name: entry.name, book: entry.book, page: entry.page }));
  }

  /* --- セッション --------------------------------------------------------
     gacha.js の commit-reveal セッションを使う。セッションの公开メソッドは
     nextInt ではなく roll(max) で、返りは 1..max（1-indexed）。
     nextInt を呼ぶと常に undefined になり Math.random に落ちてしまう。

     出目の読み方は engine だけが持つ。ここでは種からセッションを
     作る責務だけが残る（確認画面用に同じ種を再現する用途）。 */
  function seededSession(seed) {
    const g = window.LBT_gacha;
    if (g && typeof g.createSession === "function") {
      return g.createSession({ serverSeed: String(seed), clientSeed: String(seed) });
    }
    return null;
  }

  /* --- 支払い ---------------------------------------------------------- */
  /* 有料の経路。core の規則から引く。 */
  function paidCost(kind, state, packName) {
    const ownsOne = ((state.roster || {}).personas || []).length > 0;
    const resolve = window.LBT_resolveAcquireCost;
    if (kind === "persona") {
      const c = resolve ? resolve("persona", "gacha", { ownsPersona: ownsOne }) : { lp: ownsOne ? 100 : 0, shards: 0, label: "" };
      return { lp: c.lp || 0, shards: c.shards || 0, label: c.label, source: c.source };
    }
    if (kind === "ego") {
      /* E.G.O抽出は自我の欠片100個（core:7533）。所持状態に依存しない。 */
      return { lp: 0, shards: 100, label: "欠片 100", source: "core:7533" };
    }
    if (kind === "pack") {
      const pack = findPack(packName);
      const lp = Number(pack?.lp) || 0;
      return { lp, shards: 0, label: lp ? `LP ${lp}` : "無料", source: "特定抽出パック第一弾 P.7-18" };
    }
    return { lp: 0, shards: 0, label: "無料", source: "" };
  }

  /* チケット1枚の残数。state.tickets は分類付き在庫（配列）。 */
  /* 残数は収支から求める（リザルトの収入 − 明細の消費）。
     旧来の state.tickets 行配列は移行済みで、ここには残らない。 */
  function ticketCount(state, kind, pack) {
    if (window.LBT_computeTicketBalance) {
      const balance = window.LBT_computeTicketBalance(state.results || [], state.entries || []);
      return kind === "pack" ? (Number(balance.pack?.[pack]) || 0) : (Number(balance[kind]) || 0);
    }
    if (window.LBT_ticketCount) return window.LBT_ticketCount(state, kind, pack || null);
    return 0;
  }

  /* ルートに対応するチケット種別。persona/special は人格、E.G.O は ego。 */
  function ticketKindFor(route) {
    if (route === "ego") return "ego";
    if (route === "pack") return "pack";
    return "persona";
  }


  /* --- エンジン接続 ------------------------------------------------------
     gacha.js が原典のルール表とプールを持ち、1回ごとの逐次計算ができる。
     自前の draw() は「1件だけ出す」だけで、残額の管理と原典の
     1d(未所持+1) がない。ここでは同じ式を二重に書かずに済むよう、
     通貨で払う経路は engine.drawBatch に預ける（錨と検証もそこから出土る）。 */
  let engine = null;
  function gachaEngine() {
    const api = window.LBT_gacha;
    if (!api || typeof api.createGacha !== "function") return null;
    if (engine) return engine;
    engine = api.createGacha({ db: window.DB || {}, themePacks: { packs: themePacks() } });
    return engine;
  }

  /* engine の結果（{kind,item,cost,duplicate,grantedShards}）を、
     画面の hit（{type,no,name,mode,rank,pack}）へ揃える。 */
  function hitOf(result) {
    const item = result.item || {};
    if (result.kind === "ego" || item.kind === "ego") {
      return { type: "ego", no: item.no, rank: item.rank, name: item.name };
    }
    if (result.kind === "themePack" || item.kind === "themePack") {
      return { type: "themePack", pack: result.pack, no: item.no, name: item.name };
    }
    /* specialPersona は特異人格。画面の hit では mode:"t" で表す。 */
    return { type: "persona", mode: result.kind === "specialPersona" ? "t" : "n", no: item.no, name: item.name };
  }

  /* 批量抽出。原典の1d と逐次計算は engine が一つだけ持つ。
     通貨なら残額が回数を決め、チケットなら残枚が回数を決める
     （engine には method:"ticket" を渡して請求だけ0にする）。
     どちらの経路でも engineOut が封緘の材料になり、
     記録は経路によらず同じ1本の鎖に並ぶ。 */
  function engineBatchN(route, state, options) {
    const g = gachaEngine();
    const want = options.want;
    const balance = window.LBT_computeLedgerBalance
      ? window.LBT_computeLedgerBalance(state.results || [], state.entries || {}) || {}
      : {};
    const owned = {
      personas: (state.roster?.personas || []).filter((p) => p.mode !== "t").map((p) => p.no),
      specialPersonas: (state.roster?.personas || []).filter((p) => p.mode === "t").map((p) => p.no),
      egos: (state.roster?.egos || []).map((e) => e.no)
    };
    const method = options.method === "ticket" ? "ticket" : "draw";
    const input = {
      session: options.session,
      method,
      owned,
      count: options.capped == null ? want : Math.min(want, options.capped),
      /* チケットは通貨を使わないので、残高を見wakeない。 */
      lp: method === "ticket" ? Number.POSITIVE_INFINITY : (Number(balance.lp) || 0),
      shards: method === "ticket" ? Number.POSITIVE_INFINITY : (Number(balance.shards) || 0),
      /* テーマパックの重複判定は、現在既に持っている名前で渡す。 */
      heldNames: Array.from(
        new Set([...(state.roster?.personas || []).map((p) => p.name), ...(state.roster?.egos || []).map((e) => e.name)].filter(Boolean))
      )
    };
    if (route === "persona") return g.drawBatch({ ...input, kind: "persona" });
    if (route === "ego") return g.drawBatch({ ...input, kind: "ego" });
    return g.drawBatch({ ...input, kind: "themePack", pack: options.pack || null });
  }

  /* 複数回まとめて引く。同じ候補は2度選ばない（同種複数保有は不可：
     core:361 / core:7536）。チケットのときは残枚を超える回数 引かない
     （超えた分は消費しない）。

     seed を渡すと、その種から新しいセッションを作って 1 回だけ引く。
     確認ダイアログで開く前に呼べば、ダイアログを操作している間に
     データが変わっても出目は変わらない。 */
  function drawN(route, state, opts) {
    const options = opts || {};
    const want = Math.max(1, Number.parseInt(options.times, 10) || 1);
    const pay = options.pay === "ticket" ? "ticket" : "paid";
    const ticketKind = ticketKindFor(route);
    const ticketPack = route === "pack" ? (options.pack || null) : null;
    const held = pay === "ticket" ? ticketCount(state, ticketKind, ticketPack) : 0;
    if (pay === "ticket" && held <= 0) return { hits: [], reason: "no-ticket", remaining: held };

    const fixed = options.seed != null ? seededSession(options.seed) : (options.session || null);
    const commit = fixed && typeof fixed.commit === "function" ? fixed.commit() : null;

    const g = gachaEngine();
    if (!g) return { hits: [], reason: "empty", paidBy: pay, ticketKind, ticketPack, remaining: held, commit };

    const out = engineBatchN(route, state, { want, session: fixed, pack: options.pack, method: pay, capped: pay === "ticket" ? held : null });
    const hits = (out.results || []).map((r) => ({ ...hitOf(r), branch: r.kind === "specialPersona" ? "special" : null }));
    /* チケットの枚数が余ったら、engine は「全部引けた」と返す。
       利用者に「残り何枚」と伝わるよう、ここで区別する。 */
    const short = pay === "ticket" && hits.length < want;
    return {
      hits,
      engineOut: out,
      session: fixed,
      kind: out.kind,
      reason: hits.length ? null : "empty",
      paidBy: pay,
      ticketKind,
      ticketPack,
      cost: { ...(out.totalCost || { lp: 0, shards: 0 }), label: formatBatchCost(out.totalCost) },
      drawn: out.drawn,
      requested: want,
      stopped: short ? "insufficientTickets" : out.stopped,
      remaining: pay === "ticket" ? Math.max(0, held - hits.length) : held,
      commit
    };
  }

  /* engine が請求した合計を画面と同じ書式にする。 */
  function formatBatchCost(total) {
    const lp = Number(total?.lp) || 0;
    const shards = Number(total?.shards) || 0;
    const parts = [];
    if (lp > 0) parts.push(`LP ${lp}`);
    if (shards > 0) parts.push(`欠片 ${shards}`);
    return parts.join(" / ") || "無料";
  }

  /* ルール表とプールの指紋。記録の錨に載せる。engine をまだ建てていなければ
     ここで一度だけ立てる。 */
  function rulesetHash() {
    const g = gachaEngine();
    return g ? g.rulesetHash : null;
  }

  /* 1件分の結果を封緘して、抽出リストへ積める形にする。外部錨（ビーコン）は
     呼び手が取って渡す。署名は封緘の後に載せる（署名対象に錨を含めるため、
     錨は必ずここで入れる）。 */
  function sealBatch(out, options) {
    const g = gachaEngine();
    if (!g || !out || !out.engineOut) return null;
    return g.finalizeBatch(out.engineOut, out.session, {
      ruleset: out.paidBy === "ticket" ? "core-ticket" : "core",
      rulesetHash: g.rulesetHash,
      beacon: (options && options.beacon) || null
    });
  }

  /* 読み手側の検証。.engine が無くても、記録は数字だけなので検証できる。 */
  function verifyBatch(batch) {
    const api = window.LBT_gacha;
    if (!api || typeof api.verifyBatch !== "function") return { ok: false, reasons: ["検証器が読み込まれていません"] };
    return api.verifyBatch(batch);
  }

  window.LBT_gachaDraw = {
    ROUTES, KINDS,
    buildPool, buildPackPool, themePacks, findPack,
    paidCost, ticketCount, ticketKindFor, drawN,
    seededSession, rulesetHash, sealBatch, verifyBatch
  };
})();
