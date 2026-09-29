/* LIMBUS BUILD TERMINAL — core.js
   index.html と share.html の両方が最初に読み込む共通ユーティリティ。
   これまで state.js / share-link.js / generator.js / OtherSections.js に
   分散していた重複実装を一本化し、ページ間の動作乖離を防ぐ。 */

(function () {
  "use strict";

  /* ---- 深クローン ---- */
  function cloneJSON(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  /* ---- ステータスラベル正規化 ----
     過去データの「クイック0」「バリア0」はラベルと初期値の混在なので修復する。 */
  function normalizeStatusLabel(label) {
    const value = String(label ?? "").trim();
    return value.replace(/^(クイック|バリア)0+$/u, "$1");
  }

  /* ---- 基本ルールPDFのバフ（303頁）→デバフ（306〜307頁）→中立バフ（310頁）の掲載順 ----
     人格候補・E.G.O検索・出力で共通して使い、PDF外の弾丸は標準一覧の最後に置く。 */
  const PDF_KEYWORD_ORDER = [
    "パワー", "忍耐", "クイック", "保護", "充電", "呼吸", "ダメージ量増加",
    "虚弱", "武装解除", "束縛", "脆弱", "火傷", "沈潜", "出血", "恐慌", "破裂", "振動", "ダメージ量減少", "毒", "麻痺",
    "バリア", "弾丸"
  ];

  /* ---- 同期ランク正規化 ---- */
  function normalizeSyncRank(raw) {
    const v = String(raw || "");
    return ["0", "00", "000"].includes(v) ? v : null;
  }

  /* ---- 全角→半角変換 ---- */
  function toHalfWidth(value, opts) {
    let s = String(value ?? "");
    s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    if (opts && opts.digitsOnly) return s;
    s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    s = s.replace(/：/g, ":").replace(/＋/g, "+").replace(/－|ー/g, "-");
    s = s.replace(/（/g, "(").replace(/）/g, ")").replace(/　/g, " ");
    return s;
  }

  /* ---- DB 検索ヘルパー ----
     String() coercion で数値/文字列の混在する no を統一的に照合する。
     strict === と String() 比較がファイルごとに混在していたlatentバグの解消。 */
  function findPersona(db, mode, no, name) {
    if (!db) return null;
    const pool = mode === "n" ? db.normal_personas : mode === "t" ? db.tokui_personas : null;
    if (!Array.isArray(pool)) return null;
    const found = pool.find((p) => String(p?.no ?? "") === String(no ?? ""));
    if (!found) return null;
    if (name && String(found.name) !== String(name)) return null;
    return found;
  }

  function findEgo(db, rank, no) {
    if (!db || !Array.isArray(db.egos)) return null;
    return db.egos.find((e) => String(e?.rank ?? "") === String(rank ?? "") && String(e?.no ?? "") === String(no ?? "")) || null;
  }

  function findByName(rows, name) {
    if (!Array.isArray(rows)) return null;
    return rows.find((r) => r?.name === name) || null;
  }

  /* ---- DB 参照データのリフレッシュ ----
     ビルドスナップショットには装備時点の DB コピーが保存される。
     DB が更新（エラッタ等）されると、古いコピーがローカルセーブ・共有リンクの
     両経路から復元され続ける。DB に同名で存在する公式由来レコードのみを最新へ
     更新し、ユーザーが手動追加したもの（DB に無い名前）は保護する。 */
  function refreshUniqueBuffsFromDB(uniqueBuffs, dbBuffs) {
    if (!Array.isArray(uniqueBuffs) || !Array.isArray(dbBuffs)) return uniqueBuffs;
    return uniqueBuffs.map((ub) => {
      const dbBuff = dbBuffs.find((db) => db.name === ub.name);
      if (!dbBuff) return ub;
      return {
        ...ub,
        desc: dbBuff.desc,
        type: dbBuff.type || ub.type,
        initial: dbBuff.initial,
        max: dbBuff.max || 20,
        place: dbBuff.place || ub.place
      };
    });
  }

  function refreshSupportsFromDB(supports, db) {
    if (!Array.isArray(supports) || !db) return supports;
    const rows = db.support_passives || [];
    return supports.map((s) => {
      const dbRec = findByName(rows, s.name);
      if (!dbRec) return s;
      return { ...s, cond: dbRec.cond, effect: dbRec.effect, lp: dbRec.lp, type: dbRec.type || s.type };
    });
  }

  function refreshDeathSupportFromDB(deathSupport, db) {
    if (!deathSupport?.name || !db) return deathSupport;
    const dbRec = findByName(db.death_passives || [], deathSupport.name);
    if (!dbRec) return deathSupport;
    return { ...deathSupport, cond: dbRec.cond, effect: dbRec.effect, lp: dbRec.lp };
  }

  function refreshEnhancementsFromDB(enhancements, db) {
    if (!Array.isArray(enhancements) || !db) return enhancements;
    const rows = [...(db.normal_enhancements || []), ...(db.special_enhancements || [])];
    return enhancements.map((e) => {
      const dbRec = findByName(rows, e.name);
      if (!dbRec) return e;
      return { ...e, effect: dbRec.effect || e.effect };
    });
  }

  function refreshSpiritFromDB(state, db) {
    if (!state?.spirit || !db) return state;
    const dbSpirit = findByName(db.spirits || [], state.spirit);
    if (!dbSpirit) return state;
    return {
      ...state,
      spiritAlways: dbSpirit.always_effect || "",
      spiritMorale: dbSpirit.morale_effect || "",
      spiritConfuse: dbSpirit.confuse_effect || ""
    };
  }

  /* ---- スキル・固有バフ・ダイスの成形 ----
     EQUIP_PERSONA / draft import / share snapshot / UI 再読込の 8 箇所に
     分散していた成形ロジックを一本化する。 */
  function normalizeDice(d) {
    const dval = d?.dval ?? d?.d ?? "";
    return {
      roll: d?.roll || "",
      dval,
      d: d?.d ?? dval,
      plus: !!(d?.plus ?? d?.dPlus),
      dPlus: !!(d?.dPlus ?? d?.plus),
      dCnt: !!d?.dCnt,
      effect: d?.effect || ""
    };
  }

  function shapeSkillFromDB(sk, i, idPrefix) {
    return {
      id: `${idPrefix || "sk"}-${Date.now()}-${i}`,
      rank: sk.rank || `スキル${i}`,
      derived_from: sk.derived_from || "",
      derived_index: sk.derived_index,
      derived_condition: sk.derived_condition || "",
      type: sk.type || "",
      sin: sk.sin || "",
      aoe: sk.aoe || "",
      aoeCount: sk.aoeCount || "",
      name: sk.name || "",
      effect: sk.effect || "",
      dice: (sk.dice || []).map(normalizeDice),
      quick: ""
    };
  }

  function shapeUniqueBuffFromDB(b, i, idPrefix) {
    return {
      id: `${idPrefix || "ub"}-${Date.now()}-${i}`,
      name: normalizeStatusLabel(b.name || ""),
      type: b.type || "バフ",
      initial: b.initial !== void 0 ? b.initial : 0,
      max: b.max || 20,
      desc: b.desc || "",
      place: b.place || "status",
      noST: b.noST === true
    };
  }

  /* ---- クリップボードコピー ----
     clipboard API → hidden-textarea execCommand フォールバックの統一実装。 */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    }
  }

  /* ---- 公開 ---- */
  window.LBT_core = Object.freeze({
    cloneJSON,
    normalizeStatusLabel,
    PDF_KEYWORD_ORDER,
    normalizeSyncRank,
    toHalfWidth,
    findPersona,
    findEgo,
    findByName,
    refreshUniqueBuffsFromDB,
    refreshSupportsFromDB,
    refreshDeathSupportFromDB,
    refreshEnhancementsFromDB,
    refreshSpiritFromDB,
    normalizeDice,
    shapeSkillFromDB,
    shapeUniqueBuffFromDB,
    copyText
  });

  /* 下位互換: 既存コードが window.LBT_PDF_KEYWORD_ORDER を直接参照するため。 */
  window.LBT_PDF_KEYWORD_ORDER = PDF_KEYWORD_ORDER;
})();