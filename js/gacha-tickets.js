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

  /* --- 抽選 ------------------------------------------------------------ */
  /* gacha.js の commit-reveal セッションを使う。セッションの公开メソッドは
     nextInt ではなく roll(max) で、返りは 1..max（1-indexed）。
     nextInt を呼ぶと常に undefined になり Math.random に落ちてしまう。 */
  let session = null;
  function ensureSession() {
    const g = window.LBT_gacha;
    if (g && typeof g.createSession === "function") {
      if (!session) session = g.createSession({ serverSeed: String(Date.now()), clientSeed: String(Math.random()) });
      return session;
    }
    return null;
  }
  /* 1..max の出目を取る。 */
  function rollOne(max) {
    if (max < 1) return 0;
    const s = ensureSession();
    if (s && typeof s.roll === "function") return s.roll(max);
    return Math.floor(Math.random() * max) + 1;
  }
  function roll(pool) {
    if (!pool || !pool.length) return null;
    return pool[rollOne(pool.length) - 1] || null;
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

  /* 人格抽出は 1d(通常人格の総数) を振る。その出目に対応する番号が
     無い（= 最大値を引き当てた）とき 特異人格抽出 に分岐する（core:6344-6345）。
     既に持っている場合は再度人格抽出ダイスを振る（core:6346）。
     ファントは分岐しなかった場合の通し番号、分岐時は特異人格の番号。 */
  function drawPersonaWithBranch(state, session) {
    const normalTotal = (window.DB?.normal_personas || []).length;
    const normalPool = buildPool("persona", state);
    /* 1d(人格の総数) の出目。 */
    const maxDie = rollOne(normalTotal);
    /* 最大値 = 対応する人格番号が存在しない → 特異人格抽出へ。 */
    if (maxDie >= normalTotal) {
      const specialPool = buildPool("special", state);
      if (!specialPool.length) return { hit: null, reason: "empty" };
      /* 特異人格抽出は 1d（特異人格の総数）ではなく、所持していない特異人格から引く。 */
      const special = specialPool[rollOne(specialPool.length) - 1];
      return { hit: special, branch: "special", dieMax: maxDie, normalTotal };
    }
    const hit = normalPool[maxDie - 1];
    if (!hit) return { hit: null, reason: "empty" };
    return { hit, branch: null, die: maxDie, normalTotal };
  }

  /* 抽選を実行。pay は 'paid' | 'ticket'。
     ticket のときは kind と pack を指定して在庫を1つ減らす。
     返り値は {hit, cost, paidBy, remaining, branch}。 */
  function draw(route, state, opts) {
    const options = opts || {};
    const pay = options.pay === "ticket" ? "ticket" : "paid";
    const packName = options.pack || null;
    const ticketKind = ticketKindFor(route);
    const ticketPack = route === "pack" ? packName : null;
    const held = pay === "ticket" ? ticketCount(state, ticketKind, ticketPack) : 0;
    if (pay === "ticket" && held <= 0) return { hit: null, reason: "no-ticket" };
    let hit;
    let branch = null;
    if (route === "pack") {
      const pool = buildPackPool(packName, state);
      if (!pool.length) return { hit: null, reason: "empty" };
      hit = roll(pool);
    } else if (route === "persona") {
      /* 人格抽出は特異人格への分岐を持つ。 */
      const out = drawPersonaWithBranch(state, ensureSession());
      hit = out.hit;
      branch = out.branch;
    } else {
      const pool = buildPool(route, state, options);
      if (!pool.length) return { hit: null, reason: "empty" };
      hit = roll(pool);
    }
    if (!hit) return { hit: null, reason: "empty" };
    const cost = pay === "ticket" ? { lp: 0, shards: 0, label: "無料" } : paidCost(route, state, packName);
    return { hit, cost, paidBy: pay, ticketKind, ticketPack, branch, remaining: pay === "ticket" ? held - 1 : held };
  }

  window.LBT_gachaDraw = {
    ROUTES, KINDS,
    buildPool, buildPackPool, themePacks, findPack,
    paidCost, ticketCount, ticketKindFor, draw, drawPersonaWithBranch
  };
})();