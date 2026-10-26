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

function loadResolver() {
  const source = readFileSync(new URL("../js/roster-resolver.js", import.meta.url), "utf8");
  const ctx = { window: {}, console, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "roster-resolver.js" });
  return ctx.module.exports;
}
const R = loadResolver();
const DB = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const NAME_INDEX = R.buildNameIndex(DB, {});
const resolvePersonaLine = (line) => R.resolveCandidates(NAME_INDEX, line)[0] || null;
function loadFuzzy() {
  const source = readFileSync(new URL("../js/name-fuzzy.js", import.meta.url), "utf8");
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "name-fuzzy.js" });
  return ctx.window.LBT_fuzzyNameCandidatesAcross;
}
const fuzzyAcross = loadFuzzy();
const suggestPersonas = (line) => fuzzyAcross(DB, line, 6).filter((candidate) => candidate.kind === "persona");



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


test("Google Docs の [Input] とタブ区切り表をリザルトとして取り込む", () => {
  const out = T.parseText([
    "[Input]",
    "",
    "シナリオ名\tシナリオA",
    "",
    "報酬\tLP:150\t自我の欠片:70",
    "購入\t人格抽出x2(100LP)"
  ].join("\n"));

  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].title, "シナリオA");
  assert.equal(out.records[0].income.lp, 150);
  assert.equal(out.records[0].income.shards, 70);
  assert.equal(out.records[0].spends[0].name, "人格抽出x2");
  assert.deepEqual({ ...out.records[0].spends[0].cost }, { lp: 100, shards: 0 });
  assert.equal(out.skipped.length, 0);
});

test("共有文書の Markdown 表と全角コロン区切りを読み取る", () => {
  const table = T.parseText([
    "[Input]",
    "| シナリオ名 | シナリオB |",
    "| --- | --- |",
    "| 報酬 | LP:25 | 自我の欠片:7 |",
    "| 追加購入 | 乱打(50LP) |"
  ].join("\n"));
  assert.equal(table.records.length, 1);
  assert.equal(table.records[0].title, "シナリオB");
  assert.equal(table.records[0].income.lp, 25);
  assert.equal(table.records[0].income.shards, 7);
  assert.equal(table.records[0].spends[0].name, "乱打");
  assert.equal(table.skipped.length, 0);

  const colon = T.parseText("【シナリオC】\n報酬：LP:10");
  assert.equal(colon.records[0].income.lp, 10);
  assert.equal(colon.skipped.length, 0);
});

test("実記録に使われている▼/▽形式と複数行の報酬・消費・獲得を読み取る", () => {
  const input = [
    "▽初期作成時記録",
    "消費：LP20+7=27",
    "指定：仮人格Aの人格(初回指定20LP)",
    "仮パッシブ(7LP)",
    "現在所持LP：30→3",
    "現在所持欠片：10",
    "",
    "▼採光シナリオ",
    "日時：2026/05/28",
    "GM：GMさん",
    "報酬：",
    "LP：40+5=45",
    "欠片：25+5=30",
    "人格抽出チケット×1→使用済(獲得：仮人格Bの人格)",
    "現在所持LP：3→48",
    "現在所持欠片：10→40",
    "",
    "▼サポートパッシブ購入",
    "消費：LP20",
    "獲得：肩慣らし",
    "現在所持LP：78→58",
    "現在所持欠片：65",
    "",
    "▼人格同期化依頼×2",
    "該当人格：仮人格A、仮人格B",
    "消費：欠片50×2=100",
    "現在所持LP：58",
    "現在所持欠片：200→100"
  ].join("\n");

  const parsed = T.parseText(input);
  assert.equal(parsed.records.length, 4);
  assert.equal(parsed.records[0].title, "初期作成時記録");
  assert.deepEqual([...parsed.records[0].spends].map((s) => ({ name: s.name, cost: { ...s.cost } })), [
    { name: "仮人格Aの人格", cost: { lp: 20, shards: 0 } },
    { name: "仮パッシブ", cost: { lp: 7, shards: 0 } }
  ]);

  assert.equal(parsed.records[1].income.lp, 45);
  assert.equal(parsed.records[1].income.shards, 30);
  assert.deepEqual([...parsed.records[1].tickets].map((t) => ({ kind: t.kind, count: t.count })), [
    { kind: "persona", count: 1 }
  ]);

  assert.equal(parsed.records[2].spends.length, 1);
  assert.equal(parsed.records[2].spends[0].name, "肩慣らし");
  assert.deepEqual({ ...parsed.records[2].spends[0].cost }, { lp: 20, shards: 0 });

  assert.equal(parsed.records[3].spends.length, 2);
  assert.deepEqual([...parsed.records[3].spends].map((s) => ({ name: s.name, cost: { ...s.cost } })), [
    { name: "仮人格A", cost: { lp: 0, shards: 50 } },
    { name: "仮人格B", cost: { lp: 0, shards: 50 } }
  ]);
});

test("使用済み表示の報酬チケットは収入として扱い、明示的な消費欄がなければ二重減算しない", () => {
  const parsed = T.parseText([
    "▼蒼天採光-憤怒",
    "日時：2026/05/28",
    "報酬：",
    "LP：30",
    "欠片：25",
    "人格抽出チケット×1→使用済(獲得：仮人格の人格)",
    "現在所持LP：3→33",
    "現在所持欠片：10→35"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual([...parsed.records[0].tickets].map((x) => ({ kind: x.kind, count: x.count })), [
    { kind: "persona", count: 1 }
  ]);
  assert.deepEqual([...parsed.records[0].ticketUses].map((x) => ({ kind: x.kind, count: x.count })), [
    { kind: "persona", count: 1 }
  ], "「使用済」は同じリザルト内での明示的なチケット消費を示す");
  assert.ok(parsed.records[0].identityCandidates.includes("仮人格の人格"));

  const planned = T.plan(parsed, {
    resolve: (name) => name === "仮人格の人格"
      ? { name, kinds: [{ kind: "persona", mode: "n", no: "00999" }], confidence: "exact" }
      : null
  });
  const result = planned.actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.income.tickets.persona, 1);
  assert.equal(planned.actions.filter((action) => action.type === "SPEND_TICKET").length, 1);
  assert.equal(planned.actions.find((action) => action.type === "SPEND_TICKET").count, -1);
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER" && action.no === "00999"));
});

test("人格チケットとE.G.Oチケットの明示的な消費は種類別に数える", () => {
  const parsed = T.parseText([
    "▼出目報酬",
    "日時：2026/08/03",
    "報酬：",
    "人格抽出チケット×1",
    "E.G.O抽出チケット×1",
    "消費：人格抽出チケット×1、E.G.O抽出チケット×1",
    "獲得：仮人格の人格、仮EGO",
    "現在所持LP：10",
    "現在所持欠片：20"
  ].join("\n"));
  assert.equal(parsed.records.length, 1);
  const planned = T.plan(parsed, {
    resolve: (name) => {
      if (name === "仮人格の人格") return { name, kinds: [{ kind: "persona", mode: "n", no: "00997" }] };
      if (name === "仮EGO") return { name, kinds: [{ kind: "ego", rank: "TETH", no: "0096" }] };
      return null;
    }
  });
  const income = planned.actions.find((action) => action.type === "ADD_RESULT").income.tickets;
  assert.equal(income.persona, 1);
  assert.equal(income.ego, 1);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => action.kind).sort(), ["ego", "persona"]);
  assert.equal(planned.actions.filter((action) => action.type === "ADD_ENTRY").length, 0,
    "チケット抽出を0LPの支出明細として二重計上しない");
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER" && action.no === "00997"));
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER_EGO" && action.no === "0096"));
});

test("人格抽出の取得欄にある『の人格』表記も所持人格として解決する", () => {
  const parsed = T.parseText([
    "▼人格抽出",
    "日時：2026/05/29",
    "消費：人格抽出チケット×1",
    "獲得：",
    "仮人格の人格",
    "現在所持LP：58",
    "現在所持欠片：15"
  ].join("\n"));

  const planned = T.plan(parsed, {
    resolve: (name) => name === "仮人格の人格"
      ? { name, kinds: [{ kind: "persona", mode: "n", no: "00998" }], confidence: "exact" }
      : null
  });
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER" && action.no === "00998"));
  assert.ok(planned.actions.some((action) => action.type === "SPEND_TICKET" && action.kind === "persona" && action.count === -1));
});

test("テーマパック権をパック別チケットとして認識し、指定欄のLP価格を支出にする", () => {
  const parsed = T.parseText([
    "▼人格抽出-テーマパック",
    "日時：2026/09/23",
    "消費：任意の200LP以下のテーマパック+1権",
    "指定：断ち切れない(300LP)",
    "獲得：仮人格の人格",
    "現在所持LP：91",
    "現在所持欠片：130"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意の200LP以下のテーマパック", count: 1 }]);

  const planned = T.plan(parsed, {
    resolve: (name) => name === "仮人格の人格"
      ? { name, kinds: [{ kind: "persona", mode: "n", no: "00996" }] }
      : null
  });
  const ticketSpend = planned.actions.find((action) => action.type === "SPEND_TICKET");
  assert.equal(ticketSpend?.kind, "pack");
  assert.equal(ticketSpend?.pack, "任意の200LP以下のテーマパック");
  assert.equal(ticketSpend?.count, -1);
  assert.ok(planned.actions.some((action) => action.type === "ADD_ENTRY" && action.name === "断ち切れない"
    && action.cost.lp === 300 && action.cost.shards === 0));
});

test("使用済みテーマパック報酬は選択されたパックの収入として残し、そこでは消費しない", () => {
  const parsed = T.parseText([
    "▼同期化ヒロム11連戦",
    "日時：2026/10/04",
    "報酬：",
    "LP：170",
    "欠片：65+16(理性)=81",
    "任意テーマパックチケット×1→使用済(選択：断ち切れない/獲得：蜘蛛の巣 中指の子方の人格)",
    "現在所持LP：132→302",
    "現在所持欠片：194→275"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual([...parsed.records[0].tickets].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意テーマパック", count: 1 }]);
  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意テーマパック", count: 1 }]);
  const planned = T.plan(parsed);
  assert.equal(planned.actions.find((action) => action.type === "ADD_RESULT").income.tickets.pack["任意テーマパック"], 1);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, pack: action.pack, count: action.count })), [
      { kind: "pack", pack: "任意テーマパック", count: -1 }
    ]);
});

test("既所持人格を欠片へ変換した獲得欄は人格として追加せず、欠片収入へ加える", () => {
  const parsed = T.parseText([
    "▼人格抽出-テーマパック",
    "日時：2026/09/20",
    "消費：【夢の終わる】パック抽出+1権",
    "指定：夢の終わる(200LP)",
    "獲得：ロボトミーE.G.O:後悔の人格(既所持)→50欠片",
    "現在所持LP：131",
    "現在所持欠片：87→137"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.shards, 50);
  assert.equal(parsed.records[0].acquisitions.length, 0);
  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "夢の終わる", count: 1 }]);

  const planned = T.plan(parsed);
  assert.equal(planned.actions.find((action) => action.type === "ADD_RESULT").income.shards, 50);
  assert.equal(planned.actions.filter((action) => action.type === "SPEND_TICKET").length, 1);
  assert.ok(!planned.actions.some((action) => action.type === "ADD_ROSTER"));
  assert.ok(planned.actions.some((action) => action.type === "ADD_ENTRY" && action.name === "夢の終わる"
    && action.cost.lp === 200 && action.cost.shards === 0));
});

test("テーマパック権の報酬直後に欠片へ変換した場合はチケット差引と欠片収入を両方記録する", () => {
  const parsed = T.parseText([
    "▼セッション報酬",
    "日時：2026/09/18",
    "報酬：",
    "LP：60",
    "欠片：45+11(理性)=56",
    "任意の200LP以下のテーマパック+1→使用済(獲得：50欠片)",
    "現在所持LP：30→90",
    "現在所持欠片：293"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.lp, 60);
  assert.equal(parsed.records[0].income.shards, 106);
  assert.deepEqual([...parsed.records[0].tickets].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意の200LP以下のテーマパック", count: 1 }]);
  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意の200LP以下のテーマパック", count: 1 }]);

  const planned = T.plan(parsed);
  const result = planned.actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.income.shards, 106);
  assert.equal(result.income.tickets.pack["任意の200LP以下のテーマパック"], 1);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, pack: action.pack, count: action.count })), [
      { kind: "pack", pack: "任意の200LP以下のテーマパック", count: -1 }
    ]);
});

test("「後者獲得」を選んだチケットor通貨の報酬は通貨だけを計上する", () => {
  const parsed = T.parseText([
    "▼黒炎の崩剣",
    "日時：2026/09/13",
    "GM：茹でサメ店長さん",
    "報酬：",
    "LP：100",
    "欠片：60+15(理性)=75",
    "EGO抽出チケットorLP80と自我の欠片20→後者獲得",
    "現在所持LP：50→230",
    "現在所持欠片：84→179"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.lp, 180);
  assert.equal(parsed.records[0].income.shards, 95);
  assert.equal(parsed.records[0].tickets.length, 0);
  assert.equal(parsed.records[0].ticketUses.length, 0);

  const planned = T.plan(parsed);
  const result = planned.actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.income.lp, 180);
  assert.equal(result.income.shards, 95);
  assert.equal(result.income.tickets.ego, 0);
  assert.equal(planned.actions.filter((action) => action.type === "SPEND_TICKET").length, 0);
});

test("同一リザルト内で同じ収入・残高一式が重複したErrorブロックは二重計上しない", () => {
  const parsed = T.parseText([
    "▼【Error】",
    "日時：2026/10/07",
    "GM：ささらんさん",
    "LP：400",
    "欠片：175+20→195",
    "現在所持LP：234→634",
    "現在所持欠片：71→266",
    "任意抽出チケット×2→両方使用済(獲得：▼【Error】",
    "日時：2026/10/07",
    "GM：ささらんさん",
    "LP：400",
    "欠片：175+20→195",
    "現在所持LP：234→634",
    "現在所持欠片：71→266",
    "任意抽出チケット×2→両方使用済(獲得：胸痛：過ぎ去りし日の寝袋、願掛け：吊られた祈願者)"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  const record = parsed.records[0];
  assert.equal(record.date, "2026-10-07");
  assert.equal(record.income.lp, 400);
  assert.equal(record.income.shards, 195);
  assert.deepEqual([...record.tickets].map((ticket) => ({ kind: ticket.kind, count: ticket.count })), [
    { kind: "choice", count: 2 }
  ]);
  assert.deepEqual([...record.ticketUses].map((ticket) => ({ kind: ticket.kind, count: ticket.count })), [
    { kind: "choice", count: 2 }
  ]);
  assert.deepEqual([...record.identityCandidates], [
    "胸痛:過ぎ去りし日の寝袋",
    "願掛け:吊られた祈願者"
  ]);
  assert.ok(parsed.skipped.some((item) => /重複数値は1回だけ計上/.test(item.reason)));
  assert.ok(parsed.skipped.some((item) => /【Error】を指す不正な重複行/.test(item.reason)));

  const planned = T.plan(parsed);
  const result = planned.actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.income.lp, 400);
  assert.equal(result.income.shards, 195);
  assert.deepEqual([...planned.actions.filter((action) => action.type === "SPEND_TICKET")]
    .map((action) => ({ kind: action.kind, count: action.count })), [
      { kind: "choice", count: -2 }
    ]);
});

test("記録された欠片残高の差分が報酬額と違う場合は自動修正せず警告する", () => {
  const parsed = T.parseText([
    "▼突発卓：砂浜の激闘",
    "日時：2026/06/12",
    "報酬：",
    "LP：100",
    "欠片：50",
    "現在所持LP：41→141",
    "現在所持欠片：397→437"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.shards, 50);
  const warning = parsed.skipped.find((item) => item.text === "現在所持欠片：397→437");
  assert.ok(warning);
  assert.equal(warning.kind, "balance-mismatch");
  assert.match(warning.reason, /記録上 \+40、取込計算上 \+50/);
  assert.match(warning.guidance, /447/, "報酬50が正しい場合の終了残高候補を示す");
});

test("チケット使用で50欠片に変換した報酬は残高差分が一致しなければ要確認にする", () => {
  const parsed = T.parseText([
    "▼血を求める者は",
    "日時：2026/09/23",
    "報酬：",
    "LP：60",
    "欠片：35+8(理性)=43",
    "【夢の終わる】パック+1→使用済(獲得：50欠片)",
    "現在所持LP：31→91",
    "現在所持欠片：87→130"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.shards, 93);
  assert.equal(parsed.records[0].ticketUses.length, 1);
  const warning = parsed.skipped.find((item) => item.text === "現在所持欠片：87→130");
  assert.ok(warning);
  assert.equal(warning.kind, "balance-mismatch-pack");
  assert.match(warning.reason, /記録上 \+43、取込計算上 \+93/);
  assert.match(warning.guidance, /パック/);
  assert.match(warning.guidance, /180/, "50欠片を含めた場合の終了残高候補を示す");
});

test("欠片変換を含むテーマパック報酬も現在所持の差分を監査する", () => {
  const parsed = T.parseText([
    "▼とある幻想:黒獣",
    "日時：2026/10/06",
    "報酬：",
    "LP：80",
    "欠片：50+12(理性)=62",
    "眺めることしかできないテーマパックチケット×1→使用済(獲得：50欠片)",
    "現在所持LP：182→262",
    "現在所持欠片：275→337"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.shards, 112);
  assert.ok(parsed.skipped.some((item) =>
    item.text === "現在所持欠片：275→337"
      && /記録上 \+62、取込計算上 \+112/.test(item.reason)
  ));
});

test("親リザルトの残高差分が日付なしの内訳ブロックにある場合は重複警告しない", () => {
  const parsed = T.parseText([
    "▼デス金木犀",
    "日時：2026/10/04",
    "報酬：",
    "LP：150+26=176",
    "欠片：84+20(理性)=104",
    "テーマパック「時間殺人時間」+1→使用済(獲得：E.G.O 永続：時間アヒル)",
    "▽テストプレイ報酬（以下のうちから2つを選択）",
    "以下の2種を選択",
    "①LP10d5→26",
    "③好きなテーマパック+1(選択：断ち切れない→使用済(獲得：蜘蛛の巣 薬指の親方))",
    "1d100でGMより低い出目なら選択抽出チケットx1→獲得、使用済(獲得：双鉤海賊団 組員Cの人格)",
    "現在所持LP：156→332",
    "現在所持欠片：90→194"
  ].join("\n"));

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].income.lp, 176);
  assert.equal(parsed.records[0].income.shards, 104);
  assert.ok(!parsed.skipped.some((item) => /現在所持.+一致しません/.test(item.reason)));
  assert.ok(!parsed.skipped.some((item) => /親リザルト/.test(item.reason)));
});

test("日時を結果の日付欄に保持する", () => {
  const parsed = T.parseText([
    "▼梅と言うには遅く、名も悪く",
    "日時：2026/07/19",
    "報酬：",
    "LP：45",
    "欠片：30"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].date, "2026-07-19");
  const planned = T.plan(parsed);
  assert.equal(planned.actions[0].type, "ADD_RESULT");
  assert.equal(planned.actions[0].date, "2026-07-19");
});

test("見出し記号のない日時付き記録も直前の記録へ結合しない", () => {
  const parsed = T.parseText([
    "▼精神購入",
    "日時：2026/08/01",
    "消費：1000欠片",
    "獲得：分別できる理性",
    "現在所持LP：27",
    "現在所持欠片：1096→96",
    "",
    "囚人訓練　急　⬛︎⬛︎⬛",
    "日時：2026/08/01",
    "報酬：",
    "LP：190",
    "欠片：90+20(理性)=110",
    "現在所持LP：27→217",
    "現在所持欠片：96→206"
  ].join("\n"));

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].title, "精神購入");
  assert.equal(parsed.records[0].income.lp, 0);
  assert.equal(parsed.records[0].income.shards, 0);
  assert.equal(parsed.records[1].title, "囚人訓練　急　⬛︎⬛︎⬛");
  assert.equal(parsed.records[1].income.lp, 190);
  assert.equal(parsed.records[1].income.shards, 110);
});

test("獲得後に備考で使用されたアイテムは所持数を増やしてから消費する", () => {
  const parsed = T.parseText([
    "▼血袋連戦",
    "日時：2026/08/03",
    "報酬：",
    "LP：55",
    "欠片：33",
    "アイテム：",
    "砥石×1",
    "備考：砥石×1 使用",
    "現在所持LP：8→63",
    "現在所持欠片：206→239"
  ].join("\n"));

  const planned = T.plan(parsed, {
    resolveItem: (name) => name === "砥石" ? { itemId: "enh-whetstone" } : null,
    resolveItemUse: (line) => /砥石×1 使用/.test(line)
      ? { itemId: "enh-whetstone", itemName: "砥石", quantity: 1 }
      : null
  });
  assert.deepEqual([...planned.actions].filter((action) => action.type === "ADD_ITEM_INVENTORY")
    .map((action) => ({ itemId: action.itemId, quantity: action.quantity })), [
      { itemId: "enh-whetstone", quantity: 1 }
    ]);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "CONSUME_ITEM")
    .map((action) => ({ itemId: action.itemId, quantity: action.quantity })), [
      { itemId: "enh-whetstone", quantity: 1 }
    ]);
  assert.equal(planned.actions.find((action) => action.type === "ADD_RESULT").consumedItems.length, 0);
});

test("実記録の獲得アイテムは個数を保って所持アイテムへ登録する", () => {
  const parsed = T.parseText([
    "▼梅と言うには遅く、名も悪く",
    "日時：2026/07/19",
    "報酬：",
    "LP：45",
    "欠片：30",
    "硝子の欠片×1",
    "生命体切断システム装置×2",
    "バラのスパナ工房の外付け強化義足×1",
    "現在所持LP：64→109",
    "現在所持欠片：713→743"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.lp, 45);
  assert.equal(parsed.records[0].income.shards, 30);
  assert.equal(parsed.records[0].itemGains[0]?.itemId, "resource-glass-shard");
  assert.equal(parsed.records[0].itemGains[0]?.quantity, 1);
  assert.deepEqual([...parsed.records[0].rewardCandidates].map((item) => ({ name: item.name, quantity: item.quantity })), [
    { name: "生命体切断システム装置", quantity: 2 },
    { name: "バラのスパナ工房の外付け強化義足", quantity: 1 }
  ]);

  const planned = T.plan(parsed, {
    resolveItem: (name) => ({
      "生命体切断システム装置": { itemId: "enh-lifeform-cutting-system" },
      "バラのスパナ工房の外付け強化義足": { itemId: "enh-rosa-prosthetic-leg" }
    }[name] || null)
  });
  assert.deepEqual([...planned.actions].filter((action) => action.type === "ADD_ITEM_INVENTORY")
    .map((action) => ({ itemId: action.itemId, quantity: action.quantity })), [
      { itemId: "resource-glass-shard", quantity: 1 },
      { itemId: "enh-lifeform-cutting-system", quantity: 2 },
      { itemId: "enh-rosa-prosthetic-leg", quantity: 1 }
    ]);
});

test("購入済みのサポートパッシブと精神を所持へ追加し、支出は二重計上しない", () => {
  const parsed = T.parseText([
    "▼サポートパッシブ購入",
    "消費：LP20",
    "獲得：肩慣らし",
    "現在所持LP：78→58",
    "現在所持欠片：65",
    "",
    "▼精神購入",
    "消費：欠片50",
    "獲得：哀しみ",
    "現在所持LP：58",
    "現在所持欠片：65→15"
  ].join("\n"));

  const plan = T.plan(parsed, {
    resolve: (name) => ({
      name,
      kinds: name === "肩慣らし" ? [{ kind: "support" }] : [{ kind: "spirit" }]
    })
  });
  assert.deepEqual([...plan.actions].filter((a) => a.type === "ADD_ROSTER_SUPPORT")
    .map((a) => ({ name: a.spp.name, purchase: a.purchase })), [
    { name: "肩慣らし", purchase: false }
  ]);
  assert.deepEqual([...plan.actions].filter((a) => a.type === "ADD_ROSTER_SPIRIT")
    .map((a) => ({ name: a.spirit.name, purchase: a.purchase })), [
    { name: "哀しみ", purchase: false }
  ]);
  assert.equal(plan.actions.filter((a) => a.type === "ADD_ENTRY").length, 2);
  assert.equal(plan.skipped.length, 0);
});

test("実記録にある全角イコールの計算結果を合計値として読む", () => {
  const parsed = T.parseText([
    "▼黒炎の崩剣",
    "報酬：",
    "LP：110+80=190",
    "欠片：80+20＝100",
    "現在所持LP：137→327",
    "現在所持欠片：996→1096"
  ].join("\n"));
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.lp, 190);
  assert.equal(parsed.records[0].income.shards, 100);
});

test("抽出チケット複数枚とLP合計の費用配分が不明でも合計支出を保持する", () => {
  const parsed = T.parseText([
    "▼抽出イベント×5",
    "日時：2026/06/06",
    "消費：人格抽出チケット×2、抽出チケット×1、LP200",
    "獲得：",
    "ロボトミーE.G.O:たぷつきの人格",
    "メメメメメ工房フィクサーの人格",
    "黒獣-巳の人格",
    "R社第四群ウサギチームの人格",
    "ロジック・アトリエ所属フィクサーの人格",
    "現在所持LP：229→29",
    "現在所持欠片：355"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual([...parsed.records[0].spends].map((item) => ({
    name: item.name, cost: { ...item.cost }
  })), [{ name: "抽出イベント×5", cost: { lp: 200, shards: 0 } }]);
  const allocationWarning = parsed.skipped.find((item) => /合計費用は1件の支出として記録しました/.test(item.reason));
  assert.ok(allocationWarning);
  assert.equal(allocationWarning.kind, "expense-allocation-review");
  assert.match(allocationWarning.guidance, /合計費用はすでに1件の支出として保持/);
  assert.ok(!parsed.skipped.some((item) => /消費合計が安全整数/.test(item.reason)));

  const planned = T.plan(parsed);
  const expense = planned.actions.find((action) => action.type === "ADD_ENTRY");
  assert.deepEqual({ kind: expense.kind, name: expense.name, cost: { ...expense.cost } }, {
    kind: "expense", name: "抽出イベント×5", cost: { lp: 200, shards: 0 }
  }, "合計支出は取得人格の購入扱いにしない");
});

test("消費額と獲得品の個別価格が矛盾する実記録は要確認として残す", () => {
  const parsed = T.parseText([
    "▼E.G.O指定購入",
    "消費：LP450",
    "獲得：",
    "仮EGO A 50欠片",
    "仮EGO B 50欠片",
    "現在所持LP：168",
    "現在所持欠片：451→1"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.deepEqual([...parsed.records[0].spends].map((s) => ({ name: s.name, cost: { ...s.cost } })), [
    { name: "仮EGO A", cost: { lp: 0, shards: 50 } },
    { name: "仮EGO B", cost: { lp: 0, shards: 50 } }
  ]);
  const warning = parsed.skipped.find((item) => /個別価格が一致しません/.test(item.reason));
  assert.ok(warning);
  assert.equal(warning.kind, "expense-total-mismatch");
  assert.match(warning.guidance, /消費欄の合計/);
});

test("[Input]付きの見出しなし記録も空行ごとに分割する", () => {
  const parsed = T.parseText([
    "[Input]",
    "報酬\tLP:10",
    "",
    "報酬\tLP:20"
  ].join("\n"));
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].income.lp, 10);
  assert.equal(parsed.records[1].income.lp, 20);
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

test("硝子の破片は欠片通貨に混ぜず、別資源の獲得記録として保持する", () => {
  const parsed = T.parseText("【A】\n報酬｜硝子の破片x2");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].income.shards, 0);
  assert.equal(parsed.records[0].income.lp, 0);
  assert.equal(parsed.records[0].itemGains[0]?.itemId, "resource-glass-shard");
  assert.equal(parsed.records[0].itemGains[0]?.quantity, 2);
  const planned = T.plan(parsed);
  assert.equal(planned.actions[0].type, "ADD_RESULT");
  assert.equal(planned.actions[0].income.shards, 0, "資源を欠片通貨の収入に誤計上しない");
  assert.match(planned.actions[0].note, /硝子の破片 ×2（獲得記録）/);
  assert.equal(planned.skipped.length, 0);
});
test("「硝子の欠片」も「硝子の破片」と同じ別資源として獲得・消費を保持する", () => {
  const modern = T.parseText("【A】\n報酬｜LP:10/硝子の欠片x2");
  assert.equal(modern.records[0].income.lp, 10);
  assert.equal(modern.records[0].income.shards, 0, "硝子の欠片2個を自我の欠片通貨に誤計上しない");
  assert.equal(modern.records[0].itemGains[0]?.itemId, "resource-glass-shard");
  assert.equal(modern.records[0].itemGains[0]?.quantity, 2);
  assert.equal(modern.skipped.length, 0);

  const legacy = T.parseText([
    "『A』",
    "LP10+欠片2",
    "硝子の欠片x2",
    "【硝子の欠片を一つ使用して人差し指のctを解除】"
  ].join("\n"));
  assert.equal(legacy.records[0].itemGains[0]?.itemId, "resource-glass-shard");
  assert.equal(legacy.records[0].itemGains[0]?.quantity, 2);
  assert.equal(legacy.records[0].consumedItems[0]?.itemId, "resource-glass-shard");
  assert.equal(legacy.records[0].consumedItems[0]?.quantity, 1);
});
test("金鎚／金槌の既知表記差は一意一致する所持サポートへ反映する", () => {
  const parsed = T.parseText([
    "▼サポートパッシブ購入",
    "日時：2026/09/20",
    "消費：LP20",
    "獲得：釘と金鎚",
    "現在所持LP：126→106"
  ].join("\n"));
  const planned = T.plan(parsed, {
    resolve: (name) => name === "釘と金槌"
      ? { name: "釘と金槌", kinds: [{ kind: "support" }] }
      : null
  });
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER_SUPPORT"
    && action.spp?.name === "釘と金槌"));
  assert.ok(!planned.skipped.some((item) => item.text === "釘と金鎚"
    && /取得品をアイテムDB/.test(item.reason)));
});

test("ローマ数字・末尾「の人格」の既知表記差は一意一致する人格へ反映する", () => {
  const parsed = T.parseText([
    "▼人格抽出",
    "日時：2026/08/21",
    "獲得：南部親指ソルダートⅡの人格",
    "現在所持LP：170",
    "現在所持欠片：99"
  ].join("\n"));
  const planned = T.plan(parsed, {
    resolve: (name) => name === "南部親指ソルダートII"
      ? { name: "南部親指ソルダートII", kinds: [{ kind: "persona", mode: "n", no: "00991" }] }
      : null
  });
  assert.equal(planned.actions.filter((action) => action.type === "ADD_ROSTER" && action.no === "00991").length, 1);
  assert.ok(planned.identities.some((identity) => identity.source === "南部親指ソルダートⅡの人格" && !identity.unresolved));
  assert.ok(!planned.skipped.some((item) => item.text === "南部親指ソルダートⅡの人格"
    && /取得品をアイテムDB/.test(item.reason)));
});

test("ランク接頭辞つきのE.G.O獲得も正式名へ照合して所持へ追加する", () => {
  const parsed = T.parseText([
    "▼E.G.O抽出",
    "日時：2026/06/01",
    "消費：E.G.O抽出チケット×1",
    "獲得：HE Laetitia:レティシア",
    "現在所持LP：58",
    "現在所持欠片：15"
  ].join("\n"));

  const seen = [];
  const planned = T.plan(parsed, {
    resolve: (name) => {
      seen.push(name);
      if (name === "Laetitia:レティシア") {
        return { name: "Laetitia：レティシア", kinds: [{ kind: "ego", rank: "HE", no: "00555" }] };
      }
      return null;
    }
  });

  assert.ok(seen.includes("HE Laetitia:レティシア"));
  assert.ok(seen.includes("Laetitia:レティシア"));
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER_EGO" && action.rank === "HE" && action.no === "00555"));
  assert.ok(!planned.skipped.some((item) => item.text === "HE Laetitia:レティシア"
    && /取得品をアイテムDB/.test(item.reason)));
});

test("実記録の「悪への道：厄災の狸」はDB正式名「悪道：厄災の狸」へ限定照合する", () => {
  const parsed = T.parseText([
    "▼E.G.O抽出",
    "日時：2026/10/09",
    "獲得：WAW 悪への道:厄災の狸",
    "現在所持LP：100",
    "現在所持欠片：50"
  ].join("\n"));

  const seen = [];
  const planned = T.plan(parsed, {
    resolve: (name) => {
      seen.push(name);
      return name === "悪道：厄災の狸"
        ? { name, kinds: [{ kind: "ego", rank: "WAW", no: 82 }] }
        : null;
    }
  });
  assert.ok(seen.includes("悪道：厄災の狸"));
  assert.ok(planned.actions.some((action) => action.type === "ADD_ROSTER_EGO"
    && action.rank === "WAW" && action.no === 82));
  assert.ok(!planned.skipped.some((item) => item.text === "WAW 悪への道:厄災の狸"
    && /取得品をアイテムDB/.test(item.reason)));
});

test("「人格抽出チケット2」は2枚として読み、チケット残数から2枚消費する", () => {
  const parsed = T.parseText([
    "▼人格抽出×4",
    "日時：2026/06/01",
    "消費：人格抽出チケット2,LP200",
    "現在所持LP：500",
    "現在所持欠片：0"
  ].join("\n"));

  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, count: ticket.count
  })), [{ kind: "persona", count: 2 }]);
  const planned = T.plan(parsed);
  assert.ok(planned.actions.some((action) => action.type === "SPEND_TICKET"
    && action.kind === "persona" && action.count === -2));
});

test("無修飾の抽出チケットは「人格抽出」記録のときだけ人格券と解釈する", () => {
  const personaDraw = T.parseText([
    "▼人格抽出",
    "日時：2026/07/12",
    "消費：抽出チケット×1",
    "現在所持LP：58",
    "現在所持欠片：15"
  ].join("\n"));
  assert.deepEqual([...personaDraw.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, count: ticket.count
  })), [{ kind: "persona", count: 1 }]);
  assert.ok(T.plan(personaDraw).actions.some((action) => action.type === "SPEND_TICKET"
    && action.kind === "persona" && action.count === -1));

  const ambiguous = T.parseText([
    "▼逆夢は未だ明けず",
    "日時：2026/08/26",
    "報酬：任意のチケット×1→使用済(獲得：旧G社兵士の人格)",
    "現在所持LP：0",
    "現在所持欠片：0"
  ].join("\n"));
  assert.equal(ambiguous.records[0].tickets[0].kind, null);
  assert.equal(ambiguous.records[0].ticketUses[0].kind, null);
  assert.ok(!T.plan(ambiguous).actions.some((action) => action.type === "SPEND_TICKET"));
});

test("複数抽出の費用配分でもタイトル文脈で認識した無修飾チケットを数える", () => {
  const parsed = T.parseText([
    "▼人格抽出×5",
    "日時：2026/06/06",
    "消費：人格抽出チケット×2、抽出チケット×1、LP200",
    "獲得：",
    "メメメメメ工房フィクサーの人格",
    "ロボトミーE.G.O:たぷつきの人格",
    "黒獣-巳の人格",
    "R社第四群ウサギチームの人格",
    "ロジック・アトリエ所属フィクサーの人格",
    "現在所持LP：229→29",
    "現在所持欠片：355"
  ].join("\n"));

  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, count: ticket.count
  })), [
    { kind: "persona", count: 2 },
    { kind: "persona", count: 1 }
  ]);
  assert.equal(parsed.records[0].spends.length, 5);
  assert.deepEqual([...parsed.records[0].spends].map((spend) => spend.cost.lp), [0, 0, 0, 100, 100]);
  assert.ok(!parsed.skipped.some((item) => /費用配分が一意に決まらない/.test(item.reason)));
});

test("実記録の「硝子の欠片×2、LP20」は数量2の消費として認識する", () => {
  const parsed = T.parseText([
    "▼E.G.O指定購入",
    "日時：2026/08/10",
    "消費：硝子の欠片×2、LP20",
    "現在所持LP：20",
    "現在所持欠片：0"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].consumedItems.length, 1);
  assert.equal(parsed.records[0].consumedItems[0].itemId, "resource-glass-shard");
  assert.equal(parsed.records[0].consumedItems[0].quantity, 2);
  assert.ok(!parsed.skipped.some((item) => /硝子の破片の消費個数/.test(item.reason)));
});

test("実記録の「任意テーマパークチケット」は共通テーマパック券として正規化する", () => {
  const parsed = T.parseText([
    "▼人格抽出-テーマパック",
    "日時：2026/10/04",
    "消費：任意テーマパークチケット×1",
    "指定：断ち切れない(300LP)",
    "獲得：仮人格の人格",
    "現在所持LP：621",
    "現在所持欠片：406"
  ].join("\n"));

  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, pack: ticket.pack, count: ticket.count
  })), [{ kind: "pack", pack: "任意テーマパック", count: 1 }]);

  const planned = T.plan(parsed);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, pack: action.pack, count: action.count })), [
      { kind: "pack", pack: "任意テーマパック", count: -1 }
    ]);
  assert.ok(planned.actions.some((action) => action.type === "ADD_ENTRY"
    && action.name === "断ち切れない" && action.cost.lp === 300 && action.cost.shards === 0));
});

test("「人格チケとEGOチケ両方」の報酬は2種のチケットとして数える", () => {
  const parsed = T.parseText([
    "▼死卓　なんか　うみが　あれてるっぽいっすよ",
    "日時：2026/08/09",
    "報酬：",
    "LP：80",
    "欠片：60+15(理性)=75",
    "10以下90以上で人格チケとEGOチケ両方→獲得・両方使用済",
    "現在所持LP：233→313",
    "現在所持欠片：391→466"
  ].join("\n"));

  assert.deepEqual([...parsed.records[0].tickets].map((ticket) => ({
    kind: ticket.kind, count: ticket.count
  })).sort((a, b) => a.kind.localeCompare(b.kind)), [
    { kind: "ego", count: 1 },
    { kind: "persona", count: 1 }
  ]);
  assert.deepEqual([...parsed.records[0].ticketUses].map((ticket) => ({
    kind: ticket.kind, count: ticket.count
  })).sort((a, b) => a.kind.localeCompare(b.kind)), [
    { kind: "ego", count: 1 },
    { kind: "persona", count: 1 }
  ]);

  const planned = T.plan(parsed);
  assert.deepEqual([...planned.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, count: action.count })).sort((a, b) => a.kind.localeCompare(b.kind)), [
      { kind: "ego", count: -1 },
      { kind: "persona", count: -1 }
    ]);
});

test("E.G.O指定購入の個別欠片価格と合計LP費用を両方保持する", () => {
  const parsed = T.parseText([
    "▼E.G.O指定購入",
    "日時：2026/08/10",
    "消費：LP450",
    "獲得：",
    "魑魅魍魎：舌切り雀 50欠片",
    "黄金の卵：ガチョウ 50欠片",
    "Changer MK3：なんでも変えて差し上げます 50欠片",
    "低いなきごえ：泣きヒキガエル 50欠片",
    "まやかし：黄金色の林檎 50欠片",
    "蝍蛆殺：百足の使徒 50欠片",
    "喪失：欲張りなきこり 50欠片",
    "響き：マンドレイクの棺 50欠片",
    "赤く染まった羽：鶴の恩返し 50欠片",
    "欠片合計：50×9=450",
    "現在所持欠片：451→1"
  ].join("\n"));

  assert.equal(parsed.records.length, 1);
  const spends = parsed.records[0].spends;
  assert.equal(spends.length, 10, "9つのE.G.O価格とLP合計を分けて保持する");
  assert.equal(spends.reduce((sum, item) => sum + item.cost.lp, 0), 450);
  assert.equal(spends.reduce((sum, item) => sum + item.cost.shards, 0), 450);
  assert.equal(spends.filter((item) => item.raw === "LP450").length, 1);
  assert.equal(parsed.skipped.length, 0, "異なる通貨の明細は価格不一致として警告しない");

  const planned = T.plan(parsed);
  const entries = planned.actions.filter((action) => action.type === "ADD_ENTRY");
  assert.equal(entries.reduce((sum, item) => sum + item.cost.lp, 0), 450);
  assert.equal(entries.reduce((sum, item) => sum + item.cost.shards, 0), 450);
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

test("日本語の山括弧内のスラッシュはパック名の一部として保持する", () => {
  const parsed = T.parseText("【A】\n報酬｜〈A/B〉抽出チケットx2/LP:10\n");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].tickets.length, 1);
  assert.equal(parsed.records[0].tickets[0].pack, "A/B");
  assert.equal(parsed.records[0].tickets[0].count, 2);
  assert.equal(parsed.records[0].income.lp, 10);
  assert.equal(parsed.skipped.length, 0);
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

test("プレビューで曖昧なチケット種別を指定すると、同じ報酬行の収入と消費に反映する", () => {
  const parsed = T.parseText([
    "▼【夢を見続けた者共よ。】",
    "日時：2026/06/26",
    "報酬：",
    "LP：113",
    "欠片：61",
    "テストプレイ報酬抽出チケット×1→使用済(獲得：ロボトミーE.G.O:後悔の人格)",
    "現在所持LP：173→286",
    "現在所持欠片：518→579"
  ].join("\n"));

  const record = parsed.records[0];
  assert.equal(record.tickets[0].kind, null);
  assert.equal(record.ticketUses[0].kind, null);
  const key = T.ticketResolutionKey(0, record.tickets[0]);
  assert.equal(key, T.ticketResolutionKey(0, record.ticketUses[0]));

  const unresolved = T.plan(parsed);
  assert.equal(unresolved.actions.find((action) => action.type === "ADD_RESULT").income.tickets.choice, 0);
  assert.equal(unresolved.actions.filter((action) => action.type === "SPEND_TICKET").length, 0);
  assert.equal(unresolved.skipped.length, 2);

  const resolved = T.plan(parsed, {
    ticketResolved: { [key]: { kind: "choice" } }
  });
  const result = resolved.actions.find((action) => action.type === "ADD_RESULT");
  assert.equal(result.income.tickets.choice, 1);
  assert.deepEqual([...resolved.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, count: action.count })), [
      { kind: "choice", count: -1 }
    ]);
  assert.equal(resolved.skipped.length, 0);
});

test("曖昧なパック権は手動指定したパック名があるときだけ消費する", () => {
  const parsed = T.parseText([
    "▼人格抽出-テーマパック",
    "日時：2026/10/04",
    "消費：任意のチケット×1",
    "指定：断ち切れない(300LP)",
    "獲得：仮人格の人格",
    "現在所持LP：621",
    "現在所持欠片：406"
  ].join("\n"));

  const ticket = parsed.records[0].ticketUses[0];
  assert.equal(ticket.kind, null);
  const key = T.ticketResolutionKey(0, ticket);
  const withoutPack = T.plan(parsed, { ticketResolved: { [key]: { kind: "pack", pack: "" } } });
  assert.equal(withoutPack.actions.filter((action) => action.type === "SPEND_TICKET").length, 0);
  assert.ok(withoutPack.skipped.some((item) => /チケット種類|チケットの種類/.test(item.reason)));

  const withPack = T.plan(parsed, { ticketResolved: { [key]: { kind: "pack", pack: "断ち切れない" } } });
  assert.deepEqual([...withPack.actions].filter((action) => action.type === "SPEND_TICKET")
    .map((action) => ({ kind: action.kind, pack: action.pack, count: action.count })), [
      { kind: "pack", pack: "断ち切れない", count: -1 }
    ]);
  assert.ok(!withPack.skipped.some((item) => /チケット種類|チケットの種類/.test(item.reason)));
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

test("旧ログ形式の『シナリオ名』・LP+欠片・チケット・硝子破片消費を取り込める", () => {
  const input = [
    "マスカのシナリオ通過3",
    "『幻想体戦闘力実験　夢見る濁流』",
    "LP50+欠片30",
    "ノイズ",
    "『そうめんをくえ』",
    "LP80+欠片40",
    "人格チケ2枚",
    "硝子のかけら×2",
    "【硝子の破片を一つ使用して人差し指のctを解除】",
    "『一服。』 合計：97LP+47欠片"
  ].join("\n");
  const parsed = T.parseText(input);
  assert.equal(parsed.records.length, 3);
  assert.deepEqual([...parsed.records].map((r) => r.title), [
    "幻想体戦闘力実験　夢見る濁流", "そうめんをくえ", "一服。"
  ]);
  assert.deepEqual([...parsed.records].map((r) => [r.income.lp, r.income.shards]), [
    [50, 30], [80, 40], [97, 47]
  ]);
  assert.equal(parsed.records[1].tickets[0].kind, "persona");
  assert.equal(parsed.records[1].tickets[0].count, 2);
  assert.equal(parsed.records[1].itemGains[0].itemId, "resource-glass-shard");
  assert.equal(parsed.records[1].itemGains[0].quantity, 2);
  assert.equal(parsed.records[1].consumedItems[0].quantity, 1, "漢数字「一つ」を読む");
  assert.match(parsed.records[1].consumedItems[0].detail, /人差し指のctを解除/);
  assert.ok(parsed.records[0].raw.includes("ノイズ"), "解釈しきれない獲得名はリザルト注記へ保持");
});

test("旧ログの消費はリザルト履歴へ移し、現在庫の二重減算は行わない", () => {
  const parsed = T.parseText("『A』\nLP50+欠片30\n【硝子の破片を2つ使用してCT解除】");
  const plan = T.plan(parsed);
  assert.equal(plan.actions[0].type, "ADD_RESULT");
  assert.equal(plan.actions[0].consumedItems[0].itemId, "resource-glass-shard");
  assert.equal(plan.actions[0].consumedItems[0].quantity, 2);
  assert.equal(plan.actions.some((action) => action.type === "CONSUME_ITEM"), false);
  assert.equal(plan.actions.some((action) => action.type === "ADD_ITEM_INVENTORY"), false,
    "旧ログは現所持のスナップショットと二重計上しない");
  assert.match(plan.actions[0].consumedItems[0].detail, /CT解除/);
});



test("送付されたサブジェ履歴の全形式で人格行と操作行を区別する", () => {
  const input = [
    "サブジェの履歴",
    "『人は15分でエネミーデータを作ってバランスのいい調整ができるのかPart4』",
    "LP50+欠片25",
    "ワザリングハイツバトラー",
    "『ハイスピード残火』",
    "LP35+欠片20",
    "南シ6",
    "【LP-100　人格ガチャ】",
    "LCE提灯",
    "『とっきめき！皆で遠洋鯨釣り！』",
    "25LP+13欠片",
    "ディアマン",
    "【勤勉、爽快購入。LP-20】",
    "『鎧武者』",
    "LP50+欠片30",
    "『おしぷりドラゴンと遊ぶ部屋(2陣)』",
    "30LP+30欠片",
    "ダイスバトルでファンブルしたので9LP",
    "【LP-100　人格ガチャ】",
    "針金",
    "『人徳戦』",
    "LP40+30欠片",
    "『おしぷりドラゴンと遊ぶ部屋(4陣)』",
    "30LP+30欠片",
    "東部センク",
    "指定裁判",
    "『ぷるぷるなぷるる、つまりぷるだ』",
    "78LP+39欠片",
    "人差し指遂行者",
    "『トロッコ問題』",
    "LP65+欠片25",
    "硝子の欠片1",
    "【LP-100　人格ガチャ】",
    "W社2級",
    "【バラとスパナ工房の同期化依頼　-50欠片】",
    "『怠惰大罪part3』",
    "LP75+欠片50",
    "硝子の破片1",
    "【精神:正義購入。欠片-200】",
    "【サポパ：圧縮購入。LP-9】",
    "【サポパ：落雷購入。LP-30】",
    "『未来鏡：笛吹男』",
    "LP65+欠片30",
    "K社",
    "同期バラスパCT3",
    "【LP-100　人格ガチャ】",
    "シュエ家私兵"
  ].join("\n");
  const parsed = T.parseText(input);
  assert.ok(parsed.records.length >= 10, "見出しごとの履歴がリザルトに分かれる");
  const plan = T.plan(parsed, { resolve: resolvePersonaLine, suggestPersona: suggestPersonas });
  const exact = plan.identities.map((entry) => entry.name).filter(Boolean);
  assert.ok(exact.includes("ワザリングハイツバトラー"));
  assert.ok(exact.includes("シュエ家私兵"));
  assert.ok(plan.identities.some((entry) => entry.source === "東部センク" && entry.options.length >= 2), "曖昧な略称は複数候補に止める");
  assert.ok(!plan.identities.some((entry) => entry.source === "指定裁判"), "E.G.O名は人格候補にしない");
  assert.ok(!plan.identities.some((entry) => entry.source === "硝子の欠片1"), "硝子の欠片の個数表記を人格候補にしない");
  assert.ok(!plan.identities.some((entry) => entry.source === "同期バラスパCT3"), "同期操作の注記を人格候補にしない");
  assert.equal(plan.actions.some((action) => action.type === "ADD_ROSTER" && action.no === 40), true);
  assert.equal(plan.actions.some((action) => action.type === "ADD_ROSTER" && action.no === 53), true);
});

test("旧ログの注記に混ざったDB上の人格名を照合し、所持済みを二重追加しない", () => {
  const input = [
    "『結果A』",
    "LP50+欠片25",
    "ワザリングハイツバトラー",
    "『結果B』",
    "LP35+欠片20",
    "シュエ家私兵"
  ].join("\n");
  const parsed = T.parseText(input);
  const owned = new Set(["n:40"]);
  const plan = T.plan(parsed, { resolve: resolvePersonaLine, ownedPersonas: owned });
  assert.deepEqual([...plan.identities.map((item) => item.name)], ["ワザリングハイツバトラー", "シュエ家私兵"]);
  assert.equal(plan.identities[0].owned, true);
  assert.equal(plan.identities[1].owned, false);
  const additions = plan.actions.filter((action) => action.type === "ADD_ROSTER");
  assert.equal(additions.length, 1, "未所持の人格だけを追加候補へ");
  assert.equal(additions[0].mode, "n");
  assert.equal(additions[0].no, 53);
  assert.equal(additions[0].skipInitialTicketConsumption, true, "過去の履歴取込で現在の抽出チケットを消費しない");
  assert.equal(plan.actions.filter((action) => action.type === "ADD_RESULT").length, 2);
});

test("略称などの曖昧な行は候補表示だけにして、選ばれるまで人格を追加しない", () => {
  const parsed = T.parseText("『結果A』\nLP50+欠片25\n東部センク");
  const suggestPersona = (line) => line === "東部センク" ? [
    { kind: "persona", name: "東部センク協会3課フィクサー", mode: "n", no: 27, score: 80 },
    { kind: "persona", name: "東部センク協会3課フィクサーB", mode: "n", no: 125, score: 75 }
  ] : [];
  const unresolved = T.plan(parsed, { resolve: resolvePersonaLine, suggestPersona });
  assert.equal(unresolved.identities.length, 1);
  assert.equal(unresolved.identities[0].name, null);
  assert.equal(unresolved.identities[0].options.length, 2);
  assert.equal(unresolved.actions.some((action) => action.type === "ADD_ROSTER"), false);

  const resolved = T.plan(parsed, {
    resolve: resolvePersonaLine,
    suggestPersona,
    identityResolved: { "0:0": "東部センク協会3課フィクサー" }
  });
  assert.equal(resolved.identities[0].name, "東部センク協会3課フィクサー");
  assert.equal(resolved.actions.filter((action) => action.type === "ADD_ROSTER").length, 1);
  assert.equal(resolved.actions.find((action) => action.type === "ADD_ROSTER").no, 27);
});

test("履歴の購入マーカー・同期メモ・E.G.O名を人格として誤追加しない", () => {
  const parsed = T.parseText([
    "『結果A』",
    "LP50+欠片25",
    "【LP-100 人格ガチャ】",
    "同期バラスパCT3",
    "指定裁判"
  ].join("\n"));
  const plan = T.plan(parsed, {
    resolve: resolvePersonaLine,
    suggestPersona: () => []
  });
  assert.equal(plan.identities.some((item) => item.name === "指定裁判"), false, "E.G.O名は人格として解決しない");
  assert.equal(plan.actions.some((action) => action.type === "ADD_ROSTER"), false, "購入マーカーや同期メモを所持人格へ追加しない");
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

test("支出の除外はリザルトごとに独立し、同じ行番号の別シナリオを消さない", () => {
  const parsed = T.parseText([
    "【シナリオA】",
    "購入｜道具A(10LP)",
    "",
    "【シナリオB】",
    "購入｜道具B(20LP)"
  ].join("\n"));
  assert.equal(parsed.records.length, 2);
  const plan = T.plan(parsed, { excluded: new Set(["0:0"]) });
  assert.deepEqual(
    [...plan.actions.filter((action) => action.type === "ADD_ENTRY")].map((action) => [action.name, action.cost.lp]),
    [["道具B", 20]]
  );
  assert.equal(plan.actions.filter((action) => action.type === "ADD_RESULT").length, 2);
});

test("欠けら表記の価格も欠片として取り込む", () => {
  const parsed = T.parseText("【シナリオA】\n購入｜道具(50欠けら)");
  const spend = parsed.records[0].spends[0];
  assert.equal(Boolean(spend.needsDecision), false);
  assert.deepEqual(JSON.parse(JSON.stringify(spend.cost)), { lp: 0, shards: 50 });
});


test("取込プレビューの残高・費用監査警告は利用者が警告単位で確認済みにできる", () => {
  const ui = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  assert.match(ui, /確認済みとして閉じる/);
  assert.match(ui, /dismissedTextWarnings/);
  assert.match(ui, /visibleTextWarnings/);
  assert.match(ui, /setDismissedTextWarnings\(new Set\(\)\)/,
    "入力を変更したら以前の確認状態をリセットする");
});
