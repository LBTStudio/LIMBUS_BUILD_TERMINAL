import { readFileSync } from "node:fs";
import vm from "node:vm";

const IDS = ["3JIdhCPatk2URoQZ2btx"];
const parserSource = readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8");
const rosterSource = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");
const baseParserResponse = await fetch("https://raw.githubusercontent.com/LBTStudio/LIMBUS_BUILD_TERMINAL/3f326475c3aed31da08a73852c3c371207c2c8e0/js/garasumado-memo-parse.js");
if (!baseParserResponse.ok) throw new Error("Unable to fetch baseline parser: " + baseParserResponse.status);
const baselineParserSource = await baseParserResponse.text();

const makeContext = () => {
  const value = { window: {}, console, URL, fetch, setTimeout, clearTimeout, module: { exports: {} } };
  value.globalThis = value;
  vm.createContext(value);
  return value;
};
const context = makeContext();
const baselineContext = makeContext();
vm.runInContext(parserSource, context, { filename: "garasumado-memo-parse.js" });
vm.runInContext(baselineParserSource, baselineContext, { filename: "baseline-garasumado-memo-parse.js" });
vm.runInContext(rosterSource, context, { filename: "garasumado-roster-import.js" });

const memoApi = context.window.LBT_garaMemo;
const baselineMemoApi = baselineContext.window.LBT_garaMemo;
const api = context.window.LBT_garasumado;
if (!memoApi?.parseMemo || !api?.fetchGarasumadoDocument || !api?.buildManifest || !api?.reconcileBalance) {
  throw new Error("硝子窓の読み取り・解析APIが初期化できません");
}

const classifyReason = (reason) => {
  const text = String(reason || "");
  if (/現座/.test(text)) return "typo-current";
  if (/数値が同じ行に複数/.test(text)) return "ambiguous-same-currency";
  if (/支出金額が読み取れない|金額が読み取れない/.test(text)) return "unreadable-amount";
  if (/チケット|抽出/.test(text)) return "ticket-ambiguous";
  if (/安全整数/.test(text)) return "unsafe-integer";
  if (/変換行|換算行/.test(text)) return "conversion-review";
  return "other-review";
};
const fieldOf = (currency, kind) => (kind === "income" ? (currency === "lp" ? "incomeLp" : "incomeShards")
  : kind === "spend" ? (currency === "lp" ? "spendLp" : "spendShards")
    : (currency === "lp" ? "netLp" : "netShards"));
const total = (rows, currency) => rows.reduce((sum, row) => sum + (Number(row[fieldOf(currency, "net")]) || 0), 0);
const sumIncome = (rows, currency) => rows.reduce((sum, row) => sum + (Number(row[fieldOf(currency, "income")]) || 0), 0);
const sumSpend = (rows, currency) => rows.reduce((sum, row) => sum + (Number(row[fieldOf(currency, "spend")]) || 0), 0);

/* Find lines with multiple same-currency numeric tokens that escaped the parser warning.
   Keep only review candidates: alternatives/conditions, price-like text, or no clear reward context. */
function scanUnwarnedCurrencyLines(history, parsedRows, docId) {
  const out = [];
  const tokenPattern = {
    lp: /(?:[+-]?[0-9][0-9,]*\s*(?:LP|ＬＰ)|(?:LP|ＬＰ)\s*[：:]?\s*[+-]?[0-9][0-9,]*)/gi,
    shards: /(?:[+-]?[0-9][0-9,]*\s*(?:欠片|かけら|欠けら|カケラ|けっか)|(?:欠片|かけら|欠けら|カケラ|けっか)\s*[：:]?\s*[+-]?[0-9][0-9,]*)/g
  };
  const altOrCondition = /又は|または|あるいは|いずれか|どちらか|\bor\b|以下|以上|以内|未満|まで|買える|価格|値段|費用|必要|購入|消費|支払/;
  const clearReward = /獲得|入手|報酬|補填|支給|受領|被り|重複|ガチャ結果|抽選結果|合計|合算|小計|総計/;
  history.forEach((row, index) => {
    const memo = String(row?.memo || "");
    const parsed = memoApi.parseMemo(memo);
    for (const sourceLine of memo.split(/\r?\n/)) {
      const line = sourceLine.trim();
      if (!line) continue;
      if (/[+＋=＝×*＊]/.test(line) || /現在|残高|所持|保有/.test(line)) continue;
      const warned = (parsed.reasons || []).some((r) => String(r.line || "").trim() === line
        && /数値が同じ行に複数|金額が安全整数/.test(String(r.reason || "")));
      if (warned) continue;
      for (const currency of ["lp", "shards"]) {
        const matches = [...line.matchAll(tokenPattern[currency])].map((m) => m[0]);
        if (matches.length < 2) continue;
        const hasSpendRecord = (parsed.spends || []).some((spend) => String(spend.raw || spend.name || "").trim() === line
          && (Number(spend.lp) > 0 || Number(spend.shards) > 0));
        if (hasSpendRecord) continue;
        if (altOrCondition.test(line) || !clearReward.test(line)) {
          out.push({
            id: docId, row: index + 1, title: String(row?.name || "無題"),
            currency, amounts: matches, line
          });
        }
      }
    }
  });
  return out;
}

async function inspect(id) {
  const url = "https://lbt-garasumado.vercel.app/view/" + id;
  let fetched;
  try {
    fetched = await api.fetchGarasumadoDocument(url);
  } catch (error) {
    return { id, ok: false, error: String(error?.message || error) };
  }
  if (!fetched?.ok || !fetched.doc) {
    return { id, ok: false, error: String(fetched?.error || "fetch-failed") };
  }

  const history = Array.isArray(fetched.doc.scenarioHistory) ? fetched.doc.scenarioHistory : [];
  const rows = history.map((row, index) => {
    const memo = String(row?.memo || "");
    const parsed = memoApi.parseMemo(memo);
    const baseline = baselineMemoApi.parseMemo(memo);
    const sumSpendLp = (value) => value.spends.reduce((n, spend) => n + (Number(spend.lp) || 0), 0);
    const sumSpendShards = (value) => value.spends.reduce((n, spend) => n + (Number(spend.shards) || 0), 0);
    const kinds = [...new Set((parsed.reasons || []).map((r) => classifyReason(r.reason)))];
    const baseReviewKinds = [...new Set((baseline.reasons || []).map((r) => classifyReason(r.reason)))];
    const rowResult = {
      index: index + 1,
      sourceTitle: String(row?.name || "無題"),
      sourceMemo: memo,
      parsedReasons: parsed.reasons || [],
      baselineReasons: baseline.reasons || [],
      hasMemo: Boolean(memo.trim()),
      currentMarkerCount: (memo.match(/現在|現座/g) || []).length,
      incomeLp: parsed.income.lp,
      incomeShards: parsed.income.shards,
      spendLp: sumSpendLp(parsed),
      spendShards: sumSpendShards(parsed),
      netLp: parsed.income.lp - sumSpendLp(parsed),
      netShards: parsed.income.shards - sumSpendShards(parsed),
      reviewCount: (parsed.reasons || []).length,
      reviewKinds: kinds,
      baselineIncomeLp: baseline.income.lp,
      baselineIncomeShards: baseline.income.shards,
      baselineSpendLp: sumSpendLp(baseline),
      baselineSpendShards: sumSpendShards(baseline),
      baselineReviewCount: (baseline.reasons || []).length,
      baselineReviewKinds: baseReviewKinds
    };
    rowResult.amountsChanged = rowResult.incomeLp !== rowResult.baselineIncomeLp
      || rowResult.incomeShards !== rowResult.baselineIncomeShards
      || rowResult.spendLp !== rowResult.baselineSpendLp
      || rowResult.spendShards !== rowResult.baselineSpendShards;
    return rowResult;
  });
  const unwarnedCurrencyLines = scanUnwarnedCurrencyLines(history, rows, id);
  const manifest = api.buildManifest(fetched.doc, { resolve: () => null });
  const balance = api.reconcileBalance(manifest, fetched.doc);
  const purchaseHistory = Array.isArray(manifest.purchaseHistory) ? manifest.purchaseHistory : [];
  const purchaseHistoryTotals = purchaseHistory.reduce((sum, row) => ({
    lp: sum.lp + (Number(row && row.lp) || 0),
    shards: sum.shards + (Number(row && row.shards) || 0)
  }), { lp: 0, shards: 0 });
  const reviewRows = rows.filter((row) => row.reviewCount > 0);
  const changedRows = rows.filter((row) => row.amountsChanged);
  const typeCounts = {};
  for (const row of rows) for (const kind of row.reviewKinds) typeCounts[kind] = (typeCounts[kind] || 0) + 1;
  const fieldShapes = {};
  for (const row of history) {
    const shape = Object.keys(row || {}).sort().join(",");
    fieldShapes[shape] = (fieldShapes[shape] || 0) + 1;
  }

  return {
    id,
    ok: true,
    collection: fetched.collection,
    updated: fetched.updateTime || null,
    plNamePresent: Boolean(String(fetched.doc.plName || "").trim()),
    characterNamePresent: Boolean(String(fetched.doc.name || "").trim()),
    scenarioRows: rows.length,
    rowsWithMemo: rows.filter((row) => row.hasMemo).length,
    rowsWithCurrentMarker: rows.filter((row) => row.currentMarkerCount > 0).length,
    rowsNeedingReview: reviewRows.length,
    reviewTypeCounts: typeCounts,
    rowsWithChangedAmounts: changedRows.length,
    unwarnedCurrencyLineCount: unwarnedCurrencyLines.length,
    unwarnedCurrencyLines,
    fieldShapes,
    totals: {
      incomeLp: sumIncome(rows, "lp"),
      incomeShards: sumIncome(rows, "shards"),
      spendLp: sumSpend(rows, "lp"),
      spendShards: sumSpend(rows, "shards"),
      netLp: total(rows, "lp"),
      netShards: total(rows, "shards")
    },
    declaredBalance: {
      lp: balance.shownLp,
      shards: balance.shownShards
    },
    balanceCheck: {
      checked: balance.checked,
      ok: balance.ok,
      openingLp: balance.openingLp,
      openingShards: balance.openingShards,
      computedLp: balance.computedLp,
      computedShards: balance.computedShards,
      historyNetLp: balance.historyNetLp,
      historyNetShards: balance.historyNetShards,
      impliedOpeningLp: balance.impliedOpeningLp,
      impliedOpeningShards: balance.impliedOpeningShards,
      message: balance.message || ""
    },
    purchaseHistoryCount: purchaseHistory.length,
    purchaseHistoryTotals,
    purchaseHistory: purchaseHistory.map((row) => ({
      name: String(row?.name || ""),
      lp: Number(row?.lp) || 0,
      shards: Number(row?.shards) || 0,
      raw: String(row?.raw || ""),
      reason: String(row?.reason || ""),
      importSourceKey: String(row?.importSourceKey || "")
    })),
    // Expose raw source only for rows that need review or whose extracted amounts changed.
    rows: rows.map((row) => {
      const { sourceTitle, sourceMemo, parsedReasons, baselineReasons, ...summaryRow } = row;
      return row.reviewCount > 0 || row.amountsChanged || row.currentMarkerCount > 0
        ? { ...summaryRow, title: sourceTitle, memo: sourceMemo, reasons: parsedReasons, baselineReasons }
        : summaryRow;
    })
  };
}

const results = [];
for (let i = 0; i < IDS.length; i += 4) {
  const group = IDS.slice(i, i + 4);
  results.push(...await Promise.all(group.map(inspect)));
}
const successes = results.filter((x) => x.ok);
const failures = results.filter((x) => !x.ok);
const allRows = successes.flatMap((x) => x.rows || []);
const reviewKinds = {};
for (const item of successes) {
  for (const [kind, count] of Object.entries(item.reviewTypeCounts || {})) {
    reviewKinds[kind] = (reviewKinds[kind] || 0) + count;
  }
}
const allUnwarnedCurrencyLines = successes.flatMap((doc) => doc.unwarnedCurrencyLines || []);
const summary = {
  unwarnedCurrencyLineCount: allUnwarnedCurrencyLines.length,
  unwarnedCurrencyCounts: allUnwarnedCurrencyLines.reduce((out, row) => {
    out[row.currency] = (out[row.currency] || 0) + 1;
    return out;
  }, {}),
  unwarnedCurrencyLines: allUnwarnedCurrencyLines.slice(0, 300),
  requested: IDS.length,
  uniqueIds: new Set(IDS).size,
  fetched: successes.length,
  failed: failures.length,
  documentsWithReviewRows: successes.filter((x) => x.rowsNeedingReview > 0).length,
  scenarioRows: allRows.length,
  rowsWithMemo: allRows.filter((x) => x.hasMemo).length,
  rowsNeedingReview: allRows.filter((x) => x.reviewCount > 0).length,
  parserAmountsChangedRows: allRows.filter((x) => x.amountsChanged).length,
  documentsWithParserAmountChanges: successes.filter((x) => x.rowsWithChangedAmounts > 0).length,
  baselineTotals: {
    incomeLp: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineIncomeLp,0),0),
    incomeShards: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineIncomeShards,0),0),
    spendLp: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineSpendLp,0),0),
    spendShards: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineSpendShards,0),0),
    netLp: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineIncomeLp-r.baselineSpendLp,0),0),
    netShards: successes.reduce((t,x)=>t+x.rows.reduce((n,r)=>n+r.baselineIncomeShards-r.baselineSpendShards,0),0)
  },
  reviewKinds,
  balanceChecks: {
    checked: successes.filter((x) => x.balanceCheck.checked).length,
    mismatched: successes.filter((x) => x.balanceCheck.checked && !x.balanceCheck.ok).length,
    uncheckedWithManualReference: successes.filter((x) => !x.balanceCheck.checked && x.balanceCheck && x.declaredBalance && (x.declaredBalance.lp !== null || x.declaredBalance.shards !== null)).length
  },
  totals: successes.reduce((t, x) => {
    for (const k of Object.keys(t)) t[k] += x.totals[k];
    return t;
  }, {incomeLp:0,incomeShards:0,spendLp:0,spendShards:0,netLp:0,netShards:0}),
  failures,
  parserChanges: successes.filter(x=>x.rowsWithChangedAmounts>0).map(x=>({
    id:x.id,
    changedRows:x.rows.filter(r=>r.amountsChanged).map(r=>({
      row:r.index,
      title:r.sourceTitle,
      memo:r.sourceMemo,
      before:{incomeLp:r.baselineIncomeLp,incomeShards:r.baselineIncomeShards,spendLp:r.baselineSpendLp,spendShards:r.baselineSpendShards},
      after:{incomeLp:r.incomeLp,incomeShards:r.incomeShards,spendLp:r.spendLp,spendShards:r.spendShards},
      reasons:r.reviewKinds,
      reasonDetails:r.parsedReasons,
      baselineReviewKinds:r.baselineReviewKinds
    }))
  })),
  documents: results
};
console.log("GARASUMADO_LIVE_AUDIT_BEGIN");
console.log(JSON.stringify(summary));
console.log("GARASUMADO_LIVE_AUDIT_END");
