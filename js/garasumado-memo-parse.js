/* 硝子窓のシナリオ履歴（scenarioHistory[].memo）を、
 * リザルト（収入）と明細（支出）へ分解する。
 *
 * memo は自由記述で統一されていない。共有データ 73 シナリオから採った書式:
 *   90LP：現在100LP                     収入 LP
 *   29欠片：現在39欠片                  収入 欠片（かけら/欠けら/カケラも同義）
 *   30欠片：現在30                      現在値だけの行もある
 *   105LP：現在LP205                    現在値に通貨名が残る
 *   人格抽出チケット：N 社小鎚の人格      種別名つき
 *   抽出チケットx1：シュエ家私兵の人格   x1 / ×1 の個数つき
 *   抽出ガチャチケット×1「N 社中鎚の人格」
 *   LPを欠片に変換：+11欠片 -22LP        収入行に見えるが実際は換算明細
 *
 * 支出は「・支出」「・支払い」以降。行ごとに書式が違い、
 * 「現在NN」は残額であって支出額ではない。残額を取り違えると
 * 残高的数字が支出として計上されるので、必ず除いてから読む。
 *
 * 判定できない行は「無視」せず reasons に出し、利用者に返す。
 */
(function (global) {
  /* 欠片の表記ゆれ。硝子窓の入力は自由なので全部受ける。 */
  var SHARD_WORDS = ["欠片", "かけら", "欠けら", "カケラ", "欠け片"];
  /* E.G.O の読みは「エゴ」。ここに「イゴ」を書いていたため、実データで一度も
     出ない表記を E.G.O の別名として信用していた。「エゴ」を正式な読みとして
     受理する（「イゴ」は他人の入力に合わせ残す）。 */
  var EGO_WORDS = ["EGO", "ＥＧＯ", "E.G.O", "エゴ", "イゴ", " egos "];

  /* 数値・通貨表記だけを解析する用途の正規化。実際の memo 本文や名前は書き換えない。 */
  function normalizeNumericText(value) {
    return String(value ?? "")
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[\u2010-\u2015\u2212\uFE63]/g, "-")
      .replace(/\u3000/g, " ");
  }

  /* 桁区切りは正しい3桁グループだけを除去。誤った 1,20LP を 20LP と
     部分一致させないよう、解析用テキストでは不正なカンマ数値をマスクする。 */
  function normalizeAmountText(value) {
    var text = normalizeNumericText(value);
    text = text.replace(/(^|[^\d,])([+-]?\d{1,3}(?:,\d{3})+)(?![\d,])/g,
      function (_all, prefix, amount) { return prefix + amount.replace(/,/g, ""); });
    text = text.replace(/(^|[^\d])([+-]?\d[\d,]*,\d+)(?=$|[^\d])/g,
      function (_all, prefix) { return prefix + " "; });
    return text;
  }

  /* 残額の記載を伏せる。「現在100LP」「現在LP：33」「現在所持LP：30→3」は
     どれも増減ではなく残高。所持・コロン・矢印の右辺まで一緒に落とさないと、
     残高そのものが収入（または支出）として帳簿に乗る。 */
  function stripBalances(value) {
    return normalizeAmountText(value)
      /* 一部のメモは通貨名が先に来る（「LP現在8」「欠片残り81」）。
         金額の右隣にある残高マーカーも消し、数値を支出へ流用しない。 */
      .replace(/(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*(現在|現座|残高|残額|残り|所持|保有)\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?/gi, function (_match, currency, _marker, offset, source) { const prefix = source.slice(0, offset); return /(?:^|[^A-Za-z0-9])[+-]?\d[\d,]*\s*$/.test(prefix) ? currency : " "; })
      .replace(/現在\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ")
      .replace(/(?:残り|残高|残額)\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ")
      .replace(/(?:現座|所持|保有)\s*(?:残高|残額|所持|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ");
  }

  /* 金額／チケットの加算は、安全整数の範囲を超えた値を保存しない。
     黙って丸める代わりに reasons へ残し、入力元を確認できるようにする。 */
  function addSafeAmount(target, key, amount, line, reasons, label) {
    var next = target[key] + amount;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(next)) {
      reasons.push({
        line: String(line ?? ""),
        reason: (label || "数値") + "が安全整数の範囲を超えているため未計上"
      });
      return false;
    }
    target[key] = next;
    return true;
  }

  function hasShard(text) {
    for (var i = 0; i < SHARD_WORDS.length; i++) {
      if (String(text).indexOf(SHARD_WORDS[i]) >= 0) return true;
    }
    return false;
  }
  function hasLp(text) {
    return /lp/i.test(normalizeNumericText(text));
  }
  function currencyOf(text) {
    if (hasShard(text)) return "shards";
    if (hasLp(text)) return "lp";
    return "";
  }

  /* E.G.O指定購入の見出しは「▼」などで始まっても、支出節として認識する。 */
  function isEgoPurchaseHeader(line) {
    var head = String(line || "").trim().replace(/^\s*(?:[・･▼▽▶▷■□◆◇★☆●○])\s*/, "");
    /* 見出しは行全体が「E.G.O指定購入」の場合だけ。
       「欠片75消費してE.G.O指定購入…」のような取引文に語句が含まれるだけなら、
       見出し扱いで continue せず、金額の解析経路へ渡す。 */
    return /^(?:E\.?\s*G\.?\s*O|エゴ)\s*指定購入\s*[：:]?$/i.test(head);
  }

  /* セクション見出しだけを認識する。本文付きの「・基本報酬 50LP」や
     「・基本報酬：人格名」を見出しと誤認すると、金額・獲得名そのものを
     continue で捨ててしまう。見出しは語句全体が一致する場合に限る。 */
  function sectionOf(line) {
    if (isEgoPurchaseHeader(line)) return "spend";
    var m = String(line).trim().match(/^[・･▼▽▶▷■□◆◇★☆●○❚❙▌]\s*(.+?)\s*$/);
    if (!m) return "";
    var head = m[1].trim().replace(/[：:]\s*$/, "").trim();
    if (/^(?:支出|支払|支払い|支払額|購入|消費|消費額)$/.test(head)) return "spend";
    if (/^(?:現在|残高|所持通貨)$/.test(head)) return "current";
    /* 支出節から報酬節へ戻るときも、見出しだけを厳密に判定する。 */
    if (/^(?:シナリオ報酬|基本報酬|追加報酬|クリア報酬|報酬|収入|獲得|入手|取得|RESULT|リザルト)$/i.test(head)) return "income";
    return "other";
  }

  /* 金額を取る。「現在NN」と「残りNN」は残額なので先に落とす。
     落在這裡的只有「支出額」。
     「因子コード G-5購入 7LP」のように識別子に数字が混ざっていても、
     通貨名に隣接する数値を採る（7 が金額、G-5 の 5 は識別子）。 */
  function amountOf(line) {
    var cleaned = stripBalances(line)
      .replace(/残り\s*-?\d+/gi, " ")
      .replace(/へ\s*$/, " ");
    /* 通貨名に隣接する数値を優先（-22LP → 22、7LP → 7）。 */
    var near = cleaned.match(/(-?\d+)\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)/i);
    if (near) return parseInt(near[1], 10);
    /* 通貨名が無ければ先頭の数字。識別子のハイフンは符号ではない。 */
    var rest = cleaned.replace(/([A-Za-z0-9])-(?=\d)/g, "$1 ");
    var m = rest.match(/-?\d+/);
    if (!m) return null;
    var n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }

  /* チケットの種類。複数形・表記ゆれを吸収。 */
  function ticketOf(line, context) {
    /* 「チケット」だけでなく略字の「チケ」も受ける。実データに
       「ガチャチケ1枚　第四銀工房銃鎚派」がある。 */
    if (!/チケ|チケット/.test(line)) return null;
    var text = normalizeAmountText(line);
    /* 人格/E.G.Oの説明文に「チケットは捨てられる日を待っている」のような
       フレーバー文がある。枚数・券種・入手/消費の記述が一切ない説明文を
       チケット収入や抽出として誤認しない。 */
    var hasCount = /[x×]\s*\d+|(?:チケ|チケット)\s*\d+\s*枚/.test(text);
    var hasType = /抽出|ガチャ|人格|E\.?G\.?O|エゴ|イゴ|選択|テーマパック/i.test(text);
    var hasAction = /報酬|獲得|入手|付与|支給|取得|所持|消費|使用|増加|減少/.test(text);
    /* 「140LP / 26カケラ / チケット」のように直前の行が通貨報酬なら、
       単独「チケット」も実際の報酬候補として要確認に残す。
       説明文中の単なる「チケット」とは前後の文脈で分ける。 */
    var hasAdjacentCurrencyReward = Boolean(
      context && context.mode === "income" &&
      /^(?:チケ|チケット)$/.test(text.trim()) &&
      /\d/.test(String(context.previousLine || "")) &&
      /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/i.test(String(context.previousLine || ""))
    );
    if (!hasCount && !hasType && !hasAction && !hasAdjacentCurrencyReward) return null;
    var count = 1;
    var cm = text.match(/[x×]\s*(\d+)/);
    if (cm) count = parseInt(cm[1], 10);
    var cm2 = text.match(/(?:チケ|チケット)\s*(\d+)\s*枚/);
    if (cm2) count = parseInt(cm2[1], 10);

    /* 「任意のテーマパックチケット」は券種自体はパック系と分かる。
       ただし対象パック名が無いので、パック別在庫へは自動加算しない。
       人格/E.G.O/選択抽出券の曖昧さと同じ警告にはしない。 */
    var genericPackTicket = /(?:任意|お好きな方|どちらか).{0,20}(?:テーマ)?パックチケット/i.test(text);
    if (genericPackTicket) {
      return {
        kind: null,
        category: "pack",
        count: count,
        reason: "対象パック名が指定されていない汎用テーマパックチケットのため、パック別残数への計上を保留しました"
      };
    }

    /* 「人格orE.G.O」「お好きな方へ」など、出典自体が選択式なら
       人格/E.G.Oの語が両方あっても一方へ決め打ちしない。 */
    var ambiguous = /(?:人格\s*(?:or|\/|または|又は|もしくは|＆|と)\s*(?:E\.?G\.?O|エゴ|イゴ)|(?:任意|お好きな方|どちらか).{0,18}(?:抽出|チケ)|(?:抽出チケット|抽出チケ)\s*[（(][^）)]*(?:任意|お好きな方|どちらか))/i.test(text);
    var kind = null;
    if (!ambiguous) {
      var explicitPersona = /人格.{0,4}チケ|チケ.{0,4}人格/.test(text);
      if (explicitPersona) kind = "persona";
      else if (/選択|zr|upgrade/i.test(text)) kind = "choice";
      else if (/ガチャ\s*(?:チケ|チケット)/.test(text)
        || /E\.?G\.?O|エゴ|イゴ/i.test(text)
        || EGO_WORDS.some(function (w) { return text.indexOf(w) >= 0; })) kind = "ego";
    }
    /* 無修飾の「抽出チケット」は種別不明。種類を名前から推測しない。 */
    return { kind: kind, count: count };
  }

  /* 「抽出1：E.G.O:提灯」のような「抽出NN」だけの行。
     副語に E.G.O があれば E.G.O 抽出、無ければ人格抽出。
     数字無し「人格抽出：南部〜」も 1 回として数える。 */
  function bareDrawOf(line) {
    var text = normalizeAmountText(line);
    /* 「LP200を消費してガチャ」のような叙述は抽出回数の記録ではない。
       明示的な「使用/消費」しかない自然文からチケットを作らない。 */
    if (/(?:消費|使用済|使用し|支払|支出)/.test(text) && String(line).indexOf("→") < 0) return null;
    var m = text.match(/(?:抽出|ガチャ)\s*(\d+)?/);
    if (!m) return null;
    /* 「時間殺人時間テーマパック抽出」はパックの獲得であり、チケットの消費ではない。 */
    if (/パック/.test(text)) return null;
    var count = m[1] ? parseInt(m[1], 10) : 1;
    var isEgo = EGO_WORDS.some(function (w) { return text.indexOf(w) >= 0; }) || /ガチャ/.test(text);
    return { kind: isEgo ? "ego" : "persona", count: count };
  }

  /* 「+154」や「45+5」を 1 つの額に。「45+5」は加算の連なり（=50）、
     先頭の符号だけが全体の符号（「-15」は -15 のまま）。 */
  function chainSum(raw) {
    var s = normalizeAmountText(raw).replace(/＋/g, "+").replace(/\s+/g, "");
    var sign = 1;
    if (s.charAt(0) === "-") { sign = -1; s = s.slice(1); }
    else if (s.charAt(0) === "+") s = s.slice(1);
    var total = 0;
    var parts = s.split("+");
    for (var i = 0; i < parts.length; i++) total += parseInt(parts[i].replace(/,/g, ""), 10) || 0;
    return sign * total;
  }

  function currencyOfPair(token) {
    var u = String(token).toUpperCase();
    return (u === "LP" || u === "ＬＰ") ? "lp" : "shards";
  }

  /* 1 行から「通貨×数値」の対を全部読む。通貨と数値は前後どちらの順でもよく
     （「40LP」「LP：71」「LP60」「欠片40」「85：LP」）、各数値の持ち主を通貨
     ひとつへ決める。両側に通貨があるときは、後置側が自分の数値を持たない
     限り前置側が持つ（「40LP 20欠片」の 20 は欠片、「LP30 欠片15」の 30 は LP）。
     隣に通貨が無い数値は行内では持ち主無しにする（choice[...]・CT3・消費額を
     文脈継承で拾うと帳簿に幻の収入が乗る。実測 202 行 +32396）。
     現在/残の直後は残額なので先に伏せる。 */
  /* 代替価格の説明（例「50LP又は100LPで買える分の強化アイテム」）を
     報酬通貨と誤認しない。価格候補だけを除去し、別途記載された報酬は残す。 */
  function stripAlternativePriceCondition(line) {
    var removed = [];
    var text = String(line || "").replace(
      /[0-9０-９,，]+\s*(?:LP|ＬＰ)\s*(?:又は|または|あるいは|or)\s*[0-9０-９,，]+\s*(?:LP|ＬＰ)?\s*(?:で)?(?:買える|購入できる|交換できる|選べる)[^、，。;；\n]*/gi,
      function (clause) {
        removed.push(clause);
        return " ";
      }
    );
    return { text: text, removed: removed };
  }

  function stripThemePackPriceCap(line) {
    var text = String(line || "");
    if (!/テーマパック/.test(text)) return text;
    return text
      .replace(/上限\s*[:：]?\s*(?:(?:LP|ＬＰ)\s*)?[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?/gi, " ")
      .replace(/(?:LP|ＬＰ)\s*[0-9０-９][0-9０-９,，]*\s*上限|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?\s*上限/gi, " ");
  }

  function incomePairs(line) {
    var text = stripThemePackPriceCap(stripBalances(line))
      .replace(/残り?\s*-?\d+(?:\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?/gi, " ")
      /* 「300LPへ」は支払後の残高に振り直す書き方。額ではなく結果。 */
      .replace(/-?\d+(?:\s*[+＋]\s*\d+)*\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*へ/gi, " ")
      /* アイテム「硝子の欠片／破片」の数量は所持通貨の欠片ではない。 */
      .replace(/(?:硝子|ガラス)の(?:欠片|破片)\s*(?:[+＋\-−]\s*\d+|[x×]\s*\d+)?/gi, " ")
      /* 「G-5」のような単独識別子のハイフンは除くが、LP-100 の負号は保持する。 */
      .replace(/(?<![A-Za-z])([A-Za-z0-9])-(?=\d)/g, "$1 ")
      /* 括弧注釈は掉落値。「75(理性60+15)欠片」の内訳を外すと
         75 が欠片の直前に残るので 75 として読める。 */
      .replace(/[（(][^）)]*[）)]/g, " ");
    var tokens = [];
    var re = /(LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ))|([+-]?\s*\d+(?:\s*[+＋]\s*\d+)*)/gi;
    var m;
    var lastEnd = 0;
    while ((m = re.exec(text)) !== null) {
      tokens.push({
        cur: m[1] ? currencyOfPair(m[1]) : null,
        num: m[1] ? null : chainSum(m[2]),
        gap: text.slice(lastEnd, m.index)
      });
      lastEnd = re.lastIndex;
    }
    var isGap = function (g) { return /^[\s　:：]*$/.test(g); };
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.num === null) continue;
      var pre = i > 0 && tokens[i - 1].cur && isGap(tk.gap) ? tokens[i - 1].cur : null;
      var postTok = i + 1 < tokens.length ? tokens[i + 1] : null;
      var post = postTok && postTok.cur && isGap(postTok.gap) ? postTok.cur : null;
      var owner;
      if (pre && post) {
        var after = i + 2 < tokens.length ? tokens[i + 2] : null;
        owner = after && after.num !== null && isGap(after.gap) ? pre : post;
      } else {
        owner = pre || post;
      }
      if (owner) out.push({ amount: tk.num, currency: owner });
    }
    return out;
  }

  /* 通貨語が1つも無いメモで「80」「40」が縦に並ぶ書き方（実データ）。
     LR の報酬は必ず LP→欠片 の順なので 2 行なら順序が確定する。
     3 行以上は順序が確定せず、日付（2026/10/6 を縦に割ったもの）を
     読み違えるので読まない。通貨語がどこかにあればラベル経路が優先される。 */
  function parseBareStack(lines) {
    var res = { lp: 0, shards: 0 };
    var joined = normalizeAmountText(lines.join("\n"));
    if (/(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/i.test(joined)) return res;
    var runs = [];
    var cur = [];
    for (var i = 0; i < lines.length; i++) {
      var t = normalizeAmountText(lines[i] || "").trim();
      if (/^\d+$/.test(t)) { cur.push(parseInt(t, 10)); continue; }
      if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    if (runs.length !== 1 || runs[0].length !== 2) return res;
    if (runs[0][0] > 999 || runs[0][1] > 999) return res;
    res.lp = runs[0][0];
    res.shards = runs[0][1];
    return res;
  }

  /* 「LP/欠片」の見出しの下に「120/80」とだけ書く形式（実データ）。
     見出しの並びが通貨の順序。合計行の直後の対があればそれを、無ければ最初の対を取る。
     見出しが無い裸の「N/M」は読まない（日付・分数と区別できない）。 */
  function parseSlashPairs(memo) {
    var res = { lp: 0, shards: 0 };
    var lines = normalizeAmountText(memo).split(/\r?\n/);
    var order = null;
    var headerAt = -1;
    for (var i = 0; i < lines.length; i++) {
      var h = lines[i].trim();
      if (/^(LP|ＬＰ)\s*\/\s*(欠片|欠け片|かけら|欠けら|カケラ)$/i.test(h)) { order = ["lp", "shards"]; headerAt = i; break; }
      if (/^(欠片|欠け片|かけら|欠けら|カケラ)\s*\/\s*(LP|ＬＰ)$/i.test(h)) { order = ["shards", "lp"]; headerAt = i; break; }
    }
    if (!order) return parseBareStack(lines);
    var cands = [];
    var prevNonEmpty = "";
    for (var j = 0; j < lines.length; j++) {
      var t = lines[j].trim();
      if (!t) continue;
      var pm = t.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (pm && j > headerAt) {
        cands.push({ a: parseInt(pm[1], 10), b: parseInt(pm[2], 10), afterTotal: /合計/.test(prevNonEmpty) });
      }
      prevNonEmpty = t;
    }
    if (!cands.length) return res;
    var pick = null;
    for (var k = cands.length - 1; k >= 0; k--) {
      if (cands[k].afterTotal) { pick = cands[k]; break; }
    }
    if (!pick) pick = cands[0];
    res[order[0]] += pick.a;
    res[order[1]] += pick.b;
    return res;
  }

  /* アイテムの効果説明文。「▶︎〜」で始まる行や、
     「〜を得る」「〜を獲得する」で終わる行は説明であって金額行ではない。 */
  function isNarrativeLine(line) {
    var t = normalizeAmountText(line);
    if (/^\s*[▶►▷]\s*/.test(t)) return true;
    if (/^\s*(?:効果(?:説明)?|パッシブ効果|アイテム効果|説明)\s*[:：]/.test(t)) return true;
    if (/^\s*(?:使用時|消費時|発動時|効果中|パッシブ効果)/.test(t)) return true;
    if (/(?:効果|説明|パッシブ|アイテム).{0,30}(?:使用時|消費時|発動時)/.test(t)) return true;
    if (/^\s*(?:効果(?:説明)?|パッシブ効果|アイテム効果|説明)\s*[:：]/.test(t)) return true;
    if (/^\s*(?:使用時|消費時|発動時|効果中|パッシブ効果)/.test(t)) return true;
    if (/(?:効果|説明|パッシブ|アイテム).{0,30}(?:使用時|消費時|発動時)/.test(t)) return true;
    if (/(得る|獲得する|消費する|半減し|発動する)/.test(t) && !/\d\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)/.test(t)) return true;
    return false;
  }

  /* 「現在NN」と「残りNN」は残額。支出額として読むと大きな数字が立つので、
     必ず除いてから金額を取る。
     currency を指定すると、その通貨に最も近い数値を返す。
     「+11欠片 -22LP」なら lp 指定で -22、shards 指定で 11。 */
  function amountNear(line, currency, _keepCurrent) {
    /* 現在値・残り値は残高であり、支出額としては使わない。
       同じ行に「150LP消費」などの明示金額があればその金額を拾い、
       残高しかなければ金額未確定として理由を出す。 */
    var text = stripBalances(line)
      .replace(/残り\s*-?\d+(?:\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?/gi, " ")
      .replace(/へ\s*$/, " ");
    if (currency === "lp") {
      /* LP は「LP」という語で締める。「+11欠片 -22LP」なら -22 を取りたい。
         ただし行頭に「LPを欠片に変換」と通貨名が並び立つことがあるので、
         最初に現れた LP の直後にある数字は通貨名の読み方であり金額ではない。
         減算（-）を最優先し、無ければ LP 語に直近の数字を取る。 */
      var reLp = /LP/gi;
      var ml;
      var bestLp = null;
      while ((ml = reLp.exec(text)) !== null) {
        /* 通貨直前の数値はトークン全体を取る。固定長の窓では桁数の多い
           金額が末尾だけへ切り詰められ、小さい支出として誤記帳される。 */
        var backPrefix = text.slice(0, ml.index);
        var directBack = backPrefix.match(/(-?\d+)\s*$/);
        var backNums = directBack ? [directBack[1]] : backPrefix.slice(Math.max(0, backPrefix.length - 14)).match(/-?\d+/g);
        var fwdTxt = text.slice(ml.index + 2);
        var fwdN = fwdTxt.match(/-?\d+/);
        /* -（減算）を最優先。_11 のような加算は金額として採らない。 */
        if (backNums) {
          for (var bi = backNums.length - 1; bi >= 0; bi--) {
            if (backNums[bi].charAt(0) === "-") { bestLp = parseInt(backNums[bi], 10); break; }
          }
        }
        if (bestLp == null && fwdN && fwdN[0].charAt(0) === "-") bestLp = parseInt(fwdN[0], 10);
        if (bestLp == null && backNums && backNums.length) bestLp = parseInt(backNums[backNums.length - 1], 10);
        if (bestLp != null) break;
      }
      if (bestLp != null) return bestLp;
      /* LP 語が無くても、欠片語が無ければ先頭の数字が LP。 */
      if (!/欠片|欠け片|かけら|欠けら|カケラ/.test(text)) {
        if (/(?:現在|現座|残高|残り)/.test(String(line || ""))) return null;
        var only = text.match(/-?\d+/);
        return only ? parseInt(only[0], 10) : null;
      }
      return null;
    }

    var re = /欠片|欠け片|かけら|欠けら|カケラ/g;
    var mm;
    while ((mm = re.exec(text)) !== null) {
      var tail = text.slice(mm.index + mm[0].length);
      var nm = tail.match(/-?\d+/);
      if (nm) return parseInt(nm[0], 10);
      var beforeShard = text.slice(0, mm.index);
      var directShard = beforeShard.match(/(-?\d+)\s*$/);
      var backS = directShard ? [directShard[1]] : beforeShard.slice(Math.max(0, beforeShard.length - 12)).match(/-?\d+/g);
      if (backS && backS.length) return parseInt(backS[backS.length - 1], 10);
    }
    return null;
  }

  /* 合計行。「0欠片　40LP」のように、数値と通貨だけの並びで
     動詞も名前も無い行。収入でも支出でもない。
     通貨名は漢字を含むので、判定前に取り除く。
     （さreon「欠片」だけの行を名前と誤判定して通過させない） */
  function isTotalOnlyLine(line) {
    var t = normalizeAmountText(String(explicitRewardNameOf(line) || line)).replace(/現在|残/g, "").trim();
    /* 通貨名だけ刈り取ったあと、漢字/ラテンが残るか見る。 */
    var stripped = t.replace(/LP|欠片|欠け片|かけら|欠けら|カケラ/gi, " ").trim();
    if (/[A-Za-zぁ-んァ-ヶ一-龠]/.test(stripped)) return false;
    /* 通貨名を落とした残りが「数値と空白だけ」なら合計行。 */
    return /^[\s　0-9+\-　]*$/.test(stripped) && /\d/.test(stripped);
  }

  function egoCompactName(value) {
    return normalizeNumericText(String(value || "")).toLowerCase()
      .replace(/[\s　【】《》「」『』()（）:：・,，、\/\\|｜\-–—*＊#＃~〜?？!！.。]/g, "");
  }

  /* 明示された購入欄内で、候補名がDBのE.G.Oに一意に当たる場合だけ正規名にする。 */
  function findEgoPurchaseDbRow(rawLine, cleanedName) {
    var egos = global.DB && Array.isArray(global.DB.egos) ? global.DB.egos : [];
    var rawKey = egoCompactName(rawLine);
    var cleanKey = egoCompactName(cleanedName);
    var matches = egos.filter(function (ego) {
      var key = egoCompactName(ego && ego.name);
      return key && ((rawKey && rawKey.indexOf(key) >= 0) || (cleanKey && (cleanKey === key || cleanKey.indexOf(key) >= 0)));
    }).sort(function (a, b) {
      return egoCompactName(b && b.name).length - egoCompactName(a && a.name).length;
    });
    if (!matches.length) return null;
    var longest = egoCompactName(matches[0].name).length;
    var best = matches.filter(function (ego) { return egoCompactName(ego.name).length === longest; });
    return best.length === 1 ? best[0] : null;
  }

  function egoCurrencyAmounts(line) {
    var text = normalizeAmountText(String(line || ""));
    var lp = /(?:LP|ＬＰ)\s*[:：]?\s*[+-]?\s*\d|[+-]?\s*\d[\d,]*(?:\s*[+＋]\s*\d+)*\s*(?:LP|ＬＰ)/i.test(text);
    var shards = /(?:欠片|欠け片|かけら|欠けら|カケラ|欠け片)\s*[:：]?\s*[+-]?\s*\d|[+-]?\s*\d[\d,]*(?:\s*[+＋]\s*\d+)*\s*(?:欠片|欠け片|かけら|欠けら|カケラ|欠け片)/i.test(text);
    return { lp: lp, shards: shards };
  }

  /* E.G.O指定購入の合計欄は、項目別支出と別に比較する。総額を再計上しない。 */
  function egoPurchaseSummaryOf(line) {
    var text = normalizeAmountText(String(line || "")).trim();
    var labelled = /消費欄|消費額|消費合計|購入合計|合計消費|項目別価格合計|支出額|総額/.test(text);
    if (/現在|残高|残り/.test(text) && !labelled) return null;
    var summary = text
      .replace(/消費欄|消費額|消費合計|購入合計|合計消費|項目別価格合計|支出額|総額|合計|消費|購入|支出|金額|欄|の/g, " ")
      .replace(/[：:＝=]/g, " ").trim();
    if (!labelled && !isTotalOnlyLine(summary)) return null;
    if (!isTotalOnlyLine(summary)) return null;
    var currencies = egoCurrencyAmounts(summary);
    if (!currencies.lp && !currencies.shards) return null;
    return {
      raw: String(line || "").trim(),
      lp: currencies.lp ? Math.abs(amountNear(summary, "lp", false) || 0) : 0,
      shards: currencies.shards ? Math.abs(amountNear(summary, "shards", false) || 0) : 0
    };
  }

  /* E.G.O指定購入節の項目名を抽出する。通貨・価格・ランク注記を外し、
     DB名が一意に一致する場合は表示名へ正規化する。 */
  function egoPurchaseItemNameOf(line) {
    var raw = String(line || "").trim();
    if (!raw || /消費欄|消費額|消費合計|購入合計|合計消費|項目別価格合計|支出額|総額/.test(raw)) return "";
    if (/(?:現在|残高|残り)/.test(raw) || isTotalOnlyLine(raw)) return "";
    var name = normalizeAmountText(raw)
      .replace(/現在[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*-?\d+/gi, " ")
      .replace(/残り\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?/gi, " ")
      .replace(/(?:LP|ＬＰ)\s*[:：]?\s*[+-]?\s*\d+/gi, " ")
      .replace(/[+-]?\s*\d[\d,]*(?:\s*[+＋]\s*\d+)*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|欠け片)/gi, " ")
      .replace(/^\s*(?:No\.?\s*\d+|#\s*\d+|\d+[.)．、])\s*/i, "")
      .replace(/\s*[（(]\s*(?:ZAYIN|TETH|HE|WAW|ALEPH)\s*[）)]/gi, " ")
      .replace(/(?:価格|単価|購入価格|消費欄|消費合計|購入合計|支出額|総額)/g, " ")
      .replace(/^[\s*・･•●○\-—–]+|[\s,，;；]+$/g, "")
      .replace(/\s+/g, " ").trim();
    var ego = findEgoPurchaseDbRow(raw, name);
    if (ego && ego.name) return String(ego.name).trim();
    if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return "";
    return name;
  }

  /* 明示された「報酬：人格名」「基本報酬：人格名」を直接獲得として拾う。
     普通の箇条書きに書かれた参加者名などを獲得扱いする条件は広げない。 */
  function explicitRewardNameOf(line) {
    var t = String(line || "").trim().replace(/^[・･]\s*/, "");
    var match = t.match(/^(?:(?:シナリオ|基本|追加|クリア)?報酬)\s*[：:]\s*(.+)$/);
    if (!match) return "";
    return match[1].trim().replace(/^[「『「]/, "").replace(/[」』」]$/, "").trim();
  }

  /* 「獲得：HE 厳粛な哀悼：死んだ蝶たちの葬儀」のように、実記録では
     獲得ラベルとE.G.Oランクが名前の前に付く。ラベルを名前から分離し、
     ランク接頭辞は種別を確定できる証拠として保持する（DB名そのものには含めない）。 */
  function explicitAcquisitionOf(line) {
    var t = String(line || "").trim().replace(/^[・･]\s*/, "");
    var match = t.match(/^(?:獲得|入手|取得)\s*[：:]\s*(.+)$/);
    if (!match) return null;
    var name = match[1].trim().replace(/^[「『「]/, "").replace(/[」』」]$/, "").trim();
    if (!name) return null;
    var rankedEgo = name.match(/^(?:ZAYIN|TETH|HE|WAW|ALEPH)\s+(.+)$/i);
    return rankedEgo ? { name: rankedEgo[1].trim(), kind: "ego" } : { name, kind: "" };
  }

  /* シナリオが「誰を倒したか」を書く行。収入セクションにあり、
     通貨も数値もないので、獲得した人格/E.G.O の名前である。
     DB 照合は呼び出し側（buildManifest）で行う。ここでは
     「名前候補である」と分かる行だけ，洗い出す。 */
  function isAcquisitionNameLine(line) {
    var raw = String(line).trim();
    if (/^(?:現在|現座|残高|残額|残り|所持|保有)/.test(raw)) return false;
    var t = raw.replace(/現在|残/g, "").trim();
    if (!t) return false;
    /* 見出し・効果文・合計行は除く */
    if (/^【/.test(t)) return false;
    if (isTotalOnlyLine(t)) return false;
    if (isNarrativeLine(t)) return false;
    /* チケット行は別に数えるので、ここでは扱わない */
    if (/チケ|チケット|ガチャ|抽出/.test(t)) return false;
    /* 通貨が数値と隣接していれば金額行 */
    if (/\d\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)/i.test(t)) return false;
    /* 英語名だけの行は対象外（人名ではない）。日付（2026/10/6）もここで落とす。 */
    if (/^[A-Za-z0-9\s.:_\-/]+$/.test(t)) return false;
    /* 「第四銀弓使用」「エドガー継承者使用会」= 使った記録。獲得名ではない。 */
    if (/使用/.test(t)) return false;
    /* セッション番号（「1卓目」「7/13 2卓目」）は名前ではない。 */
    if (/^\d[\d\/\s]*\d?\s*卓目?$/.test(t)) return false;
    /* 表の見出し（「LP/欠片」「欠片」）は名前ではない。 */
    if (/^[ＬＰLP\/／\s]*欠片[\s\/／]*$/.test(t)) return false;
    /* 記録ラベル（「追加」等の裸の見出し語）は名前ではない。 */
    if (/^(?:追加|報酬|配布|内訳|メモ|備考|補足|その他)$/.test(t)) return false;
    /* 「なし」「無し」「特になし」は「記録が無い」意味であり、
       獲得した人格ではない。 */
    if (/^(なし|無し|特になし|無し|特になし|何もない|.$)$/.test(t)) return false;
    /* ラベル・見出し語。実データで「シナリオ報酬」「報酬合計」
       「ーーーRESULTーーー」等が獲得名として混じった。 */
    if (/(報酬|合計|結果|RESULT|ボーナス)/i.test(t)) return false;
    if (/[：:]\s*$/.test(t)) return false;
    /* 数量だけの断片（「1枚」「×1」）。 */
    if (/^[×xｘＸ✕✖\s]*\d+\s*(枚|個|回|つ|セット)?$/i.test(t)) return false;
    /* 数量付きの行は記録であって名前ではない（「W錬成セット×1(中身は…)」）。 */
    if (/[×xｘＸ✕✖\*＊]\s*\d|\d\s*(枚|個|本|セット)/.test(t)) return false;
    /* チケット・抽出の行は獲得名の入れ物ではない（名前は ticketSourceName が取る）。
       「…の人格」で終わる行は実在の人格名なので除外しない
       （「【使用人格】」の次の行と「PC:」「人格:」の記録行だけを除く）。 */
    if (/使用人格|^PC[:：]|^人格[:：]|シナリオクリア|ロスト者|以下に記載|なし\s*$|パック/.test(t)) return false;
    /* 句読点を含む行は説明文。獲得名ではない。 */
    if (/[。、]/.test(t)) return false;
    /* アイテム・効果の説明。 */
    if (/^(使用時|使用後|使用す|効果\s*[:：]|item\b|Item\b)/.test(t)) return false;
    /* 絵文字・装飾記号を含む行。 */
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{3297}\u{3299}]/u.test(t)) return false;
    /* 「[最大所持数1]」のような注記。 */
    if (/^[\[\(（]/.test(t)) return false;
    return true;
  }

  /* チケット種別の表示名。消費した記録に「どのチケット由来か」を書く。 */
  var TICKET_LABEL = {
    persona: "人格抽出チケット",
    ego: "E.G.O抽出チケット",
    choice: "選択抽出チケット"
  };

  /* チケット行から「抽出した人格/E.G.O」の名前だけを抜き出す。
     実書式:
       人格抽出チケット：N 社小鎚の人格
       人格抽出チケット:寝落ちの謝罪のため確定：西武ツヴァイ協会３課フィクサー
       抽出ガチャチケット×1「N 社中鎚の人格」
       抽出1：LCE E.G.O:ねばつきの人格
     区切りは ：/: /「」のどれか。区切りが無いなら語を全部削る。 */
  function ticketSourceName(line) {
    var t = String(line).trim();
    var body = null;
    var br = t.match(/[「『]([^」』]+)[」』]/);
    if (br) body = br[1];
    else {
      /* 区切りの後ろ側を取る。複数あるなら最後のもの。 */
      var parts = t.split(/[：:]/).map(function (s) { return s.trim(); }).filter(Boolean);
      /* 先頭は「人格抽出チケット」等の見出し。後ろが名前。 */
      if (parts.length >= 2) body = parts[parts.length - 1];
    }
    if (!body) return "";
    /* 見出し語とNoise を削る */
    var name = body
      .replace(/^.*?(?=の|：|:)/, function (m) { return m.includes("の") ? m.slice(m.indexOf("の") + 1) : m; })
      .replace(/(抽出|チケット|ガチャ|チケ|人格|E\.?G\.?O|の|ため|確定|：|:)+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    /* 名前が無いか短すぎたら採らない */
    if (name.length < 2) return "";
    /* 数量だけの断片（「1枚」「×1」「x1」）は名前ではない。
       「人格抽出チケット：1枚」の 1枚 が獲得名として記録された実害がある。 */
    if (/^[×xｘＸ✕✖\s]*\d+\s*(枚|個|回|つ|セット)?$/i.test(name)) return "";
    /* 数量付きの断片も名前ではない（「人格抽出チケット：任意テーマパック 1枚」）。 */
    if (/[×xｘＸ✕✖\*＊]\s*\d|\d\s*(枚|個|本|セット)/.test(name)) return "";
    /* 記録の断片（「…（使用済み）」「LP75 / 自我 欠片30」）は名前ではない。 */
    if (/使用済み|\//.test(name)) return "";
    /* 名前には文字が要る（記号だけの断片を弾く）。 */
    if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return "";
    /* 「抽出チケット: AEDD」の英字略号はロスターに解決できないので採らない。 */
    if (/^[A-Za-z0-9\s.:_\-/]+$/.test(name)) return "";
    return name;
  }

  /* 「ガチャ結果→◯◯」「→黒獣-卯」の矢印書式の獲得名（実データ。複数名は「、」区切り）。
     補償の叙述（「→被りにより欠片50獲得」）は獲得名ではない。 */
  function arrowWinsOf(line) {
    var t = String(line);
    var at = t.lastIndexOf("→");
    if (at < 0) return [];
    var tail = t.slice(at + 1).replace(/[。．\s]+$/g, "").trim();
    if (!tail) return [];
    if (/^(?:(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*)?(?:現在|現座|残高|残額|残り|所持|保有)/.test(tail)) return [];
    /* 「→200LP消費、テーマパック名:獲得人格獲得」形式では、最初のコロンは
       パック名と獲得品の区切り。パック名を獲得人格名へ混ぜない。
       通貨消費が明示されている場合に限って扱い、一般の人格名内のコロンは維持する。 */
    if (currencySpendOf(t)) {
      var packReward = tail.match(/(?:^|[、，,]\s*)[^：:、，,]*パック\s*[：:]\s*(.+)$/);
      if (packReward) tail = packReward[1].trim();
    }
    var out = [];
    tail.split(/[、，,]/).forEach(function (frag) {
      /* 「→LP100消費ガチャ:厳粛な哀悼獲得」は最後の区切りの後ろが名前。
         「N社E.G.O:ねばつき」の 区切りは名前の一部なので切らない。 */
      /* 取引の区切りは最初のコロンまで。後ろのコロンは E.G.O 名や人格名の一部
         かもしれない（「→100LP消費：LCE E.G.O:紅炎殺」）。 */
      var cut = frag.search(/[：:]/);
      if (cut >= 0 && /(ガチャ|抽出|消費|使用|チケ|LP|ＬＰ|欠片)/.test(frag.slice(0, cut))) frag = frag.slice(cut + 1);
      var name = frag.trim()
        .replace(/^[「『]\s*/, "").replace(/[」』]\s*$/, "")
        .replace(/^抽出\s*\d*\s*/, "")
        .replace(/(?:を|の)?(?:獲得|入手)(?:した)?$/, "")
        .trim();
      if (name.length < 2) return;
      if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return;
      /* 「選択抽出チケット→ego」のプレースホルダ。英語だけの断片は名前ではない。 */
      if (/^[A-Za-z0-9\s.:_\-/]+$/.test(name)) return;
      if (/LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|消費|使用|解除|被り|チケット|チケ|枚/.test(name)) return;
      out.push(name);
    });
    return out;
  }

  /* 1つの memo を { income, tickets, pack, spends, reasons, wins } へ。 */
  /* 「名前：名前 150欠片　現在184」の購入行判定。
     収入との差は「：」の手前が通貨でないラベルであることと現在の記載が
     あること。「90LP：現在100」は：の手前が通貨なので収入のまま。 */
  function isPurchaseSnapshot(line) {
    var t = String(line || "");
    if (/(獲得|収入|報酬)/.test(t)) return false;
    if (!/(現在|残)/.test(t)) return false;
    var label = t.match(/([^0-9\s：:][^：:]{0,24})[：:]/);
    if (!label) return false;
    if (/(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*$/.test(label[1].trim())) return false;
    return /\d+\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/.test(t.slice(label[0].length));
  }
  /* 「蒼羽蝶：75LP消費」のような名前前置・消費語後置の購入行。
     ラベル（通貨でない語）の直後に金額が置かれ、行が消費の語で終わる
     形だけを購入と見なす。「LP200を消費してガチャ」の叙述はラベルが
     通貨なので弾く。「名前：75LP、82欠片消費」の両通貨は金額の並びが
     隣接しないので読まない（落としたまま）。 */
  function namedPurchaseOf(line) {
    var t = String(line || "").trim();
    if (!/(消費|購入)[。．.」』]*$/.test(t)) return null;
    var m = t.match(/^([^0-9\s：:].+)[：:]\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)([^0-9]*)$/i);
    if (!m) return null;
    var name = m[1].trim();
    if (!name) return null;
    if (/(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*$/.test(name)) return null;
    var cost = { lp: 0, shards: 0 };
    cost[/LP/i.test(m[3]) ? "lp" : "shards"] = Number(String(m[2]).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }));
    return Object.assign({ name: name, raw: t, reason: "名前付きの購入行" }, cost);
  }

  /* 過去ログの「硝子の破片を一つ使用してCTを解除」のような記述。
     これは通貨の欠片でも購入支出でもなく、アイテム消費履歴なので専用記録へ分ける。 */
  function parseGlassConsumption(rawLine) {
    var text = normalizeAmountText(rawLine);
    if (!/硝子の(?:破片|かけら|カケラ)/.test(text) || !/(?:使用|消費)/.test(text)) return null;
    var match = text.match(/硝子の(?:破片|かけら|カケラ)\s*(?:を\s*)?(?:(\d+)\s*(?:個|つ)?|[x×]\s*(\d+)|([一二三四五六七八九十]+)\s*(?:個|つ)?)\s*(?:を\s*)?(?:使用|消費)/);
    if (!match) return null;
    var kanji = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    var rawCount = match[1] || match[2] || match[3] || "1";
    var quantity = match[3] ? kanji[match[3]] : Number(rawCount);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
    return {
      itemId: "resource-glass-shard",
      itemName: "硝子の破片",
      quantity: quantity,
      reason: "phenomenon_processing",
      detail: String(rawLine || "").trim().slice(0, 500)
    };
  }


  /* 明示された「パックをN回」は、1パックあたりの消費額をN倍する。
     例:「LP200消費 パック『A』2回→…」は200LPではなく400LPの支出。
     一般のスキル回数や数量には触れず、同じ支出行内のパックと回数だけに適用。 */
  function applyExplicitPackCount(amount, text, amountMatch) {
    const from = amountMatch.index + amountMatch[0].length;
    const arrow = text.indexOf("→", from);
    const region = text.slice(from, arrow >= 0 ? arrow : text.length);
    const repetition = region.match(/(?:パック|テーマパック)[^→\n]{0,100}?(?:[x×]\s*(\d+)\s*(?:回|個)?|(\d+)\s*回)/i);
    if (!repetition) return amount;
    const count = Number(repetition[1] || repetition[2]);
    const scaled = amount * count;
    if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(scaled)) return null;
    return scaled;
  }

  function hasMalformedCurrencyGrouping(rawLine) {
    var text = normalizeNumericText(rawLine);
    var pattern = /(?:(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ))\s*[-−+]?\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)))/gi;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      var amount = String(match[1] || match[2] || "");
      if (amount.includes(",") && !/^\d{1,3}(?:,\d{3})+$/.test(amount)) return true;
    }
    return false;
  }

  /* 明示された通貨消費を収入と分離して読む。正規化は1文字対1文字の範囲に
     限り、獲得名の位置やE.G.O名のコロンを壊さない。 */
  function currencySpendOf(rawLine, allowNaturalExpense) {
    var text = normalizeNumericText(rawLine);
    /* 1,20LP / LP1,20 のような不正な桁区切りは120として読み替えない。 */
    if (/(?:LP|ＬＰ)\s*[-−+]?\s*\d[\d,]*,\d{1,2}(?!\d)\s*(?:を\s*)?(?:消費|使用|支払|支出)|\d[\d,]*,\d{1,2}(?!\d)\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*(?:を\s*)?(?:消費|使用|支払|支出)/i.test(text)) {
      return null;
    }
    var rawSource = String(rawLine || "");
    var hasArrow = rawSource.indexOf("→") >= 0;
    var hasExplicitSpendLabel = /(?:消費|使用|支払|支出)\s*(?:ガチャ|抽出|パック|テーマパック)\s*[：:]/.test(text);
    var hasNaturalExpenseCue = /(?:消費|使用|支払|支出|購入)/.test(text);
    if (!hasArrow && !hasExplicitSpendLabel && !(allowNaturalExpense && hasNaturalExpenseCue)) return null;

    /* 明示された通貨支出を通貨ごとに抽出する。LP100と欠片100を消費のように
       1つの消費動詞が複数通貨へ掛かる形式も対応し、支出候補を丸ごと棄却しない。 */
    var candidates = [];
    function addCandidate(currency, amountText, amountStart, start, end, amountMatch) {
      var amount = Number(String(amountText || "").replace(/,/g, ""));
      if (!Number.isFinite(amount) || !Number.isSafeInteger(amount)) amount = null;
      var candidate = {
        currency: currency, amount: amount, amountStart: amountStart,
        amountEnd: amountStart + String(amountText || "").length, start: start, end: end
      };
      if (amount !== null && amountMatch) candidate.amount = applyExplicitPackCount(amount, text, amountMatch);
      var existing = candidates.find((item) =>
        item.currency === candidate.currency && item.amountStart === candidate.amountStart && item.amountEnd === candidate.amountEnd
      );
      if (existing) {
        existing.start = Math.min(existing.start, candidate.start);
        existing.end = Math.max(existing.end, candidate.end);
        return;
      }
      candidates.push(candidate);
    }

    var match;
    var lpPattern = /(?:LP|ＬＰ)\s*[-−]?\s*([0-9][0-9,]*)\s*(?:を\s*)?(?:消費|使用|支払|支出)|([0-9][0-9,]*)\s*(LP|ＬＰ)\s*(?:を\s*)?(?:消費|使用|支払|支出)/gi;
    while ((match = lpPattern.exec(text)) !== null) {
      var lpText = match[1] || match[2];
      var lpOffset = match[1] ? match[0].indexOf(match[1]) : match[0].indexOf(match[2]);
      addCandidate("lp", lpText, match.index + lpOffset, match.index,
        match.index + match[0].length, { index: match.index, 0: match[0], length: match[0].length });
    }

    var shardPattern = /(?:自我の(?:破片|欠片)|(?<!の)(?:欠片|欠け片|かけら|欠けら|カケラ))\s*[-−]?\s*([0-9][0-9,]*)\s*(?:個|つ)?\s*(?:を\s*)?(?:消費|使用|支払|支出)|([0-9][0-9,]*)\s*(?:個|つ)?\s*(?:自我の(?:破片|欠片)|(?<!の)(?:欠片|欠け片|かけら|欠けら|カケラ))\s*(?:を\s*)?(?:消費|使用|支払|支出)/gi;
    while ((match = shardPattern.exec(text)) !== null) {
      var shardText = match[1] || match[2];
      var shardOffset = match[1] ? match[0].indexOf(match[1]) : match[0].indexOf(match[2]);
      addCandidate("shards", shardText, match.index + shardOffset, match.index,
        match.index + match[0].length, { index: match.index, 0: match[0], length: match[0].length });
    }

    var moneyTokenPattern = /(?:LP|ＬＰ)\s*[-−]?\s*[0-9][0-9,]*|(?:自我の(?:破片|欠片)|(?<!の)(?:欠片|欠け片|かけら|欠けら|カケラ))\s*[-−]?\s*[0-9][0-9,]*|[0-9][0-9,]*\s*(?:LP|ＬＰ|自我の(?:破片|欠片)|(?<!の)(?:欠片|欠け片|かけら|欠けら|カケラ))/gi;
    var spendCuePattern = /(?:消費|使用|支払|支出)/gi;
    while ((match = spendCuePattern.exec(text)) !== null) {
      var segmentStart = 0;
      var delimiters = /[、，,。．;；→⇒\n]/g;
      var delimiter;
      while ((delimiter = delimiters.exec(text)) !== null && delimiter.index < match.index) {
        segmentStart = delimiter.index + delimiter[0].length;
      }
      var segment = text.slice(segmentStart, match.index);
      var tokens = [...segment.matchAll(moneyTokenPattern)];
      if (tokens.length < 2) continue;
      var residue = segment.replace(moneyTokenPattern, " ").replace(/[\s　と、および＆&をはの：:()（）]/g, "").trim();
      if (residue) continue;
      for (var ti = 0; ti < tokens.length; ti++) {
        var token = tokens[ti], tokenText = token[0];
        var amountMatch = tokenText.match(/[0-9][0-9,]*/);
        if (!amountMatch) continue;
        var currency = /LP|ＬＰ/i.test(tokenText) ? "lp" : "shards";
        var amountStart = segmentStart + token.index + tokenText.indexOf(amountMatch[0]);
        var tokenStart = segmentStart + token.index;
        addCandidate(currency, amountMatch[0], amountStart, tokenStart,
          match.index + match[0].length, { index: tokenStart, 0: tokenText, length: tokenText.length });
      }
    }

    var negativePattern = /(?:購入し使用|消費|使用|支払|支出)\s*[：:（(]?\s*[-−]\s*([0-9][0-9,]*)\s*(LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)/gi;
    while ((match = negativePattern.exec(text)) !== null) {
      var negativeText = match[1];
      var negativeOffset = match[0].indexOf(negativeText);
      addCandidate(/LP/i.test(match[2]) ? "lp" : "shards", negativeText,
        match.index + negativeOffset, match.index, match.index + match[0].length, null);
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.start - b.start || a.amountStart - b.amountStart);
    var primary = candidates[0];
    primary.additionalSpends = candidates.slice(1);
    return primary;
  }

  function hasUnparsedExplicitExpense(rawLine) {
    var text = normalizeNumericText(rawLine);
    if (!/(?:消費|使用|支払|支出|購入|買った)/.test(text)) return false;
    /* 価格上限・選択券の条件値は支出額ではない。 */
    if (/(?:以下|以上|以内|未満|まで)/.test(text)) return false;
    var money = "(?:(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)\\s*[-−]?\\s*\\d[\\d,]*|\\d[\\d,]*\\s*(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ))";
    var action = "(?:消費|使用|支払|支出)";
    return new RegExp(money + "[^,、。\\n]{0,4}(?:を)?" + action, "i").test(text)
      || new RegExp(action + "[^,、。\\n]{0,12}" + money, "i").test(text)
      || /購入[^,、。\n]{0,12}(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[-−]\s*\d[\d,]*/i.test(text);
  }

  function cleanRewardName(value) {
    var name = String(value || "").trim();
    name = name.replace(/^(?:ガチャ|抽出ガチャ|ガチャ抽出|抽出|パックチケット|テーマパック|パック)\s*[：:]\s*/i, "");
    name = name.replace(/^[：:→\s　]+/, "").trim();
    name = name.replace(/^[「『]/, "").replace(/[」』]$/, "").trim();
    name = name.replace(/(?:の)?(?:獲得|入手)(?:した)?[。．.]?$/, "").trim();
    if (!name || /(?:被り|重複|補償|返還)/.test(name)) return "";
    if (/^(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|自我の破片|自我の欠片)\s*\d*$/i.test(name)) return "";
    /* 選択抽出チケット→ego などの汎用ラベルを実際の獲得名にしない。 */
    if (/^[A-Za-z0-9\s.:_\/-]+$/.test(name)) return "";
    if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return "";
    return name;
  }

  function rewardAfterCurrencySpend(rawLine, end) {
    var raw = String(rawLine || "");
    var text = normalizeNumericText(raw);
    var tail = text.slice(end).trim();
    if (!tail) return "";
    var arrow = tail.lastIndexOf("→");
    var rawTail = raw.slice(end).trim();
    if (arrow >= 0) {
      var afterArrow = tail.slice(arrow + 1).trim();
      /* 支出後の残高は獲得名ではない。「150LP消費→残り300LP」を
         300LPの報酬・購入・所持として立てない。 */
      if (/^(?:(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*)?(?:残り|残高|残額|現在|現座|所持|保有)/.test(afterArrow)) return "";
      rawTail = rawTail.slice(Math.max(0, rawTail.lastIndexOf("→") + 1));
    } else if (!/^\s*(?:(?:ガチャ|抽出ガチャ|ガチャ抽出|抽出|パックチケット|テーマパック|パック)\s*[：:]|[：:])/.test(tail)) {
      return "";
    }
    return cleanRewardName(rawTail);
  }

  /* 「チケット→獲得名」は、チケットの収入ではなく使用の証拠として読む。 */
  function explicitTicketSpendOf(rawLine) {
    var raw = String(rawLine || "");
    var text = normalizeNumericText(raw);
    var ticketAt = text.search(/チケット|チケ/);
    if (ticketAt < 0) return null;
    var arrowAt = text.indexOf("→", ticketAt);
    var hasConsumption = /消費|使用済|使用し|支払|支出|消耗/.test(text);
    /* 「チケット×1消費」のように報酬名が無い履歴も、消費枚数は記録する。 */
    if (arrowAt < 0 && !hasConsumption) return null;
    var source = arrowAt < 0 ? text : text.slice(0, arrowAt);
    /* チケット獲得と「ガチャ結果→…」が同じ行にある場合は使用ではない。
       矢印より前に獲得・報酬・結果があればチケット消費として扱わない。 */
    if (!/チケット|チケ/.test(source) || /(?:\bd\d{2,}|ダイス条件)/i.test(source)
      || /獲得|入手|報酬|収入|ガチャ結果|抽出結果/.test(source)
      || (arrowAt < 0 && !hasConsumption)) return null;
    var isPack = /パックチケット/.test(source);
    var pack = "";
    if (isPack) {
      var pm = source.match(/パックチケット[^「『〈《]*[「『〈《]([^」』〉》]+)[」』〉》]/);
      if (pm) pack = pm[1].trim();
    }
    var count = 1;
    var cm = source.match(/[x×]\s*(\d+)/) || source.match(/(?:チケット|チケ)\s*(\d+)\s*枚/);
    if (cm) count = Number(cm[1]);
    var parsed = isPack ? { kind: "pack", count: count } : ticketOf(source);
    if (!parsed || !Number.isSafeInteger(count) || count <= 0) return null;
    return { kind: isPack ? "pack" : (parsed.kind || "unknown"), count: count, pack: pack,
      reward: arrowAt >= 0 ? cleanRewardName(raw.slice(raw.indexOf("→", ticketAt) + 1)) : "",
      raw: String(rawLine || "").trim() };
  }

  /* 重複で支給された欠片は履歴本文の括弧注記に記録されることがある。
     通常の金額解析は括弧内を誤認防止のため除外するので、重複/被りを明示する
     括弧注記に限って補償額を別途読む（一般的な括弧内数字は収入にしない）。 */
  function duplicateShardCompensationOf(rawLine) {
    const text = normalizeNumericText(rawLine);
    const notes = [...text.matchAll(/[（(]([^（）()]*)[）)]/g)];
    let total = 0;
    let found = false;
    for (const noteMatch of notes) {
      const note = noteMatch[1];
      if (!/(?:ダブ|被り|かぶり|重複)/.test(note)) continue;
      const amounts = [...note.matchAll(/(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*([+]?\d[\d,]*)|([+]?\d[\d,]*)\s*(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)/g)];
      if (!amounts.length) continue;
      found = true;
      for (const amountMatch of amounts) {
        const rawAmount = amountMatch[1] || amountMatch[2] || "";
        if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawAmount)) {
          return { error: "重複補償の欠片額を読み取れません" };
        }
        const amount = Number(rawAmount.replace(/,/g, ""));
        if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(total + amount)) {
          return { error: "重複補償の欠片額が安全整数の範囲外です" };
        }
        total += amount;
      }
    }
    if (found) return { amount: total };
    /* 支出と同じ行の後半に書かれた重複補償は、支出節への切り詰めで
       通常の収入解析から消えることがある。支出の明示通貨額が補償より前にある
       場合だけ別途抽出し、補償単独の行は incomePairs に任せて二重加算を防ぐ。 */
    const duplicateAt = text.search(/(?:被り|かぶり|重複|ダブり)/);
    if (duplicateAt >= 0) {
      const prefix = text.slice(0, duplicateAt);
      const hasPriorCurrencyExpense = /(?:(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)\s*[-+＋−]?\s*\d[\d,]*[^、。，;；\n]{0,16}(?:消費|使用|支払|支出|購入|買った)|(?:消費|使用|支払|支出|購入|買った)[^、。，;；\n]{0,16}(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)\s*[-+＋−]?\s*\d[\d,]*)/i.test(prefix);
      if (hasPriorCurrencyExpense) {
        const tail = text.slice(duplicateAt);
        const unparenthesized = tail.match(/(?:被り|かぶり|重複|ダブり)\s*(?:に(?:より)?|で)\s*(?:(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*([+]?[0-9][0-9,]*)|([+]?[0-9][0-9,]*)\s*(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ))\s*(?:を\s*)?(?:獲得|入手|付与|補償|支給)/);
        if (unparenthesized) {
          const rawAmount = unparenthesized[1] || unparenthesized[2];
          if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawAmount)) return { error: "重複補償の欠片額を読み取れません" };
          const amount = Number(rawAmount.replace(/,/g, ""));
          if (!Number.isSafeInteger(amount) || amount < 0) return { error: "重複補償の欠片額が安全整数の範囲外です" };
          return { amount };
        }
      }
    }
    return null;
  }

  /* 「消費：LP30」「消費：欠片50×3=150」「消費：150+300→欠片450」の消費記帳。
     収入の読みへ流すと支払額が収入として乗るので、通貨に隣接する数値だけを
     支出として読む。チケット1枚や「+1権」は金額ではないので数えない。
     金額が一つも読めなければ null（消費以外の読みを妨げない）。 */
  function consumptionOf(line, reasons) {
    var m = String(line || "").match(/^\s*[・･]?\s*(?:消費|支出|支払い?)\s*[：:]\s*(.+?)\s*$/);
    if (!m) return null;
    var body = normalizeAmountText(m[1])
      /* 「硝子の欠片」は通貨の欠片ではなくアイテムの消費。 */
      .replace(/硝子の(?:欠片|欠け片|かけら|欠けら|カケラ|破片)\s*(?:[×xｘ]\s*\d+)?/g, " ")
      /* 「200LP以下」の数量条件は支払額ではない。 */
      .replace(/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*\d+\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*(?:以下|以上|以内|未満|まで)/g, " ")
      /* 「欠片50×3=150」「75×2=150欠片」は合計額を読む。 */
      .replace(/\d+\s*[×xｘ]\s*\d+\s*[=＝]\s*(\d+)/g, "$1")
      /* 「150+300→欠片450」は矢印の右が支払額。 */
      .replace(/\d+(?:\s*[+＋]\s*\d+)*\s*[→⇒]\s*/g, " ");
    var pairs = incomePairs(body);
    var cost = { lp: 0, shards: 0 };
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].amount > 0) {
        addSafeAmount(cost, pairs[i].currency, pairs[i].amount, line, reasons, "消費額");
      }
    }
    if (!cost.lp && !cost.shards) return null;
    var raw = String(line).trim();
    return { name: raw, lp: cost.lp, shards: cost.shards, raw: raw, reason: "消費の記帳" };
  }


  /* 硝子窓側の記載整合性と、パーサ側の検出範囲を別々に監査する。 */
  function auditSafeInteger(raw) {
    const value = Number(String(raw || "").replace(/,/g, ""));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function standaloneCurrencyAmount(line, currency) {
    const text = normalizeNumericText(line).trim().replace(/[：:]+$/, "").trim();
    if (!text || /現在|残高|現座|残り/.test(text)) return null;
    let match = null;
    if (currency === "lp") {
      match = text.match(/^(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*(\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*(?:LP|ＬＰ)?[。．.]?$/i)
        || text.match(/^[+＋\-−]?\s*(\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*(?:LP|ＬＰ)[。．.]?$/i);
    } else {
      match = text.match(/^(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片)\s*[：:]?\s*[+＋\-−]?\s*(\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*(?:(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片))?[。．.]?$/)
        || text.match(/^[+＋\-−]?\s*(\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片)[。．.]?$/);
    }
    if (!match) return null;
    const value = match[1].split(/[+＋]/).reduce((sum, part) => sum + Number(part.replace(/[,\s]/g, "")), 0);
    return Number.isSafeInteger(value) ? { currency: currency, amount: value, raw: String(line || "").trim() } : null;
  }

  function boundedRewardFormulaOf(line) {
    const text = normalizeNumericText(line);
    const definitions = [
      { currency: "lp", regex: /(?:LP|ＬＰ)\s*[：:]?\s*(\d[\d,]*)\s*[+＋]\s*[（(]([^）)]*)[）)]/i },
      { currency: "shards", regex: /(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|欠け片)\s*[：:]?\s*(\d[\d,]*)\s*[+＋]\s*[（(]([^）)]*)[）)]/ }
    ];
    for (const definition of definitions) {
      const match = text.match(definition.regex);
      if (!match) continue;
      const base = auditSafeInteger(match[1]);
      const multiplierMatch = match[2].match(/[x×]\s*(\d[\d,]*)/i);
      const capMatch = match[2].match(/(?:最大|上限|max)\s*[_：:\s]*\s*(\d[\d,]*)/i);
      const multiplier = multiplierMatch ? auditSafeInteger(multiplierMatch[1]) : null;
      const cap = capMatch ? auditSafeInteger(capMatch[1]) : null;
      if (base === null || multiplier === null || cap === null || !Number.isSafeInteger(base + cap)) continue;
      return { currency: definition.currency, base: base, multiplier: multiplier, cap: cap,
        min: base, max: base + cap, raw: String(line || "").trim() };
    }
    return null;
  }

  function explicitArithmeticMismatch(line) {
    const text = normalizeNumericText(line);
    if (!/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/i.test(text)) return null;
    const multiply = text.match(/(\d[\d,]*)\s*[×xｘ]\s*(\d[\d,]*)\s*[=＝]\s*(\d[\d,]*)/);
    const sum = text.match(/(\d[\d,]*)\s*[+＋]\s*(\d[\d,]*)\s*[=＝]\s*(\d[\d,]*)/);
    const arrowSum = text.match(/(\d[\d,]*)\s*[+＋]\s*(\d[\d,]*)\s*[→⇒]\s*(?:(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*)?(\d[\d,]*)/i);
    const match = multiply || sum || arrowSum;
    if (!match) return null;
    const left = auditSafeInteger(match[1]);
    const right = auditSafeInteger(match[2]);
    const written = auditSafeInteger(match[3]);
    if (left === null || right === null) return { expression: match[0], expected: null, written: written, issue: "unsafe-input" };
    const expected = multiply ? left * right : left + right;
    if (!Number.isSafeInteger(expected)) return { expression: match[0], expected: null, written: written, issue: "unsafe-result" };
    if (written === null) return { expression: match[0], expected: expected, written: null, issue: "unsafe-written-result" };
    if (expected === written) return null;
    return { expression: match[0], expected: expected, written: written };
  }

  function conditionalRewardRuleOf(line) {
    const text = normalizeNumericText(line);
    /* チケットから欠片への条件付き変換には専用の既存処理がある。ここで行全体を止めない。 */
    if (/(?:変換|換算)/.test(text)) return null;
    const hasConditionalCue = /(?:達成してたら|達成したら|してたら|していたら|できたら|できなかった場合|出来なかった場合|(?:以下|以上)の場合|(?:以下|以上)なら|同じ出目なら|クリティカルかファンブルなら|条件を満たすと|条件を満たした場合|なら\s*(?:人格|E\.?G\.?O|エゴ|抽出|LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|チケ|チケット))/i.test(text);
    if (!hasConditionalCue || !/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片|チケ|チケット|抽出🎫)/i.test(text) || !/\d/.test(text)) return null;
    if (/(?:条件不成立|未達成|条件を満たさなかった|同じ出目ではなかった|条件未達|失敗が確定)/.test(text)) {
      return { status: "condition-not-met", raw: String(line || "").trim(), skipLine: true };
    }
    /* 使用済みは条件付き付与の成立を示す記録なので、既存のチケット読取を妨げない。 */
    if (/(?:使用済み?|消費済み?|獲得済み?|取得済み?)/.test(text)) return null;
    const hasTicket = /チケ|チケット|抽出🎫/.test(text);
    return { status: "condition-unconfirmed", raw: String(line || "").trim(), skipLine: !hasTicket };
  }

  function normalizeAuditMoneyLine(rawLine) {
    let text = normalizeAmountText(rawLine);
    text = stripAlternativePriceCondition(text).text;
    return stripThemePackPriceCap(stripBalances(text))
      .replace(/(?:LP|ＬＰ)\s*\d[\d,]*\s*(?:以下|以上|以内|未満|まで)|\d[\d,]*\s*(?:LP|ＬＰ)\s*(?:以下|以上|以内|未満|まで)/gi, " ")
      .replace(/(?:硝子|ガラス|硝酸)の(?:破片|欠片|欠け片|かけら|欠けら|カケラ|欠け片)/g, " ")
      /* "56(理性45+11)欠片" は外側56が通貨額。括弧内を候補にすると
         独立検算だけが金額を見失い、正しく抽出した56を誤差扱いする。
         被り・重複補償の括弧は別ロジックが読むので削除しない。 */
      .replace(/([+＋\-−]?\s*\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*[（(]([^）)]*)[）)](?=\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか)))/gi,
        (whole, amount, note) => /(?:被り|かぶり|重複|ダブり)/.test(note) ? whole : amount)
      .replace(/-?\d+(?:\s*[+＋]\s*\d+)*\s*(LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片))\s*へ/gi, " ")
      .replace(/\d+\s*[×xｘ]\s*\d+\s*[=＝]\s*(\d+)/g, "$1")
      .replace(/\d+\s*[+＋]\s*\d+\s*[=＝]\s*(\d+)/g, "$1")
      .replace(/\d+\s*[+＋]\s*[^\s\d]+\s*[=＝]\s*(\d+)/g, "$1")
      .replace(/\d+(?:\s*[+＋]\s*\d+)*\s*[→⇒]\s*/g, " ")
      .replace(/(LP|ＬＰ)\s*報酬/gi, "$1");
  }

  function auditMoneyRowsOfLine(rawLine, mode) {
    if (/^\s*[▶►▷]/.test(String(rawLine || ""))) return [];
    const text = normalizeAuditMoneyLine(rawLine);
    const rows = [];
    const usedAmounts = new Set();
    const currencyPattern = /(LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか|欠け片))/gi;
    const detectedExpense = currencySpendOf(text, true);
    const explicitExpenseRanges = detectedExpense
      ? [detectedExpense].concat(detectedExpense.additionalSpends || []).map((item) => ({
          currency: item.currency, amountStart: item.amountStart, amountEnd: item.amountEnd,
          amount: item.amount
        }))
      : [];
    const incomeCue = /報酬|収入|獲得|入手|取得|受領|付与|支給|補填|もら/;
    let match;
    while ((match = currencyPattern.exec(text)) !== null) {
      const candidates = [];
      const prefix = text.slice(0, match.index);
      const before = prefix.match(/([+＋\-−]?\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)\s*(?:[：:]?\s*)$/);
      if (before) {
        const start = before.index + before[0].indexOf(before[1]);
        const end = start + before[1].length;
        candidates.push({ rawAmount: before[1], amountStart: start, amountEnd: end, gap: match.index - end, position: "before" });
      }
      const suffix = text.slice(currencyPattern.lastIndex);
      const after = suffix.match(/^\s*[：:]?\s*([+＋\-−]?\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*)/);
      if (after) {
        const start = currencyPattern.lastIndex + after[0].indexOf(after[1]);
        const end = start + after[1].length;
        candidates.push({ rawAmount: after[1], amountStart: start, amountEnd: end, gap: start - currencyPattern.lastIndex, position: "after" });
      }
      const freshCandidates = candidates.filter((candidate) => {
        for (let i = candidate.amountStart; i < candidate.amountEnd; i++) if (usedAmounts.has(i)) return false;
        return true;
      });
      freshCandidates.sort((a, b) => a.gap - b.gap || (a.position === "after" ? -1 : 1));
      const chosen = freshCandidates[0];
      if (!chosen) continue;
      const compact = chosen.rawAmount.replace(/\s/g, "");
      const sign = compact.charAt(0);
      const parts = compact.replace(/^[+＋\-−]/, "").split(/[+＋]/);
      let amount = parts.reduce((sum, part) => sum + Number(part.replace(/,/g, "")), 0);
      if (!Number.isSafeInteger(amount) || amount < 0) continue;
      for (let i = chosen.amountStart; i < chosen.amountEnd; i++) usedAmounts.add(i);
      const currency = /^(?:LP|ＬＰ)$/i.test(match[1]) ? "lp" : "shards";
      const explicitExpenseForToken = explicitExpenseRanges.find((item) =>
        item.currency === currency && item.amountStart === chosen.amountStart && item.amountEnd === chosen.amountEnd
      );
      /* The expense parser already applies an explicit pack-count multiplier. Mirror that
         amount on the audit side so "LP200 ... theme pack x2" is compared as 400, not 200. */
      if (explicitExpenseForToken && Number.isSafeInteger(explicitExpenseForToken.amount) && explicitExpenseForToken.amount >= 0) {
        amount = explicitExpenseForToken.amount;
      }
      let direction = sign === "-" || sign === "−" ? "spend" : sign === "+" || sign === "＋" ? "income" : "";
      if (!direction) {
        if (explicitExpenseForToken) direction = "spend";
        /* Conversion without explicit signs does not establish which currency increased.
           Do not inherit the surrounding income section as a guessed direction. */
        else if (/(?:変換|換算)/.test(text)) direction = "unknown";
        else if (mode === "income" || mode === "spend") direction = mode;
        else direction = incomeCue.test(text.slice(0, chosen.amountStart)) ? "income" : "unknown";
      }
      rows.push({ currency, amount, direction: direction || "unknown", rawAmount: chosen.rawAmount, amountStart: chosen.amountStart, amountEnd: chosen.amountEnd });
    }
    return rows;
  }

  function auditMoneyTotalsOfLine(rawLine) {
    const totals = { lp: 0, shards: 0 };
    for (const row of auditMoneyRowsOfLine(rawLine, "")) totals[row.currency] += row.amount;
    return totals;
  }

  function auditMoneyFlowsOfLine(rawLine, mode) {
    const flows = {
      lpIncome: 0, lpSpend: 0, lpUnknown: 0,
      shardsIncome: 0, shardsSpend: 0, shardsUnknown: 0
    };
    for (const row of auditMoneyRowsOfLine(rawLine, mode)) {
      const key = row.currency === "lp" ? "lp" : "shards";
      const suffix = row.direction === "income" ? "Income" : row.direction === "spend" ? "Spend" : "Unknown";
      flows[key + suffix] += row.amount;
    }
    return flows;
  }

  function auditLineCoverage(rawLine, expected, detected, hasMoneyReviewReason, section, lineIndex, expectedFlows, detectedFlows) {
    if (/^\s*[▶►▷]/.test(String(rawLine || ""))) return null;
    const totalsMatch = expected.lp === detected.lp && expected.shards === detected.shards;
    let flowMatch = null;
    if (expectedFlows && detectedFlows &&
        !(expectedFlows.lpUnknown || expectedFlows.shardsUnknown)) {
      flowMatch = ["lpIncome", "lpSpend", "shardsIncome", "shardsSpend"].every(
        (key) => Number(expectedFlows[key] || 0) === Number(detectedFlows[key] || 0)
      );
    }
    const directionMismatch = flowMatch === false;
    const amountMismatch = !totalsMatch;
    if (hasMoneyReviewReason || (totalsMatch && !directionMismatch && (flowMatch === true || !expectedFlows))) return null;
    if (totalsMatch && !directionMismatch && flowMatch === null) {
      return {
        side: "parser", code: "financial-line-direction-review", severity: "review",
        lineIndex: lineIndex, line: String(rawLine || ""), section: section,
        expected: { lp: expected.lp, shards: expected.shards },
        detected: { lp: detected.lp, shards: detected.shards },
        message: "金額候補の合計は一致していますが、原文から収支方向を一意に確定できません。収入・支出の向きを確認してください。"
      };
    }
    const code = amountMismatch && directionMismatch
      ? "possible-result-amount-and-direction-mismatch"
      : directionMismatch
        ? "possible-result-direction-misclassification"
        : "possible-result-detection-omission";
    const message = amountMismatch && directionMismatch
      ? "原文から抽出した金額合計と収支方向の両方が解析結果と一致しません。金額の二重計上・倍率・残高注記の混入を含め、原文を確認してください。"
      : directionMismatch
        ? "原文の金額合計は一致していても、収入・支出の向きが解析結果と一致しません。取引方向の誤分類候補として原文を確認してください。"
        : "原文の通貨額候補は LP " + expected.lp + " / 欠片 " + expected.shards +
          " ですが、この行から生成された記録は LP " + detected.lp + " / 欠片 " + detected.shards +
          " です。リザルト側の検出漏れ・金額の取り違え候補として原文を確認してください。";
    return {
      side: "parser", code, severity: "warning",
      lineIndex: lineIndex, line: String(rawLine || ""), section: section,
      expected: { lp: expected.lp, shards: expected.shards },
      detected: { lp: detected.lp, shards: detected.shards },
      expectedFlows: expectedFlows || null, detectedFlows: detectedFlows || null,
      message
    };
  }

  function analyzeSourceMemo(lines) {
    const skipLines = new Set();
    const findings = [];
    const formulas = [];
    for (let i = 0; i < lines.length; i++) {
      if (isNarrativeLine(lines[i])) { skipLines.add(i); continue; }
      const formula = boundedRewardFormulaOf(lines[i]);
      if (!formula) continue;
      skipLines.add(i);
      formulas.push({ index: i, ...formula });
    }
    for (const formula of formulas) {
      const later = [];
      for (let j = formula.index + 1; j < lines.length; j++) {
        if (skipLines.has(j) || conditionalRewardRuleOf(lines[j])) continue;
        const amount = standaloneCurrencyAmount(lines[j], formula.currency);
        if (amount) later.push({ index: j, ...amount });
      }
      if (later.length === 1) {
        const actual = later[0], inRange = actual.amount >= formula.min && actual.amount <= formula.max;
        findings.push({
          side: "source-data", code: inRange ? "formula-result-in-range" : "formula-result-range-mismatch",
          severity: inRange ? "info" : "warning", lineIndex: formula.index + 1, line: formula.raw,
          relatedLineIndex: actual.index + 1, relatedLine: actual.raw, currency: formula.currency,
          expectedRange: { min: formula.min, max: formula.max }, reportedAmount: actual.amount,
          message: inRange
            ? "報酬の規則は " + formula.min + "～" + formula.max + "。記載された実績 " + actual.amount + " は範囲内です。規則の基準値は収入へ加算していません。"
            : "報酬の規則は " + formula.min + "～" + formula.max + " ですが、実績の記載値は " + actual.amount + " です。硝子窓側の計算・条件設定を確認してください。実績値は自動修正していません。"
        });
        if (!inRange) skipLines.add(actual.index);
      } else if (later.length === 0) {
        findings.push({
          side: "source-data", code: "formula-without-realized-amount", severity: "review",
          lineIndex: formula.index + 1, line: formula.raw, currency: formula.currency,
          expectedRange: { min: formula.min, max: formula.max },
          message: "これは報酬計算の規則ですが、実績額が見当たりません。基準値 " + formula.base + " を収入扱いせず、実績値の記載を確認してください。"
        });
      } else {
        for (const row of later) skipLines.add(row.index);
        findings.push({
          side: "source-data", code: "formula-realized-amount-ambiguous", severity: "review",
          lineIndex: formula.index + 1, line: formula.raw, currency: formula.currency,
          relatedLines: later.map((row) => ({ lineIndex: row.index + 1, line: row.raw, amount: row.amount })),
          message: "計算規則の後に同じ通貨の実績候補が複数あります。どの値が今回の実績か一意に決められないため、該当額を自動計上せず確認対象にしました。"
        });
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (skipLines.has(i)) continue;
      const mismatch = explicitArithmeticMismatch(lines[i]);
      if (mismatch) {
        skipLines.add(i);
        findings.push({
          side: "source-data", code: "source-arithmetic-mismatch", severity: "warning",
          lineIndex: i + 1, line: String(lines[i] || "").trim(), expression: mismatch.expression,
          expectedAmount: mismatch.expected, writtenAmount: mismatch.written,
          message: mismatch.expected === null
            ? "元メモの計算結果が安全整数の範囲外です。この金額は自動計上せず、硝子窓側の計算を確認してください。"
            : "元メモの計算式 " + mismatch.expression + " は " + mismatch.expected + " が正しい結果ですが、記載値は " + mismatch.written + " です。硝子窓側の計算ミスの可能性があるため、自動計上を止めています。"
        });
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (skipLines.has(i)) continue;
      const conditional = conditionalRewardRuleOf(lines[i]);
      if (!conditional) continue;
      if (conditional.skipLine) skipLines.add(i);
      findings.push({
        side: "source-data", code: conditional.status, severity: "review", lineIndex: i + 1, line: conditional.raw,
        message: conditional.status === "condition-not-met"
          ? "条件付き報酬ですが、原文に条件不成立の記録があります。該当額・チケットは実績として計上していません。"
          : "条件付き報酬・調整の規則です。条件成立を原文から確認できないため、自動計上せず確認対象にしました。"
      });
    }
    return { skipLines: skipLines, findings: findings };
  }

  function auditSpendTotal(rows, currency) {
    return (rows || []).reduce((sum, row) => sum + Math.abs(Number(row && row[currency]) || 0), 0);
  }

  function parseMemo(memo) {
    var income = { lp: 0, shards: 0 };
    var tickets = { persona: 0, ego: 0, choice: 0 };
    var pack = {};
    var spends = [];
    var reasons = [];
    /* シナリオで直接払い出された人格/E.G.O の名前。 */
    var wins = [];
    var consumedItems = [];
    var ticketSpends = [];

    var lines = String(memo || "").split(/\r?\n/);
    var sourceAuditAnalysis = analyzeSourceMemo(lines);
    var sourceAudits = sourceAuditAnalysis.findings.slice();
    var financialCoverage = [];
    var mode = "income";
    var egoPurchaseMode = false;
    var egoPurchaseItems = [];
    var egoPurchaseSummaries = [];
    var currencyDiscrepancies = [];
    var prevLine = "";

    /* 通貨支出と同じ行にチケット消費がある場合も、両方を1回ずつ保持する。 */
    function recordExplicitTicketSpend(spend) {
      if (!spend) return;
      ticketSpends.push({
        kind: spend.kind,
        pack: spend.pack || "",
        count: spend.count,
        raw: spend.raw
      });
      if (spend.reward && !wins.some((w) => w.name === spend.reward)) {
        wins.push({
          name: spend.reward,
          via: spend.kind === "pack"
            ? "パックチケット" + (spend.pack ? "「" + spend.pack + "」" : "")
            : (TICKET_LABEL[spend.kind] || "抽出チケット"),
          kind: spend.kind
        });
      }
    }

    /* 「LP/欠片」見出し＋「120/80」の対（合計優先）は行スキャンと別に一度だけ読む。 */
    var slashPair = parseSlashPairs(memo);
    addSafeAmount(income, "lp", slashPair.lp, memo, reasons, "LP収入の合計");
    addSafeAmount(income, "shards", slashPair.shards, memo, reasons, "欠片収入の合計");

    for (var i = 0; i < lines.length; i++) {
      var sourceLine = String(lines[i]).trim();
      var auditBefore = {
        lp: income.lp, shards: income.shards, spends: spends.length, reasons: reasons.length,
        ticketPersona: tickets.persona, ticketEgo: tickets.ego, ticketChoice: tickets.choice,
        pack: JSON.stringify(pack), wins: wins.length, consumedItems: consumedItems.length,
        ticketSpends: ticketSpends.length
      };
      var auditModeBefore = mode;
      var currentModeCoverageRecorded = false;
      try {
      var typoCurrentMarker = /現座(?=\s*(?:(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)\s*)?[0-9０-９])/i.test(sourceLine);
      var line = typoCurrentMarker ? sourceLine.replace(/現座/g, "現在") : sourceLine;
      if (typoCurrentMarker) {
        reasons.push({
          line: sourceLine,
          reason: "「現座」は「現在」の誤記と推定しました。残高として扱いましたが、原文の確認が必要です"
        });
      }
      if (!line) continue;
      if (isNarrativeLine(line)) continue;
      /* ▶で始まる効果説明は記述であり、通貨支出ではない。 */
      if (/^\s*[▶►▷]/.test(sourceLine)) continue;

      /* 金額が矢印に挟まれ、次の列に操作語がある行は、残高遷移か
         実取引かをこの文字列だけでは確定できない。帳簿には計上せず、
         通常の parser flow に入る前に専用のレビューcoverageとして保持する。 */
      const balanceArrowTokens = [...sourceLine.matchAll(/[→⇒]/g)];
      if (auditModeBefore !== "current" && balanceArrowTokens.length >= 2) {
        const amountBetweenBalanceArrows = sourceLine.slice(
          balanceArrowTokens[0].index + 1,
          balanceArrowTokens[1].index
        );
        const hasCurrencyAmountBetweenBalanceArrows =
          /(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+(?:[,，][0-9０-９]{3})*|[+＋\-−]?\s*[0-9０-９]+(?:[,，][0-9０-９]{3})*\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))/i
            .test(amountBetweenBalanceArrows);
        const actionAfterBalanceArrow =
          /報酬|収入|消費|支出|支払|購入|買っ|使用|行使|抽出|ガチャ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算/.test(
            sourceLine.slice(balanceArrowTokens[1].index + 1)
          );
        if (hasCurrencyAmountBetweenBalanceArrows && actionAfterBalanceArrow) {
          const expectedTransition = auditMoneyTotalsOfLine(sourceLine);
          const detectedTransition = { lp: 0, shards: 0 };
          const zeroTransitionFlows = {
            lpIncome: 0, lpSpend: 0, lpUnknown: 0,
            shardsIncome: 0, shardsSpend: 0, shardsUnknown: 0
          };
          financialCoverage.push({
            lineIndex: i + 1, line: sourceLine, section: auditModeBefore || null,
            status: "balance-transition-review",
            expected: { lp: expectedTransition.lp, shards: expectedTransition.shards },
            detected: detectedTransition,
            expectedFlows: auditMoneyFlowsOfLine(sourceLine, auditModeBefore),
            detectedFlows: zeroTransitionFlows,
            parserReasonCount: 0, sourceFinding: false
          });
          sourceAudits.push({
            side: "parser", code: "financial-action-in-balance-transition", severity: "review",
            lineIndex: i + 1, line: sourceLine, section: auditModeBefore || null,
            expected: { lp: expectedTransition.lp, shards: expectedTransition.shards },
            detected: detectedTransition,
            message: "矢印間の通貨額と後続の操作語を検出しました。残高注記か実取引か確認するまで、自動計上していません。"
          });
          currentModeCoverageRecorded = true;
          continue;
        }
      }

      var prev = prevLine;
      prevLine = line;
      if (sourceAuditAnalysis.skipLines.has(i)) continue;

      var glassConsumption = parseGlassConsumption(line);
      if (glassConsumption) {
        consumedItems.push(glassConsumption);
        continue;
      }

      /* 「LPを欠片に変換：+11欠片 -22LP」のような両替は、通貨ごとの符号を守る。
         正の通貨は収入、負の通貨は支出に分ける。両方を spends に入れると、
         欠片+11まで減算され、残高監査の帳尻が反転してしまう。 */
      if (/(?:変換|換算)/.test(line) && hasLp(line) && hasShard(line)) {
        /* 変換行は通貨の対応が符号で明示された場合だけ記帳する。
           「22LP 11欠片」は増減方向を確定できないため、双方とも計上しない。 */
        var conversionTokens = [...normalizeNumericText(line).matchAll(
          /([+\-−]?\s*\d[\d,]*)\s*(LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))|(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[：:]?\s*([+\-−]?\s*\d[\d,]*)/gi
        )];
        var conversionSignsComplete = conversionTokens.length >= 2 && conversionTokens.every(function (token) {
          var amountText = String(token[1] || token[3] || "").trim();
          return /^[+\-−]/.test(amountText);
        });
        if (!conversionSignsComplete) {
          reasons.push({ line: sourceLine, reason: "通貨変換の金額に増減符号がなく、変換方向を確定できないため両通貨とも未計上にしました" });
          continue;
        }
        var conversionPairs = incomePairs(line);
        var conversionCost = { lp: 0, shards: 0 };
        var conversionHasSignedAmount = false;
        for (var conversionIndex = 0; conversionIndex < conversionPairs.length; conversionIndex++) {
          var conversionPair = conversionPairs[conversionIndex];
          if (!Number.isSafeInteger(conversionPair.amount)) {
            reasons.push({ line: sourceLine, reason: "通貨変換の金額が安全整数の範囲外です。収支を未計上にしました" });
            continue;
          }
          if (conversionPair.amount > 0) {
            conversionHasSignedAmount = true;
            addSafeAmount(income, conversionPair.currency, conversionPair.amount, sourceLine, reasons, "通貨変換の収入");
          } else if (conversionPair.amount < 0) {
            conversionHasSignedAmount = true;
            addSafeAmount(conversionCost, conversionPair.currency, -conversionPair.amount, sourceLine, reasons, "通貨変換の支出");
          }
        }
        if (!conversionHasSignedAmount) {
          reasons.push({ line: sourceLine, reason: "通貨変換の正負の金額を区別できないため、LP・欠片の増減を要確認にしました" });
        } else if (conversionCost.lp || conversionCost.shards) {
          spends.push({
            name: line, lp: conversionCost.lp, shards: conversionCost.shards,
            raw: line, reason: "通貨変換の支出"
          });
        }
        continue;
      }

      /* 「消費：LP30」「消費：欠片50×3=150」などの消費記帳。
         報酬・チケット行として読み直すと消費を収入へ加えてしまう。 */
      var consumption = consumptionOf(line, reasons);
      if (consumption) {
        spends.push(consumption);
        /* 消費の行を通貨支出として確定しても、併記された抽出チケット消費は落とさない。
           ticketSpends は「収入」ではなく使用証拠の記録なので、通貨明細とは別に残す。 */
        recordExplicitTicketSpend(explicitTicketSpendOf(line));
        continue;
      }

      /* E.G.O指定購入の見出し・項目行は通常の報酬箇条書きとして処理しない。 */
      var egoHeader = isEgoPurchaseHeader(line);
      var sec = sectionOf(line);
      var isBullet = false;
      var markedLine = line.match(/^\s*([・･▼▽▶▷■□◆◇★☆●○])\s*(.+?)\s*$/);
      if (egoPurchaseMode && markedLine && !egoHeader && /^[・･]$/.test(markedLine[1]) &&
          !/^(?:支出|支払|現在|獲得|報酬|終了|備考|補足|結果|RESULT)(?:$|\s|[:：])/.test(markedLine[2])) {
        line = markedLine[2].trim();
        sec = "";
        isBullet = true;
      }
      if (egoPurchaseMode && markedLine && !egoHeader && !/^[・･]$/.test(markedLine[1])) {
        /* 「▼別シナリオ」等の次の見出しで購入モードを解除する。 */
        egoPurchaseMode = false;
      }
      if (sec) {
        if (sec !== "other") {
          mode = sec;
          egoPurchaseMode = egoHeader;
          continue;
        }
        egoPurchaseMode = false;
        isBullet = true;
        line = line.replace(/^\s*(?:[・･]|[▼▽▶▷■□◆◇★☆●○])\s*/, "");
        /* 「・(願いの数x10)LP - 20LP」のような記号の計算は金額にしない。 */
        if (/[（(][^）)]*[x×][^）)]*[）)]/.test(line)) continue;
      }
      if (mode === "current") {
        /* 現在値の羅列は収支へ取り込まない。ただし行監査から消えると、共有URL実データで
           金額＋操作語の候補行にcoverage欠落が出るため、残高注記／要確認として保存する。 */
        const currentExpected = auditMoneyTotalsOfLine(sourceLine);
        const currentAmountShape = /(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[+＋\-−]?\s*[0-9０-９]+\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))/i.test(sourceLine);
        if (currentExpected.lp || currentExpected.shards || currentAmountShape) {
          const currentActionCue = /報酬|収入|消費|支出|支払|購入|買っ|使用|行使|抽出|ガチャ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算|チケット|チケ/.test(sourceLine);
          const currentDetectedFlows = { lpIncome: 0, lpSpend: 0, lpUnknown: 0, shardsIncome: 0, shardsSpend: 0, shardsUnknown: 0 };
          const currentDetected = { lp: 0, shards: 0 };
          const currentStatus = currentActionCue ? "current-balance-review" : "current-balance-note";
          financialCoverage.push({
            lineIndex: i + 1, line: sourceLine, section: "current", status: currentStatus,
            expected: { lp: currentExpected.lp, shards: currentExpected.shards },
            detected: currentDetected,
            expectedFlows: auditMoneyFlowsOfLine(sourceLine, "current"),
            detectedFlows: currentDetectedFlows,
            parserReasonCount: 0, sourceFinding: false
          });
          if (currentActionCue) {
            sourceAudits.push({
              side: "parser", code: "financial-action-in-current-balance-section", severity: "review",
              lineIndex: i + 1, line: sourceLine, section: "current",
              expected: { lp: currentExpected.lp, shards: currentExpected.shards },
              detected: currentDetected,
              message: "現在残高モードの金額＋操作候補です。残高注記か実取引か確認するまで、自動計上していません。"
            });
          }
          currentModeCoverageRecorded = true;
        }
        continue;  // 現在値を収入・支出として取り込まない
      }

      if (egoPurchaseMode && mode === "spend") {
        var egoSummary = egoPurchaseSummaryOf(line);
        if (egoSummary) {
          egoPurchaseSummaries.push(egoSummary);
          continue;
        }
        if (/(?:現在|残高|残り)/.test(line)) continue;
        var egoName = egoPurchaseItemNameOf(line);
        if (egoName) {
          var egoAmounts = egoCurrencyAmounts(line);
          var listedLp = egoAmounts.lp ? amountNear(line, "lp", false) : null;
          var listedShards = egoAmounts.shards ? amountNear(line, "shards", false) : null;
          var explicitEgoPrice = listedLp !== null || listedShards !== null;
          var egoDbRow = findEgoPurchaseDbRow(line, egoName);
          var egoDbPrice = Number.parseInt(egoDbRow && egoDbRow.shards, 10) || 0;
          var egoLpCost = explicitEgoPrice && listedLp !== null ? Math.abs(listedLp) : 0;
          var egoShardCost = explicitEgoPrice && listedShards !== null ? Math.abs(listedShards)
            : (!explicitEgoPrice && egoDbPrice > 0 ? egoDbPrice : 0);
          egoPurchaseItems.push({
            name: egoName, lp: egoLpCost, shards: egoShardCost, raw: line,
            explicitPrice: explicitEgoPrice, dbPrice: egoDbPrice
          });
          spends.push({
            name: egoName, lp: egoLpCost, shards: egoShardCost, raw: line,
            reason: explicitEgoPrice ? "E.G.O指定購入（項目別価格）"
              : (egoDbPrice > 0 ? "E.G.O指定購入（DB価格補完）" : "E.G.O指定購入（価格未確定）")
          });
          wins.push({ name: egoName, raw: line, via: "E.G.O指定購入", kind: "ego", bought: true });
          if (egoDbPrice > 0 && explicitEgoPrice && (egoLpCost !== 0 || egoShardCost !== egoDbPrice)) {
            currencyDiscrepancies.push({
              code: "ego-item-price-mismatch",
              title: "E.G.Oの項目別価格がDB価格と一致しません",
              line: line,
              detail: "「" + egoName + "」の記録価格は " +
                (egoLpCost ? egoLpCost + " LP" : "") +
                (egoLpCost && egoShardCost ? " + " : "") +
                (egoShardCost ? egoShardCost + "欠片" : "") +
                "、DB価格は " + egoDbPrice + "欠片です。元の記録価格は保持し、自動修正していません。"
            });
          }
          if (egoLpCost === 0 && egoShardCost === 0) {
            reasons.push({ line: line, reason: "E.G.O指定購入の項目別価格を読み取れず、DBにも価格がありません" });
          }
          continue;
        }
        if (/消費欄|消費額|消費合計|購入合計|合計消費|項目別価格合計|支出額|総額/.test(line)) {
          reasons.push({ line: line, reason: "E.G.O指定購入の合計欄を数値として読み取れません" });
          continue;
        }
      }

      /* 「200LP以下のテーマパック×1」のように価格上限とテーマパックだけが書かれ、
         「チケット」か実支出かが不明な行を黙って通過させない。金額は控除・計上せず、
         操作種別だけを確認対象にする。明示的な「テーマパックチケット」は後段の
         pack-ticket 判定が扱うため、ここでは二重警告を避ける。 */
      var cappedPackWithoutTicket = mode === "income"
        && (
          /(?:[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)|(?:LP|ＬＰ)\s*[0-9０-９][0-9０-９,，]*)\s*(?:以下|以内|未満|まで)[^。\n]*テーマパック/i.test(line)
          || /上限\s*(?:(?:LP|ＬＰ)\s*)?[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?[^。\n]*テーマパック/i.test(line)
          || /テーマパック[^。\n]*上限\s*[:：]?\s*(?:(?:LP|ＬＰ)\s*)?[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?/i.test(line)
          || /(?:[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?\s*上限[^。\n]*テーマパック|テーマパック[^。\n]*[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ)?\s*上限)/i.test(line)
        )
        && !/チケ|チケット/.test(line);
      if (cappedPackWithoutTicket) {
        reasons.push({
          line: sourceLine,
          reason: "LP上限付きのテーマパック表記ですが、チケットか実購入かが明示されていないため、パック券の所持数・LP支出のどちらにも自動計上していません。券なら「テーマパックチケット×1」、購入なら「LP200消費」のように明記してください"
        });
      }
      if (cappedPackWithoutTicket) {
        line = stripThemePackPriceCap(line).replace(/テーマパック(?:\s*[×xｘ]\s*\d+)?/gi, " ");
      }

      /* 括弧内に明記された重複補償は、通常の収入解析で括弧ごと除外される。
         重複/被りを伴う注記だけを収入に戻し、一般的な括弧内数字は無視する。 */
      var duplicateCompensation = duplicateShardCompensationOf(line);
      if (duplicateCompensation) {
        if (duplicateCompensation.error) reasons.push({ line: line, reason: duplicateCompensation.error });
        else addSafeAmount(income, "shards", duplicateCompensation.amount, line, reasons, "重複補償の欠片収入");
      }

      /* 明示された通貨消費をチケット収入・抽出回数と混同しない。 */
      var malformedCommaSpend = hasMalformedCurrencyGrouping(sourceLine) && /(?:消費|使用|支払|支出|購入)/.test(normalizeNumericText(sourceLine));
      if (malformedCommaSpend) {
        reasons.push({ line: sourceLine, reason: "支出額の桁区切りが不正なため、金額を推測せず未計上にしました" });
        var malformedCurrencies = [];
        if (/(?:LP|ＬＰ)\s*[-−+]?\s*[0-9][0-9,]*|[0-9][0-9,]*\s*(?:LP|ＬＰ)/i.test(normalizeNumericText(sourceLine))) malformedCurrencies.push("lp");
        if (/(?:自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)\s*[-−+]?\s*[0-9][0-9,]*|[0-9][0-9,]*\s*(?:自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)/i.test(normalizeNumericText(sourceLine))) malformedCurrencies.push("shards");
        if (malformedCurrencies.length) spends.push({
          name: sourceLine, lp: 0, shards: 0, raw: sourceLine, reason: "不正な桁区切り（未計上）"
        });
        continue;
      }
      var currencySpend = currencySpendOf(line, mode === "income");
      if (currencySpend) {
        var allCurrencySpends = [currencySpend].concat(currencySpend.additionalSpends || []);
        var lastCurrencySpend = allCurrencySpends[allCurrencySpends.length - 1];
        var rewardName = rewardAfterCurrencySpend(line, lastCurrencySpend.end);
        allCurrencySpends.forEach(function (currencySpendItem) {
          if (!Number.isSafeInteger(currencySpendItem.amount) || currencySpendItem.amount <= 0) {
            reasons.push({ line: line, reason: "消費金額が正の安全整数ではないため未計上：" + currencySpendItem.currency });
            return;
          }
          var spendRecord = { name: rewardName || line, lp: 0, shards: 0, raw: line, reason: "明示された通貨消費" };
          spendRecord[currencySpendItem.currency] = currencySpendItem.amount;
          spends.push(spendRecord);
        });
        var arrowRewardNames = arrowWinsOf(line);
        if (!arrowRewardNames.length && rewardName) arrowRewardNames = [rewardName];
        var entityKindHint = allCurrencySpends.some((item) =>
          item.currency === "lp" && item.amount === 100 && /ガチャ/.test(line)
        ) ? "persona" : "";
        arrowRewardNames.forEach(function (name) {
          var existing = wins.find((w) => w.name === name);
          if (existing) {
            if (entityKindHint) existing.entityKindHint = entityKindHint;
          } else {
            wins.push({
              name: name, via: "", kind: "",
              ...(entityKindHint ? { entityKindHint: entityKindHint } : {})
            });
          }
        });
      }

      var explicitTicketSpend = explicitTicketSpendOf(line);
      if (explicitTicketSpend) {
        recordExplicitTicketSpend(explicitTicketSpend);
        if (!currencySpend && hasUnparsedExplicitExpense(line)) {
          reasons.push({ line: line, reason: "通貨額を含む支出表記を安全に解析できないため未計上" });
        }
        continue;
      }

      /* 箇条書きの「・人格抽出チケット×1消費」は使った記録であって獲得ではない。
         ダイス条件（「・1d100を…出した人は…チケットを1枚」）も獲得扱いしない。 */
      if (isBullet && /消費|使用済|使用し|d\d{2,}/.test(line) && /チケ|チケット|抽出|ガチャ/.test(line)) continue;

      /* パック別チケットは通常の人格抽出チケットと別勘定。先に記録し、
         __proto__ / constructor 等もそのままデータのキーとして保持する。 */
      var packTicketMatch = mode === "income" ? line.match(/[〈《]([^〉》]+)[〉》]?\s*抽出チケット/) : null;
      if (packTicketMatch) {
        var normalizedPackLine = normalizeAmountText(line);
        var packCountMatch = normalizedPackLine.match(/[x×]\s*(\d+)/);
        var packCount = packCountMatch ? Number(packCountMatch[1]) : 1;
        var packName = packTicketMatch[1];
        var existingPackCount = Object.prototype.hasOwnProperty.call(pack, packName) ? pack[packName] : 0;
        var nextPackCount = existingPackCount + packCount;
        if (!Number.isSafeInteger(packCount) || packCount < 0 || !Number.isSafeInteger(nextPackCount)) {
          reasons.push({ line: line, reason: "パック抽出チケットの個数が安全整数の範囲を超えています" });
        } else {
          Object.defineProperty(pack, packName, {
            value: nextPackCount, enumerable: true, configurable: true, writable: true
          });
        }
      }

      var ticketScope = currencySpend ? line.slice(0, currencySpend.start).trim() : line;
      var tk = packTicketMatch ? null : ticketOf(ticketScope, { mode: mode, previousLine: prev });
      if (tk) {
        if (!tk.kind) {
          reasons.push({
            line: line,
            reason: tk.reason || "抽出チケットの種別が不明なため、人格/E.G.O/選択の残数への計上を保留しました",
            ...(tk.category ? { ticketCategory: tk.category } : {})
          });
          /* 獲得した品名自体は残し、後段のDB照合で人格/E.G.Oを確認できるようにする。
             ただし券種や対象パック名を推測して在庫に加えない。 */
          if (tk.count > 0) {
            var unknownTicketNames = arrowWinsOf(line);
            if (!unknownTicketNames.length) { var unknownSrc = ticketSourceName(line); if (unknownSrc) unknownTicketNames = [unknownSrc]; }
            var unresolvedTicketVia = tk.category === "pack"
              ? "テーマパックチケット（対象パック未指定）"
              : "抽出チケット（種別未確認）";
            unknownTicketNames.forEach(function (nm) {
              if (!wins.some((w) => w.name === nm)) wins.push({
                name: nm,
                via: unresolvedTicketVia,
                kind: tk.category || ""
              });
            });
          }
        } else {
          var ticketCountAdded = addSafeAmount(tickets, tk.kind, tk.count, line, reasons, "抽出チケット数");
          /* チケットからどの人格/E.G.Oを得たか。ソースの書式は
             「人格抽出チケット：N 社小鎚の人格」「抽出1：LCE E.G.O:ねばつき」*/
          /* 明示された x0 / 0枚は獲得抽出ではない。チケット収入を増やさないだけでなく、
             結果名から所持まで推定すると「0枚で獲得」になるため候補も作らない。 */
          if (ticketCountAdded && tk.count > 0) {
            var srcNames = arrowWinsOf(line);
            if (!srcNames.length) { var src = ticketSourceName(line); if (src) srcNames = [src]; }
            srcNames.forEach(function (nm) { wins.push({ name: nm, via: TICKET_LABEL[tk.kind], kind: tk.kind }); });
          }
        }
        /* チケット行に報酬額が並ぶ書式がある（「140LP 90欠片　EGOチケット」）。
           収入節では金額も読む。支出節では従来どおり金額を取らない。 */
        if (mode !== "income") continue;
      } else {
  /* 「サポートパッシブ「X」を購入したのでLP-9」「サポパ購入『X』」のような
     行から括弧内の所持名を取り出す。所持照合（attributeOwned）は
     名前一致だけなので、括弧内の名前がそのまま当たる。
     「ボーナス」「スロット解放」は取得ではない。 */
  function supportPurchasesOf(line) {
    var t = String(line);
    if (!/(サポートパッシブ|サポパ|サポート|パッシブ)/.test(t)) return [];
    if (!/購入|取得|入手|獲得/.test(t)) return [];
    if (/ボーナス/.test(t)) return [];
    var names = [];
    var re = /[「『｢]([^「『｢」』｣]+)[」』｣]/g;
    var m;
    while ((m = re.exec(t)) !== null) {
      var nm = String(m[1]).trim();
      if (!nm) continue;
      /* 括弧の中身が金額注釈だけなら名前ではない（「LP-7」等）。 */
      if (/^(LP|ＬＰ|欠片)\s*-?\d*$/i.test(nm)) continue;
      if (!names.includes(nm)) names.push(nm);
    }
    return names;
  }

  /* 「抽出1：E.G.O:提灯」のような「抽出NN」だけの行。
           チケット行と二重に数えない（抽出の語を含むため）。 */
        var bd = (packTicketMatch || currencySpend) ? null : bareDrawOf(line);
        if (bd) {
          var drawCountAdded = addSafeAmount(tickets, bd.kind, bd.count, line, reasons, "抽出回数");
          /* 抽出0 は回数も獲得候補もゼロ。名前があるだけで所持へ追加しない。 */
          if (drawCountAdded && bd.count > 0) {
            var bdNames = arrowWinsOf(line);
            if (!bdNames.length) { var src2 = ticketSourceName(line); if (src2) bdNames = [src2]; }
            bdNames.forEach(function (nm) { wins.push({ name: nm, via: TICKET_LABEL[bd.kind], kind: bd.kind }); });
          }
          /* 金額が同居する書式（「LP：181、欠片:136、EGO抽出🎫x1を獲得」）を
             落とさないため、収入節では金額の読み取りへ続ける。 */
          if (mode !== "income") continue;
        }
      }

      /* サポートパッシブの購入行は名前だけ入手記録に積む。
         金額（LP-27 など）は既存の収入/支出読みに任せる。 */
      if (!tk && !bd) {
        var supNames = supportPurchasesOf(line);
        for (var si = 0; si < supNames.length; si++) {
          wins.push({ name: supNames[si], via: "", kind: "support", bought: /購入|消費/.test(line) });
        }
      }

      /* 「サポートパッシブ『A』を購入したのでLP-7、『B』を購入したのでLP-15」のように、
         名前と負額が1対1で明記された叙述は、それぞれ独立した支出として残す。
         以前は後段の「叙述体の購入は名前だけ残す」経路で金額がすべて消えていた。 */
      var narrativeSpendRe = /[「『]([^「『」』]+)[」』]\s*(?:を\s*)?(?:購入した(?:ので|ため)|買った(?:ので|ため))\s*(LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)\s*-\s*([0-9][0-9,]*)/g;
      var narrativeSpendMatches = Array.from(line.matchAll(narrativeSpendRe));
      if (narrativeSpendMatches.length >= 2) {
        narrativeSpendMatches.forEach(function (match) {
          var cost = Number(String(match[3]).replace(/,/g, ""));
          if (!Number.isSafeInteger(cost) || cost <= 0) {
            reasons.push({ line: sourceLine, reason: "叙述中の個別購入額が正の安全整数ではないため未計上：" + match[0] });
            return;
          }
          var currency = /LP|ＬＰ/i.test(match[2]) ? "lp" : "shards";
          var spend = {
            name: String(match[1]).trim(),
            lp: 0,
            shards: 0,
            raw: match[0],
            reason: "叙述中の個別購入支出"
          };
          spend[currency] = cost;
          spends.push(spend);
        });
        /* 既に支出へ抜き出した金額だけを後段の収入解析から外す。上記で所持名は記録済み。 */
        line = line.replace(narrativeSpendRe, " ");
      }

      /* アイテムの効果説明。「▶︎〜」や「〜を得る」は金額行ではない。 */
      if (isNarrativeLine(line)) continue;

      /* 合計行の扱いは節で違う。数値と通貨だけの並び（「0欠片　40LP」）は
         支出節では合計・残高なので読み飛ばす。収入節では 0 を含む
         合計だけを飛ばし、0 を含まない数値だけの行はそのシナリオの
         報酬額として読む（「140LP 90欠片」形式を旧実装は無言で落としていた）。 */
      if (isTotalOnlyLine(line)) {
        if (mode === "spend") continue;
        if (/(^|[\s　:：])0\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)/i.test(line)) continue;
      }

      if (mode !== "income") {
        /* 支出節にある購入短文（「憎悪購入：-50欠片」）は残高差分の書式でも
           実買の記録なので、収入節と同じ共通経路で読む。 */
        var buyAny = purchaseRowOf(line);
        if (buyAny) {
          if (buyAny.lp || buyAny.shards) {
            spends.push({ name: buyAny.name, lp: buyAny.lp, shards: buyAny.shards, raw: line, reason: "購入の短文" });
          }
          if (!wins.some((w) => w.name === buyAny.name)) {
            wins.push({ name: buyAny.name, via: "", kind: "", bought: true });
          }
          continue;
        }
      }

      if (mode === "income") {
        /* 「購入：ルサンチマン-7LP」「ルサンチマン購入-7」「LP-20 サポパ
           「人生一発」購入」のような購入の短文は、残高から引く支出であり
           かつその名前が手元に来たことを意味する（ purchased の勝ちは
           帰属の証跡になる）。 */
        var buyRow = purchaseRowOf(line);
        if (buyRow) {
          if (buyRow.lp || buyRow.shards) {
            if (!currencySpend) spends.push({ name: buyRow.name, lp: buyRow.lp, shards: buyRow.shards, raw: line, reason: "購入の短文" });
          }
          if (!wins.some((w) => w.name === buyRow.name)) {
            wins.push({ name: buyRow.name, via: "", kind: "", bought: true });
          }
          continue;
        }
        /* 「LP200を消費してガチャ」「LP300使用して人格抽出」のような消費の叙述は収入ではない。
           ただし「30LP、30欠片…を獲得。硝酸の欠片×1を消費して…」のように
           獲得が先に書かれた行は、消費の手前までを金額として読む。
           「G-5購入 7LP」の購入額も残高から引かれる支出（実データで確認）。 */
        var narrativeReasonCount = reasons.length;
        var narrativePurchaseSpends = narrativePurchaseSpendsOf(line, reasons);
        var narrativeParserReported = reasons.length > narrativeReasonCount;
        narrativePurchaseSpends.forEach(function (spend) {
          /* 同じ行・同じ金額を currencySpendOf と叙述パーサーが読んだ場合は
             1件へ統合し、叙述パーサーが特定した対象名を優先する。
             同額の別購入（別name）は、明示支出レコードがない限り別件として残す。 */
          var explicitSpend = spends.find(function (existing) {
            return existing && existing.reason === "明示された通貨消費"
              && existing.raw === line && existing.lp === spend.lp && existing.shards === spend.shards;
          });
          if (explicitSpend) {
            explicitSpend.name = spend.name;
            explicitSpend.reason = spend.reason;
            return;
          }
          var duplicateSpend = spends.some(function (existing) {
            return existing && existing.reason === spend.reason &&
              existing.raw === spend.raw && existing.lp === spend.lp &&
              existing.shards === spend.shards && existing.name === spend.name;
          });
          if (!duplicateSpend) spends.push(spend);
        });
        var spendAt = line.search(/消費|購入|買った|使用し/);
        if (spendAt >= 0) {
          if (!currencySpend && hasUnparsedExplicitExpense(line)
              && !narrativePurchaseSpends.length && !narrativeParserReported) {
            reasons.push({ line: line, reason: "通貨額を含む支出表記を安全に解析できないため未計上" });
          }
          var head = line.slice(0, spendAt);
          if (!/獲得|入手|報酬/.test(head)) {
            /* 「蒼羽蝶：75LP消費」の名前付き購入は残高から差し引く支出。
               この形を落とすと購入の記録が名前・金額とも消える。 */
            var namedBuy = namedPurchaseOf(line);
            if (namedBuy) {
              var existingSpend = currencySpend ? spends.find((item) => item.raw === line) : null;
              if (existingSpend) {
                existingSpend.name = namedBuy.name;
                existingSpend.reason = namedBuy.reason;
                ["lp", "shards"].forEach(function (currency) {
                  if (existingSpend[currency] && namedBuy[currency] && existingSpend[currency] !== namedBuy[currency]) {
                    existingSpend[currency] = 0;
                    reasons.push({ line: line, reason: "同じ行の支出額が一致しないため金額を保留しました" });
                  } else if (namedBuy[currency]) {
                    existingSpend[currency] = namedBuy[currency];
                  }
                });
              } else spends.push(namedBuy);
              continue;
            }
            /* 叙述体の精神・人格購入（「精神「正義」を購入したため
               欠片-200」）。購入の金額は従来どおり帳に混ぜず、名前だけ
               を所持の証跡にする（複数購入・単数購入の区別が読めない
               ため)。サポパ記載の行は所持側の別経路が受け持つ。 */
            var narrName = bracketPurchaseNameOf(line);
            var narrPair = (String(line).match(/[「『]/g) || []).length === 1;
            if (narrName && narrPair && !/サポパ|サポートパッシブ/.test(line)) {
              if (!wins.some((w) => w.name === narrName)) {
                wins.push({ name: narrName, via: "", kind: "", bought: true });
              }
              continue;
            }
            continue;
          }
          line = head;
        }
        /* 「LP報酬　49」の報酬を挟んだ通貨と金額を隣接扱いにする（実データ）。 */
        line = line.replace(/(LP|ＬＰ)\s*報酬/g, "$1");
        /* 「LP:35+GABA=40」のような計算式は結果の 40 だけを読む。 */
        line = line.replace(/\d+\s*\+\s*[^\s\d]+\s*=\s*(\d+)/g, "$1");
        /* 「LP200以下」「200LPまで」の数量条件は金額ではない。 */
        line = line.replace(/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|パック)?\s*\d+\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|パック)?\s*(?:以下|以上|以内|未満|まで)/g, " ");
        /* 「LPを欠片に変換」は収入ではなく明細。 */
        if (/変換|換算/.test(line)) {
          spends.push({ name: line, lp: 0, shards: 0, raw: line, reason: "換算行のため金額は未確定" });
          var conditionalTicketToShard = /チケット/.test(line) && /(?:全コンプ|全人格)/.test(line) && /欠片/.test(line);
          reasons.push({
            line: sourceLine,
            reason: conditionalTicketToShard
              ? "条件付きチケット換算：この行では抽出チケットを通常の種別別残数に1枚として計上し、欠片20への変換は反映していません。全人格所持などの条件を満たす場合は、チケット1枚ではなく欠片20として扱う必要があるか確認してください"
              : "変換・換算の記録です。変換元と変換先、適用レート、実際に増減した数値を確認してください"
          });
          continue;
        }
        /* 「90LP」「LP：71」「LP60」「40LP 20欠片」「+154LP +41欠片」——
           通貨と数値の対を、行内で隣接する分だけ全部読む。1 行に両通貨が
           並ぶ書式で片方だけ・誤った通貨に割り当てていたのを、対ごとに読む。
           現在/残の直後は incomePairs 内で先に伏せている。
           「LP 45+5」は 45+5=50、「-15LP」は -15 と符号を保つ。 */
        var priceCondition = stripAlternativePriceCondition(line);
        if (priceCondition.removed.length) {
          reasons.push({
            line: sourceLine,
            reason: "「又は」で結ばれたLP額が「買える」という価格条件の説明に含まれるため、アイテム価格の候補として収入計上から除外しました。実際のLP獲得額がある場合は、報酬の金額を別記してください"
          });
        }
        var pairs = incomePairs(priceCondition.text);
        var unsafePairs = pairs.filter(function (pair) { return !Number.isSafeInteger(pair.amount); });
        if (unsafePairs.length) {
          unsafePairs.forEach(function (pair) {
            reasons.push({
              line: sourceLine,
              reason: (pair.currency === "lp" ? "LP" : "欠片") + "金額が安全整数の範囲を超えているため未計上"
            });
          });
          pairs = pairs.filter(function (pair) { return Number.isSafeInteger(pair.amount); });
          if (!pairs.length) continue;
        }
        /* 同じ通貨の数値が複数あり、明示的な加算・計算記号もない場合、
           収入＋現在残高なのか、複数の内訳なのかを自由記述だけでは決められない。
           先頭の数値だけを採用することもしない。曖昧な通貨は全て保留し、警告する。 */
        var pairCountByCurrency = { lp: 0, shards: 0 };
        pairs.forEach(function (pair) { pairCountByCurrency[pair.currency] += 1; });
        var explicitIncomeContext = /獲得|入手|報酬|補填|支給|受領|被り|重複|ガチャ結果|抽選結果|合計|合算|小計|総計/.test(line);
        var ambiguousCurrencies = ["lp", "shards"].filter(function (currency) {
          return pairCountByCurrency[currency] > 1 && !/[+＋=＝]/.test(line) && !explicitIncomeContext;
        });
        if (ambiguousCurrencies.length) {
          ambiguousCurrencies.forEach(function (currency) {
            var clarificationExample = currency === "lp"
              ? "「LP収入50、現在100LP」のように役割を明記してください"
              : "「欠片収入25、現在171欠片」のように役割を明記してください";
            reasons.push({
              line: sourceLine,
              reason: (currency === "lp" ? "LP" : "欠片") +
                "の数値が同じ行に複数あります。収入・現在残高・内訳を区別できないため、この通貨の収入計上を保留しました。" + clarificationExample
            });
          });
          pairs = pairs.filter(function (pair) { return ambiguousCurrencies.indexOf(pair.currency) < 0; });
          if (!pairs.length) continue;
        }
        /* 「涙剣：燃え上がる闘志 150欠片　現在184」は購入額。収入の
           「欠片60　現在334」と形が同じなので、：の手前が通貨でない
           ラベル付きかどうかと現在の記載で区別する（実測 shards が
           210 になり、60 の収入に購入 150 が混ざっていた）。 */
        var buy = isPurchaseSnapshot(line);
        if (pairs.length) {
          if (pairs.length && buy) {
            var buyCost = { lp: 0, shards: 0 };
            for (var bi = 0; bi < pairs.length; bi++) {
              if (pairs[bi].amount <= 0) continue;
              addSafeAmount(buyCost, pairs[bi].currency, pairs[bi].amount, line, reasons, "購入額合計");
            }
            spends.push(Object.assign({ name: line, raw: line, reason: "購入行（現在の記載つき）" }, buyCost));
            continue;
          }
          for (var pi = 0; pi < pairs.length; pi++) {
            /* 支出の語がある行の負額は収入に差し引かない。「欠片-300」は消費であって
            収入の減額なので、絶対値で支出へ回す（実測 shards が -290 になり、
            収入のある行的が「未計上」に見えた）。収入セクション内で消費の語が
            無い負額は、受け取り同士の差として従来どおり合算する。 */
            if (pairs[pi].amount > 0) addSafeAmount(income, pairs[pi].currency, pairs[pi].amount, line, reasons, "通貨収入合計");
            else if (pairs[pi].amount < 0) {
              var loss = { lp: 0, shards: 0, raw: line, reason: "符号付き通貨減少" };
              loss[pairs[pi].currency] = -pairs[pi].amount;
              spends.push(loss);
            }
          }
          continue;
        }
        if (priceCondition.removed.length && !pairs.length) continue;
        /* 数字も通貨も無い行は「どの機関に勝ったか」の名前行。
           シナリオが直接払った人格/E.G.O なので、獲得として記録する。
           DB 照合は呼び出し側で行う。ここでは名前候補として残す。 */
        var explicitRewardName = explicitRewardNameOf(line);
        var explicitAcquisition = explicitAcquisitionOf(line);
        var acquisitionName = explicitAcquisition ? explicitAcquisition.name : (explicitRewardName || line);
        if ((!isBullet || explicitRewardName || explicitAcquisition) && !/使用人格/.test(prev) && isAcquisitionNameLine(acquisitionName)) {
          wins.push({
            name: acquisitionName,
            via: "",
            kind: explicitAcquisition ? explicitAcquisition.kind : ""
          });
          continue;
        }
        /* 「4 課」のように数字を含んでも通貨と数値の並びが
           间断とそれである（「90LP」「29欠片」なら数値が通貨名に隣接）。 */
        if (!/\d\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)/i.test(line) && !/現在|残/.test(line)) continue;
        if (!/現在|残/.test(line)) {
          reasons.push({ line: line, reason: "通貨か金額が読み取れない" });
        }
        continue;
      }

      /* 支出 */
      if (mode === "spend") {
        /* 支出節に書かれた購入行は所持の証跡。名前だけはいつでも勝ちに積む
           （「刺し貫く貫通購入：現在130LP」「正義購入 現在87欠片」など）。
           金額の記帳は支出読みに任せる。 */
        var pnm = purchaseNameOf(line);
        for (const pn of purchaseNamesFrom(line)) {
          if (!wins.some((w) => w.name === pn)) {
            wins.push({ name: pn, via: "", kind: "", bought: true });
          }
        }
        /* 叙述体の購入（「精神「正義」を購入したため欠片-200」）も
           支出の事実。括弧内の名前を所持の証跡にする。 */
        var bnm = bracketPurchaseNameOf(line);
        if (bnm && !wins.some((w) => w.name === bnm)) {
          wins.push({ name: bnm, via: "", kind: "", bought: true });
        }
        /* 支出節の行を2種に分ける。
           A) 支出額が明示されている行
              「正義購入 現在87欠片」      → 87 が支出（前置詞 + 現在NN）
              「150LP消費　300LPへ」       → 150 が支出、300 は〜へで残WRITE
              「切り伏せる斬撃 150LP消費」 → 150 が支出
           B) 残額だけの行
              「Foobar　現在130LP」        → 130 は支払後の残WRITE
           区別は「支出を示す動詞（消費/購入/使用/行使/買った…）があるか、
           もしくは「〜へ」で終わっているか」で行う。 */
        var hasVerb = /(消費|購入|使用|行使|解放|心疼|費やす|払う|使う|買った|引|要した|支出|支払|補充|回復|切替|升值)/.test(line);
        var endsToHe = /へ\s*$/.test(line);
        var isRemainderOnly = !hasVerb && !endsToHe;

        if (isRemainderOnly) {
          /* 動詞も支払額も無い「名前 現在130LP」「名前 残り81欠片」は残高。
             通貨名の存在だけで現在残高を支出へ転用しない。明示金額が残高語より
             前にある書式（「150欠片 現在184」）だけは、その金額を保持する。 */
          const hasBalanceMarker = /(?:現在|現座|残高|残り)/.test(line);
          if (hasBalanceMarker) {
            const withoutBalance = stripBalances(line);
            const hasExplicitAmount = /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+-]?\s*\d|\d[\d,]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/i.test(withoutBalance);
            if (!hasExplicitAmount) {
              if (/(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/i.test(line)) {
                reasons.push({ line: sourceLine, reason: "支出額を残高から逆算せず、支出セクションに残高表記しかないため要確認にしました" });
              }
              continue;
            }
          } else if (!/(LP|欠片|欠け片|かけら|欠けら|カケラ)/i.test(normalizeAmountText(line))) {
            continue;
          }
        }

        /* 両通貨が 1 行に並ぶことがある:
           「LPを欠片に変換：+11欠片 -22LP」「150LP消費　300LPへ」。 */
        var cleanedSpend = normalizeAmountText(line)
          .replace(/\d+\s*(LP|欠片|欠け片|かけら|欠けら|カケラ)\s*へ\s*$/g, " ")
          .replace(/残り\s*-?\d+/gi, " ");

        var lp = isRemainderOnly ? amountNear(cleanedSpend, "lp", false) : amountNear(line, "lp", false);
        var sh = isRemainderOnly ? amountNear(cleanedSpend, "shards", false) : amountNear(line, "shards", false);

        if ((lp != null && !Number.isSafeInteger(lp)) || (sh != null && !Number.isSafeInteger(sh))) {
          reasons.push({ line: line, reason: "支出金額が安全整数の範囲を超えているため未計上" });
          continue;
        }
        if (lp == null && sh == null) {
          if (isRemainderOnly) continue;
          spends.push({ name: pnm || bnm || line, lp: 0, shards: 0, raw: line });
          reasons.push({
            line: sourceLine,
            reason: /(?:現在|現座|残高|残り)/.test(sourceLine) && /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/.test(sourceLine)
              ? "支出金額が読み取れないため、支出額を残高から逆算せず要確認にしました"
              : "支出金額が読み取れない（要確認）"
          });
          continue;
        }
        spends.push({
          name: pnm || bnm || line,
          lp: lp != null ? Math.abs(lp) : 0,
          shards: sh != null ? Math.abs(sh) : 0,
          raw: line
        });
      }
      } finally {
        if (!currentModeCoverageRecorded) {
        /* 1行ごとに原文の通貨額候補と、その行が生んだ収入・支出を比較する。 */
        const cleanedAuditLine = stripBalances(normalizeAmountText(sourceLine)).replace(/[：:]+$/, "").trim();
        const directMoneyRow = standaloneCurrencyAmount(cleanedAuditLine, "lp") ||
          standaloneCurrencyAmount(cleanedAuditLine, "shards");
        const hasSourceFinding = sourceAuditAnalysis.findings.some(function (entry) {
          return entry && (entry.lineIndex === i + 1 || entry.relatedLineIndex === i + 1 ||
            (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === i + 1)));
        });
        const expected = auditMoneyTotalsOfLine(sourceLine);
        const expectedFlows = auditMoneyFlowsOfLine(sourceLine, auditModeBefore);
        const hasTicketMarker = /(?:チケット|チケ|抽出🎫)/.test(sourceLine);
        /* 数字が行のどこかにあるだけではチケット操作と見なさない。
           「200LP以下の任意のテーマパックチケット」のように価格条件の数字を
           チケット枚数として誤認すると、実際には何も操作されていない行を
           financial-action-unaccounted にしてしまう。 */
        const hasExplicitTicketCount =
          /(?:チケット|チケ|抽出🎫)\s*(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))/i.test(sourceLine) ||
          /(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))\s*(?:人格|E\.?G\.?O|エゴ|選択|抽出|ガチャ)?チケ(?:ット)?/i.test(sourceLine);
        const hasTicketActionVerb =
          /(?:獲得|入手|取得|付与|支給|消費|使用|購入|買っ|支払|支出|報酬|収入|受領|補填|抽出(?:した|する|結果|後|済|を行う|を実施)|ガチャ(?:結果|で獲得|を回|を引)|消費済)/i.test(sourceLine);
        const hasTicketEvent = hasTicketMarker && (hasExplicitTicketCount || hasTicketActionVerb);
        const hasRosterGainEvent = /(?:人格|E\\.?G\\.?O|エゴ).*(?:獲得|入手|取得)|(?:獲得|入手|取得).*(?:人格|E\\.?G\\.?O|エゴ)/i.test(sourceLine);
        const hasGachaResult = /ガチャ.*(?:結果|→|⇒)|(?:人格|E\\.?G\\.?O|エゴ)獲得\\s*[→⇒:：]/i.test(sourceLine);
        /* 現在残高だけが記載された購入・抽出行も監査する。金額は推測せず、
           本体処理で作られた「支出額が読み取れない」等の理由へ紐付ける。 */
        const hasBalanceMarkerAndCurrency =
          /(?:現在|現座|残り|残高)/.test(sourceLine) &&
          /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/.test(sourceLine);
        const amountOutsideBalance = stripBalances(normalizeAmountText(sourceLine));
        const hasExplicitAmountOutsideBalance =
          /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[+＋\-−]?\s*[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/i
            .test(amountOutsideBalance);
        const hasBalanceOnlySpendCandidate = auditModeBefore === "spend" &&
          hasBalanceMarkerAndCurrency && !hasExplicitAmountOutsideBalance;
        const hasCurrentBalanceAction = hasBalanceMarkerAndCurrency &&
          /消費|支出|支払|購入|買っ|使用|行使|解放|抽出|ガチャ|獲得|入手|取得/.test(sourceLine);
         const hasFinancialAction = hasTicketEvent || hasRosterGainEvent || hasGachaResult || hasCurrentBalanceAction ||
          ((expected.lp || expected.shards || directMoneyRow) &&
            /報酬|収入|獲得|入手|取得|付与|支給|補填|受領|被り|重複|消費|使用|支払|支出|購入|買っ|抽出|ガチャ|変換|換算/.test(sourceLine));
        /* 矢印で残高・操作語が挟まれ、金額が前後の記録へ結び付かず
           通常の額面検出にも残らない行だけを人手確認へ送る。矢印の存在だけでは
           取引を保留しない（通常の購入・抽出結果にも矢印は使われる）。 */
        const hasArrowDelimitedMoneyAction =
          /(?:^|[→⇒])\s*(?:(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+|[+＋\-−]?\s*[0-9０-９]+\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか)))\s*(?=[→⇒])/i.test(sourceLine) &&
          /報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算|抽出|ガチャ/.test(sourceLine);
        const hasUnaccountedArrowBalanceCandidate = hasArrowDelimitedMoneyAction &&
          (auditModeBefore === "current" ||
            (income.lp === auditBefore.lp && income.shards === auditBefore.shards && spends.length === auditBefore.spends));
        /* 「現在」節は通常パーサー本体が意図的に読み飛ばすので、そこで止まる金額行も
           行単位coverageに残す。金額のみは残高注記、操作語・矢印間の金額は要確認とし、
           収入・支出へは自動計上しない。 */
        const currentModeCurrencyCandidate = auditModeBefore === "current" &&
          (expected.lp || expected.shards || directMoneyRow ||
            /(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[+＋\-−]?\s*[0-9０-９]+\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))/i.test(sourceLine));
        const currentModeActionCue = auditModeBefore === "current" &&
          /報酬|収入|消費|支出|支払|購入|買っ|使用|行使|抽出|ガチャ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算|チケット|チケ/.test(sourceLine);
        const hasFinancialCoverageTarget = (directMoneyRow || hasFinancialAction || hasSourceFinding ||
          hasUnaccountedArrowBalanceCandidate || currentModeCurrencyCandidate || hasBalanceOnlySpendCandidate) &&
          (expected.lp || expected.shards || hasFinancialAction || hasSourceFinding ||
            hasUnaccountedArrowBalanceCandidate || currentModeCurrencyCandidate || hasBalanceOnlySpendCandidate);
        const currentBalanceActionReview =
          (auditModeBefore === "current" && (hasFinancialAction || hasSourceFinding || currentModeActionCue)) ||
          hasUnaccountedArrowBalanceCandidate || hasBalanceOnlySpendCandidate;
        if (!isNarrativeLine(sourceLine) && hasFinancialCoverageTarget &&
            (auditModeBefore !== "current" || currentBalanceActionReview)) {
          const newSpends = spends.slice(auditBefore.spends);
          const detectedFlows = {
            lpIncome: Math.max(0, income.lp - auditBefore.lp),
            lpSpend: auditSpendTotal(newSpends, "lp"),
            lpUnknown: 0,
            shardsIncome: Math.max(0, income.shards - auditBefore.shards),
            shardsSpend: auditSpendTotal(newSpends, "shards"),
            shardsUnknown: 0
          };
          const got = {
            lp: detectedFlows.lpIncome + detectedFlows.lpSpend,
            shards: detectedFlows.shardsIncome + detectedFlows.shardsSpend
          };
          /* 残高注記しか残っていない操作候補は、金額を逆算せず明示理由を残す。
           これにより要確認の行が unresolved のまま無言で埋もれない。 */
        if ((hasBalanceOnlySpendCandidate || hasCurrentBalanceAction) &&
            !hasExplicitAmountOutsideBalance &&
            !reasons.slice(auditBefore.reasons).some((entry) =>
              String(entry.line || "").trim() === sourceLine.trim() &&
              /残高から逆算せず/.test(String(entry.reason || "")))) {
          reasons.push({
            line: sourceLine,
            reason: "支出額を残高から逆算せず、残高表記しかないため要確認にしました"
          });
        }
          const addedReasons = reasons.slice(auditBefore.reasons);
        const moneyReviewReason = addedReasons.some(function (entry) {
            return /LP|欠片|通貨|金額|支出|収入|残高|計算|計上|価格|チケット|抽出/.test(String(entry.reason || ""));
          });
          const skippedForSourceAudit = sourceAuditAnalysis.skipLines.has(i);
          let status = "matched";
          let coverageFinding = null;
          const moneyBearing = expected.lp > 0 || expected.shards > 0;
          if (currentBalanceActionReview) {
            status = "current-balance-review";
            sourceAudits.push({
              side: "parser",
              code: auditModeBefore === "current" ? "financial-action-in-current-balance-section" : "financial-action-in-balance-transition",
              severity: "review",
              lineIndex: i + 1, line: sourceLine, section: auditModeBefore,
              expected: { lp: expected.lp, shards: expected.shards },
              detected: got,
              message: "残高・矢印式の金額と操作候補が同居しています。残高注記か実取引かを確認するまで、自動計上していません。"
            });
          } else if (auditModeBefore === "current") {
            status = "current-balance-note";
          } else if (skippedForSourceAudit || hasSourceFinding) {
            status = "source-reviewed";
          } else if (moneyBearing) {
            if (moneyReviewReason) {
              status = "reviewed-by-parser-reason";
            } else {
              coverageFinding = auditLineCoverage(sourceLine, expected, got, false, auditModeBefore, i + 1, expectedFlows, detectedFlows);
              if (coverageFinding) {
                sourceAudits.push(coverageFinding);
                status = coverageFinding.severity === "review" ? "direction-review" : "mismatch";
              }
            }
          } else if (hasFinancialAction) {
            const ticketDelta = (tickets.persona - auditBefore.ticketPersona) +
              (tickets.ego - auditBefore.ticketEgo) + (tickets.choice - auditBefore.ticketChoice);
            const outputDelta = ticketDelta !== 0 || JSON.stringify(pack) !== auditBefore.pack ||
              wins.length > auditBefore.wins || consumedItems.length > auditBefore.consumedItems ||
              ticketSpends.length > auditBefore.ticketSpends || spends.length > auditBefore.spends;
            if (!outputDelta && !addedReasons.length && !hasSourceFinding) {
              status = "unresolved";
              sourceAudits.push({
                side: "parser", code: "financial-action-unaccounted", severity: "warning",
                lineIndex: i + 1, line: sourceLine, section: auditModeBefore,
                expected: { lp: expected.lp, shards: expected.shards },
                detected: got,
                message: "金額・報酬・チケット等の操作を示す行ですが、この行から対応する記録も要確認理由も生成されていません。原文を確認してください。"
              });
            } else if (addedReasons.length) {
              status = "reviewed-by-parser-reason";
            } else {
              status = "noncurrency-effect-recorded";
            }
          }
          financialCoverage.push({
            lineIndex: i + 1, line: sourceLine, section: auditModeBefore, status: status,
            expected: { lp: expected.lp, shards: expected.shards },
            detected: got, expectedFlows: expectedFlows, detectedFlows: detectedFlows,
            parserReasonCount: addedReasons.length, sourceFinding: hasSourceFinding
          });
        }

        /* 既存49サンプルの回帰検査も金額＋操作語を候補とする。
           通常経路でcoverageが作られなかった場合は、残高や価格条件を推測計上せず
           監査行を明示的に残す。金額と方向が一致した場合だけ matched とする。 */
        const hasLegacyAuditAmount =
          /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i.test(sourceLine);
        const hasLegacyAuditAction =
          /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/.test(sourceLine);
        const alreadyHasLineCoverage = financialCoverage.some((entry) => entry && entry.lineIndex === i + 1);
        if (!alreadyHasLineCoverage &&
            !/^\s*[▶►▷]/.test(sourceLine) &&
            hasLegacyAuditAmount && hasLegacyAuditAction) {
          const fallbackSpends = spends.slice(auditBefore.spends);
          const fallbackExpected = auditMoneyTotalsOfLine(sourceLine);
          const fallbackExpectedFlows = auditMoneyFlowsOfLine(sourceLine, auditModeBefore);
          const fallbackDetectedFlows = {
            lpIncome: Math.max(0, income.lp - auditBefore.lp),
            lpSpend: auditSpendTotal(fallbackSpends, "lp"),
            lpUnknown: 0,
            shardsIncome: Math.max(0, income.shards - auditBefore.shards),
            shardsSpend: auditSpendTotal(fallbackSpends, "shards"),
            shardsUnknown: 0
          };
          const fallbackDetected = {
            lp: fallbackDetectedFlows.lpIncome + fallbackDetectedFlows.lpSpend,
            shards: fallbackDetectedFlows.shardsIncome + fallbackDetectedFlows.shardsSpend
          };
          const totalsMatch = fallbackExpected.lp === fallbackDetected.lp &&
            fallbackExpected.shards === fallbackDetected.shards;
          const directionsKnown = !(fallbackExpectedFlows.lpUnknown || fallbackExpectedFlows.shardsUnknown);
          const flowsMatch = directionsKnown &&
            ["lpIncome", "lpSpend", "shardsIncome", "shardsSpend"].every((key) =>
              Number(fallbackExpectedFlows[key] || 0) === Number(fallbackDetectedFlows[key] || 0));
          const hasParsedCurrency = Boolean(
            fallbackExpected.lp || fallbackExpected.shards || fallbackDetected.lp || fallbackDetected.shards
          );
          const fallbackStatus = totalsMatch && flowsMatch && hasParsedCurrency
            ? "matched"
            : "candidate-review";
          financialCoverage.push({
            lineIndex: i + 1, line: sourceLine, section: auditModeBefore || null,
            status: fallbackStatus,
            expected: { lp: fallbackExpected.lp, shards: fallbackExpected.shards },
            detected: fallbackDetected,
            expectedFlows: fallbackExpectedFlows,
            detectedFlows: fallbackDetectedFlows,
            parserReasonCount: reasons.slice(auditBefore.reasons).length,
            sourceFinding: hasSourceFinding
          });
          if (fallbackStatus === "candidate-review") {
            sourceAudits.push({
              side: "parser", code: "financial-candidate-without-coverage", severity: "review",
              lineIndex: i + 1, line: sourceLine, section: auditModeBefore || null,
              expected: { lp: fallbackExpected.lp, shards: fallbackExpected.shards },
              detected: fallbackDetected,
              message: "既存サンプル監査で金額＋操作語の候補行を検出しましたが、金額または方向を確定できません。残高や価格条件を取引として自動計上せず、原文と解析結果を確認してください。"
            });
          }
        }
        }
      }
    }

    if (egoPurchaseItems.length && egoPurchaseSummaries.length) {
      var itemTotal = egoPurchaseItems.reduce(function (sum, item) {
        sum.lp += Number(item.lp) || 0;
        sum.shards += Number(item.shards) || 0;
        return sum;
      }, { lp: 0, shards: 0 });
      var formatCurrencyTotal = function (value) {
        var parts = [];
        if (value.lp) parts.push(value.lp + " LP");
        if (value.shards) parts.push(value.shards + "欠片");
        return parts.length ? parts.join(" + ") : "0";
      };
      egoPurchaseSummaries.forEach(function (summary) {
        if (summary.lp !== itemTotal.lp || summary.shards !== itemTotal.shards) {
          currencyDiscrepancies.push({
            code: "ego-purchase-summary-mismatch",
            title: "E.G.O指定購入の項目別価格と消費欄が一致しません",
            line: summary.raw,
            detail: "項目別価格合計は " + formatCurrencyTotal(itemTotal) +
              " ですが、消費欄の記録は " + formatCurrencyTotal(summary) +
              " です。項目別価格だけを支出として記録し、総額の二重計上はしていません。"
          });
        }
      });
    }

    return {
      income: income, tickets: tickets, pack: pack, spends: spends, reasons: reasons,
      wins: wins, consumedItems: consumedItems, ticketSpends: ticketSpends,
      currencyDiscrepancies: currencyDiscrepancies, sourceAudits: sourceAudits,
      financialCoverage: financialCoverage
    };
  }

  /* scenarioHistory 配列を分解する。 */
  function parseScenarioHistory(history) {
    return (history || []).map(function (row, index) {
      var parsed = parseMemo(row && row.memo);
      return {
        key: "scenario:" + index,
        name: String((row && row.name) || "").trim() || "無題",
        index: index,
        income: parsed.income,
        tickets: parsed.tickets,
        pack: parsed.pack,
        spends: parsed.spends,
        reasons: parsed.reasons,
        currencyDiscrepancies: parsed.currencyDiscrepancies || [],
        sourceAudits: parsed.sourceAudits || [],
        financialCoverage: parsed.financialCoverage || [],
        /* シナリオで直接払い出された人格/E.G.O。
           チケットだけ記入されている場合も「どのチケット由来か」を
           持つので、ここに入る。 */
        wins: parsed.wins,
        ticketSpends: parsed.ticketSpends || [],
        /* 支出だけがあるシナリオもある（「・支出」節に数行、
           収入が書かれていない、または 0 だった）。
           収入だけを条件にすると、それらは取りこぼされる。 */
        hasData: parsed.income.lp > 0 || parsed.income.shards > 0 ||
          parsed.tickets.persona + parsed.tickets.ego + parsed.tickets.choice > 0 ||
          Object.keys(parsed.pack).length > 0 ||
          parsed.spends.length > 0 ||
          parsed.reasons.length > 0 ||
          parsed.wins.length > 0 ||
          (parsed.sourceAudits || []).some(function (entry) { return entry && entry.severity !== "info"; })
      };
    });
  }

  /* 「購入：ルサンチマン-7LP」「ルサンチマン購入-7」「因子コード G-5購入 7LP」
     「LP-20 サポートパッシブ「人生一発」購入」のような購入の短文。
     名前と金額が1行に収まっている場合はこの形で読む（実データの自由メモ）。
     形が窄い（行末が金額で終わる／括弧名＋行末の購入）ので、文章の名前を
     拾わない。名前が括弧にないと名前は動詞の直前の語になる。 */
  function purchaseRowOf(line) {
    var t = normalizeAmountText(line || "").trim();
    if (!/(購入|消費)/.test(t)) return null;
    function mk(name, amount, cur) {
      var n = parseInt(String(amount).replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      }), 10) || 0;
      if (!Number.isSafeInteger(n)) return null;
      var cost = { lp: 0, shards: 0 };
      cost[/^(LP|ＬＰ)$/i.test(String(cur || "LP")) ? "lp" : "shards"] = Math.abs(n);
      return { name: String(name).trim(), lp: cost.lp, shards: cost.shards };
    }
    var m = t.match(/^購入[：:]\s*([^0-9\s：:][^：:]{0,24}?)\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
    if (m) return mk(m[1], m[2], m[3]);
    m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
    if (m) return mk(m[1], m[2], m[3]);
    m = t.match(/^(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?[^「『]*[「『]([^「『」』]+)[」』].*?(?:購入|消費)\s*[。．.」』]*$/);
    if (m) return mk(m[4], m[2], m[3] || m[1]);
    m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)[：:]\s*[-−]\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
    if (m) return mk(m[1], m[2], m[3]);
    return null;
  }

  /* 支出節に書かれた購入行のうち、「正義購入 現在87欠片」
     「刺し貫く貫通購入：現在130LP」のように動詞さえあれば名前が
     読める行。金額は残額の可能性があるので所持の証跡（名前の勝ち）
     だけを返す。金額の記帳は支出側の既存の読みに任せる。 */
  function purchaseNameOf(line) {
    var t = String(line || "").trim();
    var m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)(?:[　\s]*[：:]?)?\s*(?:現在|残)/);
    if (m) return m[1].trim().replace(/を$/, "");
    m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*を購入[、,]/);
    if (m) return m[1].trim();
    return null;
  }

  /* 叙述体の購入（「精神「正義」を購入したため欠片-200」）。
     括弧内の名前と直後の購入語がそろえば名前とする。使用・行使は
     購入ではないので外す（使用人格の記録行を買ったと読まない）。 */
  function bracketPurchaseNameOf(line) {
    var m = String(line || "").match(/[「『]([^「『」』]{1,24})[」』]\s*を?\s*(?:購入|買っ|消費)/);
    if (m) return m[1].trim();
    return null;
  }

  /* 「購入したためLP-27」「精神『正義』を購入したため欠片-200」
     「切り伏せる斬撃を購入、150LP消費」のような文章中の明示支出を拾う。
     購入記録を所持の証跡として残す既存経路より前に、通貨支出を独立して抽出する。 */
  function narrativePurchaseSpendsOf(rawLine, reasons) {
    var text = normalizeNumericText(rawLine);
    var events = Array.from(text.matchAll(/購入した|購入|買った/g));
    if (!events.length) return [];
    var out = [];
    var currencyPattern = "(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|欠け片|かけら|欠けら|カケラ)";
    var costPattern = new RegExp(
      "^\\s*(?:(?:ので|ため)\\s*)?[、,，:：\\s　]*(?:(" + currencyPattern +
      ")\\s*[-−]\\s*([0-9][0-9,]*)|[-−]\\s*([0-9][0-9,]*)\\s*(" +
      currencyPattern + ")|([0-9][0-9,]*)\\s*(" + currencyPattern +
      ")\\s*(?:を\\s*)?(?:消費|支払|使用))",
      "i"
    );
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var start = event.index + event[0].length;
      var end = i + 1 < events.length ? events[i + 1].index : text.length;
      var tail = text.slice(start, end);
      var match = tail.match(costPattern);
      if (!match) continue;
      var currencyText = match[1] || match[4] || match[6];
      var amountText = match[2] || match[3] || match[5];
      var amount = Number(String(amountText).replace(/,/g, ""));
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        reasons.push({
          line: String(rawLine || "").trim(),
          reason: "叙述体の購入額が正の安全整数ではないため、通貨支出を未計上にしました"
        });
        continue;
      }
      var prefix = text.slice(0, event.index);
      var named = prefix.match(/[「『]([^「『」』]{1,60})[」』]\s*を?\s*$/);
      var currency = /^(?:LP|ＬＰ)$/i.test(currencyText) ? "lp" : "shards";
      out.push({
        name: named ? named[1].trim() : "叙述体の購入",
        lp: currency === "lp" ? amount : 0,
        shards: currency === "shards" ? amount : 0,
        raw: String(rawLine || "").trim(),
        reason: "叙述体に明示された購入額"
      });
    }
    return out;
  }

  /* 一行で複数を買った購入行（「ピークォド号航海士の人格、および
     呼吸熱購入」）。名前を読み取った区切りに分けて列にする。
     金額は行で一つなので支出の分割はしない。解決できない区切りは
     所持側で捨てられるので、ここでは治りすぎない。 */
  function purchaseNamesFrom(line) {
    var t = String(line || "").trim();
    var m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)(?:[　\s]*[：:]?)?\s*(?:現在|残)/);
    if (!m) m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*を購入[、,]/);
    if (!m) return [];
    return String(m[1]).trim().replace(/を$/, "").split(/[、，]/)
      .map(function (s) {
        return s.replace(/^(?:および|及び|そして)/, "").trim().replace(/を$/, "");
      })
      .filter(Boolean);
  }

  var api = { parseMemo: parseMemo, parseScenarioHistory: parseScenarioHistory, currencyOf: currencyOf, amountOf: amountOf, sectionOf: sectionOf, ticketOf: ticketOf, purchaseRowOf: purchaseRowOf, auditLineCoverage: auditLineCoverage };
  if (typeof window !== "undefined") window.LBT_garaMemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
