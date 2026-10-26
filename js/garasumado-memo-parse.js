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

  /* セクション見出し「・支出」「・支払い」「・現在」を読み分ける。 */
  function sectionOf(line) {
    var m = String(line).match(/^\s*[・･]\s*(.+?)\s*$/);
    if (!m) return "";
    var head = m[1];
    if (/支出|支払/.test(head)) return "spend";
    if (/現在/.test(head)) return "current";
    return "other";
  }

  /* 金額を取る。「現在NN」と「残りNN」は残額なので先に落とす。
     落在這裡的只有「支出額」。
     「因子コード G-5購入 7LP」のように識別子に数字が混ざっていても、
     通貨名に隣接する数値を採る（7 が金額、G-5 の 5 は識別子）。 */
  function amountOf(line) {
    var cleaned = normalizeAmountText(line)
      .replace(/現在[：:]?\s*(LP|欠片|かけら|欠けら|カケラ)?\s*-?\d+/gi, " ")
      .replace(/残り\s*-?\d+/gi, " ")
      .replace(/へ\s*$/, " ");
    /* 通貨名に隣接する数値を優先（-22LP → 22、7LP → 7）。 */
    var near = cleaned.match(/(-?\d+)\s*(LP|欠片|かけら|欠けら|カケラ)/i);
    if (near) return parseInt(near[1], 10);
    /* 通貨名が無ければ先頭の数字。識別子のハイフンは符号ではない。 */
    var rest = cleaned.replace(/([A-Za-z0-9])-(?=\d)/g, "$1 ");
    var m = rest.match(/-?\d+/);
    if (!m) return null;
    var n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }

  /* チケットの種類。複数形・表記ゆれを吸収。 */
  function ticketOf(line) {
    /* 「チケット」だけでなく略字の「チケ」も受ける。実データに
       「ガチャチケ1枚　第四銀工房銃鎚派」がある。 */
    if (!/チケ|チケット/.test(line)) return null;
    var text = normalizeAmountText(line);
    var count = 1;
    var cm = text.match(/[x×]\s*(\d+)/);
    if (cm) count = parseInt(cm[1], 10);
    /* 「ガチャチケ1枚」 */
    var cm2 = text.match(/(?:チケ|チケット)\s*(\d+)\s*枚/);
    if (cm2) count = parseInt(cm2[1], 10);

    var kind = "persona";
    if (EGO_WORDS.some(function (w) { return text.indexOf(w) >= 0; })) kind = "ego";
    else if (/選択|zr|upgrade/i.test(text)) kind = "choice";
    /* 「ガチャ」はE.G.O打ちのmixedword。LBTではガチャ=E.G.O相当。 */
    if (/ガチャ/.test(text)) kind = "ego";
    return { kind: kind, count: count };
  }

  /* 「抽出1：E.G.O:提灯」のような「抽出NN」だけの行。
     副語に E.G.O があれば E.G.O 抽出、無ければ人格抽出。
     数字無し「人格抽出：南部〜」も 1 回として数える。 */
  function bareDrawOf(line) {
    var text = normalizeAmountText(line);
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
  function incomePairs(line) {
    var text = normalizeAmountText(line)
      .replace(/現在[：:]?\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ))?/gi, " ")
      .replace(/残り?\s*-?\d+(?:\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ))?/gi, " ")
      /* 「300LPへ」は支払後の残高に振り直す書き方。額ではなく結果。 */
      .replace(/-?\d+(?:\s*[+＋]\s*\d+)*\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)\s*へ/gi, " ")
      /* 「G-5」のような識別子のハイフンを負号と混同しない。 */
      .replace(/([A-Za-z0-9])-(?=\d)/g, "$1 ")
      /* 括弧注釈は掉落値。「75(理性60+15)欠片」の内訳を外すと
         75 が欠片の直前に残るので 75 として読める。 */
      .replace(/[（(][^）)]*[）)]/g, " ");
    var tokens = [];
    var re = /(LP|ＬＰ|欠片|かけら|欠けら|カケラ)|([+-]?\d+(?:\s*[+＋]\s*\d+)*)/gi;
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
    if (/(LP|ＬＰ|欠片|かけら|欠けら|カケラ)/i.test(joined)) return res;
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
      if (/^(LP|ＬＰ)\s*\/\s*(欠片|かけら|欠けら|カケラ)$/i.test(h)) { order = ["lp", "shards"]; headerAt = i; break; }
      if (/^(欠片|かけら|欠けら|カケラ)\s*\/\s*(LP|ＬＰ)$/i.test(h)) { order = ["shards", "lp"]; headerAt = i; break; }
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
    if (/(得る|獲得する|消費する|半減し|発動する)/.test(t) && !/\d\s*(LP|欠片|かけら|欠けら|カケラ)/.test(t)) return true;
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
    var text = normalizeAmountText(line)
      .replace(/現在[：:]?\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*-?\d+/gi, " ")
      .replace(/残り\s*-?\d+(?:\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ))?/gi, " ")
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
      if (!/欠片|かけら|欠けら|カケラ/.test(text)) {
        var only = text.match(/-?\d+/);
        return only ? parseInt(only[0], 10) : null;
      }
      return null;
    }

    var re = /欠片|かけら|欠けら|カケラ/g;
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
    var t = String(explicitRewardNameOf(line) || line).replace(/現在|残/g, "").trim();
    /* 通貨名だけ刈り取ったあと、漢字/ラテンが残るか見る。 */
    var stripped = t.replace(/LP|欠片|かけら|欠けら|カケラ/gi, " ").trim();
    if (/[A-Za-zぁ-んァ-ヶ一-龠]/.test(stripped)) return false;
    /* 通貨名を落とした残りが「数値と空白だけ」なら合計行。 */
    return /^[\s　0-9+\-　]*$/.test(stripped) && /\d/.test(stripped);
  }

  /* 明示された「報酬：人格名」「基本報酬：人格名」を直接獲得として拾う。
     普通の箇条書きに書かれた参加者名などを獲得扱いする条件は広げない。 */
  function explicitRewardNameOf(line) {
    var t = String(line || "").trim().replace(/^[・･]\s*/, "");
    var match = t.match(/^(?:(?:シナリオ|基本|追加|クリア)?報酬)\s*[：:]\s*(.+)$/);
    if (!match) return "";
    return match[1].trim().replace(/^[「『「]/, "").replace(/[」』」]$/, "").trim();
  }

  /* シナリオが「誰を倒したか」を書く行。収入セクションにあり、
     通貨も数値もないので、獲得した人格/E.G.O の名前である。
     DB 照合は呼び出し側（buildManifest）で行う。ここでは
     「名前候補である」と分かる行だけ，洗い出す。 */
  function isAcquisitionNameLine(line) {
    var t = String(line).replace(/現在|残/g, "").trim();
    if (!t) return false;
    /* 見出し・効果文・合計行は除く */
    if (/^【/.test(t)) return false;
    if (isTotalOnlyLine(t)) return false;
    if (isNarrativeLine(t)) return false;
    /* チケット行は別に数えるので、ここでは扱わない */
    if (/チケ|チケット|ガチャ|抽出/.test(t)) return false;
    /* 通貨が数値と隣接していれば金額行 */
    if (/\d\s*(LP|欠片|かけら|欠けら|カケラ)/i.test(t)) return false;
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
    var out = [];
    tail.split(/[、，,]/).forEach(function (frag) {
      /* 「→LP100消費ガチャ:厳粛な哀悼獲得」は最後の区切りの後ろが名前。
         「N社E.G.O:ねばつき」の 区切りは名前の一部なので切らない。 */
      var cut = Math.max(frag.lastIndexOf("："), frag.lastIndexOf(":"));
      if (cut >= 0 && /(ガチャ|抽出|消費|使用|チケ|LP|ＬＰ|欠片)/.test(frag.slice(0, cut))) frag = frag.slice(cut + 1);
      var name = frag.trim()
        .replace(/^[「『]\s*/, "").replace(/[」』]\s*$/, "")
        .replace(/^抽出\s*\d*\s*/, "")
        .replace(/(?:を)?(?:獲得|入手)(?:した)?$/, "")
        .trim();
      if (name.length < 2) return;
      if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return;
      /* 「選択抽出チケット→ego」のプレースホルダ。英語だけの断片は名前ではない。 */
      if (/^[A-Za-z0-9\s.:_\-/]+$/.test(name)) return;
      if (/LP|ＬＰ|欠片|かけら|欠けら|カケラ|消費|使用|解除|被り|チケット|チケ|枚/.test(name)) return;
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
    if (/(LP|ＬＰ|欠片|かけら|欠けら|カケラ)\s*$/.test(label[1].trim())) return false;
    return /\d+\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)/.test(t.slice(label[0].length));
  }
  /* 「蒼羽蝶：75LP消費」のような名前前置・消費語後置の購入行。
     ラベル（通貨でない語）の直後に金額が置かれ、行が消費の語で終わる
     形だけを購入と見なす。「LP200を消費してガチャ」の叙述はラベルが
     通貨なので弾く。「名前：75LP、82欠片消費」の両通貨は金額の並びが
     隣接しないので読まない（落としたまま）。 */
  function namedPurchaseOf(line) {
    var t = String(line || "").trim();
    if (!/(消費|購入)[。．.」』]*$/.test(t)) return null;
    var m = t.match(/^([^0-9\s：:].+)[：:]\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)([^0-9]*)$/i);
    if (!m) return null;
    var name = m[1].trim();
    if (!name) return null;
    if (/(LP|ＬＰ|欠片|かけら|欠けら|カケラ)\s*$/.test(name)) return null;
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


  /* 金額と「消費」が同じ行にあるガチャ／抽出ログを、収入やチケット獲得と
     混同しない。明示額だけを支出にし、矢印の後ろは獲得名として別に読む。 */
  function currencySpendOf(rawLine) {
    var text = normalizeAmountText(rawLine);
    var lpMatch = text.match(/(?:LP|ＬＰ)\s*([0-9][0-9,]*)\s*(?:を\s*)?(?:消費|使用|支払|支出)/i);
    if (!lpMatch) lpMatch = text.match(/([0-9][0-9,]*)\s*(?:LP|ＬＰ)\s*(?:を\s*)?(?:消費|使用|支払|支出)/i);
    if (lpMatch) {
      var lp = Number(String(lpMatch[1]).replace(/,/g, ""));
      return { currency: "lp", amount: lp, end: lpMatch.index + lpMatch[0].length };
    }
    /* 「自我の破片100消費」は欠片通貨。「硝酸の欠片×1」はアイテム名なので
       通貨として拾わない。硝子の破片は、専用アイテム消費解析が先に処理する。 */
    var shardMatch = text.match(/(?:自我の(?:破片|欠片)|(?<!の)(?:欠片|かけら|欠けら|カケラ))\s*([0-9][0-9,]*)\s*(?:個|つ)?\s*(?:を\s*)?(?:消費|使用|支払|支出)/);
    if (!shardMatch) shardMatch = text.match(/([0-9][0-9,]*)\s*(?:個|つ)?\s*自我の(?:破片|欠片)\s*(?:を\s*)?(?:消費|使用|支払|支出)/);
    if (shardMatch) {
      var shardAmount = Number(String(shardMatch[1]).replace(/,/g, ""));
      return { currency: "shards", amount: shardAmount, end: shardMatch.index + shardMatch[0].length };
    }
    return null;
  }

  function cleanRewardName(value) {
    var name = String(value || "").trim();
    name = name.replace(/^(?:ガチャ|抽出ガチャ|ガチャ抽出|抽出|パックチケット|テーマパック|パック)\s*[：:]\s*/i, "");
    name = name.replace(/^[：:→\s　]+/, "").trim();
    name = name.replace(/^[「『]/, "").replace(/[」』]$/, "").trim();
    name = name.replace(/(?:の)?(?:獲得|入手)(?:した)?[。．.]?$/, "").trim();
    if (!name || /(?:被り|重複|補償|返還)/.test(name)) return "";
    if (/^(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|自我の破片|自我の欠片)\s*\d*$/i.test(name)) return "";
    if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return "";
    return name;
  }

  function rewardAfterCurrencySpend(rawLine, end) {
    var text = normalizeAmountText(rawLine);
    var tail = text.slice(end).trim();
    if (!tail) return "";
    /* 消費前にある矢印（「→LP100消費…」）ではなく、消費後の矢印だけを見る。
       名前内部の「E.G.O:紅炎殺」「羽ばたき：妖精の祭典」のコロンは分割しない。 */
    var arrow = tail.lastIndexOf("→");
    if (arrow >= 0) tail = tail.slice(arrow + 1);
    return cleanRewardName(tail);
  }

  /* 「人格抽出チケット1枚→人格名」「パックチケット『パック名』→E.G.O」のように、
     チケットが報酬ではなく抽出元として書かれた明示的な矢印行だけ消費へ回す。 */
  function explicitTicketSpendOf(rawLine) {
    var text = normalizeAmountText(rawLine);
    var ticketAt = text.search(/チケット|チケ/);
    if (ticketAt < 0) return null;
    var arrowAt = text.indexOf("→", ticketAt);
    if (arrowAt < 0) return null;
    var source = text.slice(0, arrowAt);
    if (!/チケット|チケ/.test(source) || /(?:\bd\d{2,}|ダイス条件)/i.test(source)) return null;
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
    return {
      kind: isPack ? "pack" : parsed.kind,
      count: count,
      pack: pack,
      reward: cleanRewardName(text.slice(arrowAt + 1)),
      raw: String(rawLine || "").trim()
    };
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
    var mode = "income";
    var prevLine = "";

    /* 「LP/欠片」見出し＋「120/80」の対（合計優先）は行スキャンと別に一度だけ読む。 */
    var slashPair = parseSlashPairs(memo);
    addSafeAmount(income, "lp", slashPair.lp, memo, reasons, "LP収入の合計");
    addSafeAmount(income, "shards", slashPair.shards, memo, reasons, "欠片収入の合計");

    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i]).trim();
      if (!line) continue;
      var prev = prevLine;
      prevLine = line;

      var glassConsumption = parseGlassConsumption(line);
      if (glassConsumption) {
        consumedItems.push(glassConsumption);
        continue;
      }

      var sec = sectionOf(line);
      /* 「・」見出しは節の切り替え。それ以外の箇条書きは報酬行として中身を読む
         （「・40LP」「・基本報酬 50LP/15欠片」「・人格抽出チケット1枚」）。
         チャットの名前列（「・◯◯ 様」）を獲得名にしないため、
         箇条書き由来の名前は win にしない（金額とチケットだけを取る）。 */
      var isBullet = false;
      var sec = sectionOf(line);
      if (sec) {
        if (sec !== "other") { mode = sec; continue; }
        isBullet = true;
        line = line.replace(/^\s*[・･]\s*/, "");
        /* 「・(願いの数x10)LP - 20LP」のような記号の計算は金額にしない。 */
        if (/[（(][^）)]*[x×][^）)]*[）)]/.test(line)) continue;
      }
      if (mode === "current") continue;  // 現在値の羅列は取り込まない

      /* 通貨消費の明示額がある行は、チケット収入や抽出回数として再解釈しない。 */
      var currencySpend = currencySpendOf(line);
      if (currencySpend) {
        if (!Number.isSafeInteger(currencySpend.amount) || currencySpend.amount <= 0) {
          reasons.push({ line: line, reason: "消費金額が正の安全整数ではないため未計上" });
          continue;
        }
        var rewardName = rewardAfterCurrencySpend(line, currencySpend.end);
        var spendRecord = { name: rewardName || line, lp: 0, shards: 0, raw: line, reason: "明示された通貨消費" };
        spendRecord[currencySpend.currency] = currencySpend.amount;
        spends.push(spendRecord);
        if (rewardName && !wins.some((w) => w.name === rewardName)) {
          wins.push({ name: rewardName, via: "", kind: "" });
        }
        continue;
      }

      /* チケット名→獲得名の形は、チケットを報酬として増やすのでなく消費として記録する。 */
      var explicitTicketSpend = explicitTicketSpendOf(line);
      if (explicitTicketSpend) {
        ticketSpends.push({
          kind: explicitTicketSpend.kind,
          pack: explicitTicketSpend.pack || "",
          count: explicitTicketSpend.count,
          raw: explicitTicketSpend.raw
        });
        if (explicitTicketSpend.reward && !wins.some((w) => w.name === explicitTicketSpend.reward)) {
          wins.push({
            name: explicitTicketSpend.reward,
            via: explicitTicketSpend.kind === "pack"
              ? "パックチケット" + (explicitTicketSpend.pack ? "「" + explicitTicketSpend.pack + "」" : "")
              : (TICKET_LABEL[explicitTicketSpend.kind] || "抽出チケット"),
            kind: explicitTicketSpend.kind
          });
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

      var tk = packTicketMatch ? null : ticketOf(line);
      if (tk) {
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
        var bd = packTicketMatch ? null : bareDrawOf(line);
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

      /* アイテムの効果説明。「▶︎〜」や「〜を得る」は金額行ではない。 */
      if (isNarrativeLine(line)) continue;

      /* 合計行の扱いは節で違う。数値と通貨だけの並び（「0欠片　40LP」）は
         支出節では合計・残高なので読み飛ばす。収入節では 0 を含む
         合計だけを飛ばし、0 を含まない数値だけの行はそのシナリオの
         報酬額として読む（「140LP 90欠片」形式を旧実装は無言で落としていた）。 */
      if (isTotalOnlyLine(line)) {
        if (mode === "spend") continue;
        if (/(^|[\s　:：])0\s*(LP|欠片|かけら|欠けら|カケラ)/i.test(line)) continue;
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
            spends.push({ name: buyRow.name, lp: buyRow.lp, shards: buyRow.shards, raw: line, reason: "購入の短文" });
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
        var spendAt = line.search(/消費|購入|買った|使用し/);
        if (spendAt >= 0) {
          var head = line.slice(0, spendAt);
          if (!/獲得|入手|報酬/.test(head)) {
            /* 「蒼羽蝶：75LP消費」の名前付き購入は残高から差し引く支出。
               この形を落とすと購入の記録が名前・金額とも消える。 */
            var namedBuy = namedPurchaseOf(line);
            if (namedBuy) {
              spends.push(namedBuy);
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
        line = line.replace(/(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|パック)?\s*\d+\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|パック)?\s*(?:以下|以上|以内|未満|まで)/g, " ");
        /* 「LPを欠片に変換」は収入ではなく明細。 */
        if (/変換|換算/.test(line)) {
          spends.push({ name: line, lp: 0, shards: 0, raw: line, reason: "換算行のため金額は未確定" });
          reasons.push({ line: line, reason: "LP⇄欠片の換算行。増減の両方があって単一金額にならない" });
          continue;
        }
        /* 「90LP」「LP：71」「LP60」「40LP 20欠片」「+154LP +41欠片」——
           通貨と数値の対を、行内で隣接する分だけ全部読む。1 行に両通貨が
           並ぶ書式で片方だけ・誤った通貨に割り当てていたのを、対ごとに読む。
           現在/残の直後は incomePairs 内で先に伏せている。
           「LP 45+5」は 45+5=50、「-15LP」は -15 と符号を保つ。 */
        var pairs = incomePairs(line);
        var unsafePairs = pairs.filter(function (pair) { return !Number.isSafeInteger(pair.amount); });
        if (unsafePairs.length) {
          unsafePairs.forEach(function (pair) {
            reasons.push({
              line: line,
              reason: (pair.currency === "lp" ? "LP" : "欠片") + "金額が安全整数の範囲を超えているため未計上"
            });
          });
          pairs = pairs.filter(function (pair) { return Number.isSafeInteger(pair.amount); });
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
              if (/(消費|購入|解放|支払)/.test(line)) {
                var loss = { lp: 0, shards: 0 };
                loss[pairs[pi].currency] = -pairs[pi].amount;
                spends.push(loss);
              } else {
                addSafeAmount(income, pairs[pi].currency, pairs[pi].amount, line, reasons, "通貨収入合計");
              }
            }
          }
          continue;
        }
        /* 数字も通貨も無い行は「どの機関に勝ったか」の名前行。
           シナリオが直接払った人格/E.G.O なので、獲得として記録する。
           DB 照合は呼び出し側で行う。ここでは名前候補として残す。 */
        var explicitRewardName = explicitRewardNameOf(line);
        if ((!isBullet || explicitRewardName) && !/使用人格/.test(prev) && isAcquisitionNameLine(explicitRewardName || line)) {
          wins.push({ name: explicitRewardName || line, via: "", kind: "" });
          continue;
        }
        /* 「4 課」のように数字を含んでも通貨と数値の並びが
           间断とそれである（「90LP」「29欠片」なら数値が通貨名に隣接）。 */
        if (!/\d\s*(LP|欠片|かけら|欠けら|カケラ)/i.test(line) && !/現在|残/.test(line)) continue;
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
        var hasVerb = /(消費|購入|使用|行使|心疼|費やす|払う|使う|買った|引|要した|支出|支払|補充|回復|切替|升值)/.test(line);
        var endsToHe = /へ\s*$/.test(line);
        var isRemainderOnly = !hasVerb && !endsToHe;

        if (isRemainderOnly) {
          /* 残額だけの行。通貨名が無ければ純粋な残WRITE。
             通貨名があれば「130LP を使った」という読みできるので、
             金額として拾う（Foobar　現在130LP → LP 130）。 */
          if (!/(LP|欠片|かけら|欠けら|カケラ)/i.test(normalizeAmountText(line))) continue;
        }

        /* 両通貨が 1 行に並ぶことがある:
           「LPを欠片に変換：+11欠片 -22LP」「150LP消費　300LPへ」。 */
        var cleanedSpend = normalizeAmountText(line)
          .replace(/\d+\s*(LP|欠片|かけら|欠けら|カケラ)\s*へ\s*$/g, " ")
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
          reasons.push({ line: line, reason: "支出金額が読み取れない（要確認）" });
          continue;
        }
        spends.push({
          name: pnm || bnm || line,
          lp: lp != null ? Math.abs(lp) : 0,
          shards: sh != null ? Math.abs(sh) : 0,
          raw: line
        });
      }
    }

    return { income: income, tickets: tickets, pack: pack, spends: spends, reasons: reasons, wins: wins, consumedItems: consumedItems, ticketSpends: ticketSpends };
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
          parsed.wins.length > 0
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
    var m = t.match(/^購入[：:]\s*([^0-9\s：:][^：:]{0,24}?)\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
    if (m) return mk(m[1], m[2], m[3]);
    m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
    if (m) return mk(m[1], m[2], m[3]);
    m = t.match(/^(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*[-−]?\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?[^「『]*[「『]([^「『」』]+)[」』].*?(?:購入|消費)\s*[。．.」』]*$/);
    if (m) return mk(m[4], m[2], m[3] || m[1]);
    m = t.match(/^([^0-9\s：:][^：:]{0,24}?)\s*(?:購入|消費)[：:]\s*[-−]\s*([0-9０-９]+)\s*(LP|ＬＰ|欠片|かけら|欠けら|カケラ)?\s*[。．.」』]*$/);
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

  var api = { parseMemo: parseMemo, parseScenarioHistory: parseScenarioHistory, currencyOf: currencyOf, amountOf: amountOf, sectionOf: sectionOf, ticketOf: ticketOf, purchaseRowOf: purchaseRowOf };
  if (typeof window !== "undefined") window.LBT_garaMemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
