import { readFileSync } from "node:fs";
import vm from "node:vm";

const IDS = [
  "6yXgGPzX1eSEboi2KSLM",
  "Eo19HoEJpsICZwLc7MN4",
  "JKvpdFc9XX1zyFlSNGhS",
  "VghtW6xXdiUVcwj9tJWA",
  "3WrnruHep4uHAsjEC45K",
  "Vm1wGHXzOR1EUg7K6MTo",
  "0ZTzjsRRGzrefPfYW6XH",
  "SgJBeS4Eh9Dg33oh1PO9",
  "QLEsIJ6kpsla5anP1BNf",
  "3NeApkrHegd1aPcksZ9o",
  "Gt1worbqMMl5rntFiMOt",
  "YTTFJyLsOyk8OBoPCP3R",
  "3JIdhCPatk2URoQZ2btx",
  "Qqu7wAwYUQ708c3ZeV80",
  "K63ITKrY1mOv0LvnwPL7",
  "tgH3jvde0uADt4uN20hG",
  "sYGCnxe0huoNs7cTB7o2",
  "BDIebwAJetQ0voXwg4VW",
  "0YChzrC5bLzlQlTrpgWd",
  "5Jk7ua60nxSzAgPI0Cku",
  "WCJipGMyHoD0BBHWQ6Ai",
  "2OpH8W37Dz9yZKBJwWZ0",
  "ZCoCHtzL5Z5dlF4mviHO",
  "lVB4Upekw3cqmxV91MbJ",
  "l0BTIu7Fo6nTvsjXI7ce",
  "yCvLAwYKJzGGVBJm0mV3",
  "NLNxSeQBDv7838Wpp8HV",
  "7Tuvb2uFodd2m9NS5DsZ",
  "j9mMpTHv3urenH3SlXyg",
  "hUVIkdP3KkmsT0rohd2I",
  "BiWGPzoTbVlS1l7Fjv11",
  "MZYCULddZmTt4dFPxTY5",
  "CoNmGysMDUdTP6d4DRti",
  "dH6KJ6w47pf6m4PyDO6a",
  "A8DyKMSCbfuzw50EFcXd",
  "CBEZgzRztoUfSYj7XRMv",
  "2eq3S2TIWJGcxdHqiqOv",
  "T1C4zZCrvwRfQBllBBO6",
  "hLXvnYX7gCME0YnmShVM",
  "WZDvzq8VWzkNdA3T2D81",
  "W4z5OJMTZVHkGopWBVMu",
  "oF2Sgd24p3Puz65eF8t0",
  "Zyq6Upx3oN5bTsAodlsK",
  "Y074n3mIbLSW7QecJCCU",
  "QW0yeyooSsj68EWBEALs",
  "y2yV6dZsWQut2Eg8z83s",
  "2gbYWOr0UuRDqN5eoEGi",
  "46dxXF5Rf12NOL0Ghs0u",
  "P0vi78CNraB3mjfnFN8g",
  "6sqzAInx2oZv3istnkG3",
  "UQ0ey5rwjSbqrQXkxJMS",
  "dQzD5vreZx24MJQvZkHJ",
  "mxe72kbOHnhM11zzqLgo",
  "pJxz8aNlya8WXzv7HXeb",
  "ylakQo9mHZqZEaUwrSAs",
  "awpYr2DKuai45MO4JhJQ",
  "TYKf9PdpE3fD8AySnwhL",
  "LXZtUMN1jxL9UPkeTVU4",
  "ei7JLzPKwi5CAOvjCjNf",
  "LBFbOr1CsUUmOAMWfwFH",
  "yvks9nyfnWYvyNzxYsmR",
  "G9VHrQKqvrS0Qpfa0zFi",
  "LJxW0NjFZrKbojMygAIo",
  "SOZk9o51iFTrD2JFkb4R",
  "t07aok44HjPIwb1KFzMD",
  "w3pcF8D8W04PqjzTY4gQ",
  "MDgyeCqXyFvMQ0yq86Eb",
  "QC1EyGtLMJRiONByKjUh",
  "TWVv3gftDRrBtKuZNNyU",
  "9jkD3DzUK4RSYLhlT7W4",
  "FQafcwfhbIuBRrH8dzis",
  "Z3GFDCOt0wgXCoKBt9QS",
  "2he5tT5AtV9VndIK6wpA",
  "P337HtDK2XnuAKSz4bOY",
  "z6RLDj3XRG6Ph1Y8h1KL",
  "0XJBv6pv07L36RiS81Sf",
  "XYMwOihLlr3SR0H9I8QR",
  "s90Yj5WOKVwI8lMv3dsH",
  "wTAr3BcMY3fdvOtXq1hO",
  "1ogAT2wiVCogaLyDJqNV",
  "aKFdGC4qa2zw2mTzs2iz",
  "k7rxQ2RpEpUpCFae1Q2q",
  "XfzopdmCDs5YgBcwPwhQ",
  "aNXkpi8vHzz3YP6PHMfo",
  "2TCj9uyg3m8AL4vRZW0E",
  "UK1PfFRia5CsSBpPBClx",
  "VqGLXVWoIhp0atfOXdfp",
  "hbnGsigZQiUDIp6GOk5V",
  "nE9Gn08QcCfFjJludti5",
  "JMCjtaYflOLXC4IW08VN",
  "NE7JQ9XzR4T4JZqtHRDM",
  "x17fC3LJPIYCOAN0L1TH",
  "Fwh5YvXjqswWRRE2cGiB",
  "VS0OFzHXHR3LoA7GPNSm",
  "UgG5zxvnNZTAu4jPNLn7",
  "28e2XMEgs6kbTvidxsOQ",
  "2ysoaJ21scYYNpjgstzZ",
  "DPacJEJvCc7wNOnHZXyC"
];
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

// A privacy-preserving lexical view used only to diagnose unflagged money-token rows.
// It deliberately omits item, character, player, and scenario names.
const safeFinancialShapeTokens = /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか|E\\.?G\\.?O|エゴ|人格|チケット|チケ|抽出|ガチャ|報酬|収入|獲得|入手|取得|付与|支給|補填|受領|被り|重複|消費|支出|支払|購入|買っ|使用|行使|変換|換算|現在|現座|残高|所持|保有|残り|以下|以上|以内|未満|条件|達成|未達|使用済|消費済|購入済|クリア|撤退|の|を|が|は|で|に|と|又は|または|あるいは|結果|：|:|→|⇒|=|＝|\\d[\\d,]*(?:\\.\\d+)?|[+＋\\-−])/gi;
const safeFinancialShape = (line) => (String(line || "").match(safeFinancialShapeTokens) || []).join(" ").slice(0, 240);
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
        const lineCoverage = (parsed.financialCoverage || [])
          .filter((entry) => String(entry?.line || "").trim() === line);
        const hasAccountedCoverage = lineCoverage.some((entry) =>
          ["matched", "reviewed-by-parser-reason", "source-reviewed", "noncurrency-effect-recorded"].includes(entry.status));
        const hasLineReason = (parsed.reasons || []).some((entry) => String(entry?.line || "").trim() === line);
        const hasLineAudit = (parsed.sourceAudits || []).some((entry) => entry && (
          String(entry.line || "").trim() === line ||
          (Array.isArray(entry.relatedLines) && entry.relatedLines.some((item) => String(item?.line || "").trim() === line))
        ));
        // Do not call a row "unwarned" when per-line coverage or an explicit review reason already exists.
        // Multi-purchase rows may store one spend per item, so raw-line equality alone is insufficient.
        if (hasSpendRecord || hasAccountedCoverage || hasLineReason || hasLineAudit) continue;
        if (altOrCondition.test(line) || !clearReward.test(line)) {
          const matchingCoverage = (parsed.financialCoverage || [])
            .filter((item) => String(item?.line || "").trim() === line)
            .map((item) => ({
              status: String(item.status || "missing-status"),
              section: String(item.section || "unknown"),
              code: String(item.code || ""),
              parserReasonCount: Number(item.parserReasonCount) || 0,
              expected: item.expected || null,
              detected: item.detected || null,
              expectedFlows: item.expectedFlows || null,
              detectedFlows: item.detectedFlows || null
            }));
          const parsedSpendFacts = (parsed.spends || []).map((spend) => ({
            lp: Number(spend.lp) || 0,
            shards: Number(spend.shards) || 0,
            rawShape: safeFinancialShape(spend.raw || spend.name || "")
          }));
          const parsedTicketFacts = (parsed.ticketSpends || []).map((ticket) => ({
            kind: String(ticket.kind || "unknown"),
            count: Number(ticket.count) || 0,
            rawShape: safeFinancialShape(ticket.raw || "")
          }));
          const parsedIncome = { lp: Number(parsed.income?.lp) || 0, shards: Number(parsed.income?.shards) || 0 };
          const relatedReasons = (parsed.reasons || [])
            .filter((reason) => String(reason.line || "").trim() === line)
            .map((reason) => ({
              kind: classifyReason(reason.reason),
              reasonShape: safeFinancialShape(reason.reason)
            }));
          const relatedAuditCodes = (parsed.sourceAudits || [])
            .filter((entry) => entry && (
              String(entry.line || "").trim() === line ||
              (Array.isArray(entry.relatedLines) && entry.relatedLines.some((item) => String(item?.line || "").trim() === line))
            ))
            .map((entry) => ({ code: String(entry.code || "unknown"), severity: String(entry.severity || "unknown") }));
          out.push({
            id: docId, row: index + 1, title: String(row?.name || "無題"),
            currency, amounts: matches, line, shape: safeFinancialShape(line),
            matchingCoverage, parsedSpendFacts, parsedTicketFacts, parsedIncome,
            relatedReasons, relatedAuditCodes
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
    const coverage = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
    const coverageStatusCounts = {};
    for (const item of coverage) {
      const status = String(item?.status || "missing-status");
      coverageStatusCounts[status] = (coverageStatusCounts[status] || 0) + 1;
    }
    const sourceAudits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
    const sourceAuditSeverityCounts = {};
    for (const item of sourceAudits) {
      const severity = String(item?.severity || "unknown");
      sourceAuditSeverityCounts[severity] = (sourceAuditSeverityCounts[severity] || 0) + 1;
    }
    const currencyDiscrepancyCount = Array.isArray(parsed.currencyDiscrepancies) ? parsed.currencyDiscrepancies.length : 0;
    const safeTokens = /(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|けっか|欠け片|E\.?G\.?O|エゴ|人格|チケット|チケ|抽出|ガチャ|報酬|収入|獲得|入手|取得|付与|支給|補填|受領|被り|重複|消費|支出|支払|購入|買っ|使用|行使|変換|換算|現在|現座|残高|所持|保有|残り|以下|以上|以内|未満|条件|達成|未達|使用済|消費済|購入済|クリア|撤退|入手|破片|自我|の|を|が|は|で|に|と|又は|または|あるいは|結果|報酬|：|:|→|⇒|=|＝|\d[\d,]*(?:\.\d+)?|[+＋\-−])/gi;
    const safeShape = (value) => (String(value || "").match(safeTokens) || []).join(" ").slice(0, 320);
    const coverageFindings = coverage.filter((item) => ["mismatch", "direction-review", "unresolved"].includes(String(item?.status || ""))).map((item) => ({
      lineIndex: item.lineIndex,
      status: item.status,
      section: item.section,
      expected: item.expected,
      detected: item.detected,
      expectedFlows: item.expectedFlows,
      detectedFlows: item.detectedFlows,
      parserReasonCount: item.parserReasonCount,
      sourceFinding: Boolean(item.sourceFinding),
      sourceAuditCodes: sourceAudits.filter((entry) => entry && (entry.lineIndex === item.lineIndex || entry.relatedLineIndex === item.lineIndex)).map((entry) => String(entry.code || "unknown")),
      sourceShape: safeShape(item.line)
    }));
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
      baselineReviewKinds: baseReviewKinds,
      financialCoverageCount: coverage.length,
      financialCoverageStatusCounts: coverageStatusCounts,
      sourceAuditCount: sourceAudits.length,
      sourceAuditSeverityCounts,
      currencyDiscrepancyCount,
      coverageFindings
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
  const reviewRows = rows.filter((row) => row.reviewCount > 0);
  const changedRows = rows.filter((row) => row.amountsChanged);
  const typeCounts = {};
  for (const row of rows) for (const kind of row.reviewKinds) typeCounts[kind] = (typeCounts[kind] || 0) + 1;
  const financialCoverageStatusCounts = {};
  const sourceAuditSeverityCounts = {};
  let financialCoverageRows = 0;
  let sourceAuditCount = 0;
  let currencyDiscrepancyCount = 0;
  for (const row of rows) {
    financialCoverageRows += row.financialCoverageCount || 0;
    sourceAuditCount += row.sourceAuditCount || 0;
    currencyDiscrepancyCount += row.currencyDiscrepancyCount || 0;
    for (const [key, count] of Object.entries(row.financialCoverageStatusCounts || {})) {
      financialCoverageStatusCounts[key] = (financialCoverageStatusCounts[key] || 0) + count;
    }
    for (const [key, count] of Object.entries(row.sourceAuditSeverityCounts || {})) {
      sourceAuditSeverityCounts[key] = (sourceAuditSeverityCounts[key] || 0) + count;
    }
  }
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
    financialCoverage: { rows: financialCoverageRows, statusCounts: financialCoverageStatusCounts, sourceAuditCount, sourceAuditSeverityCounts, currencyDiscrepancyCount },
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
      message: balance.message || ""
    },
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
const safeDocumentSummaries = successes.map((doc) => ({
  id: doc.id,
  collection: doc.collection,
  scenarioRows: doc.scenarioRows,
  rowsWithMemo: doc.rowsWithMemo,
  rowsWithCurrentMarker: doc.rowsWithCurrentMarker,
  rowsNeedingReview: doc.rowsNeedingReview,
  reviewTypeCounts: doc.reviewTypeCounts,
  rowsWithChangedAmounts: doc.rowsWithChangedAmounts,
  financialCoverage: doc.financialCoverage,
  unwarnedCurrencyLineCount: doc.unwarnedCurrencyLineCount,
  totals: doc.totals,
  declaredBalance: doc.declaredBalance,
  balanceCheck: {
    checked: doc.balanceCheck.checked,
    ok: doc.balanceCheck.ok,
    historyNetLp: doc.balanceCheck.historyNetLp,
    historyNetShards: doc.balanceCheck.historyNetShards
  },
  changedRows: doc.rows.filter((row) => row.amountsChanged).map((row) => ({
    row: row.index,
    before: { incomeLp: row.baselineIncomeLp, incomeShards: row.baselineIncomeShards, spendLp: row.baselineSpendLp, spendShards: row.baselineSpendShards },
    after: { incomeLp: row.incomeLp, incomeShards: row.incomeShards, spendLp: row.spendLp, spendShards: row.spendShards },
    reasons: row.reviewKinds,
    baselineReasons: row.baselineReviewKinds
  })),
  coverageFindings: doc.rows.flatMap((row) => (row.coverageFindings || []).map((finding) => ({ scenarioRow: row.index, ...finding }))),
  reviewRows: doc.rows.filter((row) => row.reviewCount > 0).map((row) => ({
    row: row.index,
    reviewKinds: row.reviewKinds,
    amounts: { incomeLp: row.incomeLp, incomeShards: row.incomeShards, spendLp: row.spendLp, spendShards: row.spendShards },
    coverageCount: row.financialCoverageCount,
    coverageStatusCounts: row.financialCoverageStatusCounts,
    sourceAuditCount: row.sourceAuditCount,
    sourceAuditSeverityCounts: row.sourceAuditSeverityCounts
  }))
}));
const perDocument = successes.map((doc, index) => ({
  documentOrdinal: index + 1,
  scenarioRows: doc.scenarioRows,
  rowsWithMemo: doc.rowsWithMemo,
  rowsWithCurrentMarker: doc.rowsWithCurrentMarker,
  rowsNeedingReview: doc.rowsNeedingReview,
  reviewCategories: doc.reviewTypeCounts,
  rowsWithChangedAmounts: doc.rowsWithChangedAmounts,
  financialCoverage: doc.financialCoverage,
  unwarnedCurrencyLineCount: doc.unwarnedCurrencyLineCount,
  totals: doc.totals,
  declaredBalance: doc.declaredBalance,
  balanceCheck: {
    checked: doc.balanceCheck.checked,
    ok: doc.balanceCheck.ok,
    historyNetLp: doc.balanceCheck.historyNetLp,
    historyNetShards: doc.balanceCheck.historyNetShards
  },
  changedRows: doc.rows.filter((row) => row.amountsChanged).map((row) => ({
    scenarioRow: row.index,
    before: { incomeLp: row.baselineIncomeLp, incomeShards: row.baselineIncomeShards, spendLp: row.baselineSpendLp, spendShards: row.baselineSpendShards },
    after: { incomeLp: row.incomeLp, incomeShards: row.incomeShards, spendLp: row.spendLp, spendShards: row.spendShards },
    reviewCategories: row.reviewKinds,
    baselineReviewCategories: row.baselineReviewKinds,
    findings: (row.coverageFindings || []).map((finding) => ({
      lineIndex: finding.lineIndex, status: finding.status, section: finding.section,
      expected: finding.expected, detected: finding.detected,
      expectedFlows: finding.expectedFlows, detectedFlows: finding.detectedFlows,
      parserReasonCount: finding.parserReasonCount, sourceFinding: finding.sourceFinding,
      sourceAuditCodes: finding.sourceAuditCodes
    }))
  }))
}));
const rowDeltas = successes.flatMap((doc, documentIndex) => doc.rows
  .filter((row) => row.amountsChanged)
  .map((row) => ({
    documentOrdinal: documentIndex + 1,
    scenarioRow: row.index,
    before: { incomeLp: row.baselineIncomeLp, incomeShards: row.baselineIncomeShards, spendLp: row.baselineSpendLp, spendShards: row.baselineSpendShards },
    after: { incomeLp: row.incomeLp, incomeShards: row.incomeShards, spendLp: row.spendLp, spendShards: row.spendShards },
    reviewCategories: row.reviewKinds,
    baselineReviewCategories: row.baselineReviewKinds,
    findings: (row.coverageFindings || []).map((finding) => ({
      lineIndex: finding.lineIndex, status: finding.status, section: finding.section,
      expected: finding.expected, detected: finding.detected,
      expectedFlows: finding.expectedFlows, detectedFlows: finding.detectedFlows,
      parserReasonCount: finding.parserReasonCount, sourceFinding: finding.sourceFinding,
      sourceAuditCodes: finding.sourceAuditCodes
    }))
  })));
const allFindings = perDocument.flatMap((doc) => doc.changedRows.flatMap((row) =>
  (row.findings || []).map((finding) => ({ documentOrdinal: doc.documentOrdinal, scenarioRow: row.scenarioRow, ...finding }))));
const failureStatusCounts = failures.reduce((out, item) => {
  const match = String(item.error || "").match(/(?:characters|personas):\s*(\d{3})/);
  const status = match ? match[1] : "unknown";
  out[status] = (out[status] || 0) + 1;
  return out;
}, {});
const safeAudit = {
  rawMemoOrTitleEmitted: false,
  requested: IDS.length,
  uniqueIds: new Set(IDS).size,
  fetched: successes.length,
  failed: failures.length,
  failureStatusCounts,
  scenarioRows: allRows.length,
  rowsWithMemo: allRows.filter((row) => row.hasMemo).length,
  rowsNeedingReview: allRows.filter((row) => row.reviewCount > 0).length,
  documentsWithReviewRows: successes.filter((doc) => doc.rowsNeedingReview > 0).length,
  parserAmountsChangedRows: allRows.filter((row) => row.amountsChanged).length,
  documentsWithParserAmountChanges: successes.filter((doc) => doc.rowsWithChangedAmounts > 0).length,
  baselineTotals: summary.baselineTotals,
  totals: summary.totals,
  totalDelta: Object.fromEntries(Object.keys(summary.totals).map((key) => [key, summary.totals[key] - summary.baselineTotals[key]])),
  reviewCategories: summary.reviewKinds,
  balanceChecks: summary.balanceChecks,
  financialCoverage: {
    coverageRows: successes.reduce((n, doc) => n + doc.financialCoverage.rows, 0),
    statusCounts: successes.reduce((out, doc) => {
      for (const [key, count] of Object.entries(doc.financialCoverage.statusCounts)) out[key] = (out[key] || 0) + count;
      return out;
    }, {}),
    sourceAuditCount: successes.reduce((n, doc) => n + doc.financialCoverage.sourceAuditCount, 0),
    sourceAuditSeverityCounts: successes.reduce((out, doc) => {
      for (const [key, count] of Object.entries(doc.financialCoverage.sourceAuditSeverityCounts)) out[key] = (out[key] || 0) + count;
      return out;
    }, {}),
    currencyDiscrepancyCount: successes.reduce((n, doc) => n + doc.financialCoverage.currencyDiscrepancyCount, 0)
  },
  unwarnedCurrencyLineCount: allUnwarnedCurrencyLines.length,
  unwarnedCurrencyCounts: allUnwarnedCurrencyLines.reduce((out, row) => {
    out[row.currency] = (out[row.currency] || 0) + 1;
    return out;
  }, {}),
  unwarnedCurrencyRows: allUnwarnedCurrencyLines.map((row) => ({
    documentOrdinal: Math.max(1, IDS.indexOf(row.id) + 1),
    scenarioRow: row.row,
    currency: row.currency,
    tokenCount: row.amounts.length,
    coverageStatuses: (row.matchingCoverage || []).map((item) => item.status),
    parsedSpendAmounts: (row.parsedSpendFacts || []).map((item) => ({ lp: item.lp, shards: item.shards })),
    parsedTicketKinds: (row.parsedTicketFacts || []).map((item) => ({ kind: item.kind, count: item.count })),
    parsedIncome: row.parsedIncome,
    reviewCategories: (row.relatedReasons || []).map((item) => item.kind),
    auditCategories: (row.relatedAuditCodes || []).map((item) => ({ code: item.code, severity: item.severity }))
  })),
  perDocument,
  changedRows: rowDeltas,
  coverageFindings: allFindings
};
const safeJson = JSON.stringify(safeAudit);
if (/"(?:id|title|memo|sourceTitle|sourceMemo|line|shape|rawShape|reasonDetails)"\s*:/.test(safeJson)) {
  throw new Error("Sanitized audit output contains a forbidden source field");
}
console.log("GARASUMADO_LIVE_AUDIT_BEGIN");
console.log(JSON.stringify(safeAudit));
console.log("GARASUMADO_LIVE_AUDIT_END");
