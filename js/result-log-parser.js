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
  const SHARD_WORDS = /欠片|欠牁|カケラ|かけら|けっか|欠けら/;
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
    const hasShard = SHARD_WORDS.test(line);
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

  /* --- 収支の識別 -------------------------------------------------------
     「現在」= 支払後の残高なので支出。「・支出」節の中-advantageも支出。 */
  const SPEND_HEAD = /^・\s*(?:支出|支払い|支付)\s*$/;
  function classifyFlow(raw, inSpend) {
    const line = canonical(raw);
    if (SPEND_HEAD.test(line)) return { flow: "spend-head", inSpend: true };
    if (/現在/.test(line)) return { flow: "spend", inSpend: false };
    if (inSpend) return { flow: "spend", inSpend: true };
    return { flow: "gain", inSpend: false };
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

      for (const raw of session.lines) {
        const line = canonical(raw);
        if (!line) continue;

        const classified = classifyFlow(raw, inSpend);
        inSpend = classified.inSpend;

        const detected = detectAmount(line);
        if (detected.currency) {
          record.currencyLines += 1;
          record.records.push({
            kind: "currency",
            currency: detected.currency,
            flow: classified.flow,
            text: line,
            needsAmount: true,
            /* 通貨語が無く「現在 + 数字」だけだった行。LP として扱ったが推測である。 */
            assumed: detected.assumed
          });
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