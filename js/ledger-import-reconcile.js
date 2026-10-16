/* 記録（通帳）の取り込み —— 検出結果と提案を組み立てる純ロジック。

   2つの役割:
     1. reconcileResults — 利用者が入力した収支と「現在残高」から、明細表を
        金額ごとに導出して、合わない箇所を指し示す。解決できない
        部分を UI に渡すのが目的で、勝手に埋めない。
     2. proposePurchases — メモ本文の行から DB に一致するものを
        候補として出し、DB の価格から金額を確定する。

   どちらも UI を持たない。画面側で呼んで結果を描く。 */

(function () {
  const zero = () => ({ lp: 0, shards: 0 });

  const normalize = (value) => Number(String(value ?? "").replace(/[,\s]/g, "")) || 0;
  const hasNumber = (value) => String(value ?? "").trim() !== "" && Number.isFinite(normalize(value));

  /* --- 1. 帳尻合わせ -----------------------------------------------------
     rows は時系列順。{ title, income:{lp,shards}, current:{lp,shards} }
     収入合計と現在残高から、各シナリオの支出額を導出する。 */
  function reconcileResults(rows) {
    const out = [];
    const running = zero();
    let started = false;

    for (const raw of rows || []) {
      const income = { lp: normalize(raw.income?.lp), shards: normalize(raw.income?.shards) };
      const current = {
        lp: hasNumber(raw.current?.lp) ? normalize(raw.current.lp) : null,
        shards: hasNumber(raw.current?.shards) ? normalize(raw.current.shards) : null
      };
      const flags = [];
      const implied = { lp: null, shards: null };

      for (const key of ["lp", "shards"]) {
        if (current[key] === null) {
          flags.push({ level: "info", code: "no-current", currency: key, text: "現在の残高が未入力" });
          continue;
        }
        if (!started) {
          // 最初の 1 件は前の残高が分からない。獲得분을そのまま収支の基準にする。
          implied[key] = income[key];
          continue;
        }
        const spend = running[key] + income[key] - current[key];
        implied[key] = spend;
        if (spend < 0) {
          flags.push({
            level: "error",
            code: "negative-spend",
            currency: key,
            gap: -spend,
            text: "記録した収入より残高が多く増えている（" + (-spend) + " " + label(key) + " 分の記録漏れ）"
          });
        }
      }

      if (current.lp !== null) running.lp = current.lp;
      if (current.shards !== null) running.shards = current.shards;
      if (current.lp !== null || current.shards !== null) started = true;

      out.push({ title: raw.title || "", income, current, impliedSpend: implied, flags });
    }
    return out;
  }

  const label = (key) => (key === "lp" ? "LP" : "欠片");

  /* --- 2. 購入履歴の予測変換 ---------------------------------------------
     メモ本文の各行から、DB が价格を持つもの（サポパ・死亡後サポパ・精神・強化）を
     見つけて候補にする。金額は DB から取るので、ログに金額が無くても決まる。 */
  const PURCHASE_KINDS = new Set(["support", "deathSupport", "spirit", "enhancement"]);

  function proposePurchases(memo, index, options) {
    const opts = options || {};
    const resolve = typeof index?.resolve === "function" ? index.resolve : () => null;
    const price = opts.price || defaultPrice;
    const annotate = opts.annotate;
    const proposals = [];
    const unresolved = [];

    /* 判定不能行の意味を「購入候補にできない支出節の行」へ絞る。
       以前は収入行・チケット行・見出しまで unresolved に積んでいたため、
       UI が「行 N 判定できませんでした」の壁になっていた。 */
    let inSpend = false;

    let lineNo = 0;
    for (const raw of String(memo || "").split("\n")) {
      lineNo += 1;
      const line = raw.trim();
      if (!line) continue;

      /* セクション見出し。以降の行の文脈を決める。 */
      const section = line.match(/^\s*[・･]\s*(.+?)\s*$/);
      if (section) {
        if (/支出|支払/.test(section[1])) inSpend = true;
        else if (/現在/.test(section[1])) inSpend = false;
        continue;
      }

      // 通貨だけの行は名前を持たない。
      if (/^[LP欠片\d\s:：現在値+.-]+$/.test(line)) continue;

      const hit = resolve(line);
      if (!hit) {
        /* 残額の書き直し（現在/残り）と換算行は支出額の判定に
           関係しない。収入節の行は購入候補の文脈ではない。 */
        if (inSpend && !/現在|残|変換|換算/.test(line)) {
          unresolved.push({ lineNo, line });
        }
        continue;
      }
      const kind = hit.kinds.find((k) => PURCHASE_KINDS.has(k.kind));
      if (!kind) continue;

      const cost = price(hit.name, kind.kind);
      if (!cost || (!cost.lp && !cost.shards)) continue; // 価格が無いものは提案しない

      /* 同一行でも由来によって支出か否かが変わる。上来の estimate をUI に渡す。 */
      const extra = annotate ? annotate(line, hit) : null;
      proposals.push({
        /* 行ごとに一意。選択はこの単位で行う。 */
        key: "occurrence:" + lineNo + ":" + kind.kind + ":" + hit.name,
        lineNo,
        line,
        name: hit.name,
        kind: kind.kind,
        cost,
        confidence: hit.confidence,
        provenance: extra ? extra.provenance : null,
        include: extra ? extra.include !== false : true,
        needsDecision: extra ? (extra.needsDecision || null) : null
      });
    }

    return { proposals, unresolved };
  }

  /* DB からMENigherを作る。 state.js の price* と同じ規則。 */
  function defaultPrice(name, kind) {
    const db = (typeof window !== "undefined" && window.DB) || {};
    if (kind === "spirit") {
      const hit = (db.spirits || []).find((s) => s.name === name);
      return { lp: 0, shards: Number.parseInt(hit && hit.price, 10) || 0 };
    }
    if (kind === "support") {
      const hit = (db.support_passives || []).find((s) => s.name === name);
      return { lp: Number.parseInt(hit && hit.lp, 10) || 0, shards: 0 };
    }
    if (kind === "deathSupport") {
      const hit = (db.death_passives || []).find((s) => s.name === name);
      return { lp: 0, shards: Number.parseInt(hit && hit.shards, 10) || 0 };
    }
    if (kind === "enhancement") {
      const all = [...(db.normal_enhancements || []), ...(db.special_enhancements || [])];
      const hit = all.find((e) => e.name === name);
      return { lp: 0, shards: Number.parseInt(hit && hit.shards, 10) || 0 };
    }
    return { lp: 0, shards: 0 };
  }

  const api = { reconcileResults, proposePurchases, defaultPrice, PURCHASE_KINDS };
  if (typeof window !== "undefined") {
    window.LBT_ledgerReconcile = api;
    window.LBT_reconcileResults = reconcileResults;
    window.LBT_proposePurchases = proposePurchases;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();