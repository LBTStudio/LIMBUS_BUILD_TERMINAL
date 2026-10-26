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
const baseParserResponse = await fetch("https://raw.githubusercontent.com/LBTStudio/LIMBUS_BUILD_TERMINAL/main/js/garasumado-memo-parse.js");
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
  const manifest = api.buildManifest(fetched.doc, { resolve: () => null });
  const balance = api.reconcileBalance(manifest, fetched.doc);
  const purchaseRows = Array.isArray(manifest.purchaseHistory) ? manifest.purchaseHistory : [];
  const purchaseTotals = purchaseRows.reduce((sum, row) => ({
    lp: sum.lp + (Number(row.lp) || 0),
    shards: sum.shards + (Number(row.shards) || 0)
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
    fieldShapes,
    totals: {
      incomeLp: sumIncome(rows, "lp"),
      incomeShards: sumIncome(rows, "shards"),
      scenarioSpendLp: sumSpend(rows, "lp"),
      scenarioSpendShards: sumSpend(rows, "shards"),
      purchaseHistoryRows: purchaseRows.length,
      purchaseHistorySpendLp: purchaseTotals.lp,
      purchaseHistorySpendShards: purchaseTotals.shards,
      spendLp: sumSpend(rows, "lp") + purchaseTotals.lp,
      spendShards: sumSpend(rows, "shards") + purchaseTotals.shards,
      netLp: sumIncome(rows, "lp") - sumSpend(rows, "lp") - purchaseTotals.lp,
      netShards: sumIncome(rows, "shards") - sumSpend(rows, "shards") - purchaseTotals.shards
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
    // Keep line-level results but deliberately omit record titles and raw memo text.
    rows
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
const summary = {
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
    for (const k of ["incomeLp","incomeShards","scenarioSpendLp","scenarioSpendShards","purchaseHistoryRows","purchaseHistorySpendLp","purchaseHistorySpendShards","spendLp","spendShards","netLp","netShards"]) t[k] += x.totals[k];
    return t;
  }, {incomeLp:0,incomeShards:0,scenarioSpendLp:0,scenarioSpendShards:0,purchaseHistoryRows:0,purchaseHistorySpendLp:0,purchaseHistorySpendShards:0,spendLp:0,spendShards:0,netLp:0,netShards:0}),
  failures,
  parserChanges: successes.filter(x=>x.rowsWithChangedAmounts>0).map(x=>({
    id:x.id,
    changedRows:x.rows.filter(r=>r.amountsChanged).map(r=>({
      row:r.index,
      before:{incomeLp:r.baselineIncomeLp,incomeShards:r.baselineIncomeShards,spendLp:r.baselineSpendLp,spendShards:r.baselineSpendShards},
      after:{incomeLp:r.incomeLp,incomeShards:r.incomeShards,spendLp:r.spendLp,spendShards:r.spendShards},
      reasons:r.reviewKinds,
      baselineReviewKinds:r.baselineReviewKinds
    }))
  })),
  documents: results
};
console.log("GARASUMADO_LIVE_AUDIT_BEGIN");
console.log(JSON.stringify(summary));
console.log("GARASUMADO_LIVE_AUDIT_END");
