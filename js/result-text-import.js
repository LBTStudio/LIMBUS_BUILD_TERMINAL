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

  /* 深さ 0 の位置だけで切る。括弧と鉤括弧の中の / や ｜ は区切りではない
     （人格抽出x2(無料1/100LP) が 3 つに割れてはいけない）。 */
  function splitTop(text, isSeparator) {
    const out = [];
    let depth = 0;
    let buf = "";
    const src = String(text ?? "");
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (c === "(" || c === "[" || c === "{" || c === "（") depth += 1;
      else if (c === ")" || c === "]" || c === "}" || c === "）") depth = Math.max(0, depth - 1);
      if (depth === 0 && isSeparator(c)) { out.push(buf); buf = ""; continue; }
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
  function costFromParens(text) {
    const lp = [...text.matchAll(/(\d[\d,]*)\s*(?:lp|LP|Lp)/g)];
    const shards = [...text.matchAll(/(\d[\d,]*)\s*(?:欠片|欠牁|カケラ|かけら|けっか)/g)];
    const one = (list) => (list.length === 1 ? Number(list[0][1].replace(/,/g, "")) : null);
    const l = one(lp);
    const s = one(shards);
    if (l === null && s === null) return null;
    /* 括弧の中の数字が、通貨として拾えた数字より多いなら余分がある
       （無料1/100LP の 1 や、150LP/50欠片 の両方）。 */
    const numbers = (text.match(/\d[\d,]*/g) || []).length;
    const recognized = lp.length + shards.length;
    return {
      lp: l || 0, shards: s || 0,
      ambiguous: lp.length + shards.length > 1 || numbers > recognized
    };
  }

  /* 末尾の括弧書きを取り除く。名前はそれ以外。 */
  function splitNameAndParens(text) {
    const m = String(text).match(/^(.*?)((?:\([^()]*\))*[()]?)\s*$/);
    if (!m || !m[2].trim()) return { name: String(text).trim(), parens: "" };
    const name = m[1].trim();
    return name ? { name, parens: m[2] } : { name: String(text).trim(), parens: "" };
  }

  const SHARD_WORD = /欠片|欠牁|カケラ|かけら|けっか/;
  const LP_WORD = /\d\s*(?:lp|LP|Lp)$|lp\s*\d/i;

  /* 報酬行の 1 項目。例: LP:150(+9) / 自我の欠片:70(+16) / 人格抽出チケットx1 */
  function readReward(item) {
    const text = toHalf(item);
    /* 増減 (±N) は残高差なので、収入には足さない。原文は残す。 */
    const delta = text.match(/([+-])\s*(\d[\d,]*)/);
    const deltas = [];
    const numeric = text.replace(/[（(]\s*[+-]\s*\d[\d,]*\s*[)）]/g, "").trim();
    const num = numeric.match(/(\d[\d,]*)/);
    const value = num ? Number(num[1].replace(/,/g, "")) : 0;
    const rest = numeric.replace(/(\d[\d,]*)/, " ").trim();
    if (delta) deltas.push({ value: Number(delta[2].replace(/,/g, "")), sign: delta[1] });

    /* 抽出チケットは数だけ取る */
    if (/抽出|チケット/.test(numeric)) {
      const kind = /e\.?g\.?o/i.test(numeric) || /ＥＧＯ/i.test(numeric) ? "ego"
        : /人格/.test(numeric) ? "persona"
        : /選択/.test(numeric) ? "choice" : null;
      return { ticket: { kind, count: value || 1 }, deltas, raw: item };
    }
    /* 通貨は単位詞で分ける */
    const isShards = SHARD_WORD.test(numeric);
    const isLp = LP_WORD.test(numeric) || /^(lp|ＬＰ)/i.test(numeric);
    if (!isShards && !isLp) return null;
    return { currency: isShards ? "shards" : "lp", value, deltas, rest, raw: item };
  }

  /* 明細の候補。種別のヒントは名前から読む（DB 解決は呼び出し側）。 */
  function hintOf(name) {
    const text = toHalf(name);
    if (/e\.?g\.?o/i.test(text) || /ＥＧＯ/.test(text)) return "ego";
    if (/同期化|解析|max|ＭＡＸ/i.test(text)) return "persona";
    if (/人格|抽出/.test(text)) return "persona";
    return null;
  }

  function parseText(rawText) {
    const records = [];
    const skipped = [];
    let current = null;

    const flush = () => {
      if (!current) return;
      /* 見出しも本文も無い帖はリザルトにならない */
      const empty = !current.title && !current.income.lp && !current.income.shards
        && !current.tickets.length && !current.spends.length;
      if (empty) current = null;
      else { records.push(current); current = null; }
    };
    const open = (title, author) => {
      flush();
      current = { title: title || null, author: author || null, income: { lp: 0, shards: 0 }, tickets: [], spends: [], deltas: [], raw: [] };
      return current;
    };

    for (const rawLine of String(rawText ?? "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) { flush(); continue; }

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
            if (got.ticket) { current.tickets.push(got.ticket); current.deltas.push(...(got.deltas || [])); continue; }
            current.income[got.currency] += got.value;
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
     ヒントを使う。どれにも当たらないものは手動支出（要把判断留给用户）。 */
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

  /* 提案済みリザルト + 明細を reducer の action 並びへ落とす。
     excluded: Set(添字) を渡すと、その明細は作らない。 */
  function plan(parsed, options) {
    const opts = options || {};
    const excluded = opts.excluded || new Set();
    const actions = [];
    const skipped = (parsed.skipped || []).slice();

    for (const record of parsed.records || []) {
      const title = record.title || "無題";
      const note = record.author ? `作：${record.author}` : "";
      actions.push({ type: "ADD_RESULT", name: title, income: { lp: record.income.lp, shards: record.income.shards, tickets: ticketIncome(record.tickets) }, note });
      record.spends.forEach((spend, index) => {
        if (excluded.has(index)) return;
        if (spend.needsDecision) { skipped.push({ text: spend.raw || spend.name, reason: spend.reason || "要確認" }); return; }
        const { kind, dbName } = kindOf(spend, opts.resolve);
        actions.push({ type: "ADD_ENTRY", kind, name: dbName, cost: { lp: spend.cost.lp, shards: spend.cost.shards } });
      });
    }
    return { actions, skipped };
  }

  /* 報酬のチケット数を受領の積に直す。種類が分からないものは choice ではなく
     unknown にして、利用者に選んでもらう（勝手に人格と決めない）。 */
  function ticketIncome(tickets) {
    const out = { persona: 0, ego: 0, choice: 0, pack: {} };
    for (const t of tickets || []) {
      if (t.kind === "persona" || t.kind === "ego" || t.kind === "choice") out[t.kind] += t.count || 0;
    }
    return out;
  }

  const api = { parseText, plan };
  if (typeof window !== "undefined") window.LBT_textImport = api;
})();