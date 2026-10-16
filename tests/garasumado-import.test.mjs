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
  const context = { window: {}, console, module: { exports: {} } };
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

test("1行に両通貨があれば両方を取る（片方だけだと帳尻が合わない）", () => {
  const r = MEMO.parseMemo("・支払い\nLPを欠片に変換：+11欠片 -22LP");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 22, "LP 側は 22");
  assert.equal(r.spends[0].shards, 11, "欠片側は 11");
  assert.notEqual(r.spends[0].lp, r.spends[0].shards, "両通貨が同じ値にならない");
});

test("「・支出」以降は支出になる", () => {
  const r = MEMO.parseMemo("60LP：現在100LP\n・支出\n正義購入 現在87欠片");
  assert.equal(r.income.lp, 60);
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].shards, 87);
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

test("動詞があれば「現在NN」がその支出額になる", () => {
  const a = MEMO.parseMemo("・支出\n正義購入 現在87欠片");
  assert.equal(a.spends.length, 1, "購入 があるので支出");
  assert.equal(a.spends[0].shards, 87);
  const b = MEMO.parseMemo("・支出\n刺し貫く貫通購入：現在130LP");
  assert.equal(b.spends.length, 1);
  assert.equal(b.spends[0].lp, 130);
});

test("「〜へ」で終わる行は前半の数が支出（後半は残WRITE）", () => {
  const r = MEMO.parseMemo("・支出\n切り伏せる斬撃を購入、150LP消費　300LPへ");
  assert.equal(r.spends.length, 1);
  assert.equal(r.spends[0].lp, 150, "消費した額。300LPへ の 300 は残WRITE");
});
test("チケットの個数と種別を読む", () => {
  const a = MEMO.parseMemo("抽出チケットx1：シュエ家私兵の人格");
  assert.equal(a.tickets.persona, 1);
  const b = MEMO.parseMemo("人格抽出チケットx2：某某");
  assert.equal(b.tickets.persona, 2);
  const c = MEMO.parseMemo("E.G.O抽出チケット：某某");
  assert.equal(c.tickets.ego, 1);
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

  assert.equal(G.parseShareUrl("").ok, false);
  assert.equal(G.parseShareUrl("https://example.com/view/abc123").ok, false);
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
    assert.equal(m.groups.length, 4, "人格 / E.G.O / パッシブ / 精神 の 4 グループ");
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
  assert.ok(doc, "ミート파이を含むキャラクターが存在する");
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
  for (const bad of [{}, null, { owned: null }, { owned: { personas: null } }, { owned: { personas: [null, {}, 3] } }]) {
    const m = G.buildManifest(bad, null);
    assert.equal(m.groups.length, 4);
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

function resolvedManifest(doc) {
  const w = loadResolver();
  const index = w.LBT_buildNameIndex(db, {});
  return G.buildManifest(doc, { resolve: (name) => w.LBT_resolveCandidates(index, name)?.[0] || null });
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
      for (const i of g.items) if (i.needsAttribution && !i.pickedScenario && first) i.pickedScenario = first.name;
    }
    actions += G.toDispatchActions(m, keys, {}).actions.length;
  }
  assert.ok(resolved > 800, "大半の所持が DB に引ける（実際 " + resolved + "）");
  assert.ok(actions > 800, "帰属先を決めると所持追加 action を大量に出せる（実際 " + actions + "）");
  assert.ok(heldBack > 0, "シナリオに無い所持品は、帰属先を選ぶまで止まる（実際 " + heldBack + "）");
});

test("取り込み: 所持だけ入れず reducer の購入経路に預ける（番号は数値のまま預ける）", () => {
  const manifest = {
    groups: [
      { id: "personas", items: [{ key: "p1", name: "黒雲会組員", dbName: "黒雲会組員", kinds: [{ kind: "persona", no: 1, mode: "n" }] }] },
      { id: "egos", items: [{ key: "e1", name: "X", dbName: "X", kinds: [{ kind: "ego", no: 32, rank: "TETH" }] }] },
      { id: "spirits", items: [{ key: "s1", name: "Y", dbName: "Y", kinds: [{ kind: "spirit" }] }] },
      { id: "supportPassives", items: [{ key: "b1", name: "Z", dbName: "Z", kinds: [{ kind: "support" }] }] }
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
        { key: "bad1", name: "A", dbName: "A", kinds: [{ kind: "ego", rank: "TETH" }] },
        { key: "bad2", name: "B", dbName: "B", kinds: [{ kind: "ego", no: 5 }] },
        { key: "ok", name: "C", dbName: "C", kinds: [{ kind: "ego", no: 5, rank: "HE" }] }
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
  /* 支出明細は直前のリザルトに歸属する。順序が崩れると明細が別の夜に入る。 */
  assert.equal(built.actions[1].kind, "spirit");
  assert.equal(built.actions[2].name, "第二夜");
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
