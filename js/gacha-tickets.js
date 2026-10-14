/* 抽出全般。ショップの「ガチャ」タブが使う単体の機能。
   ルールブック core 3章 P19-20（人格）/ P203（特異人格）/ P242（E.G.O）と
   『特定抽出パック第一弾』P.7-18 が定義する抽出を全部ここに集める。

   抽出の方法（route）
     persona  人格抽出      … 1d(人格の総数) の出目的人格。core:348
     special  特異人格抽出  … 該当番号が無くれば特異人格抽出が発生する（core:348）。
                             人格を1つでも持っていたら、望む人格に相当する出目を+1できる
                             （core:6343-6346）
     ego      E.G.O抽出     … 1d(E.G.Oの総数)。core:7533-7534
     pack     特定抽出パック … パックの lp を払って、そのパックの中からだけ引く

   支払いは route ごとに2択。所持している通貨か、対応する抽出チケットのどちらか。
   どちらの経路でも「どのリザルトで手に入れたか」は resultId で帰属を持つ。 */
(function () {
  "use strict";

  const ROUTES = [
    { id: "persona", label: "人格抽出", rule: "core:346-349", pool: "persona" },
    { id: "special", label: "特異人格抽出", rule: "core:6336-6338 / P203", pool: "special" },
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
  /* gacha.js の commit-reveal RNG を使う。無ければ Math.random に退避する。 */
  let session = null;
  function ensureSession() {
    const g = window.LBT_gacha;
    if (g && typeof g.createSession === "function") {
      if (!session) session = g.createSession();
      return session;
    }
    return null;
  }
  function roll(pool) {
    if (!pool || !pool.length) return null;
    const s = ensureSession();
    const idx = s && typeof s.nextInt === "function" ? s.nextInt(pool.length) : Math.floor(Math.random() * pool.length);
    return pool[idx] || null;
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
    if (kind === "special" || kind === "ego") {
      /* 特異人格抽出も E.G.O抽出も抽出費用。E.G.O は自我の欠片100個（core:7533）。 */
      const g = window.LBT_gacha;
      if (g && g.RULES) return { lp: 0, shards: g.RULES.egoGacha?.shards ?? 100, label: "欠片 100", source: "core:7533" };
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
  function ticketCount(state, kind, pack) {
    if (window.LBT_ticketCount) return window.LBT_ticketCount(state.tickets, kind, pack || null);
    return (Array.isArray(state.tickets) ? state.tickets : [])
      .filter((t) => t.kind === kind && (t.pack || null) === (pack || null))
      .reduce((s, t) => s + (Number(t.count) || 0), 0);
  }

  /* ルートに対応するチケット種別。persona/special は人格、E.G.O は ego。 */
  function ticketKindFor(route) {
    if (route === "ego") return "ego";
    if (route === "pack") return "pack";
    return "persona";
  }

  /* 抽選を実行。pay は 'paid' | 'ticket'。
     ticket のときは kind と pack を指定して在庫を1つ減らす。
     返り値は {hit, cost, paidBy, remaining}。 */
  function draw(route, state, opts) {
    const options = opts || {};
    const pay = options.pay === "ticket" ? "ticket" : "paid";
    const packName = options.pack || null;
    const ticketKind = ticketKindFor(route);
    const ticketPack = route === "pack" ? packName : null;
    const pool = route === "pack" ? buildPackPool(packName, state) : buildPool(route, state, options);
    if (!pool.length) return { hit: null, reason: "empty" };
    const held = pay === "ticket" ? ticketCount(state, ticketKind, ticketPack) : 0;
    if (pay === "ticket" && held <= 0) return { hit: null, reason: "no-ticket" };
    const hit = roll(pool);
    if (!hit) return { hit: null, reason: "empty" };
    const cost = pay === "ticket" ? { lp: 0, shards: 0, label: "無料" } : paidCost(route, state, packName);
    return { hit, cost, paidBy: pay, ticketKind, ticketPack, remaining: pay === "ticket" ? held - 1 : held };
  }

  window.LBT_gachaDraw = {
    ROUTES, KINDS,
    buildPool, buildPackPool, themePacks, findPack,
    paidCost, ticketCount, ticketKindFor, draw
  };
})();