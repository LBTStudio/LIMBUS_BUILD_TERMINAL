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
  /* 種から毎回新しいセッションを作る。既存の singleton を触らないので、
     別の抽選の結果に混ざらない。確認時に一度だけ作って出目を固定する用途。 */
  function seededSession(seed) {
    const g = window.LBT_gacha;
    if (g && typeof g.createSession === "function") {
      return g.createSession({ serverSeed: String(seed), clientSeed: String(seed) });
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
    /* 呼び出し側がセッションを固定していたら 그것 を使う。 */
    const sess = options.session || ensureSession();
    const rollFrom = (pool) => {
      if (!pool || !pool.length) return null;
      if (sess && typeof sess.roll === "function") return pool[sess.roll(pool.length) - 1] || null;
      return pool[rollOne(pool.length) - 1] || null;
    };
    let hit;
    let branch = null;
    if (route === "pack") {
      const pool = buildPackPool(packName, state);
      if (!pool.length) return { hit: null, reason: "empty" };
      hit = rollFrom(pool);
    } else if (route === "persona") {
      /* 人格抽出は特異人格への分岐を持つ。 */
      const out = drawPersonaWithBranch(state, sess);
      hit = out.hit;
      branch = out.branch;
    } else {
      const pool = buildPool(route, state, options);
      if (!pool.length) return { hit: null, reason: "empty" };
      hit = rollFrom(pool);
    }
    if (!hit) return { hit: null, reason: "empty" };
    const cost = pay === "ticket" ? { lp: 0, shards: 0, label: "無料" } : paidCost(route, state, packName);
    return { hit, cost, paidBy: pay, ticketKind, ticketPack, branch, remaining: pay === "ticket" ? held - 1 : held };
  }

  /* 複数回まとめて引く。1回の draw を繰り返すが、プールから既に取ったものは
     次の抽選で除外する（同種複数保有は不可：core:361 / core:7536）。
     チケットOUT のときは残数を超える回数を引かない（超出した分は消費しない）。

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

    /* ループごとに「既に取ったもの」を除いたプールを作り直す。 */
    const taken = new Set();
    const simulated = {
      roster: {
        ...(state.roster || {}),
        personas: [...((state.roster || {}).personas || [])],
        egos: [...((state.roster || {}).egos || [])]
      }
    };
    const hits = [];
    for (let i = 0; i < want; i++) {
      if (pay === "ticket" && held - hits.length <= 0) break;
      const step = draw(route, { ...simulated, ...state }, { ...options, pay: "paid", session: fixed });
      if (!step.hit) break;
      const key = step.hit.type === "ego"
        ? `e:${step.hit.rank}:${step.hit.no}`
        : step.hit.type === "themePack"
          ? `p:${step.hit.pack}:${step.hit.no}`
          : `a:${step.hit.mode}:${step.hit.no}`;
      if (taken.has(key)) break;
      taken.add(key);
      hits.push({ ...step.hit, branch: step.branch });
      /* 次の回から引かれないよう、模擬の roster へ積む。 */
      if (step.hit.type === "ego") {
        simulated.roster.egos.push({ uid: `sim-${key}`, no: step.hit.no, rank: step.hit.rank });
      } else if (step.hit.type === "persona") {
        simulated.roster.personas.push({ uid: `sim-${key}`, no: step.hit.no, mode: step.hit.mode });
      }
    }
    return {
      hits,
      reason: hits.length ? null : "empty",
      paidBy: pay,
      ticketKind,
      ticketPack,
      cost: pay === "ticket" ? { lp: 0, shards: 0, label: "無料" } : paidCost(route, state, options.pack),
      remaining: pay === "ticket" ? Math.max(0, held - hits.length) : held,
      /* 種から出目を固定したときだけ入る。検証用。 */
      commit
    };
  }

  window.LBT_gachaDraw = {
    ROUTES, KINDS,
    buildPool, buildPackPool, themePacks, findPack,
    paidCost, ticketCount, ticketKindFor, draw, drawPersonaWithBranch, drawN,
    seededSession
  };
})();