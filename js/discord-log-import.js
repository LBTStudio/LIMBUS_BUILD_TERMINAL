/* Discord に貼られる手書きリザルト（｜区切りが無い形式）専用の読み込み。
   LBT_textImport.parseText / plan の先頭で Discord 形式を検出したときだけ利用する。
   ｜区切り形式は本体 js/result-text-import.js が従来どおり処理する。
   読めないものは勝手に埋めず、理由つきの skipped として呼び出し側へ返す。 */

(function () {
  const toHalf = (value) => String(value ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[×✕]/g, "x")
    .replace(/現座/g, "現在").replace(/現在値/g, "現在").replace(/現在\s*[:：]/g, "現在")
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

  /* ---- Discord に貼られる手書きリザルト（｜区切りが無い形式） ---------------
     "90LP：現在100LP" / "・支払い" / "憎悪購入：-50欠片" のような行を読む。
     現在残高は「その時点の累計」なので収入には足さず、手前の額を収入/支出に
     使う。読めない行は null を返し、呼び出し側が skipped に回す。 */
  const num = (s) => Number(String(s || "").replace(/,/g, "")) || 0;

  /* 先頭（"現在" より手前）の通貨額を読む。 */
  function leadingAmount(head) {
    const t = toHalf(head).trim();
    if (!t) return null;
    /* 加算: "35+10" / "LP30+10" / "35LP+15" / "かけら10+10" / "欠片:20+10"。
       "LP80+ガバ(合計80)" は括弧内の合計を優先する。 */
    const paren = t.match(/\(合計\s*(\d[\d,]*)\)/);
    const two = t.match(/(\d[\d,]*)\s*(?:lp|欠片|カケラ|かけら)?\s*\+\s*[^+]*?(\d[\d,]*)/i);
    /* "35+GABA=40" は =40 が合計なので加算しない。"=40" を優先する。 */
    const eq = t.match(/=\s*(\d[\d,]*)/);
    if (two || eq) {
      const total = eq ? num(eq[1]) : num(two[1]) + num(two[2]);
      const isShard = SHARD_WORD.test(t);
      return { lp: isShard ? 0 : (paren ? num(paren[1]) : total), shards: isShard ? (paren ? num(paren[1]) : total) : 0, matched: true };
    }
    // チケット行は別途
    if (/チケット|抽出/.test(t)) return null;
    const shard = t.match(/(\d[\d,]*)\s*(?:欠片|欠牁|カケラ|かけら|けっか)/)
      || t.match(/(?:欠片|欠牁|カケラ|かけら|けっか)\s*[:]?\s*(\d[\d,]*)/);
    const lp = t.match(/(\d[\d,]*)\s*lp/i) || t.match(/lp\s*[:]?\s*(\d[\d,]*)/i)
      || t.match(/^lp[^\d]{0,6}(\d[\d,]*)/i); // LP報酬 49 / LP報酬：49
    if (shard && lp) return null; // 両方ある換算等は別扱い
    if (shard) return { lp: 0, shards: num(shard[1]), matched: true };
    if (lp) return { lp: num(lp[1]), shards: 0, matched: true };
    return null;
  }

  /* Discord の 1 行を読む。current を更新したら true。 */
  function readDiscordLine(line, current, state) {
    const raw = String(line || "");
    const t = toHalf(raw).trim();
    if (!t) return false;

    /* Discord の投稿者・日時・ピン留め装飾。リザルト本文ではない。 */
    if (/(?:@\S+\s*スレ主|スレ主\s*[—-]|ピン留めされたメッセージ|^—\s*\d{4}\/|@\S+\s*がメッセージを)/.test(raw)
      || /^しゃけ@/.test(raw) || /^スレ主$/.test(raw)) return true;

    /* CT の進行（CT解除/介助/CT3 等）。
       ledger-provenance.js:269 は「費用を伴わない CT 進行」を指す。行頭側に
       支出額が明記されていれば計算対象として通常処理へ流す。明記が無い
       「現在1492LP」だけの行は進行メモとして保持し、支出にしない。 */
    const isCt = /CT\s*\d|CT解除|CT介助|\d+CT|同期CT|CT\d+解除/.test(t);
    if (isCt) {
      const headOfCt = t.split(/現在/)[0];
      const hasExplicit = /(\d[\d,]*)\s*(?:lp|欠片|カケラ|かけら)/i.test(headOfCt);
      if (!hasExplicit) { current.gains.push(t); return true; }
    }

    /* セクション見出し（・支払い / ・支出 / ・現在 / ・報酬 / ・獲得）。 */
    const sec = t.match(/^[・•]\s*(支払い|支出|現在|報酬|獲得)\s*$/);
    if (sec) {
      state.mode = sec[1] === "支払い" || sec[1] === "支出" ? "buy"
        : sec[1] === "現在" ? "now" : sec[1] === "報酬" ? "income" : "gain";
      return true;
    }

    /* LP→欠片の換算。収入でも支出でもない第三の取引として exchange に積む。 */
    const ex = t.match(/LPを欠片に変換[^0-9]*([+-]?\d[\d,]*)\s*(?:欠片|カケラ|かけら)[^0-9-]*([+-]?\d[\d,]*)\s*lp/i);
    if (ex) {
      current.exchange = current.exchange || { lp: 0, shards: 0 };
      current.exchange.lp += Math.abs(num(ex[2]));
      current.exchange.shards += Math.abs(num(ex[1]));
      return true;
    }

    /* 抽出チケット。枚数と種別だけを取り、人格名は注記として残す。 */
    if (/チケット/.test(t)) {
      const m = t.match(/(\d[\d,]*)\s*(?:枚|x)/) || t.match(/x\s*(\d[\d,]*)/) || t.match(/[+](\d[\d,]*)/);
      const kind = /e\.?g\.?o/i.test(t) ? "ego" : /選択/.test(t) ? "choice" : /人格/.test(t) ? "persona" : null;
      const note = (t.match(/[:：](.*)$/) || [])[1] || null;
      current.tickets.push({ kind, count: m ? num(m[1]) : 1 });
      if (note) current.notes.push(String(note).trim());
      return true;
    }

    /* 残高のまとめ行（"0欠片　40LP" 等）は収支ではないので黙って消費する。 */
    if (/^\d[\d,]*\s*(?:欠片|カケラ|かけら)\s+\d[\d,]*\s*lp/i.test(t)) return true;

    /* "現在" がある行 = 手前の額がそのシナリオの収入/支出、後ろが累計残高。 */
    const now = t.indexOf("現在");
    if (now >= 0) {
      const head = t.slice(0, now).trim();
      /* "40LP：現在80LP" は通貨だけで始まる収入行。モードが buy でも収入として読む。 */
      const incomeOnly = /^(\d[\d,]*)\s*(?:lp|欠片|カケラ|かけら)/i.test(head) || /^lp\s*[:]?\s*\d/i.test(head)
        || /^\d[\d,]*\s*\+\s*[^+]*\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)/i.test(head) // 88+何変10LP
        || /^(?:欠片|カケラ|かけら|lp)\s*[:]?\s*\d[\d,]*\s*\+\s*\d[\d,]*/i.test(head); // 欠片:20+10 は加算収入
      /* "吐き出す傲慢:40LP" / "炎拳事務所の人格200LP" は名前が先にある支出。 */
      const namedCost = /[^\d\s:][^:]*[:\s]\s*\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)/i.test(head)
        || /[^\d\s:]\S*\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)/i.test(head);
      const headCurrency = /(?:\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)|(?:lp|欠片|カケラ|かけら)\s*\d)/i.test(head);
      /* 支出セクション（・支出/・支払い）の行は、名前だけでも支出として扱う。 */
      const isBuy = !incomeOnly && (state.mode === "buy" || /購入|消費|支払/.test(head) || namedCost);
      if (!head) {
        /* "現在LP：3656" のような行は残高まとめの1行目。次の "欠片：1362" も
           残高として扱うため mode を now にする（収入に数えない）。 */
        state.mode = "now";
        return true;
      }

      /* "現在" の後ろの残高を読む（LP/欠片が両方ある行もある）。 */
      const tail = t.slice(now);
      const balSh = tail.match(/現在[^0-9]{0,8}([\d,]*)\s*(?:欠片|かけら|カケラ)/);
      /* "現在87欠片" は欠片であって LP ではない。通貨が明記された LP だけを拾う。
         head に欠片がある行（"欠片35 現在287"）の現在値は欠片残高。 */
      const headShard = /欠片|かけら|カケラ/.test(head);
      const balLp = tail.match(/現在\s*([\d,]*)\s*lp/i)
        || (!balSh && !headShard ? tail.match(/現在\s*([\d,]*)/) : null);
      /* head に欠片がある行の "現在287"（通貨明記なし）は欠片残高。 */
      const balShFallback = (!balSh && !balLp && headShard) ? tail.match(/現在\s*([\d,]*)/) : null;
      const bal = {
        lp: balLp ? num(balLp[1]) : null,
        shards: balSh ? num(balSh[1]) : (balShFallback ? num(balShFallback[1]) : null)
      };
      const prevBalance = current.lastBalance;
      current.lastBalance = {
        lp: bal.lp !== null ? bal.lp : (prevBalance ? prevBalance.lp : null),
        shards: bal.shards !== null ? bal.shards : (prevBalance ? prevBalance.shards : null)
      };

      if (isBuy) {
        const cost = { lp: 0, shards: 0 };
        let found = false;
        /* "炎拳事務所の人格200LP" / "涙剣：燃え上がる闘志 150欠片" のように
           金額が名前の直後にある場合も拾う（head は「現在」より手前だけ）。 */
        const sh = head.match(/(\d[\d,]*)\s*(?:欠片|カケラ|かけら)/)
          || head.match(/(?:欠片|カケラ|かけら)\s*(\d[\d,]*)/); // 欠片134 のような前後逆
        const lpp = head.match(/(\d[\d,]*)\s*lp/i);
        if (sh) { cost.shards = num(sh[1]); found = true; }
        if (lpp) { cost.lp = num(lpp[1]); found = true; }
        /* "人格ガチャ2回" は回数×公式ルール価格（core:338 所持時100LP）。
           末尾の人格名は獲得結果なので gains へ回す。 */
        const gacha = head.match(/人格?(?:抽出)?ガチャ\s*(\d+)\s*回/);
        if (gacha && !found) {
          const times = num(gacha[1]);
          const costFn = typeof window !== "undefined" ? window.LBT_acquireCost : null;
          const rule = costFn ? costFn("persona", "gachaPaid", { ownsPersona: true }) : null;
          const per = rule ? (rule.lp || 0) : 100;
          if (per) { cost.lp = per * times; found = true; }
          /* 獲得人格名は「現在」より後ろにも書かれるので行全体から取る。
             "現在19LP T社... 南部シ協会..." の残高部分は除く。 */
          const names = t.replace(/人格?(?:抽出)?ガチャ\s*\d+\s*回/, "")
            .replace(/現在\s*\d+\s*(?:lp)?/gi, "").trim();
          if (names) current.gains.push(names);
        }
        /* 既知の人格省略形が複数並ぶ行（"夜明B 卯筆頭 薬指子方 カピターノ"）は
           各人格の購入として分割する。金額は resolve がルール価格を当てる。 */
        const aliasRe = /(?:^|\s)(W社[234]級|夜明B|卯筆頭|中期?筆頭|薬指子方|カピターノ|銛使い|ボス)(?=\s|$)/g;
        if (!found) {
          const aliases = [...head.matchAll(aliasRe)].map((m) => m[1]);
          if (aliases.length >= 2) {
            for (const a of aliases) {
              current.spends.push({ name: a, cost: { lp: 0, shards: 0 }, needsDecision: true, reason: "金額が読めない", kindHint: "persona", raw });
            }
            return true;
          }
        }
        /* 通貨単位が直後に続く数字だけを金額として除く（"6課" の 6 は人格名なので残す）。 */
        const cleanName = (s) => s.replace(/\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)/gi, "").replace(/[-:\s]+(?:購入|消費|導入)?$/, "").trim();
        const name = cleanName(head) || head;
        /* 分割は +/および は常に、"、"由来の "," は既知の人格・サポート名が
           2つ以上含まれる場合だけ行う（"肉体強化 0、精神強化 0" の誤分割を防ぐ）。 */
        const knownName = (s) => /異常震域|空回りの怠惰|呼吸熱|知識探求|圧縮|正義|破撃|自然|鈎| health/i.test(s)
          || /人格|フィクサー|殺手|職員|組員|構成員|船長|代表|筆頭|子方|ボス/.test(s);
        const commaParts = head.split(",");
        const hasSplit = /\+|＋|および/.test(head)
          || (commaParts.length > 1 && commaParts.filter(knownName).length >= 2);
        if (found || !hasSplit) {
          /* 金額が無くても明細が1つなら、resolve が価格を引けるよう1件として残す。 */
          current.spends.push({
            name, cost,
            needsDecision: !found || null,
            reason: !found ? "金額が読めない" : null,
            kindHint: hintOf(name), raw
          });
        } else {
          /* 複数明細が混在（"人格A+知識探求購入" / "人格A、および呼吸熱購入"）。
             個別に分割して resolve に価格を引かせる。 */
          const parts = head.split(/\s*(?:\+|＋|、|,|および)\s*/g).map(cleanName).filter(Boolean);
          const base = { needsDecision: true, reason: "金額が読めない", raw };
          for (const part of parts) {
            current.spends.push({ name: part, cost: { lp: 0, shards: 0 }, ...base, kindHint: hintOf(part) });
          }
        }
        return true;
      }
      /* 加算が "現在" をまたぐことがある（"88+何変10LP　現在1347" 等）ので、
         head で加算が途切れていたら行全体の加算も試す。 */
      let amount = leadingAmount(head);
      if (!amount) {
        const whole = t.slice(0, now + 2).trim();
        amount = leadingAmount(whole);
      }
      if (amount) {
        current.income.lp += amount.lp;
        current.income.shards += amount.shards;
        return true;
      }
      /* 名前はあるが額が手前で読めない（"X 現在かけら177" 等）→ 要確認の支出。 */
      if (head && !/^\d/.test(head)) {
        current.spends.push({
          name: head.replace(/[:：\s]+$/, "").trim() || head,
          cost: { lp: 0, shards: 0 },
          needsDecision: true, reason: "金額が決められない",
          kindHint: hintOf(head), raw
        });
      }
      return true;
    }

    /* "現在" が無い行。購入・消費の明細だけ拾う。
       通貨単位も購入語も無い人格名・見出し・メモは支出にしない。 */
    /* (消費アイテム) は消費ではなくアイテム種別の注記なので支出にしない。
       ▶︎ 「戦闘中...得る」はアイテム効果の説明行で支出ではない。 */
    if (/消費アイテム/.test(t) || /^[▶►▸]/.test(t) || /^戦闘中.*(?:得る|半減|付与)/.test(t)) {
      current.gains.push(t);
      return true;
    }
    const hasCurrency = /(?:\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)|(?:lp|欠片|カケラ|かけら)\s*\d)/i.test(t);
    if ((state.mode === "buy" && hasCurrency) || /購入|消費/.test(t)) {
      const cost = { lp: 0, shards: 0 };
      let found = false;
      const sh = t.match(/(\d[\d,]*)\s*(?:欠片|カケラ|かけら)/)
        || t.match(/(?:欠片|カケラ|かけら)\s*(\d[\d,]*)/);
      const lpp = t.match(/(\d[\d,]*)\s*lp/i);
      if (sh) { cost.shards = num(sh[1]); found = true; }
      if (lpp) { cost.lp = num(lpp[1]); found = true; }
      const cleanName = (s) => s.replace(/\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)/gi, "").replace(/[-:\s]+(?:購入|消費|導入)?$/, "").trim();
      const name = cleanName(t) || t;
      if (found || !/\+|＋|、|および/.test(t)) {
        current.spends.push({
          name, cost,
          needsDecision: !found || null,
          reason: !found ? "金額が読めない" : null,
          kindHint: hintOf(name), raw
        });
      } else {
        const parts = t.split(/\s*(?:\+|＋|、|,|および)\s*/g).map(cleanName).filter(Boolean);
        const base = { needsDecision: true, reason: "金額が読めない", raw };
        for (const part of parts) {
          current.spends.push({ name: part, cost: { lp: 0, shards: 0 }, ...base, kindHint: hintOf(part) });
        }
      }
      return true;
    }

    /* 単独の「報酬」「獲得」ラベル行は次の収入行の見出しなので無視する。 */
    if (/^(報酬|獲得)$/.test(t)) { state.mode = "income"; return true; }

    /* 硝子の欠片/破片 ×N は消費アイテムの獲得として保持する（通貨の欠片ではない）。 */
    if (/^硝子の(?:欠片|かけら|破片)\s*[×x*]?\s*\d*$/.test(t)) {
      current.gains.push(t);
      return true;
    }

    /* "・現在" セクション／"現在LP：NNN" の後続の残高行（187LP / 211欠片 /
       欠片：1362）は収支ではない。 */
    if (state.mode === "now" && /(?:^\d[\d,]*\s*(?:lp|欠片|カケラ|かけら)|^(?:lp|欠片|カケラ|かけら)\s*[:]?\s*\d)/i.test(t)) return true;

    /* "現在" が無い報酬行（外部卓の "LP30+10" / "LP80" / "欠片50" 等）。
       "現在" が無い＝累計残高の対比が無い分、額そのものが報酬。 */
    if (state.mode !== "buy") {
      const reward = leadingAmount(t);
      if (reward) {
        current.income.lp += reward.lp;
        current.income.shards += reward.shards;
        return true;
      }
    }

    /* 人物名だけの行（獲得人格の列挙）は調達メモとして保持し、skipped にしない。
       名称に番号が入る（白蓮3流清掃員 等）ので数字は許可するが、
       通貨単位・現在・購入・チケットは含まない。 */
    /* チケットで複数人格を獲得した記録（長い行）も gains として保持する。 */
    if (/チケ|獲得|入手|を抽出/.test(t) && !/現在\s*\d/.test(t)) {
      current.gains.push(t);
      return true;
    }
    if (!SHARD_WORD.test(t) && !/lp/i.test(t) && !/現在|チケット|購入|消費|支払/.test(t)
      && t.length <= 40 && !/^(報酬|獲得|支出|支払い|現在)/.test(t)) {
      current.gains.push(t);
      return true;
    }
    return false;
  }

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

  /* Discord 形式の判定。｜区切り形式には決して現れないセクション見出し
     （・支出 / ・支払い / ・現在 / ・報酬 / ・獲得）を手掛かりにする。 */
  function isDiscordText(rawText) {
    const s = String(rawText ?? "");
    if (!s) return false;
    if (/^([^｜|]{1,14})[｜|]\s*\S/m.test(s)) return false; // ｜区切りは本体へ
    return /^[・•]\s*(?:支払い|支出|現在|報酬|獲得)\s*$/m.test(s)
      || /(?:@\S+\s*スレ主|スレ主\s*[—-]|ピン留めされたメッセージ|^—\s*\d{4}\/)/m.test(s)
      || /(?:^|\n)\s*現在(?:LP|欠片|カケラ|かけら)\s*[:：]\s*\d/im.test(s);
  }

  function parseText(rawText) {
    const records = [];
    const skipped = [];
    let current = null;
    const discordState = { mode: null };

    let lastRecord = null;
    const flush = () => {
      if (!current) return;
      /* 見出しも本文も無い帖はリザルトにならない */
      const empty = !current.title && !current.income.lp && !current.income.shards
        && !current.tickets.length && !current.spends.length;
      /* リザルトではない見出し（特異リスト/CT管理/保管物/獲得リスト 等）は除外する。 */
      const nonResult = /リスト|管理|保管物|リスト$|CT\d|^報酬$/.test(String(current.title || ""));
      if (empty || (nonResult && !current.income.lp && !current.income.shards && !current.tickets.length && !current.spends.length)) {
        current = null;
      } else { records.push(current); lastRecord = current; current = null; }
    };
    const open = (title, author) => {
      flush();
      discordState.mode = null; // セクション（・支出等）はリザルトをまたがない
      current = { title: title || null, author: author || null, income: { lp: 0, shards: 0 }, tickets: [], spends: [], deltas: [], notes: [], gains: [], exchange: { lp: 0, shards: 0 }, lastBalance: null, raw: [] };
      return current;
    };

    for (const rawLine of String(rawText ?? "").split(/\r?\n/)) {
      const line = rawLine.trim();
      /* 空行は次の【見出し】で区切る。Discord の "・支出" は空行の続きなので
         ここで flush すると明細が別リザルトへ分離してしまう。 */
      if (!line) continue;

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

      /* ｜ が無い Discord 形式の行。認識できれば current を更新する。 */
      /* "・支出" 等は空行で flush された直前リザルトの続きなので再接続する。 */
      if (!current && /^[・•]\s*(支払い|支出|現在|報酬|獲得)\s*$/.test(toHalf(line).trim()) && lastRecord) {
        current = lastRecord;
      }
      if (!current) open(null, null);
      if (readDiscordLine(line, current, discordState)) continue;

      /* 見出しも ｜ も無い行。読み方が分からないので理由つきの skipped にする。 */
      skipped.push({ text: line, reason: "見出しも区切りも無い" });
    }
    flush();
    return { records, skipped, discord: true };
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

  /* 明細名を DB／ルール価格へ照合する。UI の resolveSpendName は人格・E.G.O
     程度しか見ないため、Discord ログに出る省略形・消耗アイテム・特殊強化・
     同期費用はここで補完する。解決できないものは勝手に埋めず null。 */
  function resolveSpendName(name, baseResolve) {
    const src = String(name || "").trim();
    if (!src) return null;
    const win = typeof window !== "undefined" ? window : {};
    const db = win.DB || {};
    const prov = win.LBT_provenance || {};
    /* 原文ログに見られる誤記だけを正式表記へ寄せる（双鈎→双鉤 等）。
       誤記の確認されている語に限定し、類似名の推測はしない。 */
    const normalize = (s) => String(s || "")
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/双鈎/g, "双鉤")
      .replace(/运送/g, "運送")
      .replace(/靴教団/g, "靴団");
    const norm = normalize(src);
    const personaAlias = [
      [/W社2級/, "W社2級整理要員"],
      [/W社3級/, "W社3級整理要員"],
      [/^夜明B$/, "夜明事務所フィクサーB"],
      [/^卯筆頭$/, "黒獣-卯 筆頭"],
      [/^薬指子方$/, "蜘蛛の巣 薬指の子方"],
      [/^カピターノ$/, "夜の錐カピターノ"]
    ];
    let look = norm;
    for (const [re, formal] of personaAlias) {
      if (re.test(norm)) { look = formal; break; }
    }

    const items = Array.isArray(db.items) ? db.items : [];
    const item = items.find((e) => e && e.name === look)
      || items.find((e) => e && e.name && (look.includes(e.name) || e.name.includes(look)));
    if (item) {
      const lp = Number.parseInt(String(item.price || "").match(/\d+/)?.[0], 10) || 0;
      if (lp) return { name: item.name, dbName: item.name, kinds: [{ kind: "item", price: { lp, shards: 0 }, source: "items.json" }] };
    }

    const enhancementAlias = [
      [/サポスロ|サポートスロット/, "サポートスロット追加"],
      [/死亡後パッシブ|デスパッシブ/, "死亡後パッシブ追加"],
      [/闘志/, "燃え上がる闘志"],
      [/守備/, "進むべき守備"],
      [/自生/, "自生する肉体"]
    ];
    for (const [re, formal] of enhancementAlias) {
      if (!re.test(src)) continue;
      const e = (db.special_enhancements || []).find((x) => x && x.name === formal);
      const shards = e ? Number.parseInt(String(e.shards || e.price || "").match(/\d+/)?.[0], 10) || 0 : 0;
      if (shards) return { name: formal, dbName: formal, kinds: [{ kind: "enhancement", price: { lp: 0, shards }, source: "special_enhancements" }] };
    }

    if (/同期/.test(src)) {
      const op = /同期MAX/.test(src) ? "syncMax" : "sync";
      const cost = typeof prov.operationCost === "function" ? prov.operationCost(op) : null;
      if (cost && (cost.lp || cost.shards)) {
        return { name: src, dbName: src, kinds: [{ kind: "sync", price: { lp: cost.lp || 0, shards: cost.shards || 0 }, source: cost.source }] };
      }
    }

    let hit = typeof baseResolve === "function" ? (baseResolve(look) || null) : null;
    if (!hit && look !== norm) hit = typeof baseResolve === "function" ? (baseResolve(norm) || null) : null;
    if (!hit) return null;
    /* 解決した kind へ価格を付ける。人格はルール価格、それ以外は
       provenance.priceOf が公式価格を持つ。価格不明の kind はそのまま。 */
    const priceOf = typeof prov.priceOf === "function" ? prov.priceOf : null;
    const costFn = typeof win.LBT_acquireCost === "function" ? win.LBT_acquireCost : null;
    const kinds = (hit.kinds || []).map((k) => {
      if (!k || (k.price && (k.price.lp || k.price.shards))) return k;
      let price = null;
      if (k.kind === "persona" && costFn) {
        const rule = costFn("persona", "purchase", { ownsPersona: true });
        if (rule) price = { lp: rule.lp || 0, shards: rule.shards || 0, source: rule.source || "core" };
      } else if (priceOf) {
        price = priceOf(hit.name || look, k.kind, db);
      }
      if (price && (price.lp || price.shards)) {
        return { ...k, price: { lp: price.lp || 0, shards: price.shards || 0 }, source: price.source || k.source };
      }
      return k;
    });
    return { ...hit, kinds };
  }

  /* 提案済みリザルト + 明細を reducer の action 並びへ落とす。
     excluded: Set(添字) を渡すと、その明細は作らない。 */
  function plan(parsed, options) {
    const opts = options || {};
    const excluded = opts.excluded || new Set();
    const actions = [];
    const skipped = (parsed.skipped || []).slice();
    const resolve = (name) => resolveSpendName(name, opts.resolve);

    for (const [recordIndex, record] of (parsed.records || []).entries()) {
      const title = record.title || "無題";
      const note = [record.author ? `作：${record.author}` : "", ...(record.notes || [])].filter(Boolean).join(" / ");
      const exchange = (record.exchange?.lp || record.exchange?.shards)
        ? { lp: record.exchange.lp, shards: record.exchange.shards } : undefined;
      actions.push({ type: "ADD_RESULT", name: title, income: { lp: record.income.lp, shards: record.income.shards, tickets: ticketIncome(record.tickets) }, ...(exchange ? { exchange } : {}), note });
      record.spends.forEach((spend, index) => {
        const exclusionKey = `${recordIndex}:${index}`;
        if (excluded.has(exclusionKey) || excluded.has(index)) return;
        const hit = resolve(spend.name);
        /* 原文に金額が無くても、DB が価格を持つ種別なら DB 価格で埋める。
           人格は DB に価格が無い（仕様）ので要確認として残す。 */
        let cost = { lp: spend.cost.lp, shards: spend.cost.shards };
        let fromDb = false;
        if (spend.needsDecision && hit && hit.kinds) {
          const priced = hit.kinds.find((k) => k.price && (k.price.lp || k.price.shards));
          if (priced) { cost = { lp: priced.price.lp || 0, shards: priced.price.shards || 0 }; fromDb = true; }
        }
        if (spend.needsDecision && !fromDb) { skipped.push({ text: spend.raw || spend.name, reason: spend.reason || "要確認" }); return; }
        const { kind, dbName } = kindOf(spend, resolve);
        actions.push({ type: "ADD_ENTRY", kind, name: dbName, cost, ...(fromDb ? { note: "DB価格で補完（原文に金額の明記なし）" } : {}) });
      });
    }
    return { actions, skipped, identities: [] };
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

  const api = { parseText, plan, isDiscordText };
  if (typeof window !== "undefined") window.LBT_discordImport = api;
})();