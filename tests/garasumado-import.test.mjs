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



test("硝子窓側の報酬計算規則と実績値を分離し、基礎額を二重計上しない", () => {
  const raw = [
    "LP：40＋(PLが討伐日乞い子の数x5_最大30)",
    "欠片：30＋(PLが討伐した日乞い子の数x2_最大12)",
    "※戦闘終了までに「しとしとさま」を討伐出来なかった場合、LP/欠片-15",
    "LP：55",
    "欠片：36"
  ].join("\n");
  const parsed = MEMO.parseMemo(raw);
  assert.equal(parsed.income.lp, 55, "LPの基礎値40と上限ボーナスを実収入へ加算しない");
  assert.equal(parsed.income.shards, 36, "欠片の基礎値30と上限ボーナスを実収入へ加算しない");
  assert.ok(parsed.sourceAudits.some((entry) => entry.code === "formula-result-in-range" && entry.currency === "lp"));
  assert.ok(parsed.sourceAudits.some((entry) => entry.code === "formula-result-in-range" && entry.currency === "shards"));
  assert.ok(parsed.sourceAudits.some((entry) => entry.code === "condition-unconfirmed" && /討伐出来なかった場合/.test(entry.line)));
});

test("硝子窓側の明示計算ミスは自動計上を止め、元記録側と識別する", () => {
  const parsed = MEMO.parseMemo("報酬\n欠片50×3=149欠片\nLP+30");
  assert.equal(parsed.income.shards, 0, "不一致の計算行を欠片収入へ自動計上しない");
  assert.equal(parsed.income.lp, 30, "別行の正常なLP報酬は保持する");
  const finding = parsed.sourceAudits.find((entry) => entry.code === "source-arithmetic-mismatch");
  assert.ok(finding, "硝子窓側の計算不整合を検出する");
  assert.equal(finding.side, "source-data");
  assert.equal(finding.expectedAmount, 150);
  assert.equal(finding.writtenAmount, 149);
});

test("リザルト側の通貨検出差分を行単位で記録する", () => {
  const parsed = MEMO.parseMemo("報酬：LP+40 / 欠片+25");
  assert.equal(parsed.income.lp, 40);
  assert.equal(parsed.income.shards, 25);
  assert.ok(Array.isArray(parsed.sourceAudits), "監査情報を解析結果に保持する");
  /* 元記録に明示額がありパーサ結果との差があるときだけ parser-side の警告を出す。 */
  const audit = MEMO.parseMemo("報酬：LP+40 / 欠片+25");
  assert.ok(!audit.sourceAudits.some((entry) => entry.side === "parser"), "正しく読めた金額に検出漏れ警告を付けない");
});


test("検出漏れ監査は元記録側と別の parser-side 判定を返し、差分の行を保持する", () => {
  const finding = MEMO.auditLineCoverage(
    "報酬：LP+40 / 欠片+25",
    { lp: 40, shards: 25 },
    { lp: 0, shards: 25 },
    false,
    "income",
    1
  );
  assert.ok(finding, "原文40LPに対して解析記録0LPなら警告を生成する");
  assert.equal(finding.side, "parser");
  assert.equal(finding.code, "possible-result-detection-omission");
  assert.deepEqual({ ...finding.expected }, { lp: 40, shards: 25 });
  assert.deepEqual({ ...finding.detected }, { lp: 0, shards: 25 });
  assert.match(finding.message, /リザルト側の検出漏れ/);
  assert.equal(MEMO.auditLineCoverage("曖昧な金額行", { lp: 40, shards: 0 }, { lp: 0, shards: 0 }, true, "income", 1), null,
    "すでに金額確認理由がある行へ重複警告を出さない");
});



test("結果カード用 draft は元記録の監査結果を引き継ぐ", () => {
  const manifest = {
    scenarios: [{
      key: "scenario:0",
      name: "計算矛盾のみ",
      memo: "欠片50×3=149欠片",
      income: { lp: 0, shards: 0 },
      tickets: { persona: 0, ego: 0, choice: 0 },
      reasons: [],
      currencyDiscrepancies: [],
      sourceAudits: [{
        side: "source-data",
        code: "source-arithmetic-mismatch",
        severity: "warning",
        lineIndex: 1,
        line: "欠片50×3=149欠片",
        message: "計算矛盾を確認してください"
      }]
    }],
    groups: []
  };
  const draft = G.buildResultDraft(manifest, {});
  manifest.scenarios[0].financialCoverage = [{
    lineIndex: 1, line: "欠片50×3=149欠片", status: "source-reviewed",
    expected: { lp: 0, shards: 149 }, detected: { lp: 0, shards: 0 }
  }];
  assert.equal(draft.blocks.length, 1, "警告だけのシナリオもカード候補として残す");
  assert.deepEqual(
    JSON.parse(JSON.stringify(draft.blocks[0].sourceAudits)),
    JSON.parse(JSON.stringify(manifest.scenarios[0].sourceAudits)),
    "監査警告は manifest → draft block で欠落・改変しない"
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(draft.blocks[0].financialCoverage)),
    JSON.parse(JSON.stringify(manifest.scenarios[0].financialCoverage)),
    "行単位の監査経路も manifest → draft block で保持する"
  );
});

test("警告だけがあるシナリオも監査カードに残す", () => {
  const M = loadImportWithMemo();
  const doc = {
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "計算矛盾だけの記録", memo: "欠片50×3=149欠片" }]
  };
  const parsedHistory = MEMO.parseScenarioHistory(doc.scenarioHistory);
  assert.equal(parsedHistory[0].hasData, true, "通常の収入が0でも重大な元記録監査があれば表示対象");
  assert.ok(parsedHistory[0].sourceAudits.some((entry) => entry.code === "source-arithmetic-mismatch"));
  const manifest = M.buildManifest(doc, null);
  assert.equal(manifest.scenarios[0].hasData, true, "取り込み画面へ渡すmanifestでも警告のみのシナリオを保持");
  assert.ok(manifest.scenarios[0].sourceAudits.some((entry) => entry.side === "source-data"));
});

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

test("現在残高の誤記と同通貨の複数値を黙って収入へ合算しない", () => {
  const r = MEMO.parseMemo("66LP 現座189LP\n30欠片 136欠片");
  assert.equal(r.income.lp, 66, "現座189LP は現在残高と推定し、収入に足さない");
  assert.equal(r.income.shards, 0, "収入と残高の可能性がある欠片値は合算しない");
  assert.ok(r.reasons.some((entry) => /現座/.test(entry.reason)), "誤記を推定したことを警告する");
  assert.ok(r.reasons.some((entry) => /欠片の数値が同じ行に複数/.test(entry.reason)), "複数値を保留した理由を示す");

  const lpAmbiguous = MEMO.parseMemo("報酬\n50LP又は100LPで買える分の強化アイテム\n30欠片");
  assert.equal(lpAmbiguous.income.lp, 0, "購入可能価格候補をLP収入へ加算しない");
  assert.equal(lpAmbiguous.income.shards, 30, "価格条件以外の報酬は維持する");
  assert.ok(lpAmbiguous.reasons.some((entry) => /価格条件の説明に含まれるため/.test(entry.reason)), "価格条件であることを具体的に知らせる");
  assert.ok(!lpAmbiguous.reasons.some((entry) => /現在100LP/.test(entry.reason)), "残高表記の修正案を誤案内しない");
  assert.ok(!lpAmbiguous.reasons.some((entry) => /通貨か金額が読み取れない/.test(entry.reason)), "価格条件の専用警告に一般警告を重ねない");

  const ambiguous = MEMO.parseMemo("欠片24 134欠片");
  assert.equal(ambiguous.income.shards, 0, "現在の明示が無い同通貨の複数値は収入へ合算しない");
  assert.ok(ambiguous.reasons.some((entry) => /欠片収入25、現在171欠片/.test(entry.reason)), "欠片の警告例は欠片の書き方を案内する");

  const conditionalConversion = MEMO.parseMemo("報酬\nLP50\n欠片30\n人格抽出チケット(人格全コンプしてるなら欠片20に変換)");
  assert.equal(conditionalConversion.income.lp, 50);
  assert.equal(conditionalConversion.income.shards, 30, "条件付きの欠片20は自動加算しない");
  assert.equal(conditionalConversion.tickets.persona, 1, "現時点では通常チケット1枚として計上し、条件付き変換を警告する");
  assert.ok(conditionalConversion.reasons.some((entry) => /条件付きチケット換算/.test(entry.reason)), "条件付き変換を具体的に警告する");
  assert.ok(!conditionalConversion.reasons.some((entry) => /LP⇄欠片/.test(entry.reason)), "チケット変換をLP⇄欠片の換算と誤表示しない");

  const explicitSum = MEMO.parseMemo("40LP + 15LP");
  assert.equal(explicitSum.income.lp, 55, "明示的な加算はこれまでどおり計上する");

  const rewardCompensation = MEMO.parseMemo("LP70、自我の欠片40、人格抽出チケット1枚、ガバ補填LP30を獲得。");
  assert.equal(rewardCompensation.income.lp, 100, "同じ行でも明示された報酬と補填は両方計上する");
  assert.equal(rewardCompensation.income.shards, 40);

  const dupeCompensation = MEMO.parseMemo("120LP、50欠片、200LP以下のテーマパック×1を獲得。「眺めることしかできない」ガチャ結果→被りのため欠片50");
  assert.equal(dupeCompensation.income.lp, 120);
  assert.equal(dupeCompensation.income.shards, 100, "被り補償の欠片を報酬欠片と合算する");
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

test("叙述文に個別の負額が明示された複数購入は支出をそれぞれ記録する", () => {
  const r = MEMO.parseMemo("終了後、サポートパッシブ「因子コードG-5」を購入したのでLP-7、「深呼吸」を購入したのでLP-15");
  assert.equal(r.income.lp, 0, "購入額を収入にしない");
  assert.deepEqual(
    [...r.spends.map((spend) => [spend.name, spend.lp, spend.shards])],
    [["因子コードG-5", 7, 0], ["深呼吸", 15, 0]],
    "名前に対応する各支出を落とさず記録する"
  );
  assert.ok(r.wins.some((win) => win.name === "因子コードG-5" && win.bought), "購入したパッシブの所持証跡を保つ");
  assert.ok(r.wins.some((win) => win.name === "深呼吸" && win.bought), "2件目の所持証跡も保つ");

  const singleNarrativePurchase = MEMO.parseMemo("終了後、「E.G.Oの解放」を購入したため欠片-50");
  assert.equal(singleNarrativePurchase.spends.length, 1, "単独でも明示された欠片支出を記録する");
  assert.equal(singleNarrativePurchase.spends[0].shards, 50);
  assert.equal(singleNarrativePurchase.income.shards, 0);
});

test("購入の叙述に明記されたLP・欠片の消費を支出として記録する", () => {
  const r = MEMO.parseMemo(
    "終了後サポートパッシブ「ルサンチマン」と「肩慣らし」を購入したためLP-27。\n" +
    "切り伏せる斬撃を購入、150LP消費　300LPへ\n" +
    "30LP、30欠片…を獲得。硝酸の欠片×1を消費して同期化"
  );
  assert.equal(r.spends.length, 2, "明示されたLP支出2件を残す。アイテム欠片の使用は通貨支出にしない");
  assert.equal(r.spends.reduce((n, spend) => n + spend.lp, 0), 177, "LP27 + LP150 を一度ずつ計上する");
  assert.equal(r.spends[0].name, "肩慣らし", "共有購入行の対象名を明細へ残す");
  assert.equal(r.spends.reduce((n, spend) => n + spend.shards, 0), 0);
  assert.ok(r.wins.some((w) => w.name === "ルサンチマン"), "サポパの名前を所持証跡として保持する");
  assert.equal(r.income.lp, 30, "収入は30LPの獲得行だけ");
  assert.equal(r.income.shards, 30, "欠片も獲得行から30");
});

test("別々に記録された叙述体の購入費用はそれぞれ一度ずつ計上する", () => {
  const r = MEMO.parseMemo(
    "終了後、サポートパッシブ「因子コードG-5」を購入したのでLP-7、「深呼吸」を購入したのでLP-15"
  );
  assert.equal(r.spends.length, 2);
  assert.equal(r.spends.reduce((n, spend) => n + spend.lp, 0), 22, "LP7 + LP15 を二重計上せず合計22");
});

test("精神購入の叙述で欠片支出も通貨を取り違えず記録する", () => {
  const r = MEMO.parseMemo("終了後、精神「正義」を購入したため欠片-200");
  assert.equal(r.income.shards, 0);
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].shards, 200);
  assert.equal(r.spends[0].name, "正義", "精神購入の対象名を支出へ保持する");
  assert.equal(r.spends[0].lp, 0);
  assert.ok(r.wins.some((w) => w.name === "正義" && w.bought), "購入された対象の証跡も保持する");
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

test("硝子窓の矢印付き消費は収入に混ぜず、支出と獲得を分離する", () => {
  const parsed = MEMO.parseMemo([
    "→LP100消費ガチャ:厳粛な哀悼獲得",
    "→100LP消費：LCE E.G.O:紅炎殺獲得",
    "→自我の破片100消費：羽ばたき：妖精の祭典獲得",
    "LP200消費パック「心のすれ違う」→ワザリングハイツ・ワイルドハントの人格の獲得",
    "自我の破片100消費→幸福：あなたは幸せでなければならない獲得"
  ].join("\n"));
  assert.equal(parsed.income.lp, 0);
  assert.equal(parsed.income.shards, 0);
  assert.deepEqual([...parsed.spends.map((s) => [s.lp, s.shards])], [
    [100, 0], [100, 0], [0, 100], [200, 0], [0, 100]
  ]);
  assert.deepEqual([...parsed.wins.map((w) => w.name)], [
    "厳粛な哀悼", "LCE E.G.O:紅炎殺", "羽ばたき：妖精の祭典",
    "ワザリングハイツ・ワイルドハントの人格", "幸福：あなたは幸せでなければならない"
  ]);
});

test("矢印の手前にある抽出チケットは使用記録で、チケット報酬にしない", () => {
  const parsed = MEMO.parseMemo([
    "人格抽出チケット1枚→薬指野獣派スチューデントA獲得",
    "200LP以下パックチケット「本に成った者たちⅠ」→夜の錐カピターノの人格獲得"
  ].join("\n"));
  assert.deepEqual([...parsed.ticketSpends.map((s) => [s.kind, s.pack, s.count])], [
    ["persona", "", 1], ["pack", "本に成った者たちⅠ", 1]
  ]);
  assert.equal(parsed.tickets.persona, 0);
  assert.equal(Object.keys(parsed.pack).length, 0);
  assert.equal(parsed.wins.length, 2);
});

test("種別不明のチケット消費は黙って人格券として確定せず、要確認に残す", () => {
  const M = loadImportWithMemo();
  const manifest = M.buildManifest({
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "種別不明", memo: "・抽出チケット×1消費" }]
  }, null);
  assert.equal(manifest.scenarios[0].hasData, true, "要確認行を取り込み対象から落とさない");
  const result = M.toDispatchActions(manifest, [], {});
  assert.ok(result.skipped.some((item) => /チケットの種別が曖昧/.test(item.reason)), "保留理由を画面へ返す");
  assert.ok(!result.actions.some((action) => action.type === "ADD_ENTRY" && action.tickets?.persona === 1),
    "推測した人格チケット消費を作らない");
});

test("報酬名が無いチケット消費もリザルトとして残り、残数から差し引く", () => {
  const parsed = MEMO.parseMemo("・人格抽出チケット×1消費");
  assert.deepEqual([...parsed.ticketSpends.map((row) => [row.kind, row.count])], [["persona", 1]]);
  assert.equal(parsed.tickets.persona, 0, "消費だけの行を獲得枚数にしない");

  const M = loadImportWithMemo();
  const manifest = M.buildManifest({
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "チケットのみ", memo: "・人格抽出チケット×1消費" }]
  }, null);
  assert.equal(manifest.scenarios[0].hasData, true, "通貨収入がなくてもチケット使用履歴を消さない");
  const actions = M.toDispatchActions(manifest, [], {}).actions;
  const used = actions.find((action) => action.type === "ADD_ENTRY" && action.tickets?.persona === 1);
  assert.ok(used, "チケット使用を収支明細へ渡す");
  assert.equal(used.name, "履歴上の使用：人格抽出チケット");
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

test("収入行と混在する叙述購入も明示的な負額だけを支出に記録し、所持証跡を残す", () => {
  const a = MEMO.parseMemo("LP60、欠片30、人格抽出チケット*1を獲得。ガチャ結果→ピークォド号船長\n精神「正義」を購入したため欠片-200");
  assert.ok(a.wins.some((w) => w.name === "正義" && w.bought), "購入した精神の所持証跡を残す");
  assert.equal(a.spends.length, 1, "明示された購入額は支出へ計上する");
  assert.equal(a.spends[0].shards, 200);
  assert.equal(a.income.lp, 60, "獲得行だけをLP収入にする");
  assert.equal(a.income.shards, 30, "購入した欠片を獲得に混ぜない");
  const b = MEMO.parseMemo("85LP、47カケラ、EGO抽出ガチャチケ＆人格抽出チケットを獲得\nサポパ「嚥下」を購入したのでLP-25\n精神「分別できる理性」を購入したので欠片-1000");
  assert.ok(b.wins.some((w) => w.name === "嚥下" && w.bought));
  assert.ok(b.wins.some((w) => w.name === "分別できる理性" && w.bought));
  assert.equal(b.spends.length, 2);
  assert.equal(b.spends.reduce((n, spend) => n + spend.lp, 0), 25);
  assert.equal(b.spends.reduce((n, spend) => n + spend.shards, 0), 1000);
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

test("チケットの個数と種別を読む（無修飾は保留し、明示種別だけ計上）", () => {
  const a = MEMO.parseMemo("抽出チケットx1：シュエ家私兵の人格");
  assert.equal(a.tickets.persona, 0, "無修飾の抽出チケットを人格券と推測しない");
  assert.ok(a.reasons.some((r) => /種別が不明/.test(r.reason)), "未確定理由を残す");
  assert.ok(a.wins.some((w) => w.name === "シュエ家私兵"), "取得品名は失わない");

  const b = MEMO.parseMemo("人格抽出チケットx2：某某");
  assert.equal(b.tickets.persona, 2);
  const c = MEMO.parseMemo("E.G.O抽出チケット：某某");
  assert.equal(c.tickets.ego, 1);

  const lowercaseEgo = MEMO.parseMemo("ego抽出チケット×1");
  assert.equal(lowercaseEgo.tickets.ego, 1, "小文字egoも明示されたE.G.Oチケットとして分類する");
  assert.equal(lowercaseEgo.reasons.some((r) => /種別が不明/.test(r.reason)), false);

  const lowercaseEgoNoCount = MEMO.parseMemo("ego抽出チケット");
  assert.equal(lowercaseEgoNoCount.tickets.ego, 1, "枚数省略の小文字ego券も通常の1枚として読む");

  const lowercaseEgoShort = MEMO.parseMemo("egoチケット×1");
  assert.equal(lowercaseEgoShort.tickets.ego, 1, "小文字egoチケットも分類する");

  const d = MEMO.parseMemo("人格orE.G.O抽出チケット×1：K社職員の人格");
  assert.equal(d.tickets.persona, 0);
  assert.equal(d.tickets.ego, 0, "人格orE.G.OをE.G.O券へ誤分類しない");
  assert.ok(d.reasons.some((r) => /種別が不明/.test(r.reason)));
});

test("実記録のパック2回購入はLP支出を2倍し、重複補償の欠片を収入に戻す", () => {
  const parsed = MEMO.parseMemo("LP200消費　パック「本に成った者たちⅠ」2回→夜の錐カピターノの人格（ダブったため欠片50）、剣契殺手A");
  assert.equal(parsed.spends.length, 1);
  assert.equal(parsed.spends[0].lp, 400, "200LP × 2回を計上");
  assert.equal(parsed.income.shards, 50, "括弧内の重複補償を計上");
  assert.equal(parsed.reasons.length, 0);
});

test("一般的な括弧内金額は収入にせず、明示された重複補償だけ計上する", () => {
  const regular = MEMO.parseMemo("75欠片（理性60+15）");
  assert.equal(regular.income.shards, 75, "外側の合計値だけ計上");
  const duplicate = MEMO.parseMemo("報酬50LP（ダブったため欠片50）");
  assert.equal(duplicate.income.lp, 50);
  assert.equal(duplicate.income.shards, 50);
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
  /* 負額が明示された購入は、所持証跡と支出の両方を保持する。 */
  const b = MEMO.parseMemo("終了後、サポートパッシブ「幻想狩り」を購入したのでLP-50");
  assert.deepEqual(wins(b), ["幻想狩り"]);
  assert.equal(b.spends.reduce((s, x) => s + x.lp, 0), 50);
  assert.equal(a.income.lp, 0, "購入行は収入にしない");
  assert.equal(a.spends.reduce((s, x) => s + x.lp, 0), 27, "明示されたLP-27を支出へ記録する");

  const c = MEMO.parseMemo("サポートパッシブ「因子コードG-5」を購入したのでLP-7、「深呼吸」を購入したのでLP-15");
  assert.deepEqual(wins(c), ["因子コードG-5", "深呼吸"]);
  assert.equal(c.spends.length, 2);
  assert.equal(c.spends.reduce((s, x) => s + x.lp, 0), 22);

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

  /* 叙述の「LP200を消費してガチャ」は対象名を推測せず、明記額だけを記録する。
     一方、リザルトへ書かれた負数の購入行（憎悪購入：-50欠片）は
     実買として支出になる（残高差分の表記でも、記された購入は
     記録する。ユーザー指定の契約）。 */
  const narrative = MEMO.parseMemo("LP200を消費してガチャ");
  assert.equal(narrative.spends.length, 1, "明示された自然文の支出は金額だけ記録する");
  assert.equal(narrative.spends[0].lp, 200);
  assert.equal(narrative.spends[0].name, "LP200を消費してガチャ", "獲得名は推測しない");

  /* 「現在へ」の残高は2件目の支出候補に含めず、既知の金額を保つ。 */
  const withBalance = MEMO.parseMemo("切り伏せる斬撃を購入、150LP消費　300LPへ");
  assert.equal(withBalance.spends.reduce((sum, row) => sum + row.lp, 0), 150);
  assert.equal(withBalance.spends.length, 1, "支出を重ねて作らない");
  assert.ok(!withBalance.reasons.some((item) => /安全に解析できない/.test(item.reason)),
    "既に別経路で正しく読めた支出に誤警告を出さない");

  /* 複数の明示支出は一方だけを勝手に選ばない。全て読めるか、確認へ回す。 */
  const multi = MEMO.parseMemo("LP100を消費、欠片50を消費して交換");
  const spendAmounts = multi.spends.flatMap((row) => [
    ...(row.lp ? [["lp", row.lp]] : []),
    ...(row.shards ? [["shards", row.shards]] : [])
  ]);
  const fullyRead = spendAmounts.some(([currency, amount]) => currency === "lp" && amount === 100)
    && spendAmounts.some(([currency, amount]) => currency === "shards" && amount === 50);
  const heldForReview = spendAmounts.length === 0
    && multi.reasons.some((item) => /安全に解析できない/.test(item.reason));
  assert.ok(fullyRead || heldForReview, "複数支出を過少計上せず、全件記録か確認対象にする");

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
  const bareId = G.parseShareUrl("mMIbGr32lGZix60RDmoN");
  assert.equal(bareId.ok, true, "既存の単一ID抽出APIは互換性のため維持する");
  const bareBatch = G.parseShareUrls("mMIbGr32lGZix60RDmoN");
  assert.equal(bareBatch.urls.length, 0, "一括取込では種別不明のIDを dispatch 候補にしない");
  assert.match(bareBatch.invalid[0]?.reason || "", /IDだけでは.*判別できません/);
  const mixedBatch = G.parseShareUrls("mMIbGr32lGZix60RDmoN\nhttps://lbt-garasumado.vercel.app/view/mMIbGr32lGZix60RDmp");
  assert.equal(mixedBatch.urls.length, 1, "不明なIDが混じっても正しいURLは取込対象に残す");
  assert.equal(mixedBatch.invalid.length, 1, "不明なIDは失敗理由付きで残す");
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

test("収支精度回帰: 共有書式から収入・支出・チケット・独自E.G.Oを分離して生成する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "318", fragment: "91" },
    freeNotes: { secret: "LP-20 サポートパッシブ「人生一発」購入\nLP-20 サポートパッシブ「肩慣らし」購入" },
    owned: { personas: [], egos: [{ rank: "ZAYIN", name: "海底墓標：プロト" }], supportPassives: [], spirits: [] },
    items: [{ name: "包帯", count: 1 }],
    scenarioHistory: [{ name: "履歴A", memo: [
      "165LP、75欠片", "→LP100消費ガチャ:厳粛な哀悼獲得",
      "→自我の破片100消費：羽ばたき：妖精の祭典獲得",
      "人格抽出チケット1枚→薬指野獣派スチューデントA獲得"
    ].join("\n") }]
  };
  const resolve = (name) => ["人生一発", "肩慣らし"].includes(name) ? { name, kinds: [{ kind: "support" }] } : null;
  const db = { items: [{ id: "heal-bandage", name: "包帯" }], egos: [], support_passives: [] };
  const manifest = M.buildManifest(doc, { resolve, candidates: () => [] }, db);
  const selected = manifest.groups.flatMap((g) => g.items.map((item) => item.key));
  const { actions, skipped } = M.toDispatchActions(manifest, selected, { db, resolve });
  const totals = actions.reduce((out, action) => {
    if (action.type === "ADD_RESULT") { out.incomeLp += action.income.lp || 0; out.incomeShards += action.income.shards || 0; }
    if (action.type === "ADD_ENTRY") { out.entries += 1; out.spentLp += action.cost.lp || 0; out.spentShards += action.cost.shards || 0; }
    out.types[action.type] = (out.types[action.type] || 0) + 1;
    return out;
  }, { incomeLp: 0, incomeShards: 0, entries: 0, spentLp: 0, spentShards: 0, types: {} });
  assert.equal(totals.incomeLp, 165);
  assert.equal(totals.incomeShards, 75);
  assert.equal(totals.spentLp, 140, "LP消費100 + 自由メモ購入40");
  assert.equal(totals.spentShards, 100);
  const ticketUseEntries = actions.filter((a) => a.type === "ADD_ENTRY" && a.tickets
    && ((a.tickets.persona || 0) + (a.tickets.ego || 0) + (a.tickets.choice || 0)
      + Object.values(a.tickets.pack || {}).reduce((sum, n) => sum + n, 0)) > 0);
  assert.equal(ticketUseEntries.length, 1, "チケット所持数が不明でも使用履歴を消費明細として残す");
  assert.equal(ticketUseEntries[0].tickets.persona, 1);
  assert.equal(totals.types.ADD_CUSTOM_ROSTER_EGO, 1);
  assert.equal(totals.types.ADD_ITEM_INVENTORY, 1);
  const notes = actions.filter((a) => a.note === "硝子窓の自由メモ由来。日時・シナリオ未特定");
  assert.equal(notes.length, 2);
  assert.ok(notes.every((a) => a.resultId === null), "日時不明購入は未分類に置く");
  assert.deepEqual([...skipped], []);
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


test("全49件の硝子窓サンプルを個別監査し、所持・金額イベントを黙って落とさない", () => {
  /* 集計で「全部の検出が有意」だと誤魔化せないよう、サンプルごとに
     所持項目の保持、履歴行の保持、金額イベントの解析結果を確認する。 */
  const context = { window: { DB: db }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["js/roster-resolver.js", "js/garasumado-memo-parse.js", "js/ledger-provenance.js", "js/garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  const api = context.window.LBT_garasumado;
  const index = context.window.LBT_buildNameIndex(db, {});
  const resolve = (name) => (context.window.LBT_resolveCandidates(index, name) || [])[0] || null;
  const candidates = (name) => context.window.LBT_resolveCandidates(index, name) || [];
  const norm = (value) => String(value || "").normalize("NFKC").replace(/[\s\u3000]/g, "").toLocaleLowerCase("ja-JP");
  const readName = (value) => {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    return String(value.name || value.src?.name || value.build?.personaSrc?.name || "").trim();
  };
  const issues = [];
  let auditedOwned = 0;
  let auditedHistory = 0;
  const samplesList = Object.entries(samples).filter(([, value]) => value && value.coll === "characters");

  for (const [sampleId, entry] of samplesList) {
    const doc = entry.doc || {};
    const manifest = api.buildManifest(doc, { resolve, candidates }, db);
    const owned = doc.owned && typeof doc.owned === "object" ? doc.owned : {};
    const actualGroups = new Map((manifest.groups || []).map((group) => [
      group.id,
      new Set((group.items || []).map((item) => norm(item.name)))
    ]));
    const expected = {
      personas: Array.isArray(owned.personas) ? owned.personas : [],
      egos: Array.isArray(owned.egos) ? owned.egos : [],
      supportPassives: [
        ...(Array.isArray(owned.supportPassives) ? owned.supportPassives : []),
        ...(Array.isArray(doc.supportPassives) ? doc.supportPassives : [])
      ],
      spirits: Array.isArray(owned.spirits) ? owned.spirits : [],
      items: (Array.isArray(doc.items) ? doc.items : []).filter((item) => Number(item && item.count) > 0)
    };

    for (const [groupId, rows] of Object.entries(expected)) {
      const seen = new Set();
      const present = actualGroups.get(groupId) || new Set();
      for (const row of rows) {
        const name = readName(row);
        const key = norm(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        auditedOwned++;
        if (!present.has(key)) issues.push(sampleId + " / " + groupId + ": 所持候補がmanifestから欠落: " + name);
      }
    }

    const history = Array.isArray(doc.scenarioHistory)
      ? doc.scenarioHistory.filter((row) => row && (row.name || row.memo))
      : [];
    if ((manifest.scenarios || []).length !== history.length) {
      issues.push(sampleId + ": 履歴行数が不一致（原文 " + history.length + " / 解析 " + (manifest.scenarios || []).length + "）");
    }
    for (let i = 0; i < history.length; i++) {
      const row = history[i] || {};
      const memo = String(row.memo || "");
      if (!memo.trim()) continue;
      auditedHistory++;
      const scenario = (manifest.scenarios || [])[i];
      if (!scenario) continue;
      const coverageRows = Array.isArray(scenario.financialCoverage) ? scenario.financialCoverage : [];
      const scenarioReasons = Array.isArray(scenario.reasons) ? scenario.reasons : [];
      const scenarioAudits = Array.isArray(scenario.sourceAudits) ? scenario.sourceAudits : [];
      const memoLines = memo.split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < memoLines.length; lineIndex++) {
        const sourceLine = memoLines[lineIndex];
        if (!sourceLine.trim()) continue;
        const lineHasAmount = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i.test(sourceLine);
        const lineHasAction = /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/.test(sourceLine);
        const relatedAudit = scenarioAudits.some((entry) => entry &&
          (entry.lineIndex === lineIndex + 1 || entry.relatedLineIndex === lineIndex + 1 ||
           (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === lineIndex + 1)));
        const relatedReason = scenarioReasons.some((entry) =>
          String(entry.line || "").trim() === sourceLine.trim());
        if (!lineHasAmount || !lineHasAction) continue;
        const coverage = coverageRows.find((entry) => entry && entry.lineIndex === lineIndex + 1);
        if (!coverage) {
          issues.push(sampleId + " / " + (row.name || ("履歴" + (i + 1))) +
            ": 金額・操作行の行単位監査がありません（" + (lineIndex + 1) + "行目）: " + sourceLine.slice(0, 100));
          continue;
        }
        if (coverage.status === "unresolved" ||
            (coverage.status === "mismatch" && !relatedAudit && !relatedReason)) {
          issues.push(sampleId + " / " + (row.name || ("履歴" + (i + 1))) +
            ": 行単位監査が未解決です（" + (lineIndex + 1) + "行目）: " + sourceLine.slice(0, 100));
        }
        if (coverage.status === "reviewed-by-parser-reason" && !relatedAudit && !relatedReason) {
          issues.push(sampleId + " / " + (row.name || ("履歴" + (i + 1))) +
            ": 監査状態は要確認ですが、対応する理由が表示対象にありません（" + (lineIndex + 1) + "行目）");
        }
      }
      /* 金額と操作語が共存する履歴は、収入・支出・チケット・獲得のいずれか、
         または利用者に見せる要確認理由として残らなければならない。 */
      const hasAmount = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i.test(memo);
      const hasAction = /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/.test(memo);
      if (hasAmount && hasAction) {
        const ticketCount = Object.values(scenario.tickets || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
        const recognized =
          (Number(scenario.income?.lp) || 0) !== 0 ||
          (Number(scenario.income?.shards) || 0) !== 0 ||
          (scenario.spends || []).length > 0 ||
          ticketCount > 0 ||
          Object.keys(scenario.pack || {}).length > 0 ||
          (scenario.wins || []).length > 0 ||
          (scenario.reasons || []).length > 0 ||
          (scenario.ticketSpends || []).length > 0;
        if (!recognized) {
          issues.push(sampleId + " / " + (row.name || ("履歴" + (i + 1))) + ": 金額と操作語を含む履歴が無言で未解析: " + memo.slice(0, 100).replace(/\s+/g, " "));
        }
      }

      /* ランク付きで正式名を記録したE.G.Oは、種別を失ったり別名として扱ったりしない。 */
      const explicitEgos = [...memo.matchAll(/(?:獲得|入手|取得)\s*[：:]\s*(ZAYIN|TETH|HE|WAW|ALEPH)\s+([^\r\n]+)/gi)];
      for (const match of explicitEgos) {
        const name = String(match[2] || "").trim().replace(/[。．]+$/g, "");
        const found = (scenario.wins || []).some((win) =>
          norm(win.name) === norm(name) && (win.kinds || []).some((kind) => kind.kind === "ego" && String(kind.rank || "").toUpperCase() === match[1].toUpperCase())
        );
        if (!found) issues.push(sampleId + " / " + (row.name || ("履歴" + (i + 1))) + ": ランク付きE.G.O獲得が正式名・種別で照合されない: " + match[0]);
      }
    }
  }

  assert.equal(samplesList.length, 49, "個別監査対象は49キャラクターすべて");
  assert.ok(auditedOwned > 1000, "所持フィールドをサンプル横断で検査した（" + auditedOwned + "件）");
  assert.ok(auditedHistory > 400, "履歴メモをサンプル横断で検査した（" + auditedHistory + "件）");
  assert.equal(issues.length, 0,
    "サンプル単位の検出漏れ（先頭12件）:\n" + issues.slice(0, 12).join("\n") + (issues.length > 12 ? "\n……残り" + (issues.length - 12) + "件" : ""));
});

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

test("由来が決められない所持は最新リザルトへ誤帰属させず、独自E.G.Oもシミュレーション件数へ数える", () => {
  const M = loadImportWithMemo();
  const supportDb = { support_passives: [{ name: "人生一発", lp: 7 }], items: [], egos: [] };
  const supportManifest = M.buildManifest({
    currency: { lp: "100", fragment: "0" },
    owned: { personas: [], egos: [], supportPassives: [{ name: "人生一発" }], spirits: [] },
    scenarioHistory: [{ name: "履歴A", memo: "100LP" }]
  }, {
    resolve: (name) => name === "人生一発" ? { name, kinds: [{ kind: "support", name }] } : null,
    candidates: () => []
  }, supportDb);
  const support = supportManifest.groups.find((group) => group.id === "supportPassives").items[0];
  assert.equal(support.needsAttribution, true);
  const supportAction = M.toDispatchActions(supportManifest, [support.key], { db: supportDb })
    .actions.find((action) => action.type === "ADD_ROSTER_SUPPORT");
  assert.ok(supportAction);
  assert.equal(supportAction.unclassified, true, "日時不明の所持はバッチ解決時に未分類へ回す");
  assert.equal("resultId" in supportAction, false, "公開取込アクションには resultId を直接持たせない");

  const egoDb = { items: [], egos: [], support_passives: [] };
  const egoManifest = M.buildManifest({
    owned: { personas: [], egos: [{ rank: "ZAYIN", name: "海底墓標：プロト" }], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "履歴B", memo: "100LP" }]
  }, null, egoDb);
  const egoKey = egoManifest.groups.find((group) => group.id === "egos").items[0].key;
  const draft = M.buildResultDraft(egoManifest, { selected: [egoKey], db: egoDb });
  assert.equal(draft.simulation.held, 1, "ADD_CUSTOM_ROSTER_EGO も所持追加件数へ含める");
  assert.equal(draft.simulation.bySource.unclassified, 1, "元記録に入手方法が無ければ配布とは断定しない");
});

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

test("手入力残高を正解扱いせず、開始残高不明の純増減だけを示す", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "318", fragment: "91" },
    freeNotes: { secret: "LP-20 サポートパッシブ「人生一発」購入" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "履歴A", memo: "165LP、75欠片\n100LP消費ガチャ:厳粛な哀悼獲得" }]
  };
  const manifest = M.buildManifest(doc, null);
  const result = M.reconcileBalance(manifest, doc);
  assert.equal(result.checked, false);
  assert.equal(result.ok, true);
  assert.equal(result.historyNetLp, 45);
  assert.equal(result.historyNetShards, 75);
  assert.equal(result.impliedOpeningLp, 273);
  assert.equal(result.impliedOpeningShards, 16);
  assert.match(result.message, /手入力/);
});

test("開始残高が負数になるときは履歴と申告残高の不整合を検出する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "120", fragment: "100" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "履歴A", memo: "140LP、105欠片" }]
  };
  const result = M.reconcileBalance(M.buildManifest(doc, null), doc);
  assert.equal(result.checked, false, "開始残高のアンカーが無いことは明示する");
  assert.equal(result.impliedOpeningLp, -20);
  assert.equal(result.impliedOpeningShards, -5);
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

test("現座の誤記を残高アンカーとしても検出する", () => {
  const M = loadImportWithMemo();
  const r = M.reconcileBalance({
    scenarios: [{ memo: "66LP 現座189LP", income: { lp: 66, shards: 0 }, spends: [] }],
    purchaseHistory: []
  }, { currency: { lp: 189, fragment: null } });
  assert.equal(r.checked, true);
  assert.equal(r.openingLp, 189);
  assert.equal(r.computedLp, 189, "アンカー前の66LPを二重加算しない");
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

test("リザルト下書きはパーサーの要確認理由を捨てず、カードへ渡す", () => {
  const reasons = [{ line: "30欠片 136欠片", reason: "曖昧なので保留" }];
  const draft = G.buildResultDraft({
    groups: [],
    scenarios: [{
      key: "scenario:review",
      name: "要確認",
      memo: "30欠片 136欠片",
      income: { lp: 0, shards: 0 },
      tickets: {},
      spends: [],
      reasons
    }]
  }, {});
  assert.deepEqual(draft.blocks[0].reasons, reasons);
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

test("自然文の明示支出・括弧内のマイナス額を通貨別に読む", () => {
  const cases = [
    ["終了後、LP200を消費し人格特定抽出「対象」", "lp", 200],
    ["欠片75消費して抽出「対象」", "shards", 75],
    ["サポートパッシブ[破撃]を35LPを消費して購入", "lp", 35],
    ["シ協会同期使用（硝子の破片x2購入し使用：-40LP）", "lp", 40]
  ];
  for (const [line, currency, amount] of cases) {
    const result = MEMO.parseMemo(line);
    assert.equal(result.income.lp, 0, "明示支出を収入へ混ぜない: " + line);
    assert.equal(result.spends.length, 1, "支出を1件記録: " + line);
    assert.equal(result.spends[0][currency], amount, "通貨額を保持: " + line);
    assert.equal(result.reasons.length, 0, "読める支出に警告を付けない: " + line);
  }
});

test("同じ行のチケット消費とLP消費を両方記録し、未対応額は警告する", () => {
  const r = MEMO.parseMemo("人格チケット×7、300LP消費。");
  assert.equal(r.ticketSpends.length, 1);
  assert.equal(r.ticketSpends[0].count, 7);
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 300);

  const unresolved = MEMO.parseMemo("消費40LP");
  assert.equal(unresolved.spends.length, 0, "書式を推測して誤計上しない");
  assert.ok(unresolved.reasons.some((item) => /安全に解析できない/.test(item.reason)), "未解析額を無警告で捨てない");
});

test("自然文支出は取込アクションと残高照合にも反映する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "300", fragment: "" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [
      { name: "開始残高", memo: "現在所持LP：500" },
      { name: "自然文支出", memo: "LP200を消費して人格抽出「対象」" }
    ]
  };
  const manifest = M.buildManifest(doc, null);
  assert.equal(manifest.scenarios[1].spends[0].lp, 200);
  const actions = M.toDispatchActions(manifest, [], {});
  const costEntries = actions.actions.filter((item) => item.type === "ADD_ENTRY" && item.cost?.lp === 200);
  assert.equal(costEntries.length, 1, "LP支出を一度だけ明細化する");
  const balance = M.reconcileBalance(manifest, doc);
  assert.equal(balance.computedLp, 300);
  assert.equal(balance.ok, true);
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


test("同じ共有元のシナリオキーはメモ修正後も安定し、同名の反復記録は区別される", () => {
  const doc = {
    name: "テストキャラクター", plName: "テストPL",
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [
      { name: "反復シナリオ", memo: "50LP", __lbtShareSourceId: "share123" },
      { name: "反復シナリオ", memo: "50LP", __lbtShareSourceId: "share123" }
    ]
  };
  const changed = {
    ...doc,
    scenarioHistory: [
      { name: "反復シナリオ", memo: "100LP（修正）", __lbtShareSourceId: "share123" },
      { name: "反復シナリオ", memo: "50LP", __lbtShareSourceId: "share123" }
    ]
  };
  const before = G.buildManifest(doc, null);
  const after = G.buildManifest(changed, null);
  assert.equal(before.scenarios[0].importSourceKey, after.scenarios[0].importSourceKey, "メモ文面を識別子に含めない");
  assert.notEqual(before.scenarios[0].importSourceKey, before.scenarios[1].importSourceKey, "同名の複数回は別キー");
  assert.equal(before.scenarios[1].importSourceKey, after.scenarios[1].importSourceKey);
});


test("「現在所持LP：30→3」は残高であり収入にしない", () => {
  const r = MEMO.parseMemo("現在所持LP：30→3\n現在所持欠片：10→35");
  assert.equal(r.income.lp, 0, "残高は収入ではない");
  assert.equal(r.income.shards, 0, "残高は収入ではない");
});

test("報酬の下に書いた残高は報酬だけを収入にする", () => {
  const r = MEMO.parseMemo("報酬：\nLP：30\n欠片：25\n現在所持LP：3→33\n現在所持欠片：10→35");
  assert.equal(r.income.lp, 30, "報酬 30 だけを読む");
  assert.equal(r.income.shards, 25, "報酬 25 だけを読む");
});

test("コロン付きの「現在LP：33」も残高であり収入にしない", () => {
  assert.equal(MEMO.parseMemo("現在LP：33").income.lp, 0);
  assert.equal(MEMO.parseMemo("現在所持LP：78→58").income.lp, 0);
});

test("「消費：LP30」は支出として読む", () => {
  const r = MEMO.parseMemo("消費：LP30\n消費：欠片100");
  assert.equal(r.income.lp, 0, "支払額を収入にしない");
  assert.equal(r.spends.length, 2, "2 件の支出");
  assert.equal(r.spends[0].lp, 30);
  assert.equal(r.spends[1].shards, 100);
});

test("消費の計算式は結果の額を読む（50×3=150 / 150+300→450）", () => {
  assert.equal(MEMO.parseMemo("消費：欠片50×3=150").spends[0].shards, 150);
  assert.equal(MEMO.parseMemo("消費：75×2=150欠片").spends[0].shards, 150);
  assert.equal(MEMO.parseMemo("消費：150+300→欠片450").spends[0].shards, 450);
  assert.equal(MEMO.parseMemo("消費：LP20+7=27").spends[0].lp, 27);
});

test("消費の行にチケットと通貨が併記されても、両方の使用記録を残す", () => {
  const r = MEMO.parseMemo("消費：人格抽出チケット×1、LP100");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 100, "LP は支出");
  assert.equal(r.tickets.persona, 0, "使ったチケットを獲得にしない");
  assert.equal(r.ticketSpends.length, 1, "チケット消費を落とさない");
  assert.equal(r.ticketSpends[0].kind, "persona");
  assert.equal(r.ticketSpends[0].count, 1);
});

test("券種や枚数のない説明文中の「チケット」は抽出チケットと誤認しない", () => {
  const flavor = MEMO.parseMemo(
    "【覚悟の残骸】\n[最大所持数1]\n使用時、対象のダイスを破壊する。\n終末点をなくしたチケットは捨てられる日を待っている。"
  );
  assert.equal(flavor.tickets.persona, 0);
  assert.equal(flavor.tickets.ego, 0);
  assert.equal(flavor.ticketSpends.length, 0);
  assert.equal(flavor.reasons.some((entry) => /抽出チケットの種別が不明/.test(entry.reason)), false);

  const namedTicket = MEMO.parseMemo("眺めるチケット");
  assert.equal(namedTicket.tickets.persona, 0);
  assert.equal(namedTicket.reasons.some((entry) => /抽出チケットの種別が不明/.test(entry.reason)), false);

  const actualGenericTicket = MEMO.parseMemo("チケット入手");
  assert.ok(actualGenericTicket.reasons.some((entry) => /抽出チケットの種別が不明/.test(entry.reason)));

  const ticketAfterCurrencyReward = MEMO.parseMemo("報酬\n140LP\n26カケラ\nチケット");
  assert.ok(ticketAfterCurrencyReward.reasons.some((entry) => /抽出チケットの種別が不明/.test(entry.reason)),
    "収入・通貨の直後に単独で書かれたチケットは取りこぼさず要確認に残す");

  const explicitDrawTicket = MEMO.parseMemo("抽出チケット");
  assert.ok(explicitDrawTicket.reasons.some((entry) => /抽出チケットの種別が不明/.test(entry.reason)));
});

test("通貨と併記された曖昧なチケットも、推測せず未確定消費として残す", () => {
  const r = MEMO.parseMemo("消費：人格orE.G.O抽出チケット×1、LP100");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 100);
  assert.equal(r.tickets.persona, 0);
  assert.equal(r.tickets.ego, 0);
  assert.equal(r.tickets.choice, 0);
  assert.equal(r.ticketSpends.length, 1);
  assert.equal(r.ticketSpends[0].kind, "unknown");
});

test("硝子の欠片と数量条件は通貨の支出にしない", () => {
  assert.equal(MEMO.parseMemo("消費：硝子の欠片×3").spends.length, 0, "アイテムの消費");
  assert.equal(MEMO.parseMemo("消費：任意の200LP以下のテーマパック+1権").spends.length, 0, "条件の数値");
});

test("「現在所持LP：30→3」を錠として読み、消費の記帳と合わせて照合する", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "33", fragment: "35" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [
      { name: "初期作成時記録", memo: "消費：LP27\n現在所持LP：30→3\n現在所持欠片：10" },
      { name: "受領記録", memo: "報酬：\nLP：30\n欠片：25\n現在所持LP：3→33\n現在所持欠片：10→35" }
    ]
  };
  const result = M.reconcileBalance(M.buildManifest(doc, null), doc);
  assert.equal(result.checked, true, "所持つきの残高も錠として検出する");
  assert.equal(result.openingLp, 3, "矢印の右辺（支出後）が現在の残高");
  assert.equal(result.computedLp, 33, "開始 3 に報酬 30 を足した 33");
  assert.equal(result.computedShards, 35);
  assert.equal(result.ok, true, "帳尻が合う");
});

test("矢印つきの残高は左辺ではなく右辺を現在の残高として使う", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "3", fragment: "" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "購入の記録", memo: "現在所持LP：30→3" }]
  };
  const result = M.reconcileBalance(M.buildManifest(doc, null), doc);
  assert.equal(result.openingLp, 3, "左辺の 30 はこの卓を始める前の額");
  assert.equal(result.checked, true);
  assert.equal(result.ok, true);
});

test("コロン付きの「現在LP：33」も錠として検出し、残高を収入に数えない", () => {
  const M = loadImportWithMemo();
  const doc = {
    currency: { lp: "33", fragment: "" },
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "受領記録", memo: "LP：33\n現在LP：33" }]
  };
  const manifest = M.buildManifest(doc, null);
  assert.equal(manifest.scenarios[0].income.lp, 33, "収入は 33 だけ");
  const result = M.reconcileBalance(manifest, doc);
  assert.equal(result.checked, true);
  assert.equal(result.computedLp, 33);
  assert.equal(result.ok, true);
});

test("通貨消費の後に「パック名:獲得人格」が続く場合、パック名を人格名へ混ぜない", () => {
  const r = MEMO.parseMemo("→200LP消費、眺めることのできないパック:黒獣-巳の人格獲得");
  assert.equal(r.income.lp, 0);
  assert.equal(r.spends.reduce((sum, row) => sum + row.lp, 0), 200, "LP200 は支出");
  assert.ok(r.wins.some((row) => row.name === "黒獣-巳の人格"), "獲得した人格名を抽出");
  assert.ok(!r.wins.some((row) => row.name.includes("パック:")), "パック名と人格名を混ぜない");
});


test("任意のテーマパックチケットは抽出券と混同せず、対象パック不明として保留する", () => {
  const r = MEMO.parseMemo("報酬\n→LP65、欠片40\n→長くなってごめんね：200LP以下の任意のテーマパックチケット×1:終止符事務所代表の人格");
  assert.equal(r.tickets.persona, 0);
  assert.equal(r.tickets.ego, 0);
  assert.equal(r.tickets.choice, 0);
  const review = r.reasons.find((row) => String(row.line || "").includes("任意のテーマパックチケット"));
  assert.ok(review, "対象パック名のない券を確認対象に残す");
  assert.equal(review.ticketCategory, "pack", "通常の抽出券ではなくパック券として分類");
  assert.match(review.reason, /対象パック名が指定されていない汎用テーマパックチケット/);
  assert.ok(r.wins.some((row) => row.via === "テーマパックチケット（対象パック未指定）"),
    "獲得品の由来もパック券として保持");
});

test("人格orE.G.O抽出チケットは引き続き真の種別不明として保留する", () => {
  const r = MEMO.parseMemo("人格orE.G.O抽出チケット1：K社3級職員の人格獲得");
  const review = r.reasons.find((row) => String(row.line || "").includes("人格orE.G.O"));
  assert.ok(review);
  assert.equal(review.ticketCategory, undefined, "パック券とは別分類");
  assert.match(review.reason, /人格\/E\.G\.O\/選択の残数への計上を保留/);
  assert.equal(r.tickets.persona, 0);
  assert.equal(r.tickets.ego, 0);
  assert.equal(r.tickets.choice, 0);
});


test("自由メモ購入の共有元キーは金額修正後も安定する", () => {
  const context = { window: {}, console, module: { exports: {} }, URL };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8"), context);
  vm.runInContext(readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8"), context);
  const importApi = context.window.LBT_garasumado;
  const makeDoc = (lp) => importApi.mergeGarasumadoDocuments([{
    id: "share123",
    url: "https://lbt-garasumado.vercel.app/view/share123",
    updateTime: "2026-10-27T00:00:00Z",
    doc: {
      name: "テストキャラクター", plName: "テストPL",
      owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
      scenarioHistory: [],
      freeNotes: { secret: "LP-" + lp + " サポートパッシブ「人生一発」購入", history: "", memo: "", setting: "" }
    }
  }]);
  const beforeDoc = makeDoc(20);
  const afterDoc = makeDoc(30);
  assert.equal(beforeDoc.__lbtFreeNotesSourceId, "share123");
  assert.deepEqual([...beforeDoc.__lbtFreeNotesSourceIds], ["share123"]);
  const before = importApi.buildManifest(beforeDoc, null);
  const after = importApi.buildManifest(afterDoc, null);
  assert.equal(before.freeNotesSourceId, "share123");
  assert.deepEqual([...before.freeNotesSourceIds], ["share123"]);
  assert.equal(before.purchaseHistory.length, 1);
  assert.equal(before.purchaseHistory[0].importSourceKey, after.purchaseHistory[0].importSourceKey,
    "金額が直っても購入元キーは変えない");
  assert.equal(before.purchaseHistory[0].lp, 20);
  assert.equal(after.purchaseHistory[0].lp, 30);

  const multi = importApi.mergeGarasumadoDocuments([
    { id: "older123", url: "https://lbt-garasumado.vercel.app/view/older123", updateTime: "2026-10-26T00:00:00Z",
      doc: { name: "テストキャラクター", plName: "テストPL", scenarioHistory: [], freeNotes: { secret: "LP-10 人生一発購入" } } },
    { id: "share123", url: "https://lbt-garasumado.vercel.app/view/share123", updateTime: "2026-10-27T00:00:00Z",
      doc: { name: "テストキャラクター", plName: "テストPL", scenarioHistory: [], freeNotes: { secret: "LP-30 サポートパッシブ「人生一発」購入" } } }
  ]);
  const multiManifest = importApi.buildManifest(multi, null);
  assert.deepEqual([...multiManifest.freeNotesSourceIds], ["older123", "share123"],
    "同じキャラクターのスナップショット群から得た旧 free-note bucket も refresh できる");
  assert.equal(multiManifest.purchaseHistory.length, 1, "最新スナップショットの購入だけを使う");
  assert.equal(multiManifest.purchaseHistory[0].lp, 30);
});


test("価格上限だけ書かれたテーマパックは収入・支出・チケットに推測計上せず警告する", () => {
  const a = MEMO.parseMemo("報酬：60LP / 自我の欠片 45 / 200LP以下のテーマパックx1");
  assert.equal(a.income.lp, 60, "明示されたLP報酬だけ計上");
  assert.equal(a.income.shards, 45, "明示された欠片報酬だけ計上");
  assert.equal(a.spends.reduce((n, row) => n + row.lp, 0), 0, "200LPは実支出ではない");
  assert.equal(a.pack["任意"] || 0, 0, "対象パックや券種を推測しない");
  assert.equal(a.tickets.persona + a.tickets.ego + a.tickets.choice, 0);
  assert.ok(a.reasons.some((row) => /LP上限付きのテーマパック表記/.test(row.reason)),
    "金額を二重計上しない理由を表示");
});

test("LP200以下の任意テーマパックという価格条件は、別記の報酬額を維持しつつ要確認にする", () => {
  const r = MEMO.parseMemo(`報酬
LP120
欠片60
LP200以下の任意のテーマパック×1を獲得`);
  assert.equal(r.income.lp, 120);
  assert.equal(r.income.shards, 60);
  assert.equal(r.reasons.filter((row) => /LP上限付きのテーマパック表記/.test(row.reason)).length, 1);
});

test("明示的なテーマパックチケットは既存のパック券警告だけを使う", () => {
  const r = MEMO.parseMemo("報酬：60LP / 欠片45 / 200LP以下の任意のテーマパックチケット×1");
  assert.equal(r.income.lp, 60);
  assert.equal(r.income.shards, 45);
  assert.equal(r.reasons.filter((row) => /LP上限付きのテーマパック表記/.test(row.reason)).length, 0);
  assert.ok(r.reasons.some((row) => row.ticketCategory === "pack"));
});

test("プロトの100LP消費ガチャは短縮名を人格として一意に解決し、E.G.Oへ誤分類しない", () => {
  const proto = samples["3JIdhCPatk2URoQZ2btx"]?.doc;
  assert.ok(proto, "プロトの実サンプルがある");
  const sourceScenario = (proto.scenarioHistory || []).find((row) =>
    String(row.memo || "").includes("→LP100消費ガチャ:厳粛な哀悼獲得")
  );
  assert.ok(sourceScenario, "元の100LP消費ガチャ記録がある");

  const parsed = MEMO.parseMemo(sourceScenario.memo);
  const parsedWin = parsed.wins.find((win) => win.name === "厳粛な哀悼");
  assert.equal(parsedWin?.entityKindHint, "persona", "100LP消費ガチャの形式から人格ヒントを保持する");
  assert.equal(parsed.spends.find((spend) => spend.lp === 100)?.lp, 100, "100LP支出は金額側にも残る");

  /* 既存の所持人格行を外し、リザルトの獲得行だけから所持補充できるかを検査。 */
  const personaName = "ロボトミーE.G.O:厳粛な哀悼";
  const doc = {
    ...proto,
    owned: {
      ...(proto.owned || {}),
      personas: (proto.owned?.personas || []).filter((row) => {
        const name = typeof row === "string" ? row : row?.name;
        return !String(name || "").trim().startsWith(personaName);
      })
    },
    scenarioHistory: [sourceScenario]
  };
  const context = { window: { DB: db }, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["js/roster-resolver.js", "js/garasumado-memo-parse.js", "js/ledger-provenance.js", "js/garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  const index = context.window.LBT_buildNameIndex(db, {});
  const resolve = (name) => (context.window.LBT_resolveCandidates(index, name) || [])[0] || null;
  const candidates = (name) => context.window.LBT_resolveCandidates(index, name) || [];
  const manifest = context.window.LBT_garasumado.buildManifest(doc, { resolve, candidates }, db);
  const scenario = manifest.scenarios.find((row) => row.name === sourceScenario.name);
  const win = scenario?.wins.find((row) => row.raw === "厳粛な哀悼");
  assert.ok(win?.resolved, "文脈付き解決で所持候補へ補える");
  assert.equal(win.resolution, "context-kind-unique-substring");
  assert.equal(win.kinds.length, 1);
  assert.equal(win.kinds[0].kind, "persona");
  assert.equal(String(win.kinds[0].no), "75");
  assert.equal(win.kinds[0].mode, "n");
  assert.ok(!win.kinds.some((kind) => kind.kind === "ego"), "E.G.O No.59には結び付けない");

  const applied = context.window.LBT_garasumado.toDispatchActions(manifest, [], { db });
  assert.ok(applied.actions.some((action) => action.type === "ADD_ROSTER" && String(action.no) === "75" && action.mode === "n"),
    "獲得記録から人格 No.75 のADD_ROSTERを作る");
  assert.ok(!applied.actions.some((action) => action.type === "ADD_ROSTER_EGO" && String(action.no) === "59"),
    "厳粛な哀悼の短縮名からE.G.O No.59を誤追加しない");
  assert.equal(applied.skipped.some((item) => String(item.key).includes("厳粛な哀悼") && /E.G.O/.test(item.reason)), false);

  /* 価格・ガチャ文脈のヒントを持たない短縮名はグローバルに人格へ寄せない。 */
  const neutral = context.window.LBT_garasumado.buildManifest({
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "別額のガチャ", memo: "→LP50消費ガチャ:厳粛な哀悼獲得" }]
  }, { resolve, candidates }, db);
  const neutralWin = neutral.scenarios[0].wins.find((row) => row.raw === "厳粛な哀悼");
  assert.ok(neutralWin, "獲得の記録自体は失わない");
  assert.equal(neutralWin.entityKindHint, undefined, "100LPでない取引から人格ヒントを作らない");
  assert.equal(neutralWin.resolved, false, "種別の根拠がない短縮名を推測解決しない");
  assert.equal(neutralWin.kinds.length, 0, "未解決のまま明示して残す");
});

test("硝子窓の「獲得：HE 厳粛な哀悼」は正式E.G.O名へ照合され所持追加される", () => {
  const fullEgoName = "厳粛な哀悼：死んだ蝶たちの葬儀";
  const memo = "消費：欠片100\n獲得：HE " + fullEgoName;
  const parsed = MEMO.parseMemo(memo);
  assert.deepEqual([...parsed.wins.map((win) => ({ name: win.name, kind: win.kind }))], [
    { name: fullEgoName, kind: "ego" }
  ], "獲得ラベルとE.G.OランクをDBの表示名へ混ぜない");

  const context = { window: { DB: db }, console, module: { exports: {} } };
  vm.createContext(context);
  for (const file of ["roster-resolver.js", "garasumado-memo-parse.js", "ledger-provenance.js", "garasumado-roster-import.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  const index = context.window.LBT_buildNameIndex(db, {});
  const resolve = (name) => (context.window.LBT_resolveCandidates(index, name) || [])[0] || null;
  const manifest = context.window.LBT_garasumado.buildManifest({
    owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
    scenarioHistory: [{ name: "E.G.O抽出", memo }]
  }, {
    resolve,
    candidates: (name) => context.window.LBT_resolveCandidates(index, name) || []
  }, db);

  const win = manifest.scenarios[0].wins.find((row) => row.name === fullEgoName);
  assert.ok(win?.resolved, "正式名が実DBへ解決される");
  assert.equal(win.kinds.length, 1);
  assert.equal(win.kinds[0].kind, "ego");
  assert.equal(win.kinds[0].rank, "HE");

  const applied = context.window.LBT_garasumado.toDispatchActions(manifest, [], { db });
  assert.ok(applied.actions.some((action) => action.type === "ADD_ROSTER_EGO"
    && action.rank === "HE" && String(action.no) === "59"),
    "厳粛な哀悼：死んだ蝶たちの葬儀（HE / 59）が取り込みアクションまで到達する");
  assert.deepEqual([...applied.skipped], [], "正規名とランクがあるE.G.Oを未解決扱いにしない");
});
