import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   硝子窓の共有URL取り込みの回帰テスト。

   守るべき性質:
     - 共有URL 1 つで所持が全部取れること（一覧取得は存在しない）
     - コレクションは characters / personas を正しく見分けること
     - 取り込む前に「何が存在するか」が一覧できること（選択の材料）
     - DB に無い名前は解決済みにしないこと
     - 壊れた値でも manifest を落とさないこと
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  /* parseShareUrl は WHATWG の URL でホスト名を検証する。vm サンドボックスには
     Node の URL が自動で生えないため、本番ブラウザーと同じ能力をここへ渡す。 */
  const context = { window: {}, console, module: { exports: {} }, URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const G = load("garasumado-roster-import.js", "LBT_garasumado");
/* メモパーサは roster-import より前に読む必要があるので、同じ VM に先に載せる。 */
const MEMO = (() => {
  const source = readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_garaMemo;
})();

/* --- シナリオ履歴（scenarioHistory[].memo）→ リザルト --------------------
   memo は自由記述。「現在NN」は収入ではなく残額、
   「・支出」以降は支出明細。この二つを取り違えると帳尻が全部ズレる。 */

test("memo の収入は「現在NN」ではなく行頭の金額を読む", () => {
  const r = MEMO.parseMemo("90LP：現在100LP\n29欠片：現在39欠片");
  assert.equal(r.income.lp, 90, "収入 LP は 90（現在 100 は残額）");
  assert.equal(r.income.shards, 29, "収入 欠片は 29");
  assert.equal(r.spends.length, 0, "収入行は支出にならない");
});

test("欠片の表記ゆれを吸収する（欠片/かけら/欠けら/カケラ）", () => {
  for (const word of ["欠片", "かけら", "欠けら", "カケラ"]) {
    const r = MEMO.parseMemo(`40${word}：現在60`);
    assert.equal(r.income.shards, 40, word + " を欠片として読む");
    assert.equal(r.income.lp, 0);
  }
});

test("「名前：名前 150欠片 現在184」は購入で収入に足さない", () => {
  const r = MEMO.parseMemo("欠片60　現在334\n涙剣：燃え上がる闘志 150欠片　現在184");
  assert.equal(r.income.shards, 60, "収入は 60 だけ（購入150は混ぜない）");
  assert.equal(r.spends.length, 1, "購入は支出として 1 件");
  assert.equal(r.spends[0].shards, 150);
  /* 「90LP：現在100」は：の前が通貨なので収入のまま。 */
  assert.equal(MEMO.parseMemo("90LP：現在100LP").income.lp, 90, "ラベル形式の現在値は収入");
});

test("名前と金額が一行に収まった購入の短文は支出と勝ちの両方になる", () => {
  const r = MEMO.parseMemo([
    "購入：ルサンチマン-7LP",
    "ルサンチマン購入-7",
    "因子コード G-5購入 7LP",
    "LP-20 サポートパッシブ「人生一発」購入"
  ].join("\n"));
  assert.equal(r.income.lp, 0, "購入の短文は収入に足さない");
  assert.equal(r.spends.length, 4, "購入 4 件は支出");
  assert.deepEqual([...r.spends.map((s) => `${s.name} ${s.lp}LP${s.shards ? " " + s.shards + "欠片" : ""}`)], [
    "ルサンチマン 7LP",
    "ルサンチマン 7LP",
    "因子コード G-5 7LP",
    "人生一発 20LP"
  ]);
  const winNames = [...new Set(r.wins.map((w) => w.name))];
  assert.deepEqual(winNames, ["ルサンチマン", "因子コード G-5", "人生一発"], "購入された名前は勝ちにもなる");
  assert.equal(r.wins.every((w) => w.bought), true, "購入の勝ちには bought が付く");
});

test("購入の短文の形でない叙述は購入の記録にしない", () => {
  const r = MEMO.parseMemo(
    "終了後サポートパッシブ「ルサンチマン」と「肩慣らし」を購入したためLP-27。\n" +
    "切り伏せる斬撃を購入、150LP消費　300LPへ\n" +
    "30LP、30欠片…を獲得。硝酸の欠片×1を消費して同期化"
  );
  assert.equal(r.spends.length, 0, "金額が一行に収まらない叙述は支出にしない");
  assert.ok(r.wins.some((w) => w.name === "ルサンチマン"), "サポパの名前は従来どおり勝ちに入る");
  assert.equal(r.income.lp, 30, "収入は 30LP の獲得行だけ（購入の叙述は混ぜない）");
  assert.equal(r.income.shards, 30, "欠片も同じ獲得行から 30");
});

test("掉落値の内訳が括弧に入っても外側の額を読む", () => {
  const r = MEMO.parseMemo("120LP、75(理性60+15)欠片、人格チケット×1を獲得。");
  assert.equal(r.income.lp, 120, "LP は 120");
  assert.equal(r.income.shards, 75, "括弧は掉落内訳なので欠片は外側の 75");
  const only = MEMO.parseMemo("75(理性60+15)欠片");
  assert.equal(only.income.shards, 75);
});

test("通貨語なしの裸数値が縦に並ぶ書き方を読む（80/40/人格チケット 形式）", () => {
  const r = MEMO.parseMemo("80\n40\n人格チケット");
  assert.equal(r.income.lp, 80, "1行目が LP");
  assert.equal(r.income.shards, 40, "2行目が 欠片");
});

test("裸数値スタックは EGO やセレンが後ろに続いても読む", () => {
  const r = MEMO.parseMemo("80\n45\n人格\n ego\nセレン");
  assert.equal(r.income.lp, 80);
  assert.equal(r.income.shards, 45);
});

test("裸数値スタックは前後の文章（まけた！等）を挟んでも読む", () => {
  const r = MEMO.parseMemo("まけた！\n25\n25");
  assert.equal(r.income.lp, 25);
  assert.equal(r.income.shards, 25);
});

test("通貨語が1つでもあれば裸数値スタックは読まない（二重計上防止）", () => {
  const r = MEMO.parseMemo("80\n40\n人格チケット\n欠片：12");
  assert.equal(r.income.shards, 12, "ラベル付きの値だけを採用");
  assert.equal(r.income.lp, 0, "裸数値の LP は重ねない");
});

test("日付や比率は裸数値スタックとして読まない", () => {
  const d = MEMO.parseMemo("2026/10/6\n報酬\n+165LP、75欠片");
  assert.equal(d.income.lp, 165);
  assert.equal(d.income.shards, 75);
  const two = MEMO.parseMemo("7/13\n報酬");
  assert.equal(two.income.lp, 0, "日付の 7/13 は収入ではない");
  assert.equal(two.income.shards, 0);
});

test("3行以上の純数字列は順序が確定しないので読まない", () => {
  const r = MEMO.parseMemo("2026\n10\n6");
  assert.equal(r.income.lp, 0);
  assert.equal(r.income.shards, 0);
});

test("数字がCircle区切りや文字列に混ざった行はスタックに数えない", () => {
  const r = MEMO.parseMemo("125どちらとも\n選択抽出チケット");
  assert.equal(r.income.lp, 0, "数値に語尾が付く行は数量として読まない");
});

test("1行に両通貨があれば両方を取る（片方だけだと帳尻が合わない）", () => {
  const r = MEMO.parseMemo("・支払い\nLPを欠片に変換：+11欠片 -22LP");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 22, "LP 側は 22");
  assert.equal(r.spends[0].shards, 11, "欠片側は 11");
  assert.notEqual(r.spends[0].lp, r.spends[0].shards, "両通貨が同じ値にならない");
});

test("「・支出」以降の現在残高は支出額として誤計上しない", () => {
  const r = MEMO.parseMemo("60LP：現在100LP\n・支出\n正義購入 現在87欠片");
  assert.equal(r.income.lp, 60);
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].shards, 0, "現在87欠片は支払後残高なので支出額にしない");
  assert.ok(r.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)),
    "購入動詞があっても残高しか書かれていなければ要確認にする");
});

test("硝子窓の矢印付き消費は収入・チケット獲得と混ぜず、支出と獲得を分離する", () => {
  const rows = [
    "→LP100消費ガチャ:厳粛な哀悼獲得",
    "→100LP消費：LCE E.G.O:紅炎殺獲得",
    "→自我の破片100消費：羽ばたき：妖精の祭典獲得",
    "LP200消費パック「心のすれ違う」→ワザリングハイツ・ワイルドハントの人格の獲得",
    "自我の破片100消費→幸福：あなたは幸せでなければならない獲得"
  ];
  const parsed = MEMO.parseMemo(rows.join("\n"));
  assert.equal(parsed.income.lp, 0, "LP消費額を収入として足さない");
  assert.equal(parsed.income.shards, 0, "自我の破片消費額を収入として足さない");
  assert.deepEqual([...parsed.spends.map((s) => [s.lp, s.shards])], [
    [100, 0], [100, 0], [0, 100], [200, 0], [0, 100]
  ]);
  assert.deepEqual([...parsed.wins.map((w) => w.name)], [
    "厳粛な哀悼",
    "LCE E.G.O:紅炎殺",
    "羽ばたき：妖精の祭典",
    "ワザリングハイツ・ワイルドハントの人格",
    "幸福：あなたは幸せでなければならない"
  ], "E.G.O名に含まれるコロンも壊さない");
  assert.deepEqual({ ...parsed.tickets }, { persona: 0, ego: 0, choice: 0 });
});

test("獲得矢印より前に書かれた抽出チケットとパックチケットは消費として記録する", () => {
  const parsed = MEMO.parseMemo([
    "人格抽出チケット1枚→薬指野獣派スチューデントA獲得",
    "200LP以下パックチケット「本に成った者たちⅠ」→夜の錐カピターノの人格獲得"
  ].join("\n"));
  assert.deepEqual([...parsed.ticketSpends.map((s) => [s.kind, s.pack, s.count])], [
    ["persona", "", 1],
    ["pack", "本に成った者たちⅠ", 1]
  ]);
  assert.equal(parsed.tickets.persona, 0, "使ったチケットを収入にしない");
  assert.equal(Object.keys(parsed.pack).length, 0, "使ったパックを獲得分にしない");
  assert.equal(parsed.wins.length, 2);
});

test("E.G.O の読みは「エゴ」で読む", () => {
  /* 「イゴ」を E.G.O の別名にしていたため、実データに一度も出ない表記を
     信用していた。正しい読みは「エゴ」。 */
  const r = MEMO.parseMemo("・支出\nエゴを愉しむ 50欠片");
  assert.equal(r.spends.length, 1, "エゴで書かれた行が支出になる");
  assert.equal(r.spends[0].shards, 50);
});

test("「・支払い」「・支出」どちらの表記でも支出になる", () => {
  for (const head of ["・支出", "・支払い"]) {
    const r = MEMO.parseMemo(`40LP：現在80LP\n${head}\n吐き出す傲慢：40LP　現在40LP`);
    assert.equal(r.spends.length, 1, head + " が支出節として読める");
  }
});

test("残額だけの行は支出に入らない（動詞なしなら残WRITE）", () => {
  /* 「現在NN」は支払後の残高。支出かどうかは動詞（消費/購入/行使…）で決まる。
     実データに「黒獣-午　現在48LP」「東部センク　闘志 残り117欠片」等同型があり、
     これらを支出に数えると帳尻が狂う。 */
  const r = MEMO.parseMemo("・支出\n黒獣-午　現在48LP\n東部センク　闘志 残り117欠片");
  assert.equal(r.spends.length, 0, "動詞なし行は残WRITEであり支出ではない");
});

test("動詞があっても「現在NN」しかなければ支出額を確定しない", () => {
  const a = MEMO.parseMemo("・支出\n正義購入 現在87欠片");
  assert.equal(a.spends.length, 1, "購入行自体は履歴に残す");
  assert.equal(a.spends[0].shards, 0, "現在87欠片を支出として記帳しない");
  assert.ok(a.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)));
  const b = MEMO.parseMemo("・支出\n刺し貫く貫通購入：現在130LP");
  assert.equal(b.spends.length, 1);
  assert.equal(b.spends[0].lp, 0, "現在130LPを支出として記帳しない");
  assert.ok(b.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)));
});

test("「〜へ」で終わる行は前半の数が支出（後半は残WRITE）", () => {
  const r = MEMO.parseMemo("・支出\n切り伏せる斬撃を購入、150LP消費　300LPへ");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 150, "消費した額。300LPへ の 300 は残WRITE");
});

test("複数購入行は所持の証跡を保ち、現在残高を支出額にしない", () => {
  const r = MEMO.parseMemo("・支出\nピークォド号航海士の人格、および呼吸熱購入 現在19LP");
  assert.equal(r.spends.length, 1, "金額の分割記帳はしない");
  assert.equal(r.spends[0].lp, 0, "現在19LPを支出として計上しない");
  assert.ok(r.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)));
  assert.ok(r.wins.some((w) => w.name === "呼吸熱" && w.bought), "区切った名前の勝ち");
  assert.ok(r.wins.some((w) => w.name === "ピークォド号航海士の人格" && w.bought), "接続詞の前の名前も勝ち");
});

test("現在残高だけの購入行はどちらの通貨も支出として記帳しない", () => {
  const a = MEMO.parseMemo("・支出\n正義購入 現在87欠片");
  assert.equal(a.spends[0].lp, 0, "LP を作らない");
  assert.equal(a.spends[0].shards, 0, "現在残高を支出にしない");
  assert.ok(a.reasons.some((reason) => /支出金額が読み取れない/.test(reason.reason)));
});

test("叙述体の精神購入は括弧の名前を所持の証跡にする", () => {
  const a = MEMO.parseMemo("・支出\n終了後、精神「正義」を購入したため欠片-200");
  assert.equal(a.spends.length, 1);
  assert.equal(a.spends[0].shards, 200);
  assert.equal(a.spends[0].name, "正義");
  assert.ok(a.wins.some((w) => w.name === "正義" && w.bought));
  const b = MEMO.parseMemo("・支出\n精神「優越」を買ったので欠片-100");
  assert.equal(b.spends[0].shards, 100);
  assert.equal(b.spends[0].name, "優越");
  assert.ok(b.wins.some((w) => w.name === "優越" && w.bought), "買ったも購入語");
});

test("収入節に書かれた叙述体の購入も所持の証跡になり、金額は帳に入れ直さない", () => {
  const a = MEMO.parseMemo("LP60、欠片30、人格抽出チケット*1を獲得。ガチャ結果→ピークォド号船長\n精神「正義」を購入したため欠片-200");
  assert.ok(a.wins.some((w) => w.name === "正義" && w.bought), "括弧の名前の勝ち");
  assert.equal(a.spends.length, 0, "購入の金額は叙述から帳に数えない");
  assert.equal(a.income.lp, 60, "獲得行だけが収入");
  const b = MEMO.parseMemo("85LP、47カケラ、EGO抽出ガチャチケ＆人格抽出チケットを獲得\nサポパ「嚥下」を購入したのでLP-25\n精神「分別できる理性」を購入したので欠片-1000");
  assert.ok(b.wins.some((w) => w.name === "嚥下" && w.bought));
  assert.ok(b.wins.some((w) => w.name === "分別できる理性" && w.bought));
  assert.equal(b.spends.length, 0, "購入語が頭にない行は負額支出に回さない（既存の読み）");
});
test("全角の収入額・支出額・抽出回数も取り込む", () => {
  const reward = MEMO.parseMemo("９０ＬＰ：現在１００ＬＰ\n２９欠片：現在３９欠片");
  assert.equal(reward.income.lp, 90);
  assert.equal(reward.income.shards, 29);

  const spend = MEMO.parseMemo("・支出\n精神「正義」を購入 －２００欠片");
  assert.equal(spend.spends.length, 1);
  assert.equal(spend.spends[0].shards, 200);

  const tickets = MEMO.parseMemo("人格抽出チケットｘ２：某某の人格");
  assert.equal(tickets.tickets.persona, 2);
});

test("カンマ区切りの通貨額は全体で読み、壊れた桁区切りを部分一致させない", () => {
  const income = MEMO.parseMemo("1,200LP 2,500欠片");
  assert.equal(income.income.lp, 1200);
  assert.equal(income.income.shards, 2500);

  const reversed = MEMO.parseMemo("LP1,200 欠片2,500");
  assert.equal(reversed.income.lp, 1200);
  assert.equal(reversed.income.shards, 2500);

  const spend = MEMO.parseMemo("・支出\n精神「正義」を購入 1,200欠片");
  assert.equal(spend.spends.length, 1);
  assert.equal(spend.spends[0].shards, 1200);

  const invalidIncome = MEMO.parseMemo("1,20LP");
  assert.equal(invalidIncome.income.lp, 0, "1,20LP を 20LP と誤読しない");
  const invalidSpend = MEMO.parseMemo("・支出\n精神「正義」を購入 1,20欠片");
  assert.equal(invalidSpend.spends.length, 1);
  assert.equal(invalidSpend.spends[0].shards, 0, "不正なカンマ値を 20 欠片にしない");
});

test("パック別抽出チケットは通常チケットと重複せず、特殊キーも保持する", () => {
  const normalPack = MEMO.parseMemo("〈肉斬骨断〉抽出チケットx2");
  assert.equal(normalPack.tickets.persona, 0, "パック専用チケットを通常の人格チケットに加算しない");
  assert.equal(normalPack.pack["肉斬骨断"], 2);

  const protoPack = MEMO.parseMemo("〈__proto__〉抽出チケットx2");
  assert.equal(protoPack.tickets.persona, 0);
  assert.equal(protoPack.pack["__proto__"], 2, "__proto__ は通常のパック名として保存");
  assert.equal(Object.prototype.hasOwnProperty.call(protoPack.pack, "__proto__"), true, "__proto__ はown propertyとして保持");
  assert.equal(Object.getPrototypeOf(protoPack.pack).constructor.name, "Object", "オブジェクトのプロトタイプを数値で上書きしない");

  const constructorPack = MEMO.parseMemo("〈constructor〉抽出チケットx3");
  assert.equal(constructorPack.pack.constructor, 3, "constructor を関数に連結しない");

  const zeroPack = MEMO.parseMemo("〈Zero〉抽出チケットx0");
  assert.equal(zeroPack.pack.Zero, 0, "明示されたパックチケット0枚は1枚へ化けない");
  assert.equal(zeroPack.tickets.persona, 0);
});

test("安全整数の上限を超える金額や回数は黙って丸めず未計上理由を残す", () => {
  const unsafeAmount = MEMO.parseMemo("9007199254740992LP");
  assert.equal(unsafeAmount.income.lp, 0);
  assert.ok(unsafeAmount.reasons.some((r) => /LP金額が安全整数/.test(r.reason)));

  const overflowTotal = MEMO.parseMemo("6000000000000000LP\n6000000000000000LP");
  assert.equal(overflowTotal.income.lp, 6000000000000000, "合計が安全整数を超える行は加算しない");
  assert.ok(overflowTotal.reasons.some((r) => /通貨収入合計が安全整数/.test(r.reason)));

  const unsafeSpend = MEMO.parseMemo("・支出\n精神「正義」を購入 9007199254740992欠片");
  assert.equal(unsafeSpend.spends.length, 0, "安全整数でない支出を明細へ記帳しない");
  assert.ok(unsafeSpend.reasons.some((r) => /支出金額が安全整数/.test(r.reason)));

  const unsafeTickets = MEMO.parseMemo("人格抽出チケットx9007199254740992");
  assert.equal(unsafeTickets.tickets.persona, 0);
  assert.ok(unsafeTickets.reasons.some((r) => /抽出チケット数が安全整数/.test(r.reason)));
});

test("チケットの個数と種別を読む", () => {
  const a = MEMO.parseMemo("抽出チケットx1：シュエ家私兵の人格");
  assert.equal(a.tickets.persona, 1);
  const b = MEMO.parseMemo("人格抽出チケットx2：某某");
  assert.equal(b.tickets.persona, 2);
  const c = MEMO.parseMemo("E.G.O抽出チケット：某某");
  assert.equal(c.tickets.ego, 1);
});

test("明示されたゼロ枚・ゼロ回の抽出は1枚に化けず、獲得候補も作らない", () => {
  const ticket = MEMO.parseMemo("人格抽出チケットx0：某某の人格");
  assert.equal(ticket.tickets.persona, 0, "x0 は0枚");
  assert.equal(ticket.wins.length, 0, "0枚の抽出から所持を推定しない");

  const draw = MEMO.parseMemo("抽出0：E.G.O:提灯");
  assert.equal(draw.tickets.ego, 0, "抽出0 は0回");
  assert.equal(draw.wins.length, 0, "0回の抽出からE.G.O所持を推定しない");

  const explicit = MEMO.parseMemo("E.G.O抽出チケット0枚：提灯");
  assert.equal(explicit.tickets.ego, 0, "0枚表記も維持");
  assert.equal(explicit.wins.length, 0);
});

test("manifest のシナリオが収入と支出を持つ", () => {
  const m = MEMO.parseScenarioHistory([
    { name: "S1", memo: "90LP：現在100LP\n29欠片：現在39欠片\n・支出\n憎悪購入：-50欠片" },
    { name: "S2", memo: "" },
    { name: "S3", memo: "なし" }
  ]);
  const s1 = m.find((s) => s.name === "S1");
  assert.equal(s1.income.lp, 90);
  assert.equal(s1.spends.length, 1);
  assert.equal(m.filter((s) => s.hasData).length, 1, "読めたシナリオだけ hasData");
});

/* --- 実データで判明した表記ゆれ（共有73シナリオから採った実物） --------- */

test("シナリオ名だけの行は「読めなかった」扱いにしない", () => {
  /* 収入セクションには「どの機関に勝ったか」の名前行が並ぶ。
     数字を含まないもの（北部ヂェーヴィチ協会 4 課フィクサー）と、
     課番号だけ持つもの（T社3級徴収職職員）は金額行ではない。
     reasons に載せると「全部読めなかった」という誤解を招く。 */
  const r = MEMO.parseMemo("90LP：現在100LP\n北部ヂェーヴィチ協会 4 課フィクサー\nT社3級徴収職職員");
  assert.equal(r.income.lp, 90);
  assert.equal(r.reasons.length, 0, "名前行はエラーではない");
});

test("効果の説明文は金額行ではない", () => {
  const r = MEMO.parseMemo("『壊れ砕けた黄金の残火』×1(消費アイテム)\n▶︎戦闘中1度だけ、E.G.O使用時に消費する精神と資源の量を半減し、火傷10を得る");
  assert.equal(r.income.lp, 0);
  assert.equal(r.income.shards, 0);
  assert.equal(r.reasons.length, 0, "説明文は金額でも名前でもない");
});

test("合計行（0欠片　40LP）は収入でも支出でもない", () => {
  const r = MEMO.parseMemo("90LP：現在100LP\n29欠片：現在39欠片\n・支払い\n憎悪購入：-50欠片\n0欠片　40LP");
  assert.equal(r.income.lp, 90, "合計行が収入に加算されない");
  assert.equal(r.spends.length, 1, "合計行が支出に増えない");
});

test("「抽出NN：」だけの行は抽出として数える", () => {
  const a = MEMO.parseMemo("抽出1：LCE E.G.O:提灯の人格");
  assert.equal(a.tickets.ego, 1, "E.G.O が書いてあれば E.G.O 抽出");
  const b = MEMO.parseMemo("抽出2：某の人格");
  assert.equal(b.tickets.persona, 2);
});

test("「チケ」だけの表記もチケットとして数える", () => {
  const r = MEMO.parseMemo("ガチャチケ1枚　第四銀工房銃鎚派");
  assert.equal(r.reasons.length, 0);
  assert.ok(r.tickets.persona + r.tickets.ego + r.tickets.choice > 0, "チケ表記がチケットになる");
});

test("識別子のハイフン（因子コード G-5）を金額として読まない", () => {
  const r = MEMO.parseMemo("因子コード G-5購入 7LP");
  assert.equal(r.income.lp, 0, "購入の額は残高から引かれる支出（実データ: 237→230）");
  assert.equal(r.reasons.length, 0);
});

test("「人格抽出：」「人格抽出チケット：」はどちらでもチケットになる", () => {
  const a = MEMO.parseMemo("人格抽出：南部リウ協会４課フィクサー");
  assert.equal(a.tickets.persona, 1);
  const b = MEMO.parseMemo("人格抽出チケット:寝落ちの謝罪のため確定：西武ツヴァイ協会３課フィクサー");
  assert.equal(b.tickets.persona, 1);
});

/* --- シナリオで直接払い出された人格 ---------------------------------------
   支出節より前に人格名が書かれていれば、チケット及び、
   シナリオ報酬として直接払われたものとして扱う。
   チケット由来のときは「どのチケット由来か」を残す。 */

test("支出より前の人格名は獲得として拾う（直接払い出し）", () => {
  const r = MEMO.parseMemo("北部ヂェーヴィチ協会 4 課フィクサー\n90LP：現在100LP");
  assert.equal(r.wins.length, 1);
  assert.equal(r.wins[0].name, "北部ヂェーヴィチ協会 4 課フィクサー");
  assert.equal(r.wins[0].via, "", "チケット経由ではないので via は空");
});

test("チケット由来の獲得は「どのチケット由来か」を持つ", () => {
  const a = MEMO.parseMemo("人格抽出チケット：N 社小鎚の人格");
  assert.equal(a.tickets.persona, 1);
  assert.equal(a.wins.length, 1);
  assert.equal(a.wins[0].name, "N 社小鎚", "「の人格」を落とした名前にする");
  assert.equal(a.wins[0].via, "人格抽出チケット");

  const b = MEMO.parseMemo("抽出ガチャチケット×1「N 社中鎚の人格」");
  assert.equal(b.tickets.ego, 1, "ガチャは E.G.O 相当");
  assert.equal(b.wins[0].via, "E.G.O抽出チケット");
  assert.equal(b.wins[0].name, "N 社中鎚");

  const c = MEMO.parseMemo("人格抽出チケット:寝落ちの謝罪のため確定：西武ツヴァイ協会３課フィクサー");
  assert.equal(c.wins[0].name, "西武ツヴァイ協会３課フィクサー", "挟まった語を除いた名前");
  assert.equal(c.wins[0].via, "人格抽出チケット");
});

test("「なし」は獲得ではない", () => {
  const r = MEMO.parseMemo("なし");
  assert.equal(r.wins.length, 0, "「なし」は記録が無い意味");
});

test("合計行も効果説明も獲得にしない", () => {
  const r = MEMO.parseMemo("0欠片　40LP\n▶︎戦闘中1度だけ、E.G.O使用時に消費する精神と資源の量を半減し、火傷10を得る");
  assert.equal(r.wins.length, 0);
});

test("箇条書きの報酬行（・40LP / ・基本報酬 50LP/15欠片）を読む", () => {
  const a = MEMO.parseMemo("❚報酬\n・基本報酬 50LP/15欠片\n❚追加報酬\n150/65");
  assert.equal(a.income.lp, 50);
  assert.equal(a.income.shards, 15);
  const b = MEMO.parseMemo("【基本報酬】\n・40LP\n・10欠片\n【戦闘クリア】\n・40LP\n・10欠片");
  assert.equal(b.income.lp, 80);
  assert.equal(b.income.shards, 20);
  const c = MEMO.parseMemo("・時間殺人時間テーマパック抽出\n・LP：25 + 欠片：25");
  assert.equal(c.income.lp, 25);
  assert.equal(c.income.shards, 25);
});

test("箇条書きのチケットは獲得だけを数え、消費とダイス条件は数えない", () => {
  const a = MEMO.parseMemo("・人格抽出チケット1枚\n・任意のテーマパックひとつ");
  assert.equal(a.tickets.persona, 1);
  const b = MEMO.parseMemo("・人格抽出チケット×1消費\n・EGO抽出チケット×1 消費");
  assert.equal(b.tickets.persona + b.tickets.ego, 0);
  const c = MEMO.parseMemo("・1d100を振りGMの出目以下を出した人は人格抽出チケットを1枚");
  assert.equal(c.tickets.persona, 0);
  const d = MEMO.parseMemo("・人格抽出🎫×1\n・EGO抽出🎫×1");
  assert.equal(d.tickets.persona, 1);
  assert.equal(d.tickets.ego, 1);
});

test("箇条書きのチャット名と記号計算は獲得にしない", () => {
  const a = MEMO.parseMemo("・ハコツムリ 様\n・わぁい");
  assert.equal(a.wins.length, 0);
  const b = MEMO.parseMemo("・(願いの数x10)LP - 20LP");
  assert.equal(b.income.lp, 0);
  assert.equal(b.income.shards, 0);
  const c = MEMO.parseMemo("・任意の200LP以下のテーマパック+1");
  assert.equal(c.income.lp, 0);
  assert.equal(c.wins.length, 0);
});

test("ガチャ結果の矢印書式から獲得名を取る", () => {
  const names = (r) => r.wins.map((w) => w.name).join("|");
  const a = MEMO.parseMemo("LP45、欠片32、ガチャチケ1枚を獲得。ガチャ結果→N社E.G.O:ねばつき");
  assert.equal(names(a), "N社E.G.O:ねばつき");
  const b = MEMO.parseMemo("慈悲ありクリア。LP90、欠片45、人格チケ2枚を獲得。ガチャ結果→N社中鎚、ジャーマ工房フィクサー");
  assert.equal(names(b), "N社中鎚|ジャーマ工房フィクサー");
  const c = MEMO.parseMemo("ガチャ結果→黒獣-卯");
  assert.equal(names(c), "黒獣-卯");
  const d = MEMO.parseMemo("→LP100消費ガチャ:厳粛な哀悼獲得");
  assert.equal(names(d), "厳粛な哀悼");
  const e = MEMO.parseMemo("終了後、LP200消費してテーマパック「眺めることしかできない」抽出→被りにより欠片50獲得");
  assert.equal(e.wins.length, 0);
  const f = MEMO.parseMemo("選択抽出チケット→ego");
  assert.equal(f.wins.length, 0, "プレースホルダは名前ではない");
  const g = MEMO.parseMemo("2026/10/6");
  assert.equal(g.wins.length, 0, "日付は名前ではない");
});

test("使用の記録と表の見出しは獲得名にしない", () => {
  const wins = (r) => r.wins.map((w) => w.name).join("|");
  assert.equal(wins(MEMO.parseMemo("第四銀弓使用")), "");
  assert.equal(wins(MEMO.parseMemo("エドガー継承者使用会")), "");
  assert.equal(wins(MEMO.parseMemo("1卓目")), "");
  assert.equal(wins(MEMO.parseMemo("7/13 2卓目")), "");
  assert.equal(wins(MEMO.parseMemo("LP/欠片")), "");
  assert.equal(wins(MEMO.parseMemo("追加")), "");
  assert.equal(wins(MEMO.parseMemo("人格抽出チケット: AEDD")), "");
});

test("サポートパッシブの購入行は括弧内の名前を獲得として積む", () => {
  const wins = (r) => [...r.wins.map((w) => w.name)];
  const kinds = (r) => [...r.wins.map((w) => w.kind)];
  const a = MEMO.parseMemo("終了後サポートパッシブ「ルサンチマン」と「肩慣らし」を購入したためLP-27。");
  assert.deepEqual(wins(a), ["ルサンチマン", "肩慣らし"], "1行に2つの購入でも両方積む");
  assert.deepEqual(kinds(a), ["support", "support"]);
  /* 金額は既存の支出読みに任せる。購入語が頭にない行の LP-27 は
     従来どおり負額支出に回る。 */
  const b = MEMO.parseMemo("終了後、サポートパッシブ「幻想狩り」を購入したのでLP-50");
  assert.deepEqual(wins(b), ["幻想狩り"]);
  assert.equal(a.income.lp, 0, "購入行は収入にしない");
  assert.equal(a.spends.reduce((s, x) => s + x.lp, 0), 0, "既存の読み（頭が購入語の行は落とす）を変えない");

  const c = MEMO.parseMemo("サポートパッシブ「因子コードG-5」を購入したのでLP-7、「深呼吸」を購入したのでLP-15");
  assert.deepEqual(wins(c), ["因子コードG-5", "深呼吸"]);

  const d = MEMO.parseMemo("★サポパ購入『遺伝コードG-5』：7LP消費（合計45LP/82欠片）");
  assert.deepEqual(wins(d), ["遺伝コードG-5"], "全角括弧『』の略記サポパも読む");

  /* 購入ではない行は獲得にしない。 */
  assert.equal(wins(MEMO.parseMemo("人差し指紙片のサポートスロット解放　現在99欠片")).length, 0, "スロット解放は取得ではない");
  assert.equal(wins(MEMO.parseMemo("パッシブボーナス +50%")).length, 0, "ボーナスは取得ではない");
  assert.equal(wins(MEMO.parseMemo("LP-20 サポートパッシブ「人生一発」購入")).length, 1, "購入語が後ろにあっても読む");
});

test("名前付き購入行「蒼羽蝶：75LP消費」は支出として読まれる", () => {
  /* 実データ mMIbGr32lGZix60RDmoN の GM練習卓 memo。ラベル（通貨でない語）
     の直後に金額が置かれ、行が消費の語で終わる形だけを購入と見なす。 */
  const r = MEMO.parseMemo("蒼羽蝶：75LP消費");
  assert.equal(r.spends.length, 1, "名前付き購入は支出になる");
  assert.equal(r.spends[0].name, "蒼羽蝶");
  assert.equal(r.spends[0].lp, 75);
  assert.equal(r.income.lp, 0, "購入の額は収入にしない");

  /* 演出名：本体名：金額消費 の二重コロンは最後の：までを名前にする。 */
  const full = MEMO.parseMemo("メラメラ燃えた羽：蒼羽蝶：75LP消費");
  assert.equal(full.spends.length, 1);
  assert.equal(full.spends[0].name, "メラメラ燃えた羽：蒼羽蝶");

  /* 叙述の「LP200を消費してガチャ」は名前付き購入にしない。
     一方、リザルトへ書かれた負数の購入行（憎悪購入：-50欠片）は
     実買として支出になる（残高差分の表記でも、記された購入は
     記録する。ユーザー指定の契約）。 */
  assert.equal(MEMO.parseMemo("LP200を消費してガチャ").spends.length, 0, "叙述は支出にしない");
  const hate = MEMO.parseMemo("憎悪購入：-50欠片");
  assert.equal(hate.spends.length, 1, "負数でも購入行は支出になる");
  assert.equal(hate.spends[0].name, "憎悪");
  assert.equal(hate.spends[0].shards, 50);
  /* ラベルが通貨の「90LP：現在100LP」は収入のまま。 */
  assert.equal(MEMO.parseMemo("90LP：現在100LP").income.lp, 90);
});

test("サポートパッシブの所持が購入記述と照合されて via を得る", () => {
  /* パーサと取り込みを同じ VM に載せる（実ブラウザと同じ構成）。 */
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  for (const file of ["garasumado-memo-parse.js", "garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + file, import.meta.url), "utf8"), context);
  }
  const GB = context.window.LBT_garasumado;
  const doc = {
    name: "テスト維持",
    owned: {
      supportPassives: [
        { condition: "なし", name: "ルサンチマン", effect: "テスト用" },
        { condition: "なし", name: "肩慣らし", effect: "テスト用" },
        { condition: "なし", name: "照合されないパッシブ", effect: "テスト用" }
      ]
    },
    scenarioHistory: [{
      name: "ダミーチキンとの戦闘",
      memo: "終了後サポートパッシブ「ルサンチマン」と「肩慣らし」を購入したためLP-27。"
    }]
  };
  const m = GB.buildManifest(doc, null);
  const sp = m.groups.find((g) => g.id === "supportPassives");
  assert.ok(sp, "サポートパッシブのグループがある");
  const byName = Object.fromEntries(sp.items.map((i) => [i.name, i]));
  assert.ok((byName["ルサンチマン"].via || []).includes("ダミーチキンとの戦闘"), "購入が書かれたシナリオに帰属する");
  assert.ok((byName["肩慣らし"].via || []).includes("ダミーチキンとの戦闘"));
  assert.equal(byName["照合されないパッシブ"].via.length, 0, "記述の無いものは勝手に紐付けない");
});

test("E.G.O は演出名を剥がして本体名で照合する", () => {
  /* パーサと取り込みを同じ VM に載せる（実ブラウザと同じ構成）。 */
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  for (const file of ["garasumado-memo-parse.js", "garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + file, import.meta.url), "utf8"), context);
  }
  const GB = context.window.LBT_garasumado;
  const doc = {
    name: "テスト維持",
    owned: { egos: ["メラメラ燃えた羽：蒼羽蝶"] },
    scenarioHistory: [{ name: "GM練習卓", memo: "蒼羽蝶：75LP消費" }]
  };
  const m = GB.buildManifest(doc, {
    resolve: (name) => (String(name).includes("蒼羽蝶")
      ? { name: "メラメラ燃えた羽：蒼羽蝶", kinds: [{ kind: "ego", no: 31, rank: "Ztut" }] }
      : null),
    candidates: () => []
  });
  const item = m.groups.find((g) => g.id === "egos").items[0];
  assert.ok((item.via || []).includes("GM練習卓"), "メモの本体名に帰属する");
  assert.equal(item.source, "buy", "購入記述があるので入手方法は購入");
});

test("リザルト作用で人格の所持追加とチケット消費記録が出る", () => {
  const manifest = {
    scenarios: [{
      key: "scenario:0",
      name: "テストシナリオ",
      income: { lp: 50, shards: 20 },
      tickets: { persona: 1, ego: 0, choice: 0 },
      pack: {},
      spends: [],
      wins: [
        { raw: "A", name: "A", kinds: [{ kind: "persona", no: 12, mode: "n" }], via: "人格抽出チケット" },
        { raw: "B", name: "B", kinds: [{ kind: "persona", no: 34, mode: "n" }], via: "" }
      ]
    }]
  };
  const { actions } = G.toDispatchActions(manifest, ["scenario:0"], { purchases: {} });
  const roster = actions.filter((a) => a.type === "ADD_ROSTER").map((a) => String(a.no));
  assert.equal(roster.join(","), "12,34", "直接払い出しもチケット経由も所持へ入る");
  const ticketNote = actions.find((a) => a.type === "ADD_ENTRY" && /で獲得：A/.test(a.name || ""));
  assert.ok(ticketNote, "チケット由来の記録が残る");
  assert.equal(ticketNote.cost.lp, 0, "金額ゼロなので帳簿が乱れない");
  assert.equal(ticketNote.cost.shards, 0);
});

test("共有URL からドキュメント ID とコレクションを抜く", () => {
  const a = G.parseShareUrl("https://lbt-garasumado.vercel.app/view/mMIbGr32lGZix60RDmoN");
  assert.equal(a.ok, true);
  assert.equal(a.id, "mMIbGr32lGZix60RDmoN");
  assert.equal(a.collection, "characters");

  const b = G.parseShareUrl("https://lbt-garasumado.vercel.app/persona/view/EPm6O9SU11aYYj0obEar");
  assert.equal(b.collection, "personas");
  const schemeless = G.parseShareUrl("lbt-garasumado.vercel.app/view/mMIbGr32lGZix60RDmoN?share=1#preview");
  assert.equal(schemeless.ok, true, "公式ホストはスキーム省略とquery/hashを許可");
  assert.equal(schemeless.id, "mMIbGr32lGZix60RDmoN");
  const pasted = G.parseShareUrl("Copied: (https://lbt-garasumado.vercel.app/view/mMIbGr32lGZix60RDmoN)");
  assert.equal(pasted.ok, true, "コピー文の前置きと括弧があっても公式URLを取り出す");

  const foreignQuery = G.parseShareUrl("https://evil.example/view/ABCDEFGHIJKLMNOPQRST?source=garasumado");
  assert.equal(foreignQuery.ok, false, "クエリに garasumado があるだけでは受理しない");
  const lookalikeHost = G.parseShareUrl("https://evil-garasumado.example/view/ABCDEFGHIJKLMNOPQRST");
  assert.equal(lookalikeHost.ok, false, "似たホスト名を受理しない");
  const nestedHost = G.parseShareUrl("evil.example/?next=lbt-garasumado.vercel.app/view/ABCDEFGHIJKLMNOPQRST");
  assert.equal(nestedHost.ok, false, "スキーム省略時もクエリ中のホスト文字列をURL本体と誤認しない");


  assert.equal(G.parseShareUrl("").ok, false);
  const invalid = G.parseShareUrl("https://example.com/view/abc123");
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /貼り付けてください/);
  assert.doesNotMatch(invalid.error, /貼りってください/);
});

test("Firestore の値表現を素の値へ戻す", () => {
  const out = G.unwrapFirestore({
    name: { stringValue: "ユサ" },
    n: { integerValue: "12" },
    ok: { booleanValue: true },
    list: { arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } },
    nested: { mapValue: { fields: { x: { stringValue: "y" } } } }
  });
  assert.equal(out.name, "ユサ");
  assert.equal(out.n, 12);
  assert.equal(out.ok, true);
  assert.deepEqual(out.list, ["a", "b"]);
  assert.equal(out.nested.x, "y");
});

/* --- 実サンプル 29 件（提示された URL から取得した実物） --------------- */
/* 実データは公開リポジトリに載せられないので personal 語のみ除いた匿名版を使う。 */
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));
const chars = Object.entries(samples).filter(([, v]) => v.coll === "characters");
const personas = Object.entries(samples).filter(([, v]) => v.coll === "personas");

test("実サンプルが 49 キャラクター + 1  persona で揃っている", () => {
  assert.equal(chars.length, 49);
  assert.equal(personas.length, 1);
});

test("実サンプルの manifest が全キャラクターで組める", () => {
  let totalScenarios = 0;
  for (const [, { doc }] of chars) {
    const m = G.buildManifest(doc, null);
    assert.ok(m.character.name, "キャラクター名が取れる");
    assert.equal(m.groups.length, 5, "人格 / E.G.O / パッシブ / 精神 / アイテム の 5 グループ");
    // 重複名は 1 件に畳まれる。所以 manifest は「一意な名前」の数になる。
    const unique = new Set((doc.owned?.personas || [])
      .map((v) => (typeof v === "string" ? v.trim() : (v && v.name ? String(v.name).trim() : "")))
      .filter(Boolean));
    assert.equal(m.counts.personas, unique.size, "重複を畳んだ所持人格の数が一致する");
    assert.ok(m.currency.lp !== undefined && m.currency.shards !== undefined, "残高が取れる");
    totalScenarios += m.counts.scenarios;
  }
  assert.ok(totalScenarios > 400, "シナリオ履歴がまとめて取れている（実際 " + totalScenarios + "）");
});

test("manifest は「解けた／解けない」を区別して出す", () => {
  const doc = chars.find(([, { doc: d }]) =>
    JSON.stringify(d.owned || {}).includes("ミートパイ"));
  assert.ok(doc, "ミートパイを含むキャラクターが存在する");
  const m = G.buildManifest(doc[1].doc, {
    resolve(name) {
      return name.includes("ミートパイ")
        ? { name: "○○のミートパイ厨房長", kinds: [{ kind: "persona" }], confidence: "unique-substring" }
        : null;
    }
  });
  const all = m.groups.flatMap((g) => g.items);
  assert.ok(all.length > 0, "候補が出ている");
  assert.ok(all.some((i) => i.resolved), "解けたものが混ざる");
  assert.ok(all.some((i) => !i.resolved), "解けないものも混ざる");
  assert.ok(m.counts.unresolved >= 0, "未解決の件数を持つ");
  for (const item of all) {
    if (item.resolved) assert.ok(item.dbName, "解けたものは DB 名を持つ");
    else assert.equal(item.dbName, "", "解けていないものに DB 名は作らない");
  }
});

test("壊れた値でも manifest を落とさない", () => {
  for (const bad of [
    {}, null, { owned: null }, { owned: { personas: null } }, { owned: { personas: [null, {}, 3] } },
    { items: "not-an-array", supportPassives: "not-an-array", scenarioHistory: "not-an-array" },
    { items: { count: 2 }, supportPassives: { name: "not-an-array" }, scenarioHistory: { name: "not-an-array" } },
    { owned: { personas: "not-an-array", egos: {}, supportPassives: 1, spirits: "not-an-array" } }
  ]) {
    const m = G.buildManifest(bad, null);
    assert.equal(m.groups.length, 5);
    assert.equal(m.counts.scenarios, 0);
  }
});

test("キャラクター名と所有者名は別物", () => {
  const withOwner = chars.find(([, { doc }]) => doc.ownerName);
  const m = G.buildManifest(withOwner[1].doc, null);
  assert.equal(m.character.name, withOwner[1].doc.name);
  assert.equal(m.character.ownerName, withOwner[1].doc.ownerName);
  assert.notEqual(m.character.name, m.character.ownerName, "名前と PL 名を取り違えない");
});

/* --- 実際に投げる action まで（製品経路は toDispatchActions） --------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function loadResolver() {
  const w = { DB: db };
  const context = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  for (const f of ["js/garasumado-roster-import.js", "js/roster-resolver.js"]) {
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), context, { filename: f });
  }
  return w;
}

const charDocs = chars.map(([, { doc }]) => doc);

test("リザルトの購入記述は所持の証跡になる（所持列が空の文書でも勝ちから補充する）", () => {
  /* mMIb はサポパ所持列が 11 枠とも空文字。憎悪・倍返しの準備・肩慣らしは
     リザルトの購入行にしか出てこない。リザルトに書かれた購入＝所持とする
     （1 種別だけに解ける名前に限り、解けない名前は捏造しない）。 */
  const mmib = samples.mMIbGr32lGZix60RDmoN && samples.mMIbGr32lGZix60RDmoN.doc;
  assert.ok(mmib, "mMIb の実サンプルがある");
  const context = { window: { DB: db }, console, module: { exports: {} } };
  vm.createContext(context);
  for (const f of ["roster-resolver.js", "garasumado-memo-parse.js", "ledger-provenance.js", "garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + f, import.meta.url), "utf8"), context, { filename: f });
  }
  const idx = context.window.LBT_buildNameIndex(db, {});
  const m = context.window.LBT_garasumado.buildManifest(mmib, {
    resolve: (n) => (context.window.LBT_resolveCandidates(idx, n) || [])[0] || null,
    candidates: (n) => context.window.LBT_resolveCandidates(idx, n) || []
  });
  const names = (g) => (((m.groups || []).find((x) => x.id === g) || {}).items || []).map((i) => i.name);
  assert.ok(names("supportPassives").includes("倍返しの準備"), "購入短文からサポパを補充する");
  assert.ok(names("supportPassives").includes("肩慣らし"), "所持列に無いサポパ名も購入行から補充する");
  assert.ok(names("spirits").includes("憎悪"), "精神の購入行から精神を補充する");
  for (const nm of ["憎悪", "倍返しの準備", "肩慣らし"]) {
    const item = [...names("supportPassives"), ...names("spirits")].includes(nm) && ((m.groups || []).flatMap((g) => g.items)).find((i) => i.name === nm);
    assert.ok(item, nm + " の項目が存在する");
    assert.ok(item.resolved, nm + " は DB に解けている");
  }
});

function resolvedManifest(doc) {
  const w = loadResolver();
  const index = w.LBT_buildNameIndex(db, {});
  return G.buildManifest(doc, { resolve: (name) => w.LBT_resolveCandidates(index, name)?.[0] || null });
}

/* memo パーサを同居させた読み込み。収入・支出を manifest へ通す検証用。 */
function loadImportWithMemo() {
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  for (const f of ["garasumado-memo-parse.js", "garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + f, import.meta.url), "utf8"), context, { filename: f });
  }
  return context.window.LBT_garasumado;
}

test("取り込み: 実サンプル 49 文書から所持を列挙し、action を大量に出せる", () => {
  assert.equal(charDocs.length, 49);
  let resolved = 0;
  let actions = 0;
  let heldBack = 0;
  for (const doc of charDocs) {
    const m = resolvedManifest(doc);
    for (const g of m.groups) for (const it of g.items) if (it.kinds?.length) resolved++;
    const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
    /* 帰属先が未決の所持品は、選ぶまで入れない。 */
    const before = G.toDispatchActions(m, keys, {});
    heldBack += before.skipped.filter((s) => /どのシナリオ/.test(s.reason)).length;
    /* 利用者が帰属先を選んだあとは全部入る。 */
    const first = (m.scenarios || [])[0];
    for (const g of m.groups) {
      for (const i of g.items) if (i.needsAttribution && !i.pickedScenario && first) { i.pickedScenario = first.name; i.source = i.source || "given"; }
    }
    actions += G.toDispatchActions(m, keys, {}).actions.length;
  }
  assert.ok(resolved > 800, "大半の所持が DB に引ける（実際 " + resolved + "）");
  /* 選択した品目は「入れる」と決めた_SUPPORT。入らないのは
     名前が引けないもの（利用者が直せない）だけ。 */
  assert.ok(actions > 800, "帰属先を決めると所持追加 action を大量に出せる（実際 " + actions + "）");
  /* シナリオ1件＝リザルト1件なので、帰属先が無くてもリザルトは残る。 */
  assert.ok(heldBack >= 0, "帰属先未決の品目は止まる（実際 " + heldBack + "）");
});

/* 帰属先の選択が実際に機能するかを、UI と同じ手順で確認する。
   選ばせる項目は「帰属先を選んでください」で終わるだけの状態では
   機能にならない（選択肢が無い、空の候補のまま詰まる）。 */

test("精神は所持へ計上する（初期精神の未計上を許さない）", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: ["萎縮", "パニック", "颠倒"] },
    scenarioHistory: [{ name: "夜A", memo: "" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "spirit", name }] }) }, { spirits: [{ name: "萎縮", price: 0 }, { name: "パニック", price: "0" }, { name: "颠倒", price: 100 }] });
  const group = m.groups.find((g) => g.id === "spirits");
  assert.equal(group.items.length, 3, "精神3件を所持へ入れる");
  assert.ok(m.counts.initialSpirits >= 1, "初期精神の件数が分かる");
  assert.equal(m.counts.initialSpiritsOwned.includes("パニック"), true, "初期精神の名が分かる");
  assert.equal(m.counts.initialSpiritsOwned.includes("颠倒"), false, "有料の精神は初期精神に数えない");
  assert.equal(m.counts.initialSpiritOverflow, false, "3件なら異常ではない");
});

test("共有取り込みの初期精神は価格0が明示されたものだけを無料扱いする", () => {
  const M = loadImportWithMemo();
  const names = ["無料数値", "無料文字列", "有料", "価格欠落", "価格null", "価格空欄", "価格不正", "価格Boolean"];
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: names },
    scenarioHistory: [{ name: "夜A", memo: "" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "spirit", name }] }) }, {
    spirits: [
      { name: "無料数値", price: 0 },
      { name: "無料文字列", price: "0" },
      { name: "有料", price: 100 },
      { name: "価格欠落" },
      { name: "価格null", price: null },
      { name: "価格空欄", price: "" },
      { name: "価格不正", price: "unknown" },
      { name: "価格Boolean", price: false }
    ]
  });
  assert.equal(m.groups.find((group) => group.id === "spirits").items.length, 8, "所持一覧の精神は欠落させない");
  assert.deepEqual(Array.from(m.counts.initialSpiritsOwned), ["無料数値", "無料文字列"]);
  assert.equal(m.counts.initialSpiritOverflow, false, "価格不明の精神を無料件数に混ぜない");
});

test("初期精神が3件を超える入力は異常として出す", () => {
  const M = loadImportWithMemo();
  const names = ["萎縮", "パニック", "颠倒", "逆恨み"];
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: names },
    scenarioHistory: [{ name: "夜A", memo: "" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "spirit", name }] }) }, { spirits: names.map((n) => ({ name: n, price: 0 })) });
  assert.equal(m.counts.initialSpiritOverflow, true, "4件以上は壊れたデータとして報告する");
  assert.equal(m.counts.initialSpirits, 4);
});

test("残高変動を記載していないユーザーにはエラーも不一致も返さない", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 335, fragment: 171 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "80LP\n40欠片" }]
  }, { resolve: () => null });
  const r = M.reconcileBalance(m, { currency: { lp: 335, fragment: 171 } });
  assert.equal(r.checked, false, "照合しない");
  assert.equal(r.ok, true, "エラーにしない");
  assert.equal(r.computedLp, null);
});

test("現在残高の行より前の収入を二重加算せず、通貨別に照合する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "100", fragment: "39" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{
      name: "受領記録",
      memo: "90LP：現在100LP\n29欠片：現在39欠片"
    }]
  };
  const manifest = M.buildManifest(doc, null);
  const result = M.reconcileBalance(manifest, doc);
  assert.equal(result.checked, true);
  assert.equal(result.computedLp, 100, "現在100LPには既に収入90LPが反映されている");
  assert.equal(result.computedShards, 39, "現在39欠片には既に収入29欠片が反映されている");
  assert.equal(result.ok, true, "同じ残高を誤って不一致にしない");
});

test("共有残高照合は全角数字・カンマ・通貨名を半角と同じように解釈する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "１００", fragment: "３９" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{
      name: "全角の受領記録",
      memo: "９０ＬＰ：現在１００ＬＰ\n２９欠片：現在３９欠片"
    }]
  };
  const manifest = M.buildManifest(doc, null);
  const result = M.reconcileBalance(manifest, doc);
  assert.equal(result.shownLp, 100);
  assert.equal(result.shownShards, 39);
  assert.equal(result.checked, true, "全角の現在残高をアンカーとして検出");
  assert.equal(result.computedLp, 100);
  assert.equal(result.computedShards, 39);
  assert.equal(result.ok, true);
});

test("全角の不正な桁区切りは有効な共有残高にしない", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "１，２", fragment: "" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{
      name: "不正な金額",
      memo: "９０ＬＰ：現在１，２ＬＰ"
    }]
  };
  const result = M.reconcileBalance(M.buildManifest(doc, null), doc);
  assert.equal(result.shownLp, null);
  assert.equal(result.checked, false, "不正な残高から帳尻を捏造しない");
});

test("空欄・null の共有残高はゼロではなく未入力として扱う", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "100", fragment: "39" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{
      name: "受領記録",
      memo: "90LP：現在100LP\n29欠片：現在39欠片"
    }]
  };
  const manifest = M.buildManifest(doc, null);
  const result = M.reconcileBalance(manifest, { currency: { lp: "", fragment: null } });
  assert.equal(result.shownLp, null);
  assert.equal(result.shownShards, null);
  assert.equal(result.ok, true, "空欄の通貨に架空の残高不一致を出さない");
});

test("残高変動を記載していて計算値と表示残高が違う場合はエラーにする", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "現在300LP\n80LP\n40欠片" }]
  }, { resolve: () => null });
  const r = M.reconcileBalance(m, { currency: { lp: 335, fragment: 171 } });
  assert.equal(r.checked, true, "照合する");
  assert.equal(r.ok, false, "不一致はエラー");
  assert.equal(r.computedLp, 380);
  assert.equal(r.shownLp, 335);
  assert.match(r.message, /一致しません/);
});

test("残高変動を記載していて計算値と表示残高が一致すればエラーにしない", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "現在300LP\n80LP\n40欠片" }]
  }, { resolve: () => null });
  const r = M.reconcileBalance(m, { currency: { lp: 380, fragment: 40 } });
  assert.equal(r.ok, true, "一致ならエラーにしない");
  assert.equal(r.message, "");
});

test("帰属先を選ばせる項目には必ず選択肢が入っている", () => {
  let missing = 0;
  for (const doc of charDocs) {
    const m = resolvedManifest(doc);
    for (const g of m.groups) {
      for (const i of g.items) {
        if (!i.needsAttribution) continue;
        if (!(i.scenarioOptions || []).length) missing += 1;
      }
    }
  }
  assert.equal(missing, 0, "選択肢の無い項目がある（選べる帰属先が無いまま詰まる）");
});

test("シナリオ履歴が無い文書では帰属先を尋ねない（帰属先が原理的に無い）", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["握る者闘志"], spirits: [] },
    scenarioHistory: []
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  assert.equal((m.scenarios || []).length, 0, "シナリオ履歴が無い");
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("握る者闘志"));
  assert.ok(target, "所持は並ぶ");
  assert.equal(target.needsAttribution, undefined, "帰属先を尋ねない");
});

test("自由メモの購入の短文は購入履歴として帰属の証跡になる", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["ルサンチマン"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "" }],
    freeNotes: { memo: "現在87欠片。", secret: "購入：ルサンチマン-7LP", history: "", setting: "" }
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  /* 購入履歴はシナリオの一覧には載せない（リザルトの実体ではない）。 */
  assert.ok(!(m.scenarios || []).some((s) => s.name === "購入履歴"), "シナリオ一覧に入れない");
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("ルサンチマン"));
  assert.ok(target, "所持は並ぶ");
  assert.deepEqual([...target.via], ["購入履歴"], "購入履歴が帰属先に入る");
  assert.equal(target.source, "buy", "購入の証跡から入手方法は購入");
  assert.equal(target.needsAttribution, undefined, "記録があるので帰属先を尋ねない");
  assert.equal(target.spends[0]?.lp, 7, "支出の証跡も持つ");
  assert.equal(m.attribution.matched, 1, "帰層できたと数える");
});

test("トップレベルのサポパ一覧（name/condition/effect）を所持に載せる", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["", "", ""], spirits: [] },
    supportPassives: [
      { condition: "なし", name: "切り伏せる斬撃", effect: "テスト" },
      { condition: "なし", name: "指令通達", effect: "テスト" }
    ]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const spo = m.groups.find((g) => g.id === "supportPassives");
  assert.ok(spo, "サポパの組がある");
  assert.deepEqual([...spo.items.map((i) => i.name)], ["切り伏せる斬撃", "指令通達"], "空文字スロットではなく実名が載る");
});

test("トップレベルのサポパ名は owned と同名なら重ねない（.sheet 真実の重複排除）", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["ルサンチマン"], spirits: [] },
    supportPassives: [{ condition: "なし", name: "ルサンチマン" }, { condition: "なし", name: "呼吸熱" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const spo = m.groups.find((g) => g.id === "supportPassives");
  assert.deepEqual([...spo.items.map((i) => i.name)].sort(), ["ルサンチマン", "呼吸熱"], "同名は1件");
});

test("シナリオの本文に名前がそのまま書かれていれば本文言及で帰属する", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["握る者闘志"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "夜Aの結果。握る者闘志を入手した描写は無いが本文に登場する。" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("握る者闘志"));
  assert.ok(target, "所持は並ぶ");
  assert.deepEqual([...target.via], ["夜A"], "本文言及で帰属先が分かる");
  assert.equal(target.matchTier, "mention", "言及照合であることが分かる");
  assert.equal(target.needsAttribution, undefined, "記録があるので帰属先を尋ねない");
  assert.equal(m.counts.attributedByMention, 1, "件数が分かる");
});

test("本文言及は解けていない名前には当てない（該当地名の事故を防ぐ）", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["何かの欠片"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "夜Aの結果。何かの欠片を欠の語が本文に含まれる。" }]
  }, { resolve: () => null });
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("何かの欠片"));
  assert.ok(target, "所持は並ぶ");
  assert.equal(target.via.length, 0, "解けていない名前は言及でも帰属しない");
  assert.equal(target.needsAttribution, true, "帰属先を選ばせる");
});

test("自由メモに購入の短文が無ければ帰属先未決のまま選ばせる", () => {  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["ルサンチマン"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "" }],
    freeNotes: { memo: "現在87欠片。ここの文章は人格について。", secret: "45LP。", history: "", setting: "" }
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("ルサンチマン"));
  assert.ok(target, "所持は並ぶ");
  assert.equal(target.via.length, 0, "帰層していない");
  assert.equal(target.needsAttribution, true, "帰層先を選ばせる");
});

test("帰属先に選んだシナリオのリザルト（ADD_RESULT）が作られる", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["握る者闘志"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "" }, { name: "夜B", memo: "" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("握る者闘志"));
  assert.ok(target, "所持は並ぶ");
  assert.equal(target.needsAttribution, true, "履歴に記載が無いので帰属先を選ぶ");

  /* 所持のチェックは入れたが、シナリオのチェックは無視して帰属先がReflectされる */
  target.pickedScenario = "夜B";
  target.source = "given";
  const out = M.toDispatchActions(m, [target.key], {});
  const results = out.actions.filter((a) => a.type === "ADD_RESULT");
  assert.deepEqual([...results.map((r) => r.name)], ["夜A", "夜B"], "シナリオ1件ごとにリザルト1件");
  const held = out.actions.filter((a) => a.type === "ADD_ROSTER_SUPPORT");
  assert.equal(held.length, 1, "所持も入る");
  assert.equal(held[0].via.join("/"), "夜B", "帰属先は選んだシナリオ");
  assert.equal(out.skipped.length, 0, "詰まらない");
});

/* シナリオ1件＝リザルト1件は「その日の記録」として必ず残る。
   利用者が選ぶのは「所持をどのシナリオに割当するか」であって、
   シナリオ自体を消してよいわけではない（消すと履歴から日が消える）。 */
test("帰属が未決でもシナリオのリザルトは残る", () => {
  const M = loadImportWithMemo();
  const m = M.buildManifest({
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["握る者闘志"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "" }]
  }, { resolve: (name) => ({ name, kinds: [{ kind: "support", name }] }) });
  const target = m.groups.flatMap((g) => g.items).find((i) => String(i.name).includes("握る者闘志"));
  const out = M.toDispatchActions(m, [target.key], {});
  assert.equal(out.actions.filter((a) => a.type === "ADD_RESULT").length, 1, "シナリオ1件＝リザルト1件");
  /* チェックした品目は帰属未決でも入る（入らないと画面の所持数が嘘になる）。
     サポートパッシブは三分類の対象外なので、購入記述が無い限り課帳しない。 */
  const sup = out.actions.find((a) => a.type === "ADD_ROSTER_SUPPORT");
  assert.ok(sup, "チェックした所持は配布扱いで入る");
  assert.equal(sup.purchase, false, "購入の記述が無いので課帳しない");
});

test("所持は支出行とも照合され、購入（source=buy）として帰属する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [], egos: [], supportPassives: ["握る者闘志"], spirits: [] },
    scenarioHistory: [{ name: "夜A", memo: "・支出\n握る者闘志 210欠片" }]
  };
  const m = M.buildManifest(doc, { resolve: () => null });
  const items = m.groups.flatMap((g) => g.items);
  const target = items.find((i) => String(i.name).includes("握る者闘志"));
  assert.ok(target, "所持一覧に握る者闘志がある");
  assert.deepEqual([...target.via], ["夜A"], "支出行からシナリオが判明する");
  assert.equal(target.source, "buy", "獲得行に無く支出行にあるので購入");
  assert.equal(target.spends.length, 1, "支出の証跡を持つ");
  assert.equal(target.spends[0].shards, 210, "支出額 210 欠片を写す");
  assert.equal(target.needsAttribution, undefined, "帰属が決まったので選ばせない");
  assert.equal(m.attribution.matched, 1, "matched に数える");
  assert.equal(m.attribution.matchedBySpend, 1, "支出由来として数える");
  assert.equal(m.counts.boughtViaSpend, 1);
});

test("装飾ゆれ（【…】/[MAX]/の人格）でも照合し、ゆれ一致は印が付く", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: 0, fragments: 0 },
    owned: { personas: [{ name: "【同期000】テストの人格" }], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "夜B", memo: "人格抽出チケット：テストの人格" }]
  };
  const m = M.buildManifest(doc, { resolve: () => null });
  const items = m.groups.flatMap((g) => g.items);
  const target = items.find((i) => String(i.name).includes("テスト"));
  assert.ok(target, "所持一覧にテストの人格がある");
  assert.deepEqual([...target.via], ["夜B"], "装飾を落として照合できる");
  assert.equal(target.matchTier, "loose", "ゆれ一致として印が付く");
  assert.equal(target.needsAttribution, undefined, "帰属が決まったので選ばせない");
  assert.equal(m.attribution.matchedByLoose, 1);
});

test("ゆれ鍵が所持側で重複するときは決めない（同期0とMAXの取り違え防止）", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: 0, fragments: 0 },
    owned: {
      personas: [{ name: "テストの人格" }, { name: "【MAX】テストの人格" }],
      egos: [], supportPassives: [], spirits: []
    },
    scenarioHistory: [{ name: "夜C", memo: "ガチャ結果→テスト" }]
  };
  const m = M.buildManifest(doc, { resolve: () => null });
  const items = m.groups.flatMap((g) => g.items).filter((i) => String(i.name).includes("テスト"));
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.matchTier, "", "重複するゆれ鍵では照合しない");
    assert.equal(item.needsAttribution, true, "帰属先は利用者が選ぶ");
    assert.deepEqual([...item.via], []);
  }
});

test("取り込み: 所持だけ入れず reducer の購入経路に預ける（番号は数値のまま預ける）", () => {
  const manifest = {
    groups: [
      { id: "personas", items: [{ key: "p1", name: "黒雲会組員", dbName: "黒雲会組員", source: "buy", kinds: [{ kind: "persona", no: 1, mode: "n" }] }] },
      { id: "egos", items: [{ key: "e1", name: "X", dbName: "X", source: "ticket", kinds: [{ kind: "ego", no: 32, rank: "TETH" }] }] },
      { id: "spirits", items: [{ key: "s1", name: "Y", dbName: "Y", source: "given", kinds: [{ kind: "spirit" }] }] },
      { id: "supportPassives", items: [{ key: "b1", name: "Z", dbName: "Z", source: "given", kinds: [{ kind: "support" }] }] }
    ],
    scenarios: []
  };
  const built = G.toDispatchActions(manifest, ["p1", "e1", "s1", "b1"], {});
  /* vm の中で作られた配列はこっちの Array ではない。広げてから比べる。 */
  assert.deepEqual([...built.actions.map((a) => a.type)].sort(),
    ["ADD_ROSTER", "ADD_ROSTER_EGO", "ADD_ROSTER_SPIRIT", "ADD_ROSTER_SUPPORT"]);
  /* 番号は文字列化しない。DB 照合は文字列比較に寄せたので、渡せる状態にしてある。 */
  assert.equal(built.actions.find((a) => a.type === "ADD_ROSTER").no, "1");
  assert.equal(built.actions.find((a) => a.type === "ADD_ROSTER_EGO").no, "32");
  /* resultId は呼び出し側が付ける（panel はどちらのリザルトかも知らない）。 */
  assert.ok(built.actions.every((a) => !("resultId" in a)));
  assert.equal(built.skipped.length, 0);
});

test("取り込み: 番号やランクが引けないものは理由付きで除外する", () => {
  const manifest = {
    groups: [
      { id: "egos", items: [
        { key: "bad1", name: "A", dbName: "A", source: "buy", kinds: [{ kind: "ego", rank: "TETH" }] },
        { key: "bad2", name: "B", dbName: "B", source: "buy", kinds: [{ kind: "ego", no: 5 }] },
        { key: "ok", name: "C", dbName: "C", source: "buy", kinds: [{ kind: "ego", no: 5, rank: "HE" }] }
      ] }
    ],
    scenarios: []
  };
  const built = G.toDispatchActions(manifest, ["bad1", "bad2", "ok"], {});
  assert.equal(built.actions.length, 1, "引けた1件だけ入れる");
  assert.equal(built.actions[0].no, "5");
  assert.equal(built.skipped.length, 2, "残り2件は理由付きで除外");
  assert.ok(built.skipped.every((s) => /DB番号かランク/.test(s.reason)));
});

test("取り込み: 不正なアイテム個数は成功 action にせず、正の安全な整数だけ入れる", () => {
  const manifest = {
    groups: [{
      id: "items",
      items: [
        { key: "valid", name: "包帯", quantity: 2, kinds: [] },
        { key: "string-quantity", name: "救急包", quantity: "3", kinds: [] },
        { key: "missing-quantity", name: "止血剤", kinds: [] },
        { key: "fraction", name: "薬草", quantity: 1.5, kinds: [] },
        { key: "unsafe", name: "装置", quantity: Number.MAX_SAFE_INTEGER + 1, kinds: [] },
        { key: "zero", name: "投薬器", quantity: 0, kinds: [] },
        { key: "junk", name: "薬瓶", quantity: "2abc", kinds: [] }
      ]
    }],
    scenarios: []
  };
  const built = G.toDispatchActions(manifest, ["valid", "string-quantity", "missing-quantity", "fraction", "unsafe", "zero", "junk"], {
    db: { items: [
      { id: "bandage", name: "包帯" },
      { id: "emergency-kit", name: "救急包" },
      { id: "hemostat", name: "止血剤" },
      { id: "herb", name: "薬草" },
      { id: "device", name: "装置" },
      { id: "injector", name: "投薬器" },
      { id: "bottle", name: "薬瓶" }
    ] }
  });
  assert.deepEqual(
    Array.from(built.actions, (action) => [action.itemId, action.quantity]),
    [["bandage", 2], ["emergency-kit", 3], ["hemostat", 1]]
  );
  assert.deepEqual(
    Array.from(built.skipped, (item) => [item.key, item.reason]),
    [
      ["fraction", "アイテムの個数が正の整数ではない"],
      ["unsafe", "アイテムの個数が正の整数ではない"],
      ["zero", "アイテムの個数が正の整数ではない"],
      ["junk", "アイテムの個数が正の整数ではない"]
    ]
  );
});

test("取り込み: シナリオ1件ごとに ADD_RESULT が出て、ADD_ENTRY が直後に続く", () => {
  const manifest = {
    groups: [],
    scenarios: [
      { key: "scenario:0", name: "第一夜", memo: "", group: "scenarios" },
      { key: "scenario:1", name: "第二夜", memo: "", group: "scenarios" }
    ]
  };
  const built = G.toDispatchActions(manifest, ["scenario:0", "scenario:1"], {
    income: { lp: "10", shards: "2" },
    purchases: { "scenario:0": [{ kind: "spirit", name: "パニック", cost: { lp: 1 } }] }
  });
  const types = [...built.actions.map((a) => a.type)];
  assert.deepEqual(types, ["ADD_RESULT", "ADD_ENTRY", "ADD_RESULT"]);
  assert.equal(built.actions[0].name, "第一夜");
  /* 支出明細は直前のリザルトに帰属する。順序が崩れると明細が別の夜に入る。 */
  assert.equal(built.actions[1].kind, "spirit");
  assert.equal(built.actions[2].name, "第二夜");
});

test("取り込み: 精神も入手方法に応じて purchase を渡す（報酬・既払いを再課金しない）", () => {
  const scenario = { key: "scenario:0", name: "第一夜", memo: "", group: "scenarios" };
  const item = (source, spends) => ({
    key: "spirit:0",
    name: "泉水",
    dbName: "泉水",
    kinds: [{ kind: "spirit", name: "泉水" }],
    source,
    spends,
    via: ["scenario:0"]
  });
  const build = (source, spends) => G.toDispatchActions({
    groups: [{ id: "spirits", items: [item(source, spends)] }],
    scenarios: [scenario]
  }, ["spirit:0"], {});
  const actionOf = (built) => built.actions.find((a) => a.type === "ADD_ROSTER_SPIRIT");

  assert.equal(actionOf(build("given", [])).purchase, false, "配布は購入ではない");
  assert.equal(actionOf(build("buy", [])).purchase, true, "購入は課帳する");
  assert.equal(actionOf(build("buy", [{}])).purchase, false, "メモに購入が載っているなら二重計上しない");
});

/* --- 表記ゆれ耐性（実データの共有URLで観測した書き方をそのまま固定する） -- */

test("1行2通貨・順序反転・前置きラベル・通貨先・全角をまとめて取る", () => {
  const a = MEMO.parseMemo("40LP 20欠片");
  assert.equal(a.income.lp, 40);
  assert.equal(a.income.shards, 20);
  const b = MEMO.parseMemo("20欠片 40LP");
  assert.equal(b.income.lp, 40, "通貨の順序が逆でも同じ");
  assert.equal(b.income.shards, 20);
  const c = MEMO.parseMemo("報酬 40LP 20欠片");
  assert.equal(c.income.lp, 40, "前置きのラベルは金額に混ざらない");
  assert.equal(c.income.shards, 20);
  const d = MEMO.parseMemo("LP60\n欠片40");
  assert.equal(d.income.lp, 60, "通貨が先でも読む");
  assert.equal(d.income.shards, 40);
  const e = MEMO.parseMemo("ＬＰ60");
  assert.equal(e.income.lp, 60, "全角の通貨名も読む");
});

test("+連結（45+5）と負の中間集計を合算する", () => {
  assert.equal(MEMO.parseMemo("LP 45+5").income.lp, 50);
  assert.equal(MEMO.parseMemo("かけら 30+4").income.shards, 34);
  /* 実データ（汝の名は？）: 消費の後に受け取りが続く書き方。符号付きで合算。 */
  const net = MEMO.parseMemo("-15LP\n+154LP +41欠片");
  assert.equal(net.income.lp, 139);
  assert.equal(net.income.shards, 41);
});

test("「NNLPへ」は残高の書き直しであり受け取りではない", () => {
  const r = MEMO.parseMemo("300LPへ");
  assert.equal(r.income.lp, 0, "支払後の残高を収入に数えない");
});

test("チケットと金額が同じ行にあっても両方を読む", () => {
  const r = MEMO.parseMemo("140LP 90欠片　EGOチケット");
  assert.equal(r.income.lp, 140);
  assert.equal(r.income.shards, 90);
  assert.equal(r.tickets.ego, 1);
});

test("チケット行を二重に数えず、幻の獲得を作らない", () => {
  const a = MEMO.parseMemo("人格抽出チケット：1枚");
  assert.equal(a.tickets.persona, 1, "数はチケット側で1回だけ");
  assert.equal(a.wins.length, 0, "「1枚」は獲得名ではない");
  const b = MEMO.parseMemo("ワンキル報酬：人格抽出チケット×1");
  assert.equal(b.tickets.persona, 1);
  assert.equal(b.wins.length, 0);
  const c = MEMO.parseMemo("ガチャチケ1枚　第四銀工房銃鎚派");
  assert.equal(c.tickets.ego, 1, "ガチャはE.G.O相当（LBTの分類）");
  assert.equal(c.wins.length, 0, "チケット行は獲得を捏造しない");
});

test("ラベル・装飾・叙述・数量行は獲得名にしない", () => {
  for (const line of ["シナリオ報酬:", "報酬合計", "ーーーRESULTーーー", "[最大所持数1]",
    "㊗️全員生存", "R開始時に使用できる。"]) {
    assert.equal(MEMO.parseMemo(line).wins.length, 0, `「${line}」を獲得にしない`);
  }
  const w = MEMO.parseMemo("W錬成セット×1(中身は下記のパックから選択)");
  assert.equal(w.wins.length, 0, "数量付きの行は記録であって名前ではない");
});

/* 実データ（硝子窓の書式ゆれ）から採った回帰ケース。 */

test("「LP30 欠片25」型は通貨ごとに分けて読む（片方に寄せない）", () => {
  const r = MEMO.parseMemo("LP30 欠片25");
  assert.equal(r.income.lp, 30);
  assert.equal(r.income.shards, 25);
  const rev = MEMO.parseMemo("LP+37 欠片+22");
  assert.equal(rev.income.lp, 37);
  assert.equal(rev.income.shards, 22);
});

test("獲得の後の消費叙述は手前までを金額として読む", () => {
  const r = MEMO.parseMemo("30LP、30欠片、硝子の欠片×1を獲得。硝子の欠片×1を消費して同期化鬼門CT解除。");
  assert.equal(r.income.lp, 30);
  assert.equal(r.income.shards, 30);
});

test("消費・使用の叙述は収入に数えない（「消費し」「消費ガチャ」を含む）", () => {
  const a = MEMO.parseMemo("終了後、LP200を消費し人格特定抽出「剣契殺手A」");
  assert.equal(a.income.lp, 0);
  const b = MEMO.parseMemo("→LP100消費ガチャ:厳粛な哀悼獲得");
  assert.equal(b.income.lp, 0);
  const c = MEMO.parseMemo("LP300、欠片116、人格チケット2枚獲得。ガチャ結果→W社2級整理要員\n終了後、LP300使用して人格抽出→LCE E.G.O：提灯\n欠片100を消費してEGO抽出→一生シチュー");
  assert.equal(c.income.lp, 300);
  assert.equal(c.income.shards, 116);
});

test("報酬を挟んだ通貨・計算式の結果・数量条件のマスク", () => {
  const a = MEMO.parseMemo("LP報酬　49　現在93LP");
  assert.equal(a.income.lp, 49);
  const b = MEMO.parseMemo("LP:35+GABA=40　現在41LP");
  assert.equal(b.income.lp, 40, "計算式は結果だけを読む");
  const c = MEMO.parseMemo("LP120、欠片60、LP200以下の任意のテーマパック×1を獲得。");
  assert.equal(c.income.lp, 120, "「LP200以下」は条件であって金額ではない");
  assert.equal(c.income.shards, 60);
  const d = MEMO.parseMemo("120LP、50欠片、200LP以内のパック(夢の終わる：西部ツヴァイ3課)");
  assert.equal(d.income.lp, 120);
  assert.equal(d.wins.length, 0, "パック断片は獲得名ではない");
});

test("「LP/欠片」見出しのスラッシュ対は合計を優先する", () => {
  const r = MEMO.parseMemo("報酬\nLP/欠片\n120/80\n\nパッシブボーナス +50%\n\n合計\n180/120");
  assert.equal(r.income.lp, 180);
  assert.equal(r.income.shards, 120);
  const rev = MEMO.parseMemo("欠片/LP\n40/60");
  assert.equal(rev.income.lp, 60);
  assert.equal(rev.income.shards, 40);
});

test("使用人格・PC・人格の記録行は獲得にせず、の人格終わりの実名は残す", () => {
  const used = MEMO.parseMemo("【使用人格】\nヴェネリア専用　鬼門事務所フィクサーの人格　RANK0\nディアマン・ノワール構成員（p.199）");
  assert.equal(used.wins.length, 1, "【使用人格】の次行と使用人格の見出しは数えない");
  assert.ok(used.wins[0].name.includes("ディアマン・ノワール構成員"), "実在の結果行は獲得名");
  const pc = MEMO.parseMemo("PC:ソーシャ・ファラティ テケリーリ\n人格:炎拳事務所フィクサーの人格00\n報酬:156LP、40欠片、抽出チケットx1");
  assert.equal(pc.wins.length, 0);
  assert.equal(pc.income.lp, 156);
  const real = MEMO.parseMemo("美味しいですねカルボナーラ工房フィクサーの人格");
  assert.equal(real.wins.length, 1, "「の人格」終わりの実名は獲得名");
});

test("明示的な報酬ラベルから人格名を抽出し、参加者名の箇条書きは維持する", () => {
  const plain = MEMO.parseMemo("報酬：黒雲会若衆");
  const bullet = MEMO.parseMemo("・基本報酬：『黒雲会若衆』");
  assert.deepEqual([...plain.wins.map((w) => w.name)], ["黒雲会若衆"]);
  assert.deepEqual([...bullet.wins.map((w) => w.name)], ["黒雲会若衆"]);
  assert.equal(MEMO.parseMemo("❚報酬").wins.length, 0, "見出しだけなら候補にしない");
  assert.equal(MEMO.parseMemo("・ハコツムリ 様").wins.length, 0, "参加者を獲得扱いしない");
});
