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

export function summarizeBalanceCuePatterns(history) {
  const summary = {
    memoRows: 0,
    cueLines: 0,
    currentWordLines: 0,
    otherBalanceWordLines: 0,
    arrowLines: 0,
    lpLines: 0,
    shardLines: 0,
    bothCurrencyLines: 0,
    numericBeforeCueLines: 0,
    numericAfterCueLines: 0,
    actionCueLines: 0,
    conversionCueLines: 0,
    patternCounts: {}
  };
  const amountPattern = /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)\s*[：:]?\s*[+＋\-−]?\s*\d[\d,]*|[+＋\-−]?\s*\d[\d,]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/ig;
  for (const row of Array.isArray(history) ? history : []) {
    const memo = String(row?.memo || "").replace(/\r\n?/g, "\n");
    if (!memo.trim()) continue;
    summary.memoRows += 1;
    for (const rawLine of memo.split("\n")) {
      const line = normalizeNoteText(rawLine);
      const currentWord = /現在|現座/.test(line);
      const otherBalanceWord = /残高|残り|所持|保有/.test(line);
      const arrow = /[→⇒]/.test(line);
      if (!currentWord && !otherBalanceWord && !arrow) continue;
      summary.cueLines += 1;
      if (currentWord) summary.currentWordLines += 1;
      if (otherBalanceWord) summary.otherBalanceWordLines += 1;
      if (arrow) summary.arrowLines += 1;
      const hasLp = CURRENCY_MARKERS.lp.test(line);
      const hasShards = CURRENCY_MARKERS.shards.test(line);
      if (hasLp) summary.lpLines += 1;
      if (hasShards) summary.shardLines += 1;
      if (hasLp && hasShards) summary.bothCurrencyLines += 1;
      if (/報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|付与|支給|補填|受領|被り|重複/.test(line)) summary.actionCueLines += 1;
      if (/変換|換算/.test(line)) summary.conversionCueLines += 1;
      const cues = [...line.matchAll(/現在|現座|残高|残り|所持|保有|[→⇒]/g)];
      const cueIndex = cues[0]?.index ?? -1;
      const before = cueIndex >= 0 ? line.slice(0, cueIndex) : "";
      const after = cueIndex >= 0 ? line.slice(cueIndex + (line[cueIndex] === "→" || line[cueIndex] === "⇒" ? 1 : (line.startsWith("現座", cueIndex) ? 2 : line.startsWith("現在", cueIndex) ? 2 : line.startsWith("残高", cueIndex) ? 2 : line.startsWith("残り", cueIndex) ? 2 : line.startsWith("所持", cueIndex) ? 2 : line.startsWith("保有", cueIndex) ? 2 : 0))) : "";
      amountPattern.lastIndex = 0;
      const beforeAmount = amountPattern.test(before);
      amountPattern.lastIndex = 0;
      const afterAmount = amountPattern.test(after);
      if (beforeAmount) summary.numericBeforeCueLines += 1;
      if (afterAmount) summary.numericAfterCueLines += 1;
      const parts = [
        currentWord ? "current-word" : "",
        otherBalanceWord ? "balance-word" : "",
        arrow ? "arrow" : "",
        hasLp ? "lp" : "",
        hasShards ? "shards" : "",
        beforeAmount ? "amount-before" : "",
        afterAmount ? "amount-after" : "",
        /報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|付与|支給|補填|受領|被り|重複/.test(line) ? "action" : "",
        /変換|換算/.test(line) ? "conversion" : ""
      ].filter(Boolean);
      const key = parts.join("+") || "cue-only";
      summary.patternCounts[key] = (summary.patternCounts[key] || 0) + 1;
    }
  }
  return summary;
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
  /* The source may omit an "initial creation" label. Report exact 30/10 pairs
     separately as candidates rather than treating them as confirmed grants. */
  const exactInitialAmountRows = rows.filter((row) =>
    Number(row.parsed?.income?.lp || 0) === RULE_INITIAL_RESOURCES.lp &&
    Number(row.parsed?.income?.shards || 0) === RULE_INITIAL_RESOURCES.shards
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
    exactInitialAmountRows,
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
    balanceCuePatterns: summarizeBalanceCuePatterns(history),
    totals: {
      reviewRows: rows.reduce((sum, row) => sum + row.reviewRows, 0),
      parserReasons: rows.reduce((sum, row) => sum + row.parserReasons, 0),
      currencyDiscrepancies: rows.reduce((sum, row) => sum + row.currencyDiscrepancies, 0)
    }
  };
}
