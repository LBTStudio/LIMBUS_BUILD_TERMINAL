/* Rulebook-constrained opening-balance analysis for Glass Window shared records.
 * It never changes data. It compares balance snapshots embedded in notes against
 * parsed history flows and the rulebook's initial 30 LP / 10 Ego Shards.
 */
export const RULE_INITIAL_RESOURCES = Object.freeze({ lp: 30, shards: 10 });
const REVIEW_STATUSES = new Set([
  "mismatch", "direction-review", "reviewed-by-parser-reason",
  "candidate-review", "unresolved", "balance-transition-review"
]);
const CURRENCY_MARKERS = {
  lp: /(?:LP|ＬＰ)/i,
  shards: /(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか)/
};

function normalizeNoteText(value) {
  return String(value ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[，]/g, ",")
    .replace(/\u2212/g, "-")
    .replace(/\u3000/g, " ");
}
function parseBalanceAmount(value) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function netOf(parsed, currency) {
  const income = Number(parsed?.income?.[currency]) || 0;
  const spends = (parsed?.spends || []).reduce((sum, row) =>
    sum + Math.abs(Number(row?.[currency]) || 0), 0);
  const net = income - spends;
  return Number.isSafeInteger(net) ? net : null;
}
function parseRows(history, memoApi) {
  return (Array.isArray(history) ? history : []).map((row, index) => {
    const memo = String(row?.memo || "");
    const parsed = memoApi.parseMemo(memo);
    const coverages = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
    return {
      index,
      name: String(row?.name || ""),
      memo,
      parsed,
      netLp: netOf(parsed, "lp"),
      netShards: netOf(parsed, "shards"),
      reviewRows: coverages.filter((entry) => REVIEW_STATUSES.has(String(entry?.status || ""))).length,
      parserReasons: (parsed.reasons || []).length,
      currencyDiscrepancies: (parsed.currencyDiscrepancies || []).length
    };
  });
}
function balanceAnchorsInMemo(memo, currency) {
  const original = String(memo || "").replace(/\r\n?/g, "\n");
  const normalized = normalizeNoteText(original);
  const amountAfterCue = currency === "lp"
    ? /(?:現在|現座)\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ)?\s*[：:]?\s*([0-9][0-9,]*)\s*(?:LP|ＬＰ)?(?:\s*[→⇒]\s*([0-9][0-9,]*))?/i
    : /(?:現在|現座)\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか)\s*)?\s*[：:]?\s*([0-9][0-9,]*)\s*(?:(?:自我の)?(?:欠片|欠け片|かけら|欠けら|カケラ|けっか))?(?:\s*[→⇒]\s*([0-9][0-9,]*))?/i;
  const output = [];
  let lineOffset = 0;
  let lineIndex = 0;
  for (const rawLine of original.split(/\r?\n/)) {
    lineIndex += 1;
    const line = normalizeNoteText(rawLine);
    if (CURRENCY_MARKERS[currency].test(line)) {
      for (const cue of line.matchAll(/(?:現在|現座)/g)) {
        const match = line.slice(cue.index).match(amountAfterCue);
        if (!match) continue;
        const value = parseBalanceAmount(match[2] ?? match[1]);
        if (value === null) continue;
        const charIndex = lineOffset + cue.index;
        output.push({
          currency, value, historyLine: lineIndex,
          absoluteIndex: charIndex,
          cueLength: cue[0].length,
          prefix: original.slice(0, charIndex)
        });
      }
    }
    lineOffset += rawLine.length + 1;
  }
  return output;
}
function classifyResidual(value, initialCeiling) {
  if (!Number.isSafeInteger(value)) return "not-comparable";
  if (value < 0) return "below-zero: parsed net exceeds current balance";
  if (value > initialCeiling) return "above-initial-ceiling: missing history, unrecorded adjustment or parser undercount";
  return "compatible-with-rulebook-initial-resources-after-setup-spend";
}
function analyzeOrder(rows, currency, currentBalance, memoApi, reverse) {
  const ordered = reverse ? [...rows].reverse() : rows.slice();
  const netKey = currency === "lp" ? "netLp" : "netShards";
  const currentKey = currency === "lp" ? "lp" : "shards";
  const cumulativeBefore = 0;
  let cumulative = cumulativeBefore;
  const checkpoints = [];
  const netValues = ordered.map((row) => row[netKey]);
  for (let orderIndex = 0; orderIndex < ordered.length; orderIndex += 1) {
    const row = ordered[orderIndex];
    for (const anchor of balanceAnchorsInMemo(row.memo, currency)) {
      const prefixParsed = memoApi.parseMemo(anchor.prefix);
      const prefixNet = netOf(prefixParsed, currency);
      if (prefixNet === null || row[netKey] === null) continue;
      const impliedOpening = anchor.value - cumulative - prefixNet;
      const laterRowsNet = netValues.slice(orderIndex + 1).reduce((sum, value) => sum + value, 0);
      const netAfterAnchorInRow = row[netKey] - prefixNet;
      const projectedCurrent = anchor.value + netAfterAnchorInRow + laterRowsNet;
      checkpoints.push({
        historyRow: row.index + 1,
        historyLine: anchor.historyLine,
        value: anchor.value,
        inferredOpening: impliedOpening,
        projectedCurrent,
        matchesSavedCurrent: Number.isSafeInteger(currentBalance?.[currentKey])
          ? projectedCurrent === currentBalance[currentKey] : null
      });
    }
    cumulative += row[netKey] ?? 0;
  }
  const uniqueOpenings = [...new Set(checkpoints.map((entry) => entry.inferredOpening))];
  const stable = checkpoints.length > 0 && uniqueOpenings.length === 1;
  const inferredOpening = stable ? uniqueOpenings[0] : (checkpoints[0]?.inferredOpening ?? null);
  const latest = checkpoints.at(-1) || null;
  const projectedMatchesCurrent = latest?.matchesSavedCurrent ?? null;
  const ceiling = RULE_INITIAL_RESOURCES[currency];
  const withinRuleRange = Number.isSafeInteger(inferredOpening) &&
    inferredOpening >= 0 && inferredOpening <= ceiling;
  return {
    order: reverse ? "reverse-history-array" : "history-array-order",
    anchorCount: checkpoints.length,
    stableAcrossAnchors: stable,
    distinctOpeningEstimates: uniqueOpenings.length,
    inferredOpening,
    withinRuleInitialRange: withinRuleRange,
    latestAnchor: latest ? {
      historyRow: latest.historyRow, historyLine: latest.historyLine,
      value: latest.value, projectedCurrent: latest.projectedCurrent,
      matchesSavedCurrent: latest.matchesSavedCurrent
    } : null,
    checkpoints
  };
}

export function auditRuleBasedOpening(history, currentBalance, memoApi) {
  if (typeof memoApi?.parseMemo !== "function") throw new TypeError("memoApi.parseMemo is required");
  const rows = parseRows(history, memoApi);
  const historyNetLp = rows.reduce((sum, row) => sum + (row.netLp ?? 0), 0);
  const historyNetShards = rows.reduce((sum, row) => sum + (row.netShards ?? 0), 0);
  const impliedOpeningLp = Number.isSafeInteger(currentBalance?.lp) ? currentBalance.lp - historyNetLp : null;
  const impliedOpeningShards = Number.isSafeInteger(currentBalance?.shards) ? currentBalance.shards - historyNetShards : null;
  const hasInitialNamedRow = rows.some((row) =>
    /初期作成|初期資源|初期支給|キャラ作成/.test(row.name + "\n" + row.memo) &&
    Number(row.parsed?.income?.lp || 0) >= RULE_INITIAL_RESOURCES.lp &&
    Number(row.parsed?.income?.shards || 0) >= RULE_INITIAL_RESOURCES.shards
  );
  const explicitInitialGrantRows = rows.filter((row) =>
    /初期作成|初期資源|初期支給|キャラ作成/.test(row.name + "\n" + row.memo) &&
    Number(row.parsed?.income?.lp || 0) >= RULE_INITIAL_RESOURCES.lp &&
    Number(row.parsed?.income?.shards || 0) >= RULE_INITIAL_RESOURCES.shards
  ).map((row) => row.index + 1);
  const orders = {
    historyArrayOrder: {
      lp: analyzeOrder(rows, "lp", currentBalance, memoApi, false),
      shards: analyzeOrder(rows, "shards", currentBalance, memoApi, false)
    },
    reverseHistoryArray: {
      lp: analyzeOrder(rows, "lp", currentBalance, memoApi, true),
      shards: analyzeOrder(rows, "shards", currentBalance, memoApi, true)
    }
  };
  const score = (pair) => ["lp", "shards"].reduce((sum, currency) => {
    const value = pair[currency];
    return sum + (value.anchorCount ? 1 : 0) +
      (value.stableAcrossAnchors ? 4 : 0) +
      (value.withinRuleInitialRange ? 3 : 0) +
      (value.latestAnchor?.matchesSavedCurrent === true ? 2 : 0);
  }, 0);
  const forwardScore = score(orders.historyArrayOrder);
  const reverseScore = score(orders.reverseHistoryArray);
  const preferredHistoryOrder = forwardScore === reverseScore
    ? "ambiguous" : forwardScore > reverseScore ? "history-array-order" : "reverse-history-array";
  const openingResult = (currency) => {
    const field = currency === "lp" ? "impliedOpeningLp" : "impliedOpeningShards";
    const opening = currency === "lp" ? impliedOpeningLp : impliedOpeningShards;
    const ruleInitial = RULE_INITIAL_RESOURCES[currency];
    return {
      current: Number.isSafeInteger(currentBalance?.[currency]) ? currentBalance[currency] : null,
      historyNet: currency === "lp" ? historyNetLp : historyNetShards,
      aggregateImpliedOpening: opening,
      aggregateClass: classifyResidual(opening, ruleInitial),
      openingAnchors: {
        historyArrayOrder: orders.historyArrayOrder[currency],
        reverseHistoryArray: orders.reverseHistoryArray[currency]
      }
    };
  };
  return {
    initialResources: { ...RULE_INITIAL_RESOURCES },
    explicitInitialGrantRecorded: hasInitialNamedRow,
    explicitInitialGrantRows,
    historyRows: rows.length,
    memoRows: rows.filter((row) => row.memo.trim()).length,
    historyNetLp, historyNetShards,
    currentLp: currentBalance?.lp ?? null,
    currentShards: currentBalance?.shards ?? null,
    impliedOpeningLp, impliedOpeningShards,
    lpClass: classifyResidual(impliedOpeningLp, RULE_INITIAL_RESOURCES.lp),
    shardsClass: classifyResidual(impliedOpeningShards, RULE_INITIAL_RESOURCES.shards),
    lpCompatible: Number.isSafeInteger(impliedOpeningLp) && impliedOpeningLp >= 0 && impliedOpeningLp <= RULE_INITIAL_RESOURCES.lp,
    shardsCompatible: Number.isSafeInteger(impliedOpeningShards) && impliedOpeningShards >= 0 && impliedOpeningShards <= RULE_INITIAL_RESOURCES.shards,
    bothCompatible: Number.isSafeInteger(impliedOpeningLp) && impliedOpeningLp >= 0 && impliedOpeningLp <= RULE_INITIAL_RESOURCES.lp &&
      Number.isSafeInteger(impliedOpeningShards) && impliedOpeningShards >= 0 && impliedOpeningShards <= RULE_INITIAL_RESOURCES.shards,
    lpNegative: impliedOpeningLp !== null && impliedOpeningLp < 0,
    shardsNegative: impliedOpeningShards !== null && impliedOpeningShards < 0,
    lpAboveCeiling: impliedOpeningLp !== null && impliedOpeningLp > RULE_INITIAL_RESOURCES.lp,
    shardsAboveCeiling: impliedOpeningShards !== null && impliedOpeningShards > RULE_INITIAL_RESOURCES.shards,
    ruleAnalysis: {
      lp: openingResult("lp"),
      shards: openingResult("shards"),
      preferredHistoryOrder,
      orderScores: { historyArrayOrder: forwardScore, reverseHistoryArray: reverseScore }
    },
    totals: {
      reviewRows: rows.reduce((sum, row) => sum + row.reviewRows, 0),
      parserReasons: rows.reduce((sum, row) => sum + row.parserReasons, 0),
      currencyDiscrepancies: rows.reduce((sum, row) => sum + row.currencyDiscrepancies, 0)
    }
  };
}
