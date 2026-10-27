/* 記録ログの解析 —— DetectLog の結果を組み立てる純ロジック。

   ユーザーが自分で入力するのは LP/欠片の「額」。機械が導出すべきなのは
   「どの通貨の収支か」と「何を登録したか」だけ。だから出力は確定値ではなく
   検出した事実の一覧で、数額は利用者が書き換える前提。

   検出するのは 2 種類:
     - 通貨: LP か 欠片か 精神か
     - 登録したものの種別（人格 / E.G.O / 精神 / アイテム / 強化）
*/
(function () {
  // 欠片の言い方はゆらぐ。字面が違っても全部 欠片 として扱う。
  const SHARD_WORDS = /欠片|欠牁|カケラ|かけら|けっか|欠けら|欠け片/;
  const LP_WORDS = /LP|Lp|lp|ＬＰ/;

  const halfWidth = (value) => String(value ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：︰﹕]/g, ":")
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/　/g, " ")
    .replace(/、/g, ",");

  const canonical = (value) => halfWidth(value)
    .replace(/現在値?/g, " 現在 ")
    .replace(/[ \t]+/g, " ")
    .trim();

  /* --- 通貨の識別 -------------------------------------------------------
     本命ここ。LP だけ / 欠片だけ / 混在 / なし の4値で返す。 */
  function classifyCurrency(raw) {
    const line = String(raw ?? "");
    const hasLp = LP_WORDS.test(line);
    /* 所持アイテム「硝子の破片／欠け片」「硝酸の欠片」は
       通貨の自我の欠片とは別物として識別する。 */
    const currencyText = line.replace(/(?:硝子の(?:破片|欠け片)|硝酸の(?:欠片|欠け片))/g, " ");
    const hasShard = SHARD_WORDS.test(currencyText);
    if (hasLp && hasShard) return "both";
    if (hasLp) return "lp";
    if (hasShard) return "shards";
    return null;
  }

  /* 金額の検出。 通貨語が無くても「現在 + 数字」なら拾う。
     実データでは 欠片 は必ず語を書く（欠片20 現在100 のように）ので、
     語が無く「現在 + 数字」なら残りは LP と決まる。
     ただしそれは推測なので assumed で表し、利用者が直せるようにする。 */
  function detectAmount(raw) {
    const line = canonical(raw);
    const direct = classifyCurrency(line);
    if (direct) return { currency: direct, assumed: false };
    if (/現在/.test(line) && /\d/.test(line)) return { currency: "lp", assumed: true };
    return { currency: null, assumed: false };
  }

  /* --- 収支と残高の識別 -------------------------------------------------
     「現在」だけでは支出と断定できない。
     「LP153 現在187」のような報酬額→残高は収入候補、
     「品名 現在52LP」は支払い後の残高候補、
     「・現在」の節と「現在230LP」の単独行は残高アンカーとして扱う。
     プラス/マイナスの両方が同じ行にある変換などは方向を決めず review にする。 */
  const SPEND_HEAD = /^・\s*(?:支出|支払い|支払|支付)\s*$/;
  const BALANCE_HEAD = /^・\s*(?:現在|所持|残高)\s*$/;
  const INCOME_HEAD = /^・\s*(?:報酬|収入|獲得)\s*$/;
  const CURRENCY_WORDS = "(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片))";

  function hasMixedCurrencyDirections(line) {
    const positive = new RegExp("(?:\\+\\s*\\d[\\d,]*\\s*" + CURRENCY_WORDS + "|" + CURRENCY_WORDS + "\\s*[:：]?\\s*\\+\\s*\\d)", "i").test(line);
    const negative = new RegExp("(?:-\\s*\\d[\\d,]*\\s*" + CURRENCY_WORDS + "|" + CURRENCY_WORDS + "\\s*[:：]?\\s*-\\s*\\d)", "i").test(line);
    return positive && negative;
  }

  function hasRewardAmountBeforeBalance(line) {
    const before = canonical(line).split("現在")[0].trim();
    if (!before || /(?:購入|消費|支出|支払|使用|買っ)/.test(before)) return false;
    const patterns = [
      /^(?:LP|ＬＰ)\s*(?:報酬)?\s*[:：]?\s*[+＋-−]?\s*\d/i,
      /^(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片)\s*[:：]?\s*[+＋-−]?\s*\d/i,
      /^[+＋-−]?\s*\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片))/i,
      /報酬\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片))\s*[:：]?\s*[+＋-−]?\s*\d/i
    ];
    return patterns.some((pattern) => pattern.test(before));
  }

  function classifyFlow(raw, inSpend, inBalance) {
    const line = canonical(raw);
    if (SPEND_HEAD.test(line)) return { flow: "spend-head", inSpend: true, inBalance: false };
    if (BALANCE_HEAD.test(line)) return { flow: "balance-head", inSpend: false, inBalance: true };
    if (INCOME_HEAD.test(line)) return { flow: "gain-head", inSpend: false, inBalance: false };
    if (hasMixedCurrencyDirections(line)) return { flow: "review", inSpend: false, inBalance: false };
    if (inSpend) return { flow: "spend", inSpend: true, inBalance: false };
    if (inBalance || /^現在\s*(?:(?:LP|ＬＰ)\s*)?\d/i.test(line)) {
      return { flow: "balance", inSpend: false, inBalance: Boolean(inBalance) };
    }
    if (/(?:消費|支出|支払|購入|買っ|使用|不足分.{0,8}補填)/.test(line) ||
        new RegExp("(?:^|[\\s:：])[-−]\\s*\\d[\\d,]*\\s*" + CURRENCY_WORDS + "|" + CURRENCY_WORDS + "\\s*[:：]?\\s*[-−]\\s*\\d", "i").test(line)) {
      return { flow: "spend", inSpend: false, inBalance: false };
    }
    if (/現在/.test(line)) {
      return {
        flow: hasRewardAmountBeforeBalance(line) ? "gain" : "spend",
        inSpend: false,
        inBalance: false
      };
    }
    return { flow: "gain", inSpend: false, inBalance: false };
  }

  /* --- セッション分割 --------------------------------------------------- */
  const OPEN = /^[[【《]/;
  const CLOSE = /[\]】》]/;
  function splitSessions(text) {
    const sessions = [];
    let current = null;
    let pending = "";
    for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\S+\s*:\s*スレ主\s*$/.test(line)) continue;
      if (/^—\s*\d{4}\/\d{1,2}\/\d{1,2}/.test(line)) continue;
      if (/がメッセージをチャンネルにピン留め/.test(line)) continue;

      /* 見出しが折り返して複数行になることがある。 */
      if (pending) {
        pending += " " + line;
        if (CLOSE.test(line)) {
          sessions.push({
            title: pending.replace(/^[[【《]\s*/, "").replace(/\s*[\]】》]\s*$/, "").trim(),
            lines: []
          });
          current = sessions[sessions.length - 1];
          pending = "";
        }
        continue;
      }
      if (OPEN.test(line) && !CLOSE.test(line)) { pending = line; continue; }

      const h = line.match(/^[[【《]\s*(.+?)\s*[\]】》]\s*$/);
      if (h) {
        current = { title: h[1], lines: [] };
        sessions.push(current);
        continue;
      }
      if (!current) {
        current = { title: "", lines: [] };
        sessions.push(current);
      }
      current.lines.push(line);
    }
    if (pending) {
      if (current) current.lines.push(pending);
      else sessions.push({ title: "", lines: [pending] });
    }
    return sessions;
  }

  /* --- 本体 -------------------------------------------------------------
     検出した事実を並べる。数値は「record でもANGE」。 */
  function parseResultLog(text) {
    const sessions = [];
    for (const session of splitSessions(text)) {
      const record = {
        title: session.title,
        records: [],
        currencyLines: 0,
        registrationLines: 0
      };
      let inSpend = false;
      let inBalance = false;

      for (const raw of session.lines) {
        const line = canonical(raw);
        if (!line) continue;

        const classified = classifyFlow(raw, inSpend, inBalance);
        inSpend = classified.inSpend;
        inBalance = classified.inBalance;
        if (classified.flow === "spend-head" || classified.flow === "balance-head" || classified.flow === "gain-head") {
          continue;
        }

        const detected = detectAmount(line);
        if (detected.currency) {
          if (classified.flow === "balance") {
            record.balanceLines = (record.balanceLines || 0) + 1;
            record.records.push({
              kind: "balance",
              currency: detected.currency,
              flow: "balance",
              text: line,
              needsAmount: false,
              assumed: detected.assumed
            });
          } else {
            record.currencyLines += 1;
            record.records.push({
              kind: "currency",
              currency: detected.currency,
              flow: classified.flow,
              text: line,
              needsAmount: true,
              needsReview: classified.flow === "review",
              /* 通貨語が無く「現在 + 数字」だけだった行。LP として扱ったが推測である。 */
              assumed: detected.assumed
            });
          }
        } else if (classified.flow !== "gain" || !/^[\s\d.,:()（）-]*$/.test(line)) {
          /* 通貨語が無い行でも名前らしきものは登録候補として残す。 */
          if (/[^\s\d.,:()（）-]/.test(line) && line.length >= 2) {
            record.registrationLines += 1;
            record.records.push({ kind: "registration", text: line, flow: classified.flow });
          }
        }
      }
      sessions.push(record);
    }
    return { sessions };
  }

  const api = { parseResultLog, splitSessions, classifyCurrency, detectAmount, classifyFlow, canonical, halfWidth };
  if (typeof window !== "undefined") {
    window.LBT_parseResultLog = parseResultLog;
    window.LBT_resultLogInternals = api;
    window.LBT_detectAmount = detectAmount;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();