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
    .replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
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
    const shards = [...text.matchAll(/(\d[\d,]*)\s*(?:欠片|欠けら|欠牁|カケラ|かけら|けっか)/g)];
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

  const SHARD_WORD = /欠片|欠けら|欠牁|カケラ|かけら|けっか/;
  const LP_WORD = /\d\s*(?:lp|LP|Lp)$|lp\s*\d/i;

  /* 報酬行の 1 項目。例: LP:150(+9) / 自我の欠片:70(+16) / 人格抽出チケットx1 */
  function readReward(item) {
    const text = toHalf(item);
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
    const text = toHalf(line).replace(/硝子の(?:破片|かけら|カケラ)/g, " ");
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
    if (!/硝子の(?:破片|かけら|カケラ)/.test(text) || /(?:使用|消費)/.test(text)) return null;
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
    if (!/硝子の(?:破片|かけら|カケラ)/.test(text) || !/(?:使用|消費)/.test(text)) return null;
    const match = text.match(/硝子の(?:破片|かけら|カケラ)\s*(?:を\s*)?(?:(\d[\d,]*)\s*(?:個|つ)?|[x×]\s*(\d[\d,]*)|([一二三四五六七八九十]+)\s*(?:個|つ)?)\s*(?:を\s*)?(?:使用|消費)/);
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

  function parseText(rawText) {
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
    let legacyMode = /^\s*『[^』]+』(?:\s+.*)?\s*$/m.test(String(rawText ?? ""));
    for (const rawLine of String(rawText ?? "").split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line) { if (!legacyMode) flush(); continue; }

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
    if (/^(?:報酬|購入|追加購入|支出|支払い|消費|保管物|所持物)\s*[｜|：:]/.test(line)) return false;
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
    const importedPersonaKeys = new Set();
    let legacyUseSequence = 0;

    for (const [recordIndex, record] of (parsed.records || []).entries()) {
      const title = record.title || "無題";
      const note = record.author ? `作：${record.author}` : "";
      const acceptedTickets = [];
      const ticketTotals = new Map();
      for (const ticket of record.tickets || []) {
        const kind = ticket?.kind;
        const pack = kind === "pack" ? String(ticket?.pack || "").trim() : "";
        const knownKind = kind === "persona" || kind === "ego" || kind === "choice";
        if (!knownKind && !(kind === "pack" && pack)) {
          skipped.push({ text: ticket?.raw || "抽出チケット", reason: "チケット種別が不明なため、収入へ確定できません" });
          continue;
        }
        const count = Number(ticket?.count);
        if (!Number.isSafeInteger(count) || count < 0) {
          skipped.push({ text: ticket?.raw || "抽出チケット", reason: "チケット枚数が不正です" });
          continue;
        }
        const totalKey = kind === "pack" ? "pack:" + pack : kind;
        const nextCount = (ticketTotals.get(totalKey) || 0) + count;
        if (!Number.isSafeInteger(nextCount)) {
          skipped.push({ text: ticket?.raw || "抽出チケット", reason: "同種チケットの合計が安全整数の範囲を超えています" });
          continue;
        }
        ticketTotals.set(totalKey, nextCount);
        acceptedTickets.push(ticket);
      }
      const legacyNotes = (record.raw || []).map((line) => String(line || "").trim()).filter(Boolean);
      const itemGainNotes = (record.itemGains || []).map((item) => `${item.itemName} ×${item.quantity}（獲得記録）`);
      const fullNote = [note, ...legacyNotes, ...itemGainNotes].filter(Boolean).join("\n").slice(0, 2000);
      actions.push({
        type: "ADD_RESULT",
        name: title,
        income: { lp: record.income.lp, shards: record.income.shards, tickets: ticketIncome(acceptedTickets) },
        note: fullNote,
        consumedItems: (record.consumedItems || []).map((item) => {
          const operationId = `legacy-use-${Date.now()}-${legacyUseSequence++}`;
          return { ...item, id: operationId, operationId, consumedAt: Date.now() };
        })
      });

      /* legacy raw に残っている報酬名・ガチャ結果を DB と照合する。
         不一致や複数候補は手動選択へ回し、推測で所持人格を増やさない。 */
      (record.raw || []).forEach((rawLine, rawIndex) => {
        const source = String(rawLine || "").trim();
        if (!canBeIdentityLine(source) || typeof opts.resolve !== "function") return;
        const key = `${recordIndex}:${rawIndex}`;
        const overrideName = opts.identityResolved && opts.identityResolved[key];
        const initialHit = opts.resolve(overrideName || source);
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
        /* 旧 API の数値キーは最初のリザルトだけ後方互換で受け付ける。 */
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

  const api = { parseText, plan };
  if (typeof window !== "undefined") window.LBT_textImport = api;
})();