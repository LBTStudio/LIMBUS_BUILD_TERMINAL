import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   戦闘リザルト・テキストの読み込み法則の回帰テスト。

   守るべき性質:
     - 通貨の識別が外れないこと（LP と 欠片 の取り違えは誤った収支を生む）
     - 全文の表記ゆらぎ（全角/半角・欠片の言い換え・表記ゆれ）を吸収すること
     - 折り返した見出しでもセッションが混線しないこと
     - 種別を文面から推測しないこと（DB に照合して決める）
     - DB に無い自作アイテムと略称は unknown のまま残すこと
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const P = load("result-log-parser.js", "LBT_resultLogInternals");
const R = load("roster-resolver.js", "LBT_rosterResolver");

const corpus = {
  garasumado: readFileSync(new URL("./fixtures/garasumado-memo-corpus.txt", import.meta.url), "utf8"),
  log: readFileSync(new URL("./fixtures/result-log-corpus.txt", import.meta.url), "utf8")
};

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const idx = R.buildNameIndex(db, { "涙剣": "ロボトミーE.G.O:涙で研ぎ澄まされた剣" });

/* --- 通貨の識別（本命） ----------------------------------------------- */

test("通貨の識別: LP・欠片・両方の3値", () => {
  assert.equal(P.classifyCurrency("LP：153　現在187"), "lp");
  assert.equal(P.classifyCurrency("80LP　現在127"), "lp");
  assert.equal(P.classifyCurrency("欠片：104　現在360"), "shards");
  assert.equal(P.classifyCurrency("カケラ25　現在40"), "shards", "言い換えも 欠片");
  assert.equal(P.classifyCurrency("かけら15　現在145"), "shards");
  assert.equal(P.classifyCurrency("自我の欠片：20　現在205欠片"), "shards");
  assert.equal(P.classifyCurrency("LP32で欠片16。欠片00で自制め"), "both");
  assert.equal(P.classifyCurrency("南部セブン協会5課フィクサー"), null, "通貨語は無い");
});

test("硝子の破片は LP・欠片通貨に誤分類せず、登録候補として残す", () => {
  assert.equal(P.classifyCurrency("硝子の破片x2"), null);
  const parsed = P.parseResultLog("【A】\n硝子の破片 x2");
  const records = parsed.sessions[0].records;
  assert.equal(records.some((record) => record.kind === "currency"), false);
  assert.ok(records.some((record) => record.kind === "registration" && record.text.includes("硝子の破片")));
});

test("欠け片の表記ゆれを通貨として読み、硝子・硝酸のアイテム名は除外する", () => {
  assert.equal(P.classifyCurrency("欠け片25 現在40"), "shards");
  assert.equal(P.classifyCurrency("25欠け片 現在40欠け片"), "shards");
  assert.equal(P.classifyCurrency("硝子の欠け片 x2"), null);
  assert.equal(P.classifyCurrency("硝酸の欠片 x1"), null);
});

test("通貨の識別: 全実データで外さない（ゲート）", () => {
  let total = 0;
  let ok = 0;
  const misses = [];
  for (const [label, text] of Object.entries(corpus)) {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const hasShard = /欠片|欠牁|カケラ|かけら/.test(line);
      const hasLp = /LP|Lp|lp/.test(line);
      const truth = hasShard && hasLp ? "both" : hasShard ? "shards" : hasLp ? "lp" : null;
      if (!truth) continue;
      total += 1;
      const got = P.classifyCurrency(line);
      if (got === truth) ok += 1;
      else misses.push(label + ": " + line);
    }
  }
  assert.ok(total > 400, "サンプルが十分な量あること（実際 " + total + " 行）");
  assert.deepEqual(misses.slice(0, 5), [], "誤判定がないこと");
  assert.equal(ok, total, "通貨識別 " + ok + "/" + total);
});

test("収支の識別: 報酬額・支出明細・残高アンカーを区別する", () => {
  assert.equal(P.classifyFlow("南部センク協会5課フィクサー　現在52LP", false).flow, "spend",
    "購入・獲得額ではなく所持品名の後ろにある現在残高は支出候補");
  assert.equal(P.classifyFlow("LP：153　現在187", false).flow, "gain",
    "報酬額から現在残高を記した行は収入");
  assert.equal(P.classifyFlow("80LP　現在127", false).flow, "gain");
  assert.equal(P.classifyFlow("刺し貫く貫通購入：現在130LP", false).flow, "spend");
  assert.equal(P.classifyFlow("現在230LP", false).flow, "balance", "残高だけの行は支出にしない");
  assert.equal(P.classifyFlow("・支出", false).flow, "spend-head");
  assert.equal(P.classifyFlow("・現在", false).flow, "balance-head");
  assert.equal(P.classifyFlow("人格抽出チケット", true).flow, "spend", "支出節の中は支出");
  assert.equal(P.classifyFlow("80LP", false).flow, "gain");
  assert.equal(P.classifyFlow("LPを欠片に変換：+11欠片 -22LP", false).flow, "review",
    "複数通貨に正負が混在する行を一方向に断定しない");
});

test("全リザルトログを行単位監査し、収入・残高・支出節を取り違えない", () => {
  const sourceSessions = P.splitSessions(corpus.log);
  const parsedSessions = P.parseResultLog(corpus.log).sessions;
  assert.ok(sourceSessions.length >= 125, "少なくとも125区分の実ログを分割できる（実際 " + sourceSessions.length + "）");
  assert.equal(parsedSessions.length, sourceSessions.length, "分割した全区分の出力が保持される");

  let auditedCurrencyRows = 0;
  let rewardBalanceRows = 0;
  let spendSectionRows = 0;
  const failures = [];

  for (let sessionIndex = 0; sessionIndex < sourceSessions.length; sessionIndex++) {
    const source = sourceSessions[sessionIndex];
    const parsed = parsedSessions[sessionIndex];
    let inSpend = false;
    let inBalance = false;
    for (const rawLine of source.lines) {
      const line = P.canonical(rawLine);
      if (!line) continue;
      const wasInSpend = inSpend;
      const expected = P.classifyFlow(rawLine, inSpend, inBalance);
      inSpend = expected.inSpend;
      inBalance = expected.inBalance;

      if (["spend-head", "balance-head", "gain-head"].includes(expected.flow)) {
        if ((parsed.records || []).some((record) => record.kind === "registration" && record.text === line)) {
          failures.push(source.title + ": 節見出しが登録候補として出力: " + line);
        }
        continue;
      }

      const detected = P.detectAmount(line);
      if (!detected.currency) continue;
      auditedCurrencyRows++;
      const found = (parsed.records || []).find((record) =>
        record.text === line && (record.kind === "currency" || record.kind === "balance")
      );
      if (!found) {
        failures.push(source.title + ": 通貨行が出力から欠落: " + line);
        continue;
      }
      if (found.flow !== expected.flow) {
        failures.push(source.title + ": 収支方向不一致 (" + expected.flow + "/" + found.flow + "): " + line);
      }
      if (expected.flow === "balance") {
        if (found.kind !== "balance" || found.needsAmount !== false) {
          failures.push(source.title + ": 残高アンカーが取引額として出力: " + line);
        }
      }
      if (wasInSpend && expected.flow === "spend") spendSectionRows++;
      if (!wasInSpend && /現在/.test(line) &&
          /^(?:(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片))\s*[:：]?\s*[+＋−-]?\s*\d|[+＋−-]?\s*\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片)))/i.test(line.split("現在")[0].trim())) {
        rewardBalanceRows++;
        if (expected.flow !== "gain") failures.push(source.title + ": 報酬額＋現在残高行を収入として保持できない: " + line);
      }
      if (expected.flow === "review") {
        if (!found.needsReview) failures.push(source.title + ": 混合方向行に要確認フラグが無い: " + line);
      }
    }
  }

  assert.ok(auditedCurrencyRows > 300, "セッション分割後の通貨候補行を十分に監査（実際 " + auditedCurrencyRows + " 行）");
  assert.ok(rewardBalanceRows > 100, "報酬額＋残高形式の大量サンプルを監査（実際 " + rewardBalanceRows + " 行）");
  assert.ok(spendSectionRows > 0, "支出節の明細を支出として残す");
  assert.deepEqual(failures.slice(0, 12), [], "コーパスの監査不一致（先頭12件）:\n" + failures.slice(0, 12).join("\n"));
});

/* --- 表記ゆらぎ ------------------------------------------------------- */

test("表記ゆらぎ: 全角数字・全角コロン・全角空白を吸収する", () => {
  assert.equal(P.classifyCurrency("ＬＰ：１５３"), "lp");
  assert.equal(P.classifyCurrency("欠片：１０４　現在３６０"), "shards");
  assert.equal(P.classifyCurrency("lp 150　現在217"), "lp");
});

test("見出しが折り返してもセッションが混線しない", () => {
  const text = [
    "【外部委託戦闘講師-切磋琢磨】",
    "LP：153　現在187",
    "【トウキョウダイバアフェイクショウ",
    "　　　　　　　　　　落下式ネクロポリス】",
    "LP95　現在147"
  ].join("\n");
  const parsed = P.parseResultLog(text);
  assert.equal(parsed.sessions.length, 2, "折り返した見出しも別セッション");
  assert.match(parsed.sessions[1].title, /トウキョウダイバア/);
});

test("セッションを検知するときのタイトルが混ざらない", () => {
  const sessions = P.splitSessions(corpus.log);
  assert.ok(sessions.length > 100, "実データで 100 以上のセッション（実際 " + sessions.length + "）");
  assert.ok(sessions.some((s) => s.title.includes("宇宙の欠片戦")), "見出しが名前として取れている");
});

/* --- 登録の種別は DB 照合で決める -------------------------------------- */

test("DB 照合: 「ミートパイ 闘志」は特異の人格として決まる", () => {
  const hit = R.resolveCandidates(idx, "ミートパイ　闘志　現在55欠片")[0];
  assert.ok(hit, "解けている");
  assert.ok(hit.kinds.some((k) => k.kind === "persona"), "人格");
  assert.equal(hit.name, "○○のミートパイ厨房長", "DB の正名に寄せている");
});

test("DB 照合: 略称は利用者が結んだ时才決まる", () => {
  const hit = R.resolveCandidates(idx, "涙剣 同期化 欠片134")[0];
  assert.ok(hit, "別名で解けている");
  assert.equal(hit.confidence, "alias");
  const bare = R.buildNameIndex(db, {});
  assert.equal(R.resolveCandidates(bare, "涙剣 同期化 欠片134").length, 0,
    "別名を登録していないときは当てない");
});

test("DB 照合: 名前の後ろに操作語が続いても届く", () => {
  const hit = R.resolveCandidates(idx, "涙剣CT2を短縮 1589LP")[0];
  assert.ok(hit, "解けている");
  assert.ok(hit.kinds.some((k) => k.kind === "persona"));
});

test("DB 照合: 複数に一致する名前は断定しない", () => {
  const hits = R.resolveCandidates(idx, "南部セブン協会5課フィクサーの人格");
  assert.equal(hits[0].name, "南部セブン協会5課フィクサー", "一意なら確定");
  const ambiguous = R.resolveCandidates(idx, "ディエーチ 同期化 欠片255");
  assert.equal(ambiguous.length, 0, "二つに分かれるときは保留");
});

test("DB 照合: DB に無い自作アイテムは unknown のまま残す", () => {
  const hits = R.resolveCandidates(idx, "東部親指ソルダードII　87");
  assert.equal(hits.length, 0, "推測で埋めない");
  const r = R.resolveText(idx, corpus.log);
  assert.ok(r.unknown.length > 0, "unknown が残ることは仕様");
});

test("登録の抽出: 実データから種別ごとの登録がが出ていること", () => {
  const r = R.resolveText(idx, corpus.log);
  const kinds = Object.keys(r.byKind);
  assert.ok(r.items.length > 50, "実データで十分な数が解ける（実際 " + r.items.length + "）");
  for (const k of kinds) assert.ok(r.byKind[k].length > 0, k + " が 1 件以上出ている");
});