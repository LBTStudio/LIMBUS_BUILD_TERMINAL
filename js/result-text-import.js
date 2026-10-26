/* 記録のテキスト流し込み。｜区切りの手書きログを
   リザルト（収入）と支出明細の提案へ落とす純ロジック。

   取り込む形式:
     【シナリオ名】(作：著者)
     報酬｜LP:150/自我の欠片:70/人格抽出チケットx1
     購入｜人格抽出x2(100LP)/第四銀太刀派同期化(50欠片)/EGO購入-TETH[鬼退治](75欠片)
     追加購入｜壊し砕く打撃(150LP)/乱打(50LP)

   方針は 硝子窓取り込みと同じ: 読めないものは勝手に埋めず、
   理由つきの skipped として呼び出し側へ返す。 */

(function () {
  const toHalf = (value) => String(value ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：]/g, ":").replace(/[＝]/g, "=").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/　/g, " ").replace(/[、]/g, ",");

  /* 深さ 0 の位置だけで切る。括弧と日本語の鉤括弧・山括弧の中の
     / や ｜ は区切りではない（〈A/B〉のパック名を途中で切らない）。 */
  const BRACKET_CLOSE = {
    "(": ")", "[": "]", "{": "}", "（": "）",
    "〈": "〉", "《": "》", "「": "」", "『": "』",
    "【": "】", "〔": "〕", "〖": "〗", "〘": "〙", "〚": "〛"
  };
  function splitTop(text, isSeparator) {
    const out = [];
    const stack = [];
    let buf = "";
    const src = String(text ?? "");
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (Object.prototype.hasOwnProperty.call(BRACKET_CLOSE, c)) {
        stack.push(BRACKET_CLOSE[c]);
      } else if (stack.length && c === stack[stack.length - 1]) {
        stack.pop();
      }
      if (stack.length === 0 && isSeparator(c)) { out.push(buf); buf = ""; continue; }
      buf += c;
    }
    out.push(buf);
    return out.map((s) => s.trim()).filter(Boolean);
  }

  const SECTIONS = {
    "報酬": "income", "獲得": "income", "収入": "income",
    "購入": "buy", "追加購入": "buy", "消費": "buy", "支出": "buy", "支払い": "buy"
  };

  /* Google Docs/Word からコピーしたテーブルも、既存の正規フォーマットへ寄せる。
     [Input] は共有ドキュメントの枠名であり、シナリオ見出しではない。
     ラベルを認識できる行だけ変換し、不明な内容は後段の skipped に残す。 */
  const fieldKey = (value) => String(value ?? "")
    .replace(/[*_]/g, "")
    .replace(/[\s・･]/g, "")
    .trim();
  const isSectionField = (value) => Object.prototype.hasOwnProperty.call(SECTIONS, fieldKey(value));
  const isTitleField = (value) => /^(?:シナリオ名?|タイトル|scenario(?:name)?|title)$/i.test(fieldKey(value));
  const cleanTableCell = (value) => String(value ?? "")
    .replace(/^[\s|]+|[\s|]+$/g, "")
    .replace(/[*_]/g, "")
    .trim();

  function normalizeInputText(rawText) {
    const source = String(rawText ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
    const wrapped = /^\s*(?:[-*+]\s*)?\[\s*(?:input|入力)\s*\]\s*$/im.test(source);
    const lines = [];
    for (const rawLine of source.split("\n")) {
      let line = rawLine.trim();
      if (!line) { lines.push(""); continue; }
      if (/^(?:[-*+]\s*)?\[\s*(?:input|入力)\s*\]$/i.test(line)) continue;
      if (/^\u0060{3}(?:[\w-]+)?\s*$/.test(line)) continue;
      if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line)) continue;
      line = line.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, "");

      /* Markdown 表をテキストとしてコピーした場合: | 報酬 | LP:100 | 欠片:20 | */
      if (line.startsWith("|") && line.includes("|")) {
        const cells = line.split("|").map(cleanTableCell);
        while (cells.length && !cells[0]) cells.shift();
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        const label = cells[0] || "";
        if (isTitleField(label) && cells.length > 1 && cells[1]) {
          lines.push("【" + cells[1] + "】");
          continue;
        }
        if (isSectionField(label) && cells.length > 1) {
          lines.push(fieldKey(label) + "｜" + cells.slice(1).filter(Boolean).join("/"));
          continue;
        }
      }

      /* Google Docs/Word の表コピーはセルがタブ区切りになる。 */
      if (line.includes("\t")) {
        const cells = line.split(/\t+/).map(cleanTableCell);
        while (cells.length && !cells[0]) cells.shift();
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        const label = cells[0] || "";
        if (isTitleField(label) && cells.length > 1 && cells[1]) {
          lines.push("【" + cells[1] + "】");
          continue;
        }
        if (isSectionField(label) && cells.length > 1) {
          lines.push(fieldKey(label) + "｜" + cells.slice(1).filter(Boolean).join("/"));
          continue;
        }
      }

      const fieldValue = line.match(/^([^:：｜|]{1,14})\s*[:：]\s*(.+)$/);
      if (fieldValue) {
        const field = fieldKey(fieldValue[1]);
        if (isTitleField(field)) {
          lines.push("【" + fieldValue[2].trim() + "】");
          continue;
        }
        if (isSectionField(field)) {
          lines.push(field + "｜" + fieldValue[2].trim());
          continue;
        }
      }

      lines.push(line);
    }
    return { text: lines.join("\n"), wrapped };
  }

  /* (150LP) や (50欠片) の中の金額。取れなければ null（0 ではない）。
     数が合わないときは「読めない」のではなく「決まらない」として別扱いする
     （無料1/100LP は無料か 100LP かで意味が違う）。 */
  /* 手書き金額も帳簿へ入るため、桁区切りと安全整数を厳密に検査する。 */
  function safeAmount(token) {
    const raw = String(token ?? "").trim();
    if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return null;
    const value = Number(raw.replace(/,/g, ""));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function costFromParens(text) {
    const lp = [...text.matchAll(/(\d[\d,]*)\s*(?:lp|LP|Lp)/g)];
    const shards = [...text.matchAll(/(\d[\d,]*)\s*(?:欠片|欠けら|欠けら|カケラ|かけら|けっか)/g)];
    const one = (list) => (list.length === 1 ? safeAmount(list[0][1]) : null);
    const l = one(lp);
    const s = one(shards);
    if (lp.length + shards.length === 0) return null;
    /* 不正な桁区切り・安全整数超過・複数価格は決め打ちせず要確認にする。 */
    const invalidAmount = [...lp, ...shards].some((match) => safeAmount(match[1]) === null);
    const numbers = (text.match(/\d[\d,]*/g) || []).length;
    const recognized = lp.length + shards.length;
    return {
      lp: l ?? 0, shards: s ?? 0,
      ambiguous: invalidAmount || lp.length + shards.length > 1 || numbers > recognized || (lp.length === 1 && l === null) || (shards.length === 1 && s === null)
    };
  }

  /* 末尾の括弧書きを取り除く。名前はそれ以外。 */
  function splitNameAndParens(text) {
    const m = String(text).match(/^(.*?)((?:\([^()]*\))*[()]?)\s*$/);
    if (!m || !m[2].trim()) return { name: String(text).trim(), parens: "" };
    const name = m[1].trim();
    return name ? { name, parens: m[2] } : { name: String(text).trim(), parens: "" };
  }

  const SHARD_WORD = /欠片|欠けら|欠けら|カケラ|かけら|けっか/;
  const LP_WORD = /\d\s*(?:lp|LP|Lp)$|lp\s*\d/i;

  /* 報酬行の 1 項目。例: LP:150(+9) / 自我の欠片:70(+16) / 人格抽出チケットx1 */
  function readReward(item) {
    const text = toHalf(item);
    /* 「硝子の欠片」は資源アイテムであり、自我の欠片通貨ではない。 */
    if (/硝子の(?:破片|欠片|かけら|カケラ)/.test(text)) return null;
    /* 増減 (±N) は残高差なので、収入には足さない。原文は残す。 */
    const delta = text.match(/([+-])\s*(\d[\d,]*)/);
    const deltaAmount = delta ? safeAmount(delta[2]) : null;
    const invalidDelta = Boolean(delta) && deltaAmount === null;
    const deltas = [];
    const numeric = text.replace(/[（(]\s*[+-]\s*\d[\d,]*\s*[)）]/g, "").trim();
    const num = numeric.match(/([+-]?\d[\d,]*)/);
    const value = num ? safeAmount(num[1]) : 0;
    const rest = numeric.replace(/([+-]?\d[\d,]*)/, " ").trim();
    if (delta && deltaAmount !== null) deltas.push({ value: deltaAmount, sign: delta[1] });

    /* 数量は名前中のシーズン番号などではなく、xN/×N/チケットN枚から取る。 */
    if (/抽出|チケット/.test(numeric)) {
      const packMatch = numeric.match(/[〈《]([^〉》]+)[〉》]\s*抽出チケット/i);
      const countMatch = numeric.match(/[x×]\s*([+-]?\d[\d,]*)/i)
        || numeric.match(/チケット\s*[:：]?\s*([+-]?\d[\d,]*)\s*枚/i);
      const count = countMatch ? safeAmount(countMatch[1]) : 1;
      if (count === null) return null;
      const kind = packMatch ? "pack"
        : /e\.?g\.?o/i.test(numeric) || /ＥＧＯ/i.test(numeric) ? "ego"
        : /人格/.test(numeric) ? "persona"
        : /選択/.test(numeric) ? "choice" : null;
      const ticket = { kind, count };
      /* 原文は保留表示用の内部メタデータ。既存のJSON形状とdeep equalityは変えない。 */
      Object.defineProperty(ticket, "raw", { value: item, enumerable: false });
      if (packMatch) ticket.pack = packMatch[1].trim();
      return { ticket, deltas, invalidDelta, raw: item };
    }
    if (num && value === null) return null;
    /* 通貨は単位詞で分ける */
    const isShards = SHARD_WORD.test(numeric);
    const isLp = LP_WORD.test(numeric) || /^(lp|ＬＰ)/i.test(numeric);
    if (!isShards && !isLp) return null;
    /* 収入として負額を反転加算しない。補正は元データを直してから再取込する。 */
    if (num && num[1].startsWith("-")) return null;
    return { currency: isShards ? "shards" : "lp", value, deltas, invalidDelta, rest, raw: item };
  }

  /* 明細の候補。種別のヒントは名前から読む（DB 解決は呼び出し側）。 */
  function hintOf(name) {
    const text = toHalf(name);
    if (/e\.?g\.?o/i.test(text) || /ＥＧＯ/.test(text)) return "ego";
    if (/同期化|解析|max|ＭＡＸ/i.test(text)) return "persona";
    if (/人格|抽出/.test(text)) return "persona";
    return null;
  }

  /* 旧シナリオ一覧（『シナリオ名』→報酬→獲得品/同期ログ）にも対応。
     数値と通貨の両方が明示されたペアだけ読む。硝子の破片は自我の欠片ではない。 */
  function parseLegacyIncome(line) {
    const text = toHalf(line).replace(/硝子の(?:破片|欠片|かけら|カケラ)/g, " ");
    const lpMatches = [...text.matchAll(/(\d[\d,]*)\s*LP\b|\bLP\s*[:：]?\s*(\d[\d,]*)/gi)];
    const shardMatches = [...text.matchAll(/(\d[\d,]*)\s*(?:自我の)?(?:欠片|かけら|欠けら|カケラ)|(?:自我の)?(?:欠片|かけら|欠けら|カケラ)\s*[:：]?\s*(\d[\d,]*)/g)];
    if (!lpMatches.length && !shardMatches.length) return null;
    const values = (matches) => {
      let total = 0;
      for (const match of matches) {
        const token = match[1] || match[2];
        const value = safeAmount(token);
        if (value === null || !Number.isSafeInteger(total + value)) return null;
        total += value;
      }
      return total;
    };
    const lp = values(lpMatches);
    const shards = values(shardMatches);
    if (lp === null || shards === null) return { error: "通貨収入の合計が不正です" };
    return { lp, shards };
  }

  function parseLegacyTicket(line) {
    const text = toHalf(line);
    if (!/人格\s*(?:抽出)?\s*チケ(?:ット)?/.test(text)) return null;
    const countMatch = text.match(/[x×]\s*(\d[\d,]*)/i) || text.match(/(\d[\d,]*)\s*枚/);
    const count = countMatch ? safeAmount(countMatch[1]) : 1;
    return count === null ? { error: "チケット枚数が不正です" } : { kind: "persona", count };
  }

  function parseLegacyGlassGain(line) {
    const text = toHalf(line);
    if (!/硝子の(?:破片|欠片|かけら|カケラ)/.test(text) || /(?:使用|消費)/.test(text)) return null;
    const countMatch = text.match(/[x×]\s*(\d[\d,]*)/i)
      || text.match(/(\d[\d,]*)\s*(?:個|つ)/)
      || text.match(/([一二三四五六七八九十]+)\s*(?:個|つ)?/);
    const kanji = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const token = countMatch ? countMatch[1] : "";
    const quantity = !countMatch ? 1 : (kanji[token] || safeAmount(token));
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return { error: "硝子の破片の個数が不正です" };
    return { itemId: "resource-glass-shard", itemName: "硝子の破片", quantity };
  }

  function parseLegacyGlassUse(line) {
    const text = toHalf(line);
    if (!/硝子の(?:破片|欠片|かけら|カケラ)/.test(text) || !/(?:使用|消費)/.test(text)) return null;
    const amount = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)";
    const match = text.match(new RegExp(
      "硝子の(?:破片|欠片|かけら|カケラ)\\s*(?:を\\s*)?(?:(" + amount + ")\\s*(?:個|つ)?|[x×]\\s*(" + amount + ")|([一二三四五六七八九十]+)\\s*(?:個|つ)?)\\s*(?:を\\s*)?(?:使用|消費)"
    ));
    if (!match) return { error: "硝子の破片の消費個数を読み取れません" };
    const token = match[1] || match[2] || match[3] || "1";
    const kanji = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const quantity = match[3] ? kanji[token] : safeAmount(token);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return { error: "硝子の破片の消費個数が不正です" };
    return {
      itemId: "resource-glass-shard",
      itemName: "硝子の破片",
      quantity,
      reason: "phenomenon_processing",
      detail: String(line || "").replace(/^[【\[『「]+|[】\]』」]+$/g, "").trim().slice(0, 500)
    };
  }

  /* 縦書きの実記録（▼/▽見出し、複数行の報酬・消費・獲得）を安全に構造化する。 */
  function ledgerDate(expression) {
    const source = toHalf(expression).trim();
    const match = source.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function ledgerNumber(expression) {
    const source = toHalf(expression).trim();
    if (!source) return null;
    let candidate = source;
    if (/[→⇒➜]/.test(candidate)) candidate = candidate.split(/[→⇒➜]/).pop().trim();
    else if (candidate.includes("=")) candidate = candidate.split("=").pop().trim();
    else if (/[+＋]/.test(candidate)) {
      const core = candidate.split(/[（(]/)[0];
      const nums = [...core.matchAll(/\d[\d,]*/g)].map((m) => safeAmount(m[0]));
      if (!nums.length || nums.some((n) => n === null)) return null;
      const total = nums.reduce((sum, n) => sum + n, 0);
      return Number.isSafeInteger(total) ? total : null;
    }
    const match = candidate.match(/(\d[\d,]*)\s*(?:LP|自我の欠片|欠片|欠けら|カケラ|かけら)?\s*$/i);
    return match ? safeAmount(match[1]) : null;
  }

  function ledgerCost(text) {
    const cost = { lp: 0, shards: 0 };
    let found = false;
    let ambiguous = false;
    const parts = String(text ?? "").split(/[、,，;；]/);
    for (const rawPart of parts) {
      /* 「200LP以下」はパックの適用条件であり、消費LPではない。 */
      const part = toHalf(rawPart)
        .replace(/\d[\d,]*\s*LP\s*以下の?/gi, " ")
        .replace(/硝子の(?:破片|欠片|かけら|カケラ)(?:\s*[x×]\s*\d[\d,]*)?/gi, " ");
      const hasLP = /(?:LP\s*\d|\d\s*LP|\bLP\b)/i.test(part);
      const hasShards = /(?:(?:自我の)?(?:欠片|欠けら|カケラ|かけら)\s*\d|\d\s*(?:自我の)?(?:欠片|欠けら|カケラ|かけら))/i.test(part);
      if (hasLP && hasShards) { ambiguous = true; continue; }
      if (!hasLP && !hasShards) continue;
      const amount = ledgerNumber(part);
      if (amount === null) { ambiguous = true; continue; }
      const key = hasLP ? "lp" : "shards";
      const next = cost[key] + amount;
      if (!Number.isSafeInteger(next)) { ambiguous = true; continue; }
      cost[key] = next;
      found = true;
    }
    return { cost, found, ambiguous };
  }

  function ledgerTicket(text) {
    const source = toHalf(text).trim();
    const bracketPack = source.match(/[【〔〈<]([^】〕〉>]+)[】〕〉>]/);
    const quotedPack = source.match(/(?:テーマパック|テーマパーク)\s*[「『"]([^」』"]+)[」』"]/);
    const bracketPackName = bracketPack
      ? bracketPack[1].replace(/\s*(?:チケット|パック|抽出)\s*$/i, "").trim()
      : "";
    const quotedPackName = quotedPack ? quotedPack[1].trim() : "";
    const genericPackMatch = source.match(/(?:任意(?:の)?(?:\s*\d[\d,]*\s*LP\s*以下の)?|好きな)\s*(?:テーマパック|テーマパーク)/i);
    const genericPackName = genericPackMatch
      ? genericPackMatch[0].replace(/\s+/g, " ").replace(/テーマパーク/ig, "テーマパック").trim()
      : "";
    const packPrefixMatch = source.match(/([^:：]+?)\s*(?:テーマパック|テーマパーク)\s*(?:チケット|権)/i);
    const packPrefix = packPrefixMatch ? packPrefixMatch[1].split(/[:：]/).pop().trim() : "";
    const bracketPackRight = /[【〔〈<][^】〕〉>]+[】〕〉>]\s*パック\s*[+＋]\s*\d[\d,]*/i.test(source);
    const quotedPackRight = /(?:テーマパック|テーマパーク)\s*[「『"][^」』"]+[」』"]\s*[+＋]\s*\d[\d,]*/i.test(source);
    const genericPackRight = /(?:任意(?:の)?(?:\s*\d[\d,]*\s*LP\s*以下の)?|好きな)\s*(?:テーマパック|テーマパーク)\s*[+＋]\s*\d[\d,]*/i.test(source);
    const unnamedPackRight = /(?:テーマパック|テーマパーク)\s*[+＋]\s*\d[\d,]*/i.test(source);
    const packRight = /(?:テーマパック|テーマパーク)\s*(?:チケット|権)|パック抽出\s*[+＋]\s*\d[\d,]*\s*権|[+＋]\s*\d[\d,]*\s*権\s*$/i.test(source)
      || bracketPackRight || quotedPackRight || genericPackRight || unnamedPackRight;
    const hasTicketWord = /(?:チケ(?:ット)?|抽出🎫)/i.test(source);
    if (!hasTicketWord && !packRight) return null;

    const countMatch = source.match(/[x×]\s*([+-]?\d[\d,]*)/i)
      || source.match(/([+-]?\d[\d,]*)\s*枚/)
      || source.match(/(?:チケット|チケ)\s*([+-]?\d{1,3}(?:,\d{3})+|[+-]?\d+)\s*(?=$|[\s,，、;；()（）])/i)
      || (packRight ? source.match(/[+＋]\s*(\d[\d,]*)\s*(?:権)?/i) : null);
    const count = countMatch ? safeAmount(countMatch[1]) : 1;
    if (count === null) return { error: "チケット枚数が不正です", raw: text };

    let kind = null;
    let pack = "";
    const hasPersonaTicket = /人格\s*(?:抽出)?\s*チケ(?:ット)?/i.test(source);
    const hasEgoTicket = /(?:E\.?\s?G\.?\s?O|エゴ)\s*(?:抽出)?\s*チケ(?:ット)?/i.test(source);
    if (packRight) {
      kind = "pack";
      /* パック抽出権の残高キーは「選択した報酬品」ではなく、使用したチケット種別。
         「任意テーマパック」と「断ち切れない」は別物なので、混同しない。 */
      pack = quotedPackName || (bracketPackName && /(?:パック|抽出\s*[+＋]\s*\d+\s*権|\+1\s*権)/i.test(source) ? bracketPackName : "")
        || genericPackName || packPrefix;
      if (!pack && /[+＋]\s*\d[\d,]*\s*権\s*$/i.test(source)) {
        const prefix = source.replace(/[+＋]\s*\d[\d,]*\s*権\s*$/i, "").trim();
        if (prefix && !/(?:テーマパック|テーマパーク)(?:チケット|権)/i.test(prefix)) pack = prefix;
      }
    } else if (/(?:人格\s*(?:or|または)\s*E\.?G\.?O|E\.?G\.?O\s*(?:or|または)\s*人格|選択(?:式|可能)?抽出|選択式チケット|人格orE\.?G\.?O|人格orEGO|EGOor人格|任意(?:の)?(?:選択)?抽出チケット|任意選択抽出チケット)/i.test(source)) kind = "choice";
    else if (hasPersonaTicket && hasEgoTicket) kind = null;
    else if (hasEgoTicket) kind = "ego";
    else if (hasPersonaTicket) kind = "persona";
    return { kind, ...(kind === "pack" && pack ? { pack } : {}), count, raw: text };
  }

  function ledgerTickets(text) {
    /* 「テーマパック+1」「名前+1権」の + は枚数であり、チケット同士の区切りではない。 */
    const protectedPlus = String(text ?? "").replace(/[+＋](?=\s*\d[\d,]*)/g, "\uE000");
    const terms = splitTop(protectedPlus, (c) =>
      c === "、" || c === "," || c === "，" || c === ";" || c === "；" || c === "+" || c === "＋")
      .map((term) => term.replace(/\uE000/g, "+"));
    /* 特定の出目条件で「人格チケとEGOチケ両方」と明記された記録は、
       1枚ずつ両種を獲得・使用した意味なので、1つの未知チケットにまとめない。 */
    if (terms.length === 1 && /両方/.test(terms[0])) {
      const source = toHalf(terms[0]);
      const persona = source.match(/人格\s*(?:抽出)?\s*チケ(?:ット)?(?:\s*[x×]\s*(\d[\d,]*))?/i);
      const ego = source.match(/(?:E\.?\s?G\.?\s?O|エゴ)\s*(?:抽出)?\s*チケ(?:ット)?(?:\s*[x×]\s*(\d[\d,]*))?/i);
      if (persona && ego) {
        const countOf = (match) => match[1] === undefined ? 1 : safeAmount(match[1]);
        const personaCount = countOf(persona), egoCount = countOf(ego);
        return [
          personaCount === null ? { error: "人格チケットの枚数が不正です", raw: terms[0] } : { kind: "persona", count: personaCount, raw: terms[0] },
          egoCount === null ? { error: "E.G.Oチケットの枚数が不正です", raw: terms[0] } : { kind: "ego", count: egoCount, raw: terms[0] }
        ];
      }
    }
    return terms.map((term) => ledgerTicket(term)).filter(Boolean);
  }

  /* 一般的な「抽出チケット」は単独では種別不明。
     ただし、記録タイトルが厳密に「人格抽出」と明記される場合だけ、
     消費欄の無修飾チケットを人格抽出券と解釈する。任意券やテストプレイ報酬は推測しない。 */
  function ticketWithRecordContext(ticket, title, rawText) {
    if (!ticket || ticket.error || ticket.kind) return ticket;
    const normalizedTitle = toHalf(title).replace(/\s+/g, " ").trim();
    if (!/^人格抽出(?:\s*[x×]\s*\d+)?$/i.test(normalizedTitle)) return ticket;
    const raw = toHalf(rawText);
    if (!/(?:^|[^任意選択])抽出チケット(?:\s*[x×]?\s*\d+)?/i.test(raw)) return ticket;
    if (/(?:任意|選択|テーマパック|テーマパーク|テストプレイ|報酬)/i.test(raw)) return ticket;
    return { ...ticket, kind: "persona" };
  }

  function ticketResolutionKey(recordIndex, ticket) {
    return `${recordIndex}:${String(ticket?.sourceLine || "").trim()}::${String(ticket?.raw || "").trim()}`;
  }

  function ledgerShardConversion(text) {
    const source = toHalf(text).trim();
    const converted = source.match(/[→⇒➜]\s*(\d[\d,]*)\s*(?:自我の)?(?:欠片|欠けら|かけら|カケラ)\s*$/i);
    if (converted) return safeAmount(converted[1]);
    const direct = source.match(/^(\d[\d,]*)\s*(?:自我の)?(?:欠片|欠けら|かけら|カケラ)\s*$/i);
    return direct ? safeAmount(direct[1]) : null;
  }

  function ledgerItem(text) {
    const original = String(text ?? "").trim().replace(/^[*+-]\s+/, "");
    let normalized = toHalf(original);
    let quantity = 1;
    let quantityInvalid = false;
    const quantitySuffix = normalized.match(/\s*[x×]\s*([+-]?\d[\d,]*)\s*$/i);
    if (quantitySuffix) {
      const parsedQuantity = safeAmount(quantitySuffix[1]);
      if (parsedQuantity === null || parsedQuantity <= 0) quantityInvalid = true;
      else quantity = parsedQuantity;
      normalized = normalized.slice(0, quantitySuffix.index).trim();
    }
    const trailing = normalized.match(/^(.*?)(?:\s+)(\d[\d,]*)\s*(LP|自我の欠片|欠片|欠けら|カケラ|かけら)\s*$/i);
    if (trailing && trailing[1].trim()) {
      const amount = safeAmount(trailing[2]);
      if (amount !== null) {
        const isLP = /^LP$/i.test(trailing[3]);
        return {
          name: trailing[1].trim(), quantity, quantityInvalid,
          cost: isLP ? { lp: amount, shards: 0 } : { lp: 0, shards: amount },
          priced: true,
          raw: original
        };
      }
    }
    const split = splitNameAndParens(normalized);
    const parenCost = split.parens ? costFromParens(split.parens) : null;
    if (split.name && parenCost && !parenCost.ambiguous) {
      return {
        name: split.name, quantity, quantityInvalid,
        cost: { lp: parenCost.lp, shards: parenCost.shards },
        priced: true,
        raw: original
      };
    }
    return { name: normalized || original, quantity, quantityInvalid, cost: null, priced: false, raw: original };
  }

  function ledgerItems(text) {
    return splitTop(String(text ?? ""), (c) => c === "、" || c === "," || c === "，" || c === ";" || c === "；")
      .map(ledgerItem).filter((item) => item.name);
  }

  function ledgerGlassConsumption(text) {
    const source = toHalf(text);
    if (!/硝子の(?:破片|欠片|かけら|カケラ)/.test(source) || !/(?:消費|使用)/.test(source)) return null;
    const amount = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)";
    const match = source.match(new RegExp(
      "硝子の(?:破片|欠片|かけら|カケラ)\\s*(?:[x×]\\s*(" + amount + ")|(" + amount + ")\\s*(?:個|つ)?|([一二三四五六七八九十]+)\\s*(?:個|つ)?)",
      "i"
    ));
    const kanji = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const token = match ? (match[1] || match[2] || match[3]) : "";
    const quantity = !match ? 1 : (match[3] ? kanji[token] : safeAmount(token));
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return { error: "硝子の破片の消費個数が不正です", raw: text };
    return {
      itemId: "resource-glass-shard",
      itemName: "硝子の破片",
      quantity,
      reason: "phenomenon_processing",
      detail: String(text || "").trim().slice(0, 500)
    };
  }

  function parseLedgerJournal(rawText) {
    const source = String(rawText ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
    const records = [];
    const skipped = [];
    const blocks = [];
    let block = null;
    const sourceLines = source.split("\n");
    const isDateLine = (value) => /^日時\s*[：:]\s*\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(String(value || "").trim());
    for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
      const rawLine = sourceLines[lineIndex];
      const line = rawLine.trim();
      const markedHeader = line.match(/^[▼▽]\s*(.+?)\s*$/);
      let inferredHeader = false;
      if (!markedHeader && line && !/[:：]/.test(line) && !sourceLines[lineIndex - 1]?.trim()) {
        let next = lineIndex + 1;
        while (next < sourceLines.length && !sourceLines[next].trim()) next += 1;
        inferredHeader = isDateLine(sourceLines[next]);
      }
      if (markedHeader || inferredHeader) {
        if (block) blocks.push(block);
        block = { title: (markedHeader ? markedHeader[1] : line).trim(), lines: [], inferredHeader };
      } else if (block) {
        block.lines.push(rawLine);
      } else if (line) {
        skipped.push({ text: line, reason: "記録見出しより前にあるため、リザルトへ割り当てていません" });
      }
    }
    if (block) blocks.push(block);

    const addValue = (record, key, amount, rawLine) => {
      if (amount === null) {
        skipped.push({ text: rawLine, reason: "通貨の金額を読み取れません" });
        return;
      }
      const next = record.income[key] + amount;
      if (!Number.isSafeInteger(next)) {
        skipped.push({ text: rawLine, reason: "収入合計が安全整数の範囲を超えています" });
        return;
      }
      record.income[key] = next;
    };
    const addItem = (record, bucket, item, role) => {
      bucket.push(item);
      if (role === "acquired") record.acquisitions.push(item);
      else if (role === "specified") record.specifiedItems.push(item);
      else if (role === "targets") record.identityCandidates.push(item.name);
    };
    const totalCostsEqual = (a, b) => a.lp === b.lp && a.shards === b.shards;

    for (const entry of blocks) {
      const title = entry.title.replace(/^『\s*(.+?)\s*』$/, "$1").trim();
      const record = {
        title: title || null, date: null, author: null, income: { lp: 0, shards: 0 },
        tickets: [], ticketUses: [], spends: [], deltas: [], consumedItems: [], itemGains: [], raw: [],
        journalFormat: true, acquisitions: [], specifiedItems: [], identityCandidates: [], rewardCandidates: [], itemUseCandidates: []
      };
      const acquired = [];
      const specified = [];
      const targets = [];
      const consumeLines = [];
      let continuation = null;
      let rewardContext = false;

      const keepNote = (line) => {
        const value = String(line ?? "").trim();
        if (!value) return;
        record.raw.push(value);
        /* 注記欄のアイテム使用は、完全一致でDBへ引けた場合のみ在庫減少候補にする。
           CT使用などアイテムでない記述は、後段の完全一致に失敗すれば注記のまま残る。 */
        if (/(?:使用(?!可能|可)|消費)/.test(value) && !/硝子の(?:破片|欠片|かけら|カケラ)/.test(value)
          && !/^消費\s*[：:]/.test(value)) {
          record.itemUseCandidates.push(value);
        }
      };
      const collectItems = (value, bucket, role) => {
        const items = ledgerItems(value);
        for (const item of items) {
          if (item.quantityInvalid) {
            skipped.push({ text: item.raw, reason: "取得品の個数が不正なため登録を保留しました" });
            continue;
          }
          const glass = parseLegacyGlassGain(item.raw);
          if (glass && !glass.error) {
            record.itemGains.push(glass);
            continue;
          }
          if (role === "acquired") {
            const convertedShards = ledgerShardConversion(item.raw);
            if (convertedShards !== null) {
              addValue(record, "shards", convertedShards, item.raw);
              continue;
            }
          }
          addItem(record, bucket, item, role);
          if (role === "acquired" && /人格抽出|人格指定抽出/.test(title)) {
            record.identityCandidates.push(item.name);
          } else if (role === "specified" && /初期作成/.test(title)) {
            record.identityCandidates.push(item.name);
          }
        }
      };

      for (const rawLine of entry.lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const fieldValue = line.match(/^([^:：]{1,36})\s*[:：]\s*(.*)$/);
        const rawLabel = fieldValue ? fieldValue[1].trim() : "";
        const label = fieldValue ? fieldKey(rawLabel) : "";
        const value = fieldValue ? fieldValue[2].trim() : "";

        if (label === "消費") {
          rewardContext = false;
          consumeLines.push(value);
          for (const parsedTicket of ledgerTickets(value)) {
            const usedTicket = ticketWithRecordContext(parsedTicket, title, value);
            if (usedTicket.error) skipped.push({ text: line, reason: usedTicket.error });
            else record.ticketUses.push({ ...usedTicket, raw: usedTicket.raw || line, sourceLine: line });
          }
          keepNote(line);
          const glassUse = ledgerGlassConsumption(line) || parseLegacyGlassUse(line);
          if (glassUse) {
            if (glassUse.error) skipped.push({ text: line, reason: glassUse.error });
            else record.consumedItems.push(glassUse);
          }
          continuation = null;
          continue;
        }

        if (label === "報酬") {
          rewardContext = true;
          keepNote(line);
          if (value) {
            const nested = value.match(/^\s*(LP|自我の欠片|欠片)\s*[:：]\s*(.+)$/i);
            if (nested) {
              const key = /^LP$/i.test(nested[1]) ? "lp" : "shards";
              addValue(record, key, ledgerNumber(nested[2]), line);
            } else {
              for (const parsedTicket of ledgerTickets(value)) {
                const ticket = ticketWithRecordContext(parsedTicket, title, value);
                if (ticket.error) skipped.push({ text: line, reason: ticket.error });
                else {
                  record.tickets.push({ ...ticket, raw: ticket.raw || line, sourceLine: line });
                  if (/(?:使用済|使用済み|両方使用済|全て使用済|消費済)/.test(value)) {
                    record.ticketUses.push({ ...ticket, raw: ticket.raw || line, sourceLine: line });
                  }
                }
              }
            }
          }
          continuation = null;
          continue;
        }

        if (label === "LP" || label === "欠片" || label === "自我の欠片") {
          const key = label === "LP" ? "lp" : "shards";
          addValue(record, key, ledgerNumber(value), line);
          keepNote(line);
          continuation = null;
          continue;
        }

        if (label === "獲得") {
          rewardContext = false;
          if (value) collectItems(value, acquired, "acquired");
          continuation = "acquired";
          keepNote(line);
          continue;
        }

        if (label === "指定") {
          rewardContext = false;
          if (value) collectItems(value, specified, "specified");
          continuation = "specified";
          keepNote(line);
          continue;
        }

        if (label === "該当人格" || label === "対象") {
          rewardContext = false;
          if (value) collectItems(value, targets, "targets");
          continuation = "targets";
          keepNote(line);
          continue;
        }

        if (label === "強化対象人格") {
          rewardContext = false;
          if (value) collectItems(value, targets, "targets");
          continuation = null;
          keepNote(line);
          continue;
        }

        if (label === "日時") {
          record.date = ledgerDate(value);
          if (!record.date && value) skipped.push({ text: line, reason: "日時の形式を YYYY/MM/DD として読めませんでした" });
          rewardContext = false;
          keepNote(line);
          continuation = null;
          continue;
        }

        if (label === "現在所持LP" || label === "現在所持欠片" ||
            label.toLowerCase() === "gm" || label === "備考" || label === "強化内容" ||
            label === "アイテム" || label === "欠片合計" || label === "合計") {
          rewardContext = false;
          keepNote(line);
          if (label === "アイテム" && value) {
            const glass = parseLegacyGlassGain(line);
            if (glass && !glass.error) record.itemGains.push(glass);
            else collectItems(value, acquired, "acquired");
          }
          continuation = label === "アイテム" ? "items" : null;
          continue;
        }

        if (/(?:チケ(?:ット)?|抽出🎫|テーマパック|テーマパーク|パック\s*[+＋]\s*\d|パック抽出)/i.test(line)) {
          const ticketRows = ledgerTickets(line).map((ticket) => ticketWithRecordContext(ticket, title, line));
          if (ticketRows.length) {
            for (const ticket of ticketRows) {
              if (ticket.error) {
                skipped.push({ text: line, reason: ticket.error });
                continue;
              }
              record.tickets.push({ ...ticket, raw: ticket.raw || line, sourceLine: line });
              if (/(?:使用済|使用済み|両方使用済|全て使用済|消費済)/.test(line)) {
                record.ticketUses.push({ ...ticket, raw: ticket.raw || line, sourceLine: line });
              }
            }
            if (/(?:使用済|使用済み|両方使用済|全て使用済|消費済)/.test(line)) {
              const gainedPrefix = line.match(/獲得\s*[：:]\s*/);
              const gainedText = gainedPrefix
                ? line.slice(gainedPrefix.index + gainedPrefix[0].length).replace(/[）)]+\s*$/, "").trim().replace(/[」』】]+$/g, "")
                : "";
              if (gainedText) {
                const convertedShards = ledgerShardConversion(gainedText);
                if (convertedShards !== null) {
                  addValue(record, "shards", convertedShards, line);
                } else {
                  const targetLines = ledgerItems(gainedText);
                  for (const target of targetLines) {
                    if (!target.name) continue;
                    record.identityCandidates.push(target.name);
                    record.rewardCandidates.push(target);
                  }
                }
              }
            }
            keepNote(line);
            continuation = null;
            continue;
          }
        }

        if (continuation === "acquired" || continuation === "specified" || continuation === "targets" || continuation === "items") {
          const glass = parseLegacyGlassGain(line);
          if (glass && !glass.error) {
            record.itemGains.push(glass);
            continuation = null;
            continue;
          }
          const item = ledgerItem(line);
          if (item.quantityInvalid) {
            skipped.push({ text: item.raw, reason: "取得品の個数が不正なため登録を保留しました" });
            continue;
          }
          if (continuation === "acquired") {
            addItem(record, acquired, item, "acquired");
            if (/人格抽出|人格指定抽出/.test(title)) record.identityCandidates.push(item.name);
          } else if (continuation === "specified") {
            addItem(record, specified, item, "specified");
            if (/初期作成/.test(title)) record.identityCandidates.push(item.name);
          } else if (continuation === "targets") addItem(record, targets, item, "targets");
          else if (continuation === "items") addItem(record, acquired, item, "acquired");
          continue;
        }

        const glassUse = ledgerGlassConsumption(line) || parseLegacyGlassUse(line);
        if (glassUse) {
          if (glassUse.error) skipped.push({ text: line, reason: glassUse.error });
          else record.consumedItems.push(glassUse);
          keepNote(line);
          continue;
        }
        const glassGain = parseLegacyGlassGain(line);
        if (glassGain) {
          if (glassGain.error) skipped.push({ text: line, reason: glassGain.error });
          else record.itemGains.push(glassGain);
          keepNote(line);
          continue;
        }
        if (rewardContext) {
          const convertedShards = ledgerShardConversion(line);
          if (convertedShards !== null) {
            addValue(record, "shards", convertedShards, line);
            keepNote(line);
            continuation = null;
            continue;
          }
          if (/[x×]\s*\d[\d,]*\s*$/i.test(toHalf(line))) {
            record.rewardCandidates.push(ledgerItem(line));
            keepNote(line);
            continuation = null;
            continue;
          }
        }
        keepNote(line);
        continuation = null;
      }

      /* 使用チケットの残高キーは報酬品の名前ではなく、消費欄に記載されたチケット種別で維持する。 */
      /* 過去ログの収入チケットは、種類が明示された場合だけチケット欄へ加算する。 */
      const consumedTicketCount = consumeLines.reduce((sum, line) => {
        const tickets = ledgerTickets(line);
        return sum + tickets.reduce((count, ticket) => count + (!ticket.error && ticket.kind ? ticket.count : 0), 0);
      }, 0);
      const aggregate = { lp: 0, shards: 0 };
      let hasCurrencyCost = false;
      let ambiguousCost = false;
      for (const line of consumeLines) {
        const parsed = ledgerCost(line);
        if (parsed.ambiguous) {
          ambiguousCost = true;
          skipped.push({ text: line, reason: "消費欄に複数通貨または判定できない金額があります。原文確認が必要です" });
          continue;
        }
        if (!parsed.found) continue;
        hasCurrencyCost = true;
        for (const key of ["lp", "shards"]) {
          const next = aggregate[key] + parsed.cost[key];
          if (Number.isSafeInteger(next)) aggregate[key] = next;
          else {
            ambiguousCost = true;
            skipped.push({ text: line, reason: "消費合計が安全整数の範囲を超えています" });
          }
        }
      }

      const isSync = /人格同期化依頼|人格同期化|同期化依頼/.test(title) && !/クールタイム|強制.*(?:開|明)|強化/.test(title);
      const isOperation = /クールタイム|強制.*(?:開|明)|人格強化|身体強化|特殊強化/.test(title);
      const isThemePackDraw = /テーマパック|テーマパーク/.test(title) && /抽出/.test(title);
      const hasPricedSpecifiedItem = specified.some((item) => item.priced && item.cost);
      let spendItems = isSync ? targets.slice() : acquired.length ? acquired.slice() : [];
      if (isThemePackDraw && !hasCurrencyCost && hasPricedSpecifiedItem) {
        /* テーマパックの「指定」は、抽出対象名とLP価格を明示する購入指定。 */
        spendItems = specified.filter((item) => item.priced && item.cost);
      }
      if (!spendItems.length && specified.length && /初期作成|指定(?:抽出|購入)|指定依頼/.test(title)) spendItems = specified.slice();
      if (isOperation && consumeLines.length) spendItems = [ledgerItem(title)];
      if (consumeLines.length && !spendItems.length && hasCurrencyCost) {
        spendItems = [ledgerItem(title)];
      }

      /* チケットだけの抽出を0LP/0欠片の支出明細に重複登録しない。 */
      const hasPricedPackPurchase = isThemePackDraw && !hasCurrencyCost && hasPricedSpecifiedItem;
      if (consumeLines.length && spendItems.length && !ambiguousCost
        && (hasCurrencyCost || hasPricedPackPurchase)) {
        const descriptions = spendItems.map((item) => item.priced ? item : ledgerItem(item.raw || item.name));
        const explicitAll = descriptions.every((item) => item.priced && item.cost);
        const explicitSum = descriptions.reduce((sum, item) => {
          if (item.cost) {
            sum.lp += item.cost.lp;
            sum.shards += item.cost.shards;
          }
          return sum;
        }, { lp: 0, shards: 0 });

        let useExplicit = explicitAll;
        /* 個別品が欠片建て、消費欄がLP建て（またはその逆）なら、異なる通貨の併存。
           例：E.G.O 9品を各50欠片で購入し、別途LP450を消費。片方を上書きしない。 */
        const hasMatchingShardSubtotal = record.raw.some((line) => {
          const match = toHalf(line).match(/^欠片合計\s*[:：]\s*(?:.*[=＝]\s*)?(\d[\d,]*)\s*(?:欠片)?\s*$/i);
          return Boolean(match && safeAmount(match[1]) === explicitSum.shards);
        });
        const complementaryCurrencyCosts = explicitAll && hasCurrencyCost && hasMatchingShardSubtotal && (
          (explicitSum.lp === 0 && explicitSum.shards > 0 && aggregate.lp > 0 && aggregate.shards === 0) ||
          (explicitSum.shards === 0 && explicitSum.lp > 0 && aggregate.shards > 0 && aggregate.lp === 0)
        );
        if (explicitAll && hasCurrencyCost && !totalCostsEqual(explicitSum, aggregate) && !complementaryCurrencyCosts) {
          skipped.push({
            text: "消費：" + consumeLines.join("、") + " / 獲得：" + descriptions.map((item) => item.raw).join("、"),
            reason: "消費欄の通貨・合計と獲得品の個別価格が一致しません。個別価格は保持しましたが、原文の確認が必要です"
          });
        }

        if (useExplicit) {
          for (const item of descriptions) {
            record.spends.push({
              name: item.name,
              cost: { lp: item.cost.lp, shards: item.cost.shards },
              needsDecision: null, reason: null, kindHint: hintOf(item.name), raw: item.raw
            });
          }
          if (complementaryCurrencyCosts) {
            record.spends.push({
              name: title,
              cost: { lp: aggregate.lp, shards: aggregate.shards },
              needsDecision: null, reason: null, kindHint: null,
              raw: consumeLines.join("、")
            });
          }
        } else {
          const freeCount = /抽出/.test(title) ? Math.min(consumedTicketCount, descriptions.length) : 0;
          const paidCount = descriptions.length - freeCount;
          const divisible = (key) => paidCount > 0
            ? aggregate[key] % paidCount === 0
            : aggregate[key] === 0;
          if ((aggregate.lp || aggregate.shards) && (!divisible("lp") || !divisible("shards"))) {
            skipped.push({
              text: "消費：" + consumeLines.join("、"),
              reason: "獲得品ごとの費用配分が一意に決まらないため、合計費用は1件の支出として記録しました。品目別の配分は原文確認が必要です"
            });
            record.spends.push({
              name: title, cost: { lp: aggregate.lp, shards: aggregate.shards },
              needsDecision: null, reason: null, kindHint: null, raw: consumeLines.join("、")
            });
          } else {
            descriptions.forEach((item, index) => {
              const free = index < freeCount;
              record.spends.push({
                name: item.name,
                cost: free ? { lp: 0, shards: 0 } : {
                  lp: paidCount ? aggregate.lp / paidCount : 0,
                  shards: paidCount ? aggregate.shards / paidCount : 0
                },
                needsDecision: null, reason: null, kindHint: hintOf(item.name), raw: item.raw
              });
            });
          }
        }
      } else if (consumeLines.length && hasCurrencyCost && !spendItems.length && !ambiguousCost) {
        record.spends.push({
          name: title, cost: { lp: aggregate.lp, shards: aggregate.shards },
          needsDecision: null, reason: null, kindHint: hintOf(title), raw: consumeLines.join("、")
        });
      }

      /* 記録欄に残った明示的な獲得物は、通貨として二重計上せず注記として保持する。 */
      const hasAnything = Boolean(record.title) || record.income.lp || record.income.shards ||
        record.tickets.length || (record.ticketUses || []).length || record.spends.length || record.consumedItems.length ||
        record.itemGains.length || record.raw.length;
      if (hasAnything) records.push(record);
    }
    return { records, skipped };
  }

  function parseText(rawText) {
    const originalText = String(rawText ?? "");
    if (/^\s*[▼▽]\s*\S/m.test(originalText) && /(?:日時|報酬|現在所持LP|現在所持欠片)/.test(originalText)) {
      return parseLedgerJournal(originalText);
    }
    const normalizedInput = normalizeInputText(originalText);
    const sourceText = normalizedInput.text;
    const wrappedInput = normalizedInput.wrapped;
    const wrappedHasTitles = wrappedInput && /^\s*【[^】]+】/m.test(sourceText);
    const records = [];
    const skipped = [];
    let current = null;

    const flush = () => {
      if (!current) return;
      /* 見出しも本文も無い帖はリザルトにならない */
      const empty = !current.title && !current.income.lp && !current.income.shards
        && !current.tickets.length && !current.spends.length
        && !(current.consumedItems || []).length && !(current.itemGains || []).length && !(current.raw || []).length;
      if (empty) current = null;
      else { records.push(current); current = null; }
    };
    const open = (title, author) => {
      flush();
      current = { title: title || null, author: author || null, income: { lp: 0, shards: 0 }, tickets: [], spends: [], deltas: [], consumedItems: [], itemGains: [], raw: [] };
      return current;
    };

    /* 入力内に旧形式の見出しがあるなら、先頭の「通過3」などの案内行は
       リザルト外のタイトルとして扱い、読み取りエラーへ積まない。 */
    let legacyMode = /^\s*『[^』]+』(?:\s+.*)?\s*$/m.test(sourceText);
    for (const rawLine of sourceText.split(/\r?\n/)) {
      let line = rawLine.trim();
      /* [Input] のある共有文書では、空行は段落・表の余白として扱う。
         次の見出しが来た時点で open() が前のリザルトを確実に確定する。 */
      if (!line) { if (!legacyMode && !wrappedHasTitles) flush(); continue; }

      /* 旧記録の見出し。タイトルの右側に「合計：97LP+47欠片」が続く形も許可。 */
      const legacyHeader = line.match(/^『\s*(.+?)\s*』\s*(.*)$/);
      if (legacyHeader) {
        legacyMode = true;
        open(legacyHeader[1].trim(), null);
        line = legacyHeader[2].trim();
        if (!line) continue;
      }

      /* 硝子の破片消費は装飾見出しとして処理せず、直前のリザルトへ記録する。 */
      const legacyUse = parseLegacyGlassUse(line);
      if (legacyUse) {
        if (!current) open(null, null);
        if (legacyUse.error) skipped.push({ text: rawLine.trim(), reason: legacyUse.error });
        else current.consumedItems.push(legacyUse);
        continue;
      }
      if (legacyMode && current) {
        const legacyIncome = parseLegacyIncome(line);
        if (legacyIncome) {
          if (legacyIncome.error) skipped.push({ text: line, reason: legacyIncome.error });
          else {
            const lp = current.income.lp + legacyIncome.lp;
            const shards = current.income.shards + legacyIncome.shards;
            if (Number.isSafeInteger(lp) && Number.isSafeInteger(shards)) current.income = { lp, shards };
            else skipped.push({ text: line, reason: "リザルト収入の合計が安全整数の範囲を超えています" });
          }
          continue;
        }
        const ticket = parseLegacyTicket(line);
        if (ticket) {
          if (ticket.error) skipped.push({ text: line, reason: ticket.error });
          else current.tickets.push({ ...ticket, raw: line });
          continue;
        }
        const glassGain = parseLegacyGlassGain(line);
        if (glassGain) {
          if (glassGain.error) skipped.push({ text: line, reason: glassGain.error });
          else current.itemGains.push(glassGain);
          continue;
        }
        /* 同期CTや報酬名など、専用項目化していない文章もリザルトの注記として保持。 */
        current.raw.push(line);
        continue;
      }

      if (legacyMode && !current) continue;

      /* 見出し行。装飾文字（絵字等）は読み飛ばす。
         開く括弧の直前を英数字・記号に限定する。さもないと
         EGO解析-TETH[鬼退治](40欠片) が見出し「鬼退治」に化ける。 */
      const header = line.match(/^([^A-Za-z0-9_\-—・･/／【\[《]{0,8})[【\[《]\s*(.+?)\s*[\]】》]\s*(.*)$/);
      if (header) {
        /* 1=装飾文字の直前 2=シナリオ名 3=後ろに付いた書き方（作：…など） */
        const tail = toHalf(header[3] || "");
        const by = tail.match(/(?:作|作成者|著者)\s*[:：]\s*([^)]*)\)?\s*$/);
        open(header[2].trim(), by ? by[1].trim() : null);
        continue;
      }

      /* 見出し｜本文 */
      const section = line.match(/^([^｜|]{1,14})[｜|]\s*(.*)$/);
      if (section) {
        const label = section[1].replace(/[\s・･]/g, "");
        const kind = SECTIONS[label];
        if (!kind) { skipped.push({ text: line, reason: "見出しが不明" }); continue; }
        if (!current) open(null, null);
        for (const item of splitTop(section[2], (c) => c === "/")) {
          if (kind === "income") {
            /* 硝子の破片／欠片の別表記は通貨収入へ混ぜず、アイテム獲得として保存する。 */
            const glassGain = parseLegacyGlassGain(item);
            if (glassGain) {
              if (glassGain.error) skipped.push({ text: item, reason: glassGain.error });
              else current.itemGains.push(glassGain);
              continue;
            }
            const got = readReward(item);
            if (!got) { skipped.push({ text: item, reason: "報酬の書式が読めない" }); continue; }
            if (got.invalidDelta) skipped.push({ text: item, reason: "増減欄の金額形式が不正です" });
            if (got.ticket) { current.tickets.push(got.ticket); current.deltas.push(...(got.deltas || [])); continue; }
            const nextIncome = current.income[got.currency] + got.value;
            if (!Number.isSafeInteger(nextIncome)) {
              skipped.push({ text: item, reason: "収入合計が安全整数の範囲を超えています" });
              continue;
            }
            current.income[got.currency] = nextIncome;
            for (const d of got.deltas || []) current.deltas.push({ currency: got.currency, value: d.value * (d.sign === "-" ? -1 : 1) });
            continue;
          }
          const { name, parens } = splitNameAndParens(item);
          if (!name) { skipped.push({ text: item, reason: "名前が無い" }); continue; }
          const cost = parens ? costFromParens(parens) : null;
          current.spends.push({
            name,
            cost: cost ? { lp: cost.lp, shards: cost.shards } : { lp: 0, shards: 0 },
            needsDecision: !cost || cost.ambiguous || null,
            reason: !cost ? "金額が読めない" : cost.ambiguous ? "金額が決められない" : null,
            kindHint: hintOf(name),
            raw: item
          });
        }
        continue;
      }

      /* 見出しも ｜ も無い行。読み方が分からないので理由つきの skipped にする。 */
      skipped.push({ text: line, reason: "見出しも区切りも無い" });
    }
    flush();
    return { records, skipped };
  }

  /* 明細の種別。解決器が种类を返したらそれを優先し、なければ名前から推測した
  ヒントを使う。どれにも当たらないものは手動支出（判断は利用者に残す）。 */
  function kindOf(spend, resolve) {
    const hit = typeof resolve === "function" ? resolve(spend.name) : null;
    const kinds = (hit && hit.kinds) || [];
    const priced = kinds.find((k) => k.kind === "spirit") || kinds.find((k) => k.kind === "enhancement")
      || kinds.find((k) => k.kind === "deathSupport") || kinds.find((k) => k.kind === "support");
    if (priced) return { kind: priced.kind === "deathSupport" ? "deathSupport" : priced.kind, dbName: (hit && (hit.dbName || hit.name)) || spend.name };
    if (spend.kindHint === "ego") return { kind: "ego", dbName: spend.name };
    if (spend.kindHint === "persona") return { kind: "persona", dbName: spend.name };
    return { kind: "expense", dbName: spend.name };
  }


  /* 旧ログの注記欄に入った人格名を、所持DBへ照合する。
     自動で正体を断定せず、解決候補をプレビューに出して確認後に所持へ追加する。 */
  function canBeIdentityLine(raw) {
    const line = String(raw || "").trim();
    if (line.length < 2 || line.length > 120) return false;
    if (/^[【\[『「《]/.test(line)) return false;
    if (/^(?:報酬|購入|追加購入|支出|支払い|消費|獲得|日時|GM|備考|現在所持LP|現在所持欠片|LP|自我の欠片|欠片|アイテム|指定|対象|該当人格|強化対象人格|強化内容|合計|RPボーナス)\s*[｜|：:]/.test(line)) return false;
    if (/(?:\bLP\b|ＬＰ|欠片|カケラ|かけら|硝子の(?:破片|欠片|かけら)|人格ガチャ|抽出チケット|同期(?:化|MAX)?|CT\s*\d|サポ(?:パ|スロ)|精神\s*[:：]|購入|消費|支払|ファンブル|ダイスバトル|現在値?\s*\d)/i.test(line)) return false;
    return !/^\d[\d,.\s]*$/.test(line);
  }

  function personaKindsOf(hit) {
    return ((hit && hit.kinds) || []).filter((kind) =>
      kind.kind === "persona" && kind.no !== undefined && (kind.mode === "n" || kind.mode === "t"));
  }

  /* 提案済みリザルト + 明細を reducer の action 並びへ落とす。
     excluded: Set(添字) を渡すと、その明細は作らない。 */
  function plan(parsed, options) {
    const opts = options || {};
    const excluded = opts.excluded || new Set();
    const actions = [];
    const skipped = (parsed.skipped || []).slice();
    const identities = [];
    const excludedIdentities = opts.excludedIdentities instanceof Set ? opts.excludedIdentities : new Set();
    const ownedPersonas = opts.ownedPersonas instanceof Set ? opts.ownedPersonas : new Set(opts.ownedPersonas || []);
    const ownedEgos = opts.ownedEgos instanceof Set ? opts.ownedEgos : new Set(opts.ownedEgos || []);
    const ownedSupports = opts.ownedSupports instanceof Set ? opts.ownedSupports : new Set(opts.ownedSupports || []);
    const ownedSpirits = opts.ownedSpirits instanceof Set ? opts.ownedSpirits : new Set(opts.ownedSpirits || []);
    const importedPersonaKeys = new Set();
    const importedEgoKeys = new Set();
    const importedSupportNames = new Set();
    const importedSpiritNames = new Set();
    const itemBalances = opts.ownedItems instanceof Map
      ? new Map(opts.ownedItems)
      : new Map(Object.entries(opts.ownedItems || {}).map(([id, quantity]) => [String(id), Number(quantity) || 0]));
    const addInventoryGain = (itemId, quantity) => {
      actions.push({ type: "ADD_ITEM_INVENTORY", itemId, quantity });
      itemBalances.set(String(itemId), (itemBalances.get(String(itemId)) || 0) + quantity);
    };
    const applyTicketResolution = (ticket, recordIndex) => {
      const override = opts.ticketResolved?.[ticketResolutionKey(recordIndex, ticket)];
      if (!override || typeof override !== "object") return ticket;
      const kind = String(override.kind || "");
      if (kind === "persona" || kind === "ego" || kind === "choice") {
        const { pack: _ignoredPack, ...base } = ticket;
        return { ...base, kind };
      }
      if (kind === "pack") {
        const pack = String(override.pack || ticket.pack || "").trim();
        return { ...ticket, kind, ...(pack ? { pack } : { pack: "" }) };
      }
      return ticket;
    };
    let legacyUseSequence = 0;

    for (const [recordIndex, record] of (parsed.records || []).entries()) {
      const title = record.title || "無題";
      const note = record.author ? `作：${record.author}` : "";
      const acceptedTickets = [];
      const ticketTotals = new Map();
      for (const rawTicket of record.tickets || []) {
        const ticket = applyTicketResolution(rawTicket, recordIndex);
        const kind = ticket?.kind;
        const pack = kind === "pack" ? String(ticket?.pack || "").trim() : "";
        const knownKind = kind === "persona" || kind === "ego" || kind === "choice";
        if (!knownKind && !(kind === "pack" && pack)) {
          skipped.push({ text: ticket?.sourceLine || ticket?.raw || "抽出チケット", reason: "チケット種別が不明なため、収入へ確定できません" });
          continue;
        }
        const count = Number(ticket?.count);
        if (!Number.isSafeInteger(count) || count < 0) {
          skipped.push({ text: ticket?.sourceLine || ticket?.raw || "抽出チケット", reason: "チケット枚数が不正です" });
          continue;
        }
        const totalKey = kind === "pack" ? "pack:" + pack : kind;
        const nextCount = (ticketTotals.get(totalKey) || 0) + count;
        if (!Number.isSafeInteger(nextCount)) {
          skipped.push({ text: ticket?.sourceLine || ticket?.raw || "抽出チケット", reason: "同種チケットの合計が安全整数の範囲を超えています" });
          continue;
        }
        ticketTotals.set(totalKey, nextCount);
        acceptedTickets.push(ticket);
      }
      const legacyNotes = (record.raw || []).map((line) => String(line || "").trim()).filter(Boolean);
      const itemGainNotes = (record.itemGains || []).map((item) => `${item.itemName} ×${item.quantity}（獲得記録）`);
      const acquisitionNotes = [...(record.acquisitions || []), ...(record.specifiedItems || [])]
        .map((item) => `${item.name}${Number(item.quantity) > 1 ? ` ×${item.quantity}` : ""}（取得記録）`);
      const fullNote = [note, ...legacyNotes, ...itemGainNotes, ...acquisitionNotes].filter(Boolean).join("\n").slice(0, 2000);
      const resultAction = {
        type: "ADD_RESULT",
        name: title,
        date: record.date || "",
        income: { lp: record.income.lp, shards: record.income.shards, tickets: ticketIncome(acceptedTickets) },
        note: fullNote,
        consumedItems: record.journalFormat === true ? [] : (record.consumedItems || []).map((item) => {
          const operationId = `legacy-use-${Date.now()}-${legacyUseSequence++}`;
          return { ...item, id: operationId, operationId, consumedAt: Date.now() };
        })
      };
      actions.push(resultAction);

      for (const rawTicketUse of record.ticketUses || []) {
        const ticketUse = applyTicketResolution(rawTicketUse, recordIndex);
        const kind = ticketUse?.kind;
        const pack = kind === "pack" ? String(ticketUse?.pack || "").trim() : "";
        const knownKind = kind === "persona" || kind === "ego" || kind === "choice";
        const count = Number(ticketUse?.count);
        if ((!knownKind && !(kind === "pack" && pack)) ||
            !Number.isSafeInteger(count) || count <= 0) {
          skipped.push({
            text: ticketUse?.sourceLine || ticketUse?.raw || "抽出チケット",
            reason: "使用したチケットの種類または枚数を一意に判定できず、所持残数からは差し引いていません"
          });
          continue;
        }
        actions.push({
          type: "SPEND_TICKET",
          kind,
          ...(kind === "pack" ? { pack } : {}),
          count: -count,
          ref: { kind: "textImportTicketUse" }
        });
      }

      const identityRows = record.journalFormat === true
        ? (Array.isArray(record.identityCandidates) ? record.identityCandidates : [])
        : (record.raw || []);
      const identityNames = new Set(identityRows.map((line) => String(line || "").trim()));
      /* 限定した表記揺れだけを試す。部分一致・類似名からの推測は行わない。 */
      const resolveImportedName = (value) => {
        if (typeof opts.resolve !== "function") return null;
        const source = String(value || "").trim();
        if (!source) return null;
        const directHit = opts.resolve(source);
        if (directHit) return directHit;

        const toAsciiRoman = (text) => String(text || "").replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]/g, (letter) => ({
          "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI",
          "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X", "Ⅺ": "XI", "Ⅻ": "XII"
        })[letter] || letter);
        const variants = [];
        const seen = new Set([source]);
        const add = (candidate) => {
          const name = String(candidate || "").trim();
          if (name && !seen.has(name)) { seen.add(name); variants.push(name); }
        };
        const addKnownSpellingVariants = (candidate) => {
          add(candidate.replace(/金鎚/g, "金槌"));
          add(toAsciiRoman(candidate));
          add(toAsciiRoman(candidate.replace(/金鎚/g, "金槌")));
        };

        const rankPrefixedEgo = source.match(/^(?:ZAYIN|TETH|HE|WAW|ALEPH)\s+(.+)$/i);
        if (rankPrefixedEgo) {
          add(rankPrefixedEgo[1]);
          addKnownSpellingVariants(rankPrefixedEgo[1]);
        }
        /* 実記録では「WAW 悪への道：厄災の狸」となっていたが、
           DB の正式名は「悪道：厄災の狸」。この一つの表記揺れだけを橋渡しする。 */
        if (/^WAW\s+悪への道[:：]厄災の狸$/i.test(source)) add("悪道：厄災の狸");
        addKnownSpellingVariants(source);
        const withoutPersonaSuffix = source.replace(/の人格$/, "").trim();
        if (withoutPersonaSuffix !== source) addKnownSpellingVariants(withoutPersonaSuffix);

        for (const candidate of variants) {
          const hit = opts.resolve(candidate);
          if (hit) return hit;
        }
        return null;
      };
      const addResolvedAsset = (item, warnIfUnknown) => {
        const source = String(item?.name || "").trim();
        if (!source) return false;
        const quantity = Number(item?.quantity ?? 1);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || item?.quantityInvalid) {
          skipped.push({ text: item?.raw || source, reason: "取得品の個数が不正なため登録を保留しました" });
          return true;
        }

        /* 物品カタログとの完全一致だけを自動採用する。略称・部分一致から
           別アイテムを勝手に増やさない。 */
        const itemHit = typeof opts.resolveItem === "function" ? opts.resolveItem(source) : null;
        const itemId = itemHit && String(itemHit.itemId || itemHit.id || "");
        if (itemId && itemHit.ledgerResource !== "shards") {
          addInventoryGain(itemId, quantity);
          return true;
        }

        const hit = resolveImportedName(source);
        const kinds = (hit && Array.isArray(hit.kinds)) ? hit.kinds : [];
        const personas = personaKindsOf(hit);
        if (personas.length === 1) {
          const kind = personas[0];
          const personaKey = `${kind.mode}:${kind.no}`;
          if (!identityNames.has(source) && !ownedPersonas.has(personaKey) && !importedPersonaKeys.has(personaKey)) {
            importedPersonaKeys.add(personaKey);
            actions.push({ type: "ADD_ROSTER", mode: kind.mode, no: kind.no, purchase: false, skipInitialTicketConsumption: true, via: title ? [title] : [] });
          }
          return true;
        }

        if (kinds.length === 1) {
          const kind = kinds[0];
          if (kind.kind === "ego" && kind.rank && kind.no !== undefined) {
            const egoKey = `${kind.rank}:${kind.no}`;
            if (!ownedEgos.has(egoKey) && !importedEgoKeys.has(egoKey)) {
              importedEgoKeys.add(egoKey);
              actions.push({ type: "ADD_ROSTER_EGO", rank: kind.rank, no: kind.no, purchase: false, via: title ? [title] : [] });
            }
            return true;
          }
          if (kind.kind === "support" || kind.kind === "deathSupport") {
            const name = String(hit.name || source);
            if (!ownedSupports.has(name) && !importedSupportNames.has(name)) {
              importedSupportNames.add(name);
              actions.push({ type: "ADD_ROSTER_SUPPORT", spp: { name }, purchase: false, via: title ? [title] : [] });
            }
            return true;
          }
          if (kind.kind === "spirit") {
            const name = String(hit.name || source);
            if (!ownedSpirits.has(name) && !importedSpiritNames.has(name)) {
              importedSpiritNames.add(name);
              actions.push({ type: "ADD_ROSTER_SPIRIT", spirit: { name }, purchase: false, via: title ? [title] : [] });
            }
            return true;
          }
          /* DB上で別カテゴリと明確に解決した行は人格候補に回さない。 */
          return true;
        }
        if (warnIfUnknown && !identityNames.has(source)) {
          skipped.push({ text: item?.raw || source, reason: "取得品をアイテムDBまたは所持データへ一意に照合できず、原文注記のみ保持しました" });
        }
        return false;
      };

      for (const item of record.itemGains || []) {
        const itemId = String(item?.itemId || "");
        const quantity = Number(item?.quantity);
        if (itemId && Number.isSafeInteger(quantity) && quantity > 0) {
          addInventoryGain(itemId, quantity);
        } else {
          skipped.push({ text: item?.detail || item?.itemName || "アイテム獲得", reason: "アイテムの個数または識別子が不正です" });
        }
      }
      const acquisitions = [...(record.acquisitions || [])];
      if (!acquisitions.length && /初期作成/.test(title)) acquisitions.push(...(record.specifiedItems || []));
      for (const item of acquisitions) addResolvedAsset(item, true);
      for (const item of record.rewardCandidates || []) addResolvedAsset(item, false);

      if (record.journalFormat === true) {
        const useRows = [...(record.consumedItems || [])].map((item) => ({
          itemId: String(item?.itemId || ""),
          itemName: String(item?.itemName || item?.name || item?.itemId || ""),
          quantity: Number(item?.quantity),
          reason: String(item?.reason || "consumption"),
          detail: String(item?.detail || item?.raw || item?.itemName || "")
        }));
        if (typeof opts.resolveItemUse === "function") {
          for (const line of record.itemUseCandidates || []) {
            const use = opts.resolveItemUse(line);
            if (use && use.itemId) useRows.push({
              itemId: String(use.itemId),
              itemName: String(use.itemName || use.name || use.itemId),
              quantity: Number(use.quantity || 1),
              reason: String(use.reason || "consumption"),
              detail: String(line || "")
            });
          }
        }
        useRows.forEach((use, useIndex) => {
          if (!use.itemId || !Number.isSafeInteger(use.quantity) || use.quantity <= 0) {
            skipped.push({ text: use.detail || use.itemName, reason: "アイテム消費個数を正しく読めませんでした" });
            return;
          }
          const available = itemBalances.get(use.itemId) || 0;
          if (available >= use.quantity) {
            const operationId = `text-use-${Date.now()}-${recordIndex}-${useIndex}`;
            actions.push({
              type: "CONSUME_ITEM", itemId: use.itemId, quantity: use.quantity,
              reason: use.reason, operationId
            });
            itemBalances.set(use.itemId, available - use.quantity);
          } else {
            resultAction.consumedItems.push({
              itemId: use.itemId, itemName: use.itemName, quantity: use.quantity,
              reason: use.reason, detail: use.detail
            });
            skipped.push({
              text: use.detail || use.itemName,
              reason: "消費は記録しましたが、取込前からの所持数と今回の獲得数だけでは在庫が足りないため、在庫は減らしていません"
            });
          }
        });
      }

      /* 旧形式は raw 注記から、ジャーナル形式は指定された人格候補だけを照合する。 */
      identityRows.forEach((rawLine, rawIndex) => {
        const source = String(rawLine || "").trim();
        const validJournalIdentity = record.journalFormat === true
          ? source.length >= 2 && source.length <= 180 && !/^\d[\d,.\s]*$/.test(source)
          : canBeIdentityLine(source);
        if (!validJournalIdentity || typeof opts.resolve !== "function") return;
        const key = `${recordIndex}:${rawIndex}`;
        const overrideName = opts.identityResolved && opts.identityResolved[key];
        const initialHit = overrideName ? opts.resolve(overrideName) : resolveImportedName(source);
        const kinds = personaKindsOf(initialHit);
        if (kinds.length === 1) {
          const kind = kinds[0];
          const personaKey = `${kind.mode}:${kind.no}`;
          const owned = ownedPersonas.has(personaKey);
          const duplicate = importedPersonaKeys.has(personaKey);
          const candidate = {
            key, recordIndex, rawIndex, source, name: initialHit.name,
            mode: kind.mode, no: kind.no, confidence: initialHit.confidence || "unknown",
            owned, duplicate, options: [], unresolved: false
          };
          identities.push(candidate);
          if (!owned && !duplicate && !excludedIdentities.has(key)) {
            importedPersonaKeys.add(personaKey);
            actions.push({ type: "ADD_ROSTER", mode: kind.mode, no: kind.no, purchase: false, skipInitialTicketConsumption: true, via: title ? [title] : [] });
          }
          return;
        }
        /* 明確に別カテゴリと分かった行は、人格候補へ誤分類しない。 */
        if (initialHit && Array.isArray(initialHit.kinds) && initialHit.kinds.length) return;
        const suggested = typeof opts.suggestPersona === "function"
          ? (opts.suggestPersona(source) || []).filter((item) => item && item.kind === "persona" && item.name)
          : [];
        const options = suggested.filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index).slice(0, 6);
        if (overrideName) {
          skipped.push({ text: source, reason: "選択した人格をDBで一意に解決できませんでした" });
          return;
        }
        if (options.length) {
          identities.push({ key, recordIndex, rawIndex, source, name: null, mode: null, no: null, confidence: null, owned: false, duplicate: false, options, unresolved: true });
        } else {
          identities.push({ key, recordIndex, rawIndex, source, name: null, mode: null, no: null, confidence: null, owned: false, duplicate: false, options: [], unresolved: true });
        }
      });

      record.spends.forEach((spend, index) => {
        const exclusionKey = `${recordIndex}:${index}`;
        /* 数値キーは最初のリザルトだけ旧形式として後方互換を保つ。 */
        if (excluded.has(exclusionKey) || (recordIndex === 0 && excluded.has(index))) return;
        if (spend.needsDecision) { skipped.push({ text: spend.raw || spend.name, reason: spend.reason || "要確認" }); return; }
        const { kind, dbName } = kindOf(spend, opts.resolve);
        actions.push({ type: "ADD_ENTRY", kind, name: dbName, cost: { lp: spend.cost.lp, shards: spend.cost.shards } });
      });
    }
    return { actions, skipped, identities };
  }

  /* 報酬のチケット数を受領の積に直す。種類が分からないものは choice ではなく
     unknown にして、利用者に選んでもらう（勝手に人格と決めない）。 */
  function ticketIncome(tickets) {
    const out = { persona: 0, ego: 0, choice: 0, pack: {} };
    for (const t of tickets || []) {
      const count = Number(t?.count) || 0;
      if (t.kind === "persona" || t.kind === "ego" || t.kind === "choice") out[t.kind] += count;
      else if (t.kind === "pack" && typeof t.pack === "string" && t.pack.trim()) {
        const pack = t.pack.trim();
        const current = Object.prototype.hasOwnProperty.call(out.pack, pack) ? out.pack[pack] : 0;
        const next = current + count;
        if (Number.isSafeInteger(next) && next >= 0) {
          Object.defineProperty(out.pack, pack, { value: next, writable: true, enumerable: true, configurable: true });
        }
      }
    }
    return out;
  }

  const api = { parseText, plan, ticketResolutionKey };
  if (typeof window !== "undefined") window.LBT_textImport = api;
})();