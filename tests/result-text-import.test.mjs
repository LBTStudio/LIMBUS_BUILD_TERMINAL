import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   記録のテキスト流し込み。｜区切りの手書きログをリザルトと支出明細に落とす。

   取り込む形式:
     【シナリオ名】(作：著者)
     報酬｜LP:150/自我の欠片:70/人格抽出チケットx1
     購入｜人格抽出x2(100LP)/第四銀太刀派同期化(50欠片)/EGO購入-TETH[鬼退治](75欠片)
     追加購入｜壊し砕く打撃(150LP)/乱打(50LP)

   守るべき性質:
     - 括弧と鉤括弧の中の / は区切りに数えない（人格抽出x2(無料1/100LP) が壊れない）
     - 金額は括弧書きから取る。取れなければ 0 ではなく「要確認」で出す（勝手に埋めない）
     - 分からない行は「無視」せず、理由つきの skipped にする
     - 複数シナリオを空行・次の見出しで区切って読み分ける
   --------------------------------------------------------------------------- */

function load() {
  const source = readFileSync(new URL("../js/result-text-import.js", import.meta.url), "utf8");
  const ctx = { window: {}, console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "result-text-import.js" });
  return ctx.window.LBT_textImport;
}

const T = load();

/* 例テキストに実在の投稿者のハンドル名を混ぜない。
   抽出機能の検証であって作者名の検証ではないため、値は誰でも書ける
   仮称でよい。実名が入ると、テンプレートとしてもサンプルとしても
   その人に紛らわしくなる。 */
const SAMPLE = [
  "【シナリオA】(作：作者名)",
  "報酬｜LP:150(+9)/自我の欠片:70(+16)/人格抽出チケットx1",
  "購入｜人格抽出x2(無料1/100LP)/第四銀太刀派同期化(50欠片)/EGO購入-TETH[鬼退治](75欠片)/EGO解析-TETH[鬼退治](40欠片)",
  "追加購入｜壊し砕く打撃(150LP)/乱打(50LP)"
].join("\n");

/* --- 見出し ------------------------------------------------------------- */

test("【シナリオ名】(作：著者) から名前と作者を取り出す", () => {
  const out = T.parseText(SAMPLE);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].title, "シナリオA");
  assert.equal(out.records[0].author, "作者名");
});

/* 例テキストは誰でも書ける仮称只用。実在の投稿者のハンドル名や
   公開済みのシナリオ名をテンプレートに載せると、その人の引用に見え、
   サンプルと混ざって誤読される。 */
const BANNED = ["無\u793C\u9762", "\u4E2D\u592E\u901A\u8DEF\u6226\u7DDA"];  // 実在ハンドル名 / 実在シナリオ名

test("例テキストに実在の個人名・シナリオ名を使わない", () => {
  const src = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  const placeholders = [...src.matchAll(/placeholder:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const examples = placeholders.filter((p) => /作：|【/.test(p));
  assert.ok(examples.length > 0, "例テキストが存在する");
  for (const p of examples) {
    for (const banned of BANNED) {
      assert.equal(p.includes(banned), false, "例テキストに実在名が混ざっている: " + p);
    }
  }
  const self = readFileSync(new URL(import.meta.url), "utf8");
  for (const banned of BANNED) {
    assert.equal(self.includes(banned), false, "テスト側にも実在名が残っている");
  }
});

test("【の前の装飾文字（絵文字等）は無視する", () => {
  const out = T.parseText("❤❤【シナリオA】\n報酬｜LP:150\n");
  assert.equal(out.records[0].title, "シナリオA");
});

test("作者の書き方が違っても著者として読む", () => {
  assert.equal(T.parseText("【A】(作：X)").records[0].author, "X");
  assert.equal(T.parseText("【A】(作成者：X)").records[0].author, "X");
  assert.equal(T.parseText("【A】").records[0].author, null, "書かなければ著者なし");
});

/* --- 報酬 --------------------------------------------------------------- */

test("報酬行は収入になる", () => {
  const rec = T.parseText(SAMPLE).records[0];
  assert.equal(rec.income.lp, 150);
  assert.equal(rec.income.shards, 70);
});

test("括弧の中の増減 (±N) は収入に混ぜない（残高差であり獲得ではない）", () => {
  const rec = T.parseText(SAMPLE).records[0];
  assert.equal(rec.income.lp, 150, "+9 を足さない");
  assert.equal(rec.income.shards, 70, "+16 を足さない");
  /* 消えないよう、原文に残す。 */
  assert.deepEqual([...rec.deltas].map((d) => ({ ...d })), [{ currency: "lp", value: 9 }, { currency: "shards", value: 16 }]);
});

test("抽出チケットの種類が分かるものは種類まで読む", () => {
  const rec = T.parseText(SAMPLE).records[0];
  assert.deepEqual([...rec.tickets].map((t) => ({ ...t })), [{ kind: "persona", count: 1 }]);
});

test("全角の書き方（：やＥ.Ｇ.Ｏ）でも同じ Rewards として読む", () => {
  const rec = T.parseText("【A】\n報酬｜LP：150/欠片：70/E.G.O抽出チケットx2\n").records[0];
  assert.equal(rec.income.lp, 150, "全角コロンでもよい");
  assert.equal(rec.income.shards, 70);
  assert.deepEqual([...rec.tickets].map((t) => ({ ...t })), [{ kind: "ego", count: 2 }]);
});

/* --- 購入 --------------------------------------------------------------- */

test("購入行は支出明細に落ちる（人数ではなく個数が数になる）", () => {
  const rec = T.parseText(SAMPLE).records[0];
  const names = [...rec.spends].map((s) => s.name);
  assert.deepEqual(names, [
    "人格抽出x2", "第四銀太刀派同期化", "EGO購入-TETH[鬼退治]", "EGO解析-TETH[鬼退治]", "壊し砕く打撃", "乱打"
  ]);
});

test("括弧の中の / は区切りに数えない", () => {
  const gacha = T.parseText(SAMPLE).records[0].spends[0];
  assert.equal(gacha.name, "人格抽出x2", "(無料1/100LP) で割られない");
  assert.ok(gacha.needsDecision, "無料か 100LP かが決まらないので要確認");
});

test("括弧書きから LP と欠片の金額を取る", () => {
  const s = T.parseText(SAMPLE).records[0].spends;
  assert.deepEqual(costOf(s[1]), { lp: 0, shards: 50 }, "第四銀太刀派同期化");
  assert.deepEqual(costOf(s[2]), { lp: 0, shards: 75 }, "EGO購入");
  assert.deepEqual(costOf(s[4]), { lp: 150, shards: 0 }, "壊し砕く打撃");
  assert.deepEqual(costOf(s[5]), { lp: 50, shards: 0 }, "乱打");
});

function costOf(spend) {
  return { lp: spend.cost.lp, shards: spend.cost.shards };
}

test("金額は読めなければ「要確認」で、勝手に 0 埋めしない", () => {
  const rec = T.parseText("【A】\n購入｜謎のアイテム(無料)\n").records[0];
  const s = rec.spends[0];
  assert.equal(s.cost.lp, 0);
  assert.equal(s.cost.shards, 0);
  assert.ok(s.needsDecision, "無料としか書いてない");
  assert.equal(s.reason, "金額が読めない");
});

test("E.G.O と人格は明細の種別を名前から推測する", () => {
  const s = T.parseText(SAMPLE).records[0].spends;
  assert.equal(s[1].kindHint, "persona", "人格の同期化");
  assert.equal(s[2].kindHint, "ego", "EGO購入");
  assert.equal(s[3].kindHint, "ego", "EGO解析");
  assert.equal(s[0].kindHint, "persona", "人格抽出");
});

/* --- 分からないもの ----------------------------------------------------- */

test("不正な桁区切り・負数・安全整数超過の報酬は収入へ入れない", () => {
  const out = T.parseText("【A】\n報酬｜LP:10/1,2,3LP/LP:-100/9,007,199,254,740,992LP\n");
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].income.lp, 10);
  assert.equal(out.skipped.length, 3, "不正な3項目は理由つきで保留");
  assert.ok(out.skipped.every((entry) => entry.text), "元の行を保持");
});

test("合計が安全整数を超える報酬は加算せず要確認にする", () => {
  const out = T.parseText("【A】\n報酬｜9,007,199,254,740,991LP/1LP\n");
  assert.equal(out.records[0].income.lp, Number.MAX_SAFE_INTEGER);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].reason, /安全整数/);
});

test("不正な桁区切り・安全整数超過の購入価格は自動確定しない", () => {
  const out = T.parseText("【A】\n購入｜謎の道具(1,2,3LP)/古い欠片(9,007,199,254,740,992欠片)\n");
  assert.equal(out.records[0].spends.length, 2);
  for (const spend of out.records[0].spends) {
    assert.equal(spend.cost.lp + spend.cost.shards, 0);
    assert.equal(spend.needsDecision, true);
    assert.match(spend.reason, /決められない/);
  }
});

test("明示されたチケット数 x0 は既定の1枚に置き換えない", () => {
  const out = T.parseText("【A】\n報酬｜人格抽出チケットx0\n");
  assert.equal(out.records[0].tickets.length, 1);
  assert.equal(out.records[0].tickets[0].count, 0);
});

test("増減欄の金額形式が不正でも、主収入は保持し、増減だけ要確認にする", () => {
  const out = T.parseText("【A】\n報酬｜LP:150(+1,2,3)\n");
  assert.equal(out.records[0].income.lp, 150);
  assert.ok(out.skipped.some((entry) => /増減欄/.test(entry.reason)));
});

test("パック名付き抽出チケットはパック別収入へ記録する", () => {
  const parsed = T.parseText("【A】\n報酬｜〈肉斬骨断〉抽出チケットx2\n");
  assert.equal(parsed.records[0].tickets[0].kind, "pack");
  assert.equal(parsed.records[0].tickets[0].pack, "肉斬骨断");
  assert.equal(parsed.records[0].tickets[0].count, 2);
  const planned = T.plan(parsed);
  assert.equal(planned.actions[0].income.tickets.pack["肉斬骨断"], 2);
  assert.equal(planned.skipped.length, 0);
});

test("パック名の数字をチケット枚数と取り違えない", () => {
  const parsed = T.parseText("【A】\n報酬｜〈シーズン3〉抽出チケットx2\n");
  assert.equal(parsed.records[0].tickets[0].pack, "シーズン3");
  assert.equal(parsed.records[0].tickets[0].count, 2);
});

test("種別不明の抽出チケットは黙って破棄せず、取り込み保留として表示する", () => {
  const parsed = T.parseText("【A】\n報酬｜抽出チケットx2\n");
  const planned = T.plan(parsed);
  assert.equal(planned.actions[0].income.tickets.persona, 0);
  assert.equal(planned.actions[0].income.tickets.ego, 0);
  assert.equal(planned.skipped.length, 1);
  assert.match(planned.skipped[0].reason, /種別が不明/);
  assert.equal(planned.skipped[0].text, "抽出チケットx2");
});

test("パック別収入で __proto__ などの名前を落とさない", () => {
  const parsed = T.parseText("【A】\n報酬｜〈__proto__〉抽出チケットx2/〈constructor〉抽出チケットx3\n");
  const planned = T.plan(parsed);
  const packs = planned.actions[0].income.tickets.pack;
  assert.equal(Object.prototype.hasOwnProperty.call(packs, "__proto__"), true);
  assert.equal(packs["__proto__"], 2);
  assert.equal(packs.constructor, 3);
});

test("見出しが分からない行は、捨てずに理由つきの skipped にする", () => {
  const out = T.parseText("【A】\n報酬｜LP:10\n不时　｜ Lufthansa\n");
  assert.equal(out.records.length, 1);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].reason, "見出しが不明");
  assert.equal(out.skipped[0].text, "不时　｜ Lufthansa");
});

test("空行だけの行は空行として無視する（skipped に載せない）", () => {
  const out = T.parseText("【A】\n報酬｜LP:10\n\n\n");
  assert.equal(out.records.length, 1);
  assert.equal(out.skipped.length, 0);
});

/* --- 複数シナリオ ------------------------------------------------------- */

test("空行で区切ると別リザルトとして読む", () => {
  const out = T.parseText("【A】\n報酬｜LP:10\n\n【B】\n報酬｜LP:20\n");
  assert.deepEqual([...out.records].map((r) => r.title), ["A", "B"]);
  assert.deepEqual([...out.records].map((r) => r.income.lp), [10, 20]);
});

test("見出しが連続しても別リザルトとして読む", () => {
  const out = T.parseText("【A】\n報酬｜LP:10\n【B】\n報酬｜LP:20\n");
  assert.deepEqual([...out.records].map((r) => r.title), ["A", "B"]);
});

test("見出しの無い本文だけの貼り付けは 1 件のリザルトとしてまとめる", () => {
  const out = T.parseText("報酬｜LP:10\n購入｜乱打(50LP)\n");
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].title, null, "名前が書いてないなら未定");
  assert.equal(out.records[0].income.lp, 10);
});

/* --- action 化 ---------------------------------------------------------- */

test("ADD_RESULT と ADD_ENTRY の並びになる（明細は直前のリザルトに帰属）", () => {
  const plan = T.plan(T.parseText(SAMPLE), {});
  assert.equal(plan.actions[0].type, "ADD_RESULT");
  assert.equal(plan.actions[0].name, "シナリオA");
  assert.deepEqual(plan.actions[0].income.lp, 150);
  assert.deepEqual(plan.actions[0].income.shards, 70);
  for (const a of plan.actions.slice(1)) assert.equal(a.type, "ADD_ENTRY", "明細が続く");
});

test("明細の種別は kindHint が無いとき解決器に任せる（引けなければ手動支出）", () => {
  const parsed = T.parseText("【A】\n追加購入｜壊し砕く打撃(150LP)\n");
  /* 解決器が support を返したら support、無ければ手動支出。 */
  const withSpp = T.plan(parsed, { resolve: () => ({ kinds: [{ kind: "support" }], dbName: "壊し砕く打撃" }) });
  assert.equal(withSpp.actions[1].kind, "support");
  assert.equal(withSpp.actions[1].name, "壊し砕く打撃", "DB 名に寄せる");

  const without = T.plan(parsed, { resolve: () => null });
  assert.equal(without.actions[1].kind, "expense");
});

test("選択を外した明細は action にしない", () => {
  const parsed = T.parseText(SAMPLE);
  const all = T.plan(parsed, {});
  /* 金額は決められない 1 件は既定で入らない。だから「全部で何件」からの差を見る。 */
  assert.equal(all.actions.filter((a) => a.type === "ADD_ENTRY").length, 5, "決める 5 件は入る");
  const off = new Set([1]);
  const plan = T.plan(parsed, { excluded: off });
  assert.equal(plan.actions.filter((a) => a.type === "ADD_ENTRY").length, 4, "外した 1 件が減る");
});

test("要確認の明細は確定させず skipped に理由を出す", () => {
  const plan = T.plan(T.parseText("【A】\n購入｜謎のアイテム(無料)\n"), {});
  assert.equal(plan.actions.filter((a) => a.type === "ADD_ENTRY").length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].reason, "金額が読めない");
});

test("著者はメモに載せる（リザルト名には混ぜない）", () => {
  const plan = T.plan(T.parseText("【A】(作：X)"), {});
  assert.equal(plan.actions[0].name, "A");
  assert.match(plan.actions[0].note, /X/);
});

/* --- skipped の表示 ------------------------------------------------------
   skipped は「取り込み口」ごとに形が違う。硝子窓は {key,name}、テキスト
   流しは {text}。両方を同じ「取り込み結果」カードへ出すので、描画は
   どれか1つの形しか見ない実装だと、他方の行が `undefined：理由` と
   表示される。   読者に «読めない» を «読めていない» と騙すので、
   ここでは構造で塞ぐ（全形の持ち方と、区切りが必ず落ちること）。 */

test("テキスト流しの skipped は必ず行の中身（text）を持つ", () => {
  const parsed = T.parseText("【A】\n購入｜謎のアイテム(無料)\n理解できない見出し｜本文\n");
  const plan = T.plan(parsed, {});
  assert.ok(plan.skipped.length >= 2, "両方ともスキップされる");
  for (const s of plan.skipped) {
    assert.equal(typeof s.text, "string", "text が文字列");
    assert.ok(s.text.trim().length > 0, "空文字を出さない");
    assert.ok(typeof s.reason === "string" && s.reason.length > 0, "理由が空でない");
  }
});

test("取り込み結果の行表示は undefined を印刷しない（形の違う取り込み口が2つある）", () => {
  const src = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  const renderers = [...src.matchAll(/importNote\.skipped\.map\(([^)]*)\)\s*=>\s*h\("li"[^`]*`([^`]*)`/g)];
  assert.equal(renderers.length, 1, "描画は1箇所に留まる");
  const template = renderers[0][2];
  for (const field of ["s.text", "s.name", "s.key"]) {
    assert.ok(template.includes(field), `${field} を読む`);
  }
  assert.ok(!/undefined/.test(template), "既定値を不用意に書かない");
  assert.match(template, /（行を特定できません）/);
  assert.match(template, /s\.reason\s*\|\|\s*s\.kind\s*\|\|/);
});

test("読み込んだ行と理由は読者に同じ文で出す（型の取り違えをしない）", () => {
  const src = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  const chains = [...src.matchAll(/\$\{(s\.[^}]*)\}：\$\{(s\.reason[^}]*)\}/g)].map((m) => [m[1], m[2]]);
  assert.ok(chains.length >= 2, "2つの取り込み口が同じ並びで出す");
  for (const [label, reason] of chains) {
    assert.ok(label.startsWith("s.text"), `${label} は text を先に見る`);
    assert.ok(reason.includes('"不明"'), `${reason} は最後の値がある`);
  }
});