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
    /* 通貨名だけ收割してから、漢字/ラテンが残るか見る。 */
    var stripped = t.replace(/LP|欠片|かけら|欠けら|カケラ/gi, " ").trim();
    if (/[A-Za-zぁ-んァ-ヶ一-龠]/.test(stripped)) return false;
    /* 通貨名を落とした残りが「数値と空白だけ」なら合計行。 */
    return /^[\s　0-9+\-　]*$/.test(stripped) && /\d/.test(stripped);
  }

  /* 1つの memo を { income, tickets, spends, reasons } へ。 */
  function parseMemo(memo) {
    var income = { lp: 0, shards: 0 };
    var tickets = { persona: 0, ego: 0, choice: 0 };
    var pack = {};
    var spends = [];
    var reasons = [];

    var lines = String(memo || "").split(/\r?\n/);
    var mode = "income";

    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i]).trim();
      if (!line) continue;

      var sec = sectionOf(line);
      if (sec) { mode = sec === "other" ? mode : sec; continue; }
      if (mode === "current") continue;  // 現在値の羅列は取り込まない

      var tk = ticketOf(line);
      if (tk) { tickets[tk.kind] += tk.count; continue; }

      /* 「抽出1：E.G.O:提灯」のような「抽出NN」だけの行。 */
      var bd = bareDrawOf(line);
      if (bd) { tickets[bd.kind] += bd.count; continue; }

      /* アイテムの効果説明。「▶︎〜」や「〜を得る」は金額行ではない。 */
      if (isNarrativeLine(line)) continue;

      /* 合計行。「0欠片　40LP」は収入でも支出でもない。 */
      if (isTotalOnlyLine(line)) continue;

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
        var cur = currencyOf(line);
        var amt = amountOf(line);
        if (cur && amt != null && amt > 0) {
          if (cur === "lp") income.lp += amt; else income.shards += amt;
          continue;
        }
        /* 数字も通貨も無い行は「どの機関に勝ったか」の名前行
           （北部ヂェーヴィチ協会 4 課フィクサー 等）。収入でも支出でも
           ないので、理由に載せない。載せると
           「47件が読めなかった」という印象になり、
           実際は正常な名前行eministである。
           「4 課」のように数字を含んでも通貨と数値の並びが
           间断とそれである（「90LP」「29欠片」なら数値が通貨名に隣接）。 */
        if (!/\d\s*(LP|欠片|かけら|欠けら|カケラ)/i.test(line) && !/現在|残/.test(line)) continue;
        if (!/現在|残/.test(line)) {
          reasons.push({ line: line, reason: "通貨か金額が読み取れない" });
        }
        continue;
      }

      /* 支出 */
      if (mode === "spend") {
        /* 合計行。「0欠片　40LP」は収入でも支出でもない。 */
        if (isTotalOnlyLine(line)) continue;
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

    return { income: income, tickets: tickets, pack: pack, spends: spends, reasons: reasons };
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
          /* 支出だけがあるシナリオもある（「・支出」節に数行、
             収入が writtenされていない、または 0 だった）。
             収入だけを条件にすると，它们は取liners。
             支出があるならリザルトとして残す（明細だけFabriculture）。 */
          hasData: parsed.income.lp > 0 || parsed.income.shards > 0 ||
            parsed.tickets.persona + parsed.tickets.ego + parsed.tickets.choice > 0 ||
            Object.keys(parsed.pack).length > 0 ||
            parsed.spends.length > 0
        };
      });
  }

  var api = { parseMemo: parseMemo, parseScenarioHistory: parseScenarioHistory, currencyOf: currencyOf, amountOf: amountOf, sectionOf: sectionOf, ticketOf: ticketOf };
  if (typeof window !== "undefined") window.LBT_garaMemo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
