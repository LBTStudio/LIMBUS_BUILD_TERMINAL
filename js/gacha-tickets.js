/* ショップ「ガチャ」タブ — 卓配布の抽出権利を3種使い分ける。
   3種（core 3章 P19-20 の有料抽出とは別経路のローカルルール）：
     persona 人格抽出チケット … 人格プールからランダム1つ
     ego     E.G.O抽出チケット … E.G.Oプールからランダム1つ
     choice  選択抽出チケット … 人格かE.G.Oのどちらか（利用者が選択）からランダム1つ
   抽選は gacha.js の commit-reveal RNG を>',
   ローカルサーバのファイル読み込みを前提にしない（window.LBT_gacha を優先）。 */
(function () {
  "use strict";

  const TICKET_KINDS = [
    { id: "persona", label: "人格抽出チケット", pool: "persona", hint: "人格からランダムに1つ" },
    { id: "ego", label: "E.G.O抽出チケット", pool: "ego", hint: "E.G.Oからランダムに1つ" },
    { id: "choice", label: "選択抽出チケット", pool: "choice", hint: "人格かE.G.O、どちらか選んでからランダムに1つ" }
  ];

  /* 抽選プール。所持済みは引かない（core:361/7536 同種複数保有禁止）。 */
  function buildPool(kind, state) {
    const roster = state.roster || {};
    const owned = {
      persona: new Set((roster.personas || []).filter((p) => p.mode !== "t").map((p) => String(p.no))),
      ego: new Set((roster.egos || []).map((e) => `${e.rank}:${e.no}`)),
      tokui: new Set((roster.personas || []).filter((p) => p.mode === "t").map((p) => String(p.no)))
    };
    if (kind === "ego") {
      return (window.DB?.egos || [])
        .filter((e) => !owned.ego.has(`${e.rank}:${e.no}`))
        .map((e) => ({ type: "ego", rank: e.rank, no: e.no, name: e.name }));
    }
    /* persona / choice の人格側。特殊人格は別プール（後に統合）。 */
    const normal = (window.DB?.normal_personas || [])
      .filter((p) => !owned.persona.has(String(p.no)))
      .map((p) => ({ type: "persona", mode: "n", no: p.no, name: p.name }));
    const tokui = (window.DB?.tokui_personas || [])
      .filter((p) => !owned.tokui.has(String(p.no)))
      .map((p) => ({ type: "persona", mode: "t", no: p.no, name: p.name }));
    return normal.concat(tokui);
  }

  function buildEgoPool(state) {
    return buildPool("ego", state);
  }

  /* 抽選。window.LBT_gacha の createSession が持つ commit-reveal RNG を使う。
     セッションは使い切りなので_MODULE-level_に1つ持つ（表の抽選は毎回独立）。 */
  let session = null;
  function ensureSession() {
    const g = window.LBT_gacha;
    if (g && typeof g.createSession === "function") {
      if (!session) session = g.createSession();
      return session;
    }
    return null;
  }

  /* 抽選。session が無い環境（RNG モジュール未読込）は Math.random に退避する。 */
  function roll(pool) {
    if (!pool.length) return null;
    const s = ensureSession();
    if (s && typeof s.nextInt === "function") {
      return s.nextInt(pool.length);
    }
    return Math.floor(Math.random() * pool.length);
  }

  window.LBT_gachaTickets = {
    TICKET_KINDS,
    buildPool,
    buildEgoPool,
    /* state から該当チケットを1枚消費して抽選結果を返す。消費はしない（呼び出し側で dispatch）。 */
    previewRoll: function (kind, poolChoice, state) {
      let pool;
      if (kind === "ego") pool = buildPool("ego", state);
      else if (kind === "persona") pool = buildPool("persona", state);
      else {
        /* choice: 利用者が poolChoice（'persona'|'ego'）を選ぶ */
        pool = poolChoice === "ego" ? buildPool("ego", state) : buildPool("persona", state);
      }
      const idx = roll(pool);
      return { poolSize: pool.length, hit: idx === null ? null : pool[idx] };
    }
  };
})();