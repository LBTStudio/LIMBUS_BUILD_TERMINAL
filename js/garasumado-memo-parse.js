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
  var EGO_WORDS = ["EGO", "ＥＧＯ", "E.G.O", "イゴ", " egos "];

  function hasShard(text) {
    for (var i = 0; i < SHARD_WORDS.length; i++) {
      if (String(text).indexOf(SHARD_WORDS[i]) >= 0) return true;
    }
    return false;
  }
  function hasLp(text) {
    return /lp/i.test(String(text));
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
    var cleaned = String(line)
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
    var text = String(line);
    var count = 1;
    var cm = text.match(/[x×]\s*(\d+)/);
    if (cm) count = parseInt(cm[1], 10) || 1;
    /* 「ガチャチケ1枚」 */
    var cm2 = text.match(/(?:チケ|チケット)\s*(\d+)\s*枚/);
    if (cm2) count = parseInt(cm2[1], 10) || 1;

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
    var m = String(line).match(/(?:抽出|ガチャ)\s*(\d+)?/);
    if (!m) return null;
    /* 「抽出」か「ガチャ」が単独で教务之外に無ければ何でもない。 */
    if (!/抽出|ガチャ/.test(String(line))) return null;
    var count = m[1] ? parseInt(m[1], 10) || 1 : 1;
    var isEgo = EGO_WORDS.some(function (w) { return String(line).indexOf(w) >= 0; }) || /ガチャ/.test(line);
    return { kind: isEgo ? "ego" : "persona", count: count };
  }

  /* 「+154」や「45+5」を 1 つの額に。「45+5」は加算の連なり（=50）、
     先頭の符号だけが全体の符号（「-15」は -15 のまま）。 */
  function chainSum(raw) {
    var s = String(raw).replace(/＋/g, "+").replace(/\s+/g, "");
    var sign = 1;
    if (s.charAt(0) === "-") { sign = -1; s = s.slice(1); }
    else if (s.charAt(0) === "+") s = s.slice(1);
    var total = 0;
    var parts = s.split("+");
    for (var i = 0; i < parts.length; i++) total += parseInt(parts[i], 10) || 0;
    return sign * total;
  }

  function currencyOfPair(token) {
    var u = String(token).toUpperCase();
    return (u === "LP" || u === "ＬＰ") ? "lp" : "shards";
  }

  /* 1 行から「通貨×数値」の対を全部読む。数値は通貨に隣接していれば
     前後どちらでもよい（「40LP」「LP：71」「LP60」「欠片40」）。
     旧実装は 1 対しか読まず、「40LP 20欠片」の 40 を欠片に寄せる等
     取り違えていた。現在/残の直後は残額なので先に伏せる。 */
  function incomePairs(line) {
    var text = String(line)
      .replace(/現在[：:]?\s*(LP|欠片|かけら|欠けら|カケラ)?\s*-?\d+(?:\s*[+＋]\s*\d+)*/gi, " ")
      .replace(/残り?\s*-?\d+/gi, " ")
      /* 「300LPへ」は支払後の残高に振り直す書き方。額ではなく結果。 */
      .replace(/-?\d+(?:\s*[+＋]\s*\d+)*\s*(LP|欠片|かけら|欠けら|カケラ|ＬＰ)\s*へ/g, " ")
      /* 「G-5」のような識別子のハイフンを負号と混同しない。 */
      .replace(/([A-Za-z0-9])-(?=\d)/g, "$1 ");
    var out = [];
    var m;
    var reNum = /([+-]?\d+(?:\s*[+＋]\s*\d+)*)\s*(LP|欠片|かけら|欠けら|カケラ|ＬＰ)/gi;
    while ((m = reNum.exec(text)) !== null) {
      out.push({ amount: chainSum(m[1]), currency: currencyOfPair(m[2]) });
    }
    var reCur = /(LP|欠片|かけら|欠けら|カケラ|ＬＰ)\s*[:：]?\s*([+-]?\d+(?:\s*[+＋]\s*\d+)*)/gi;
    while ((m = reCur.exec(text)) !== null) {
      /* 数値の直後に別の通貨名が続くなら、その数値はそちらのもの
         （「40LP 20欠片」の 20 を LP と読まない）。 */
      if (/^\s*(LP|欠片|かけら|欠けら|カケラ|ＬＰ)/i.test(text.slice(reCur.lastIndex))) continue;
      out.push({ amount: chainSum(m[2]), currency: currencyOfPair(m[1]) });
    }
    return out;
  }

  /* アイテムの効果説明文。「▶︎〜」で始まる行や、
     「〜を得る」「〜を獲得する」で終わる行は説明であって金額行ではない。 */
  function isNarrativeLine(line) {
    var t = String(line);
    if (/^\s*[▶►▷]\s*/.test(t)) return true;
    if (/(得る|獲得する|消費する|半減し|発動する)/.test(t) && !/\d\s*(LP|欠片|かけら|欠けら|カケラ)/.test(t)) return true;
    return false;
  }

  /* 「現在NN」と「残りNN」は残額。支出額として読むと大きな数字が立つので、
     必ず除いてから金額を取る。
     currency を指定すると、その通貨に最も近い数値を返す。
     「+11欠片 -22LP」なら lp 指定で -22、shards 指定で 11。 */
  function amountNear(line, currency, keepCurrent) {
    /* 「現在」は二役を演する。
       ・収入行「90LP：現在100LP」→ 100 は残額。90 が収入。
       ・支出行「正義購入 現在87欠片」  → 87 が支出そのもの。
       支出節（keepCurrent）では現在を残し、収入側では落とす。 */
    var text = String(line)
      .replace(/残り\s*-?\d+/gi, " ")
      .replace(/へ\s*$/, " ");
    if (!keepCurrent) {
      text = text.replace(/現在[：:]?\s*(LP|欠片|かけら|欠けら|カケラ)?\s*-?\d+/gi, " ");
    }

    if (currency === "lp") {
      /* LP は「LP」という語で締める。「+11欠片 -22LP」なら -22 を取りたい。
         ただし行頭に「LPを欠片に変換」と通貨名が並び立つことがあるので、
         最初に現れた LP の直後にある数字は通貨名の読み方であり金額ではない。
         減算（-）を最優先し、無ければ LP 語に直近の数字を取る。 */
      var reLp = /LP/gi;
      var ml;
      var bestLp = null;
      while ((ml = reLp.exec(text)) !== null) {
        var backTxt = text.slice(Math.max(0, ml.index - 14), ml.index);
        var backNums = backTxt.match(/-?\d+/g);
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
      var backS = text.slice(Math.max(0, mm.index - 12), mm.index).match(/-?\d+/g);
      if (backS && backS.length) return parseInt(backS[backS.length - 1], 10);
    }
    return null;
  }

  /* 合計行。「0欠片　40LP」のように、数値と通貨だけの並びで
     動詞も名前も無い行。収入でも支出でもない。
     通貨名は漢字を含むので、判定前に取り除く。
     （さreon「欠片」だけの行を名前と誤判定して通過させない） */
  function isTotalOnlyLine(line) {
    var t = String(line).replace(/現在|残/g, "").trim();
    /* 通貨名だけ刈り取って���から、漢字/ラテンが残るか見る。 */
    var stripped = t.replace(/LP|欠片|かけら|欠けら|カケラ/gi, " ").trim();
    if (/[A-Za-zぁ-んァ-ヶ一-龠]/.test(stripped)) return false;
    /* 通貨名を落とした残りが「数値と空白だけ」なら合計行。 */
    return /^[\s　0-9+\-　]*$/.test(stripped) && /\d/.test(stripped);
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
    /* 英語名だけの行は対象外（人名ではない） */
    if (/^[A-Za-z0-9\s.:_\-]+$/.test(t)) return false;
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
    if (/[×xｘＸ✕✖]\s*\d|\d\s*(枚|個|本|セット)/.test(t)) return false;
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
    if (/[×xｘＸ✕✖]\s*\d|\d\s*(枚|個|本|セット)/.test(name)) return "";
    /* 名前には文字が要る（記号だけの断片を弾く）。 */
    if (!/[A-Za-zぁ-んァ-ヶ一-龠]/.test(name)) return "";
    return name;
  }

  /* 1つの memo を { income, tickets, pack, spends, reasons, wins } へ。 */
  function parseMemo(memo) {
    var income = { lp: 0, shards: 0 };
    var tickets = { persona: 0, ego: 0, choice: 0 };
    var pack = {};
    var spends = [];
    var reasons = [];
    /* シナリオで直接払い出された人格/E.G.O の名前。 */
    var wins = [];

    var lines = String(memo || "").split(/\r?\n/);
    var mode = "income";

    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i]).trim();
      if (!line) continue;

      var sec = sectionOf(line);
      if (sec) { mode = sec === "other" ? mode : sec; continue; }
      if (mode === "current") continue;  // 現在値の羅列は取り込まない

      var tk = ticketOf(line);
      if (tk) {
        tickets[tk.kind] += tk.count;
        /* チケット从哪里抽出的。ソースの書式は
           「人格抽出チケット：N 社小鎚の人格」「抽出1：LCE E.G.O:ねばつき」*/
        var src = ticketSourceName(line);
        if (src) wins.push({ name: src, via: TICKET_LABEL[tk.kind], kind: tk.kind });
        /* チケット行に報酬額が並ぶ書式がある（「140LP 90欠片　EGOチケット」）。
           収入節では金額も読む。支出節では従来どおり金額を取らない。 */
        if (mode !== "income") continue;
      } else {
        /* 「抽出1：E.G.O:提灯」のような「抽出NN」だけの行。
           チケット行と二重に数えない（抽出の語を含むため）。 */
        var bd = bareDrawOf(line);
        if (bd) {
          tickets[bd.kind] += bd.count;
          var src2 = ticketSourceName(line);
          if (src2) wins.push({ name: src2, via: TICKET_LABEL[bd.kind], kind: bd.kind });
          continue;
        }
      }

      /* アイテムの効果説明。「▶︎〜」や「〜を得る」は金額行ではない。 */
      if (isNarrativeLine(line)) continue;

      /* 合計行の扱いは節で違う。数値と通貨だけの並び（「0欠片　40LP」）は
         支出節では合計・残WRITEなので読み飛ばす。収入節では 0 を含む
         合計だけを飛ばし、0 を含まない数値だけの行はそのシナリオの
         報酬額として読む（「140LP 90欠片」形式を旧実装は無言で落としていた）。 */
      if (isTotalOnlyLine(line)) {
        if (mode === "spend") continue;
        if (/(^|[\s　:：])0\s*(LP|欠片|かけら|欠けら|カケラ)/i.test(line)) continue;
      }

      /* パック別チケット「〈肉斬骨断〉抽出チケット」 */
      var pm = line.match(/[〈《]([^〉》]+)[〉》]?\s*抽出チケット/);
      if (pm) {
        var pn = line.match(/[x×]\s*(\d+)/);
        var pname = pm[1];
        pack[pname] = (pack[pname] || 0) + (pn ? parseInt(pn[1], 10) || 1 : 1);
        continue;
      }

      if (mode === "income") {
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
        if (pairs.length) {
          for (var pi = 0; pi < pairs.length; pi++) {
            if (pairs[pi].amount) income[pairs[pi].currency] += pairs[pi].amount;
          }
          continue;
        }
        /* 数字も通貨も無い行は「どの機関に勝ったか」の名前行。
           シナリオが直接払った人格/E.G.O なので、獲得として記録する。
           DB 照合は呼び出し側で行う。ここでは名前候補として残す。 */
        if (isAcquisitionNameLine(line)) {
          wins.push({ name: line, via: "", kind: "" });
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
        /* 支出節の行を2種に分ける。
           A) 支出額が明示されている行
              「正義購入 現在87欠片」      → 87 が支出（前置詞 + 現在NN）
              「150LP消費　300LPへ」       → 150 が支出、300 は〜へで残WRITE
              「切り伏せる斬撃 150LP消費」 → 150 が支出
           B) 残額だけの行
              「Foobar　現在130LP」        → 130 は支払後の残WRITE
           区別は「支出を示す動詞（消費/購入/使用/行使…）があるか、
           もしくは「〜へ」で終わっているか」で行う。 */
        var hasVerb = /(消費|購入|使用|行使|心疼|費やす|払う|使う|引|要した|支出|支払|補充|回復|切替|升值)/.test(line);
        var endsToHe = /へ\s*$/.test(line);
        var isRemainderOnly = !hasVerb && !endsToHe;

        if (isRemainderOnly) {
          /* 残額だけの行。通貨名が無ければ純粋な残WRITE。
             通貨名があれば「130LP を使った」という読みできるので、
             金額として拾う（Foobar　現在130LP → LP 130）。 */
          if (!/(LP|欠片|かけら|欠けら|カケラ)/i.test(line)) continue;
        }

        /* 両通貨が 1 行に並ぶことがある:
           「LPを欠片に変換：+11欠片 -22LP」「150LP消費　300LPへ」。 */
        var cleanedSpend = String(line)
          .replace(/\d+\s*(LP|欠片|かけら|欠けら|カケラ)\s*へ\s*$/g, " ")
          .replace(/残り\s*-?\d+/gi, " ");

        var lp = isRemainderOnly ? amountNear(cleanedSpend, "lp", false) : amountNear(line, "lp", true);
        var sh = isRemainderOnly ? amountNear(cleanedSpend, "shards", false) : amountNear(line, "shards", true);

        if (lp == null && sh == null) {
          if (isRemainderOnly) continue;
          spends.push({ name: line, lp: 0, shards: 0, raw: line });
          reasons.push({ line: line, reason: "支出金額が読み取れない（要確認）" });
          continue;
        }
        spends.push({
          name: line,
          lp: lp != null ? Math.abs(lp) : 0,
          shards: sh != null ? Math.abs(sh) : 0,
          raw: line
        });
      }
    }

    return { income: income, tickets: tickets, pack: pack, spends: spends, reasons: reasons, wins: wins };
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

  var api = { parseMemo: parseMemo, parseScenarioHistory: parseScenarioHistory, currencyOf: currencyOf, amountOf: amountOf, sectionOf: sectionOf, ticketOf: ticketOf };
  if (typeof window !== "undefined") window.LBT_garaMemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
