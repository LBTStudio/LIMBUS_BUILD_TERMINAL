#!/usr/bin/env node
/**
 * Read-only live regression audit for the 98 shared URLs gathered on 2026-10-27.
 *
 * Do not persist document bodies or print memo text: shared records can contain
 * user-written notes and names. The committed baseline contains inventory
 * metadata only; parser checks run against current Firestore documents.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const baseline = JSON.parse(readFileSync(resolve(root, "tests/fixtures/garasumado-share-url-baseline.json"), "utf8"));
const importSource = readFileSync(resolve(root, "js/garasumado-roster-import.js"), "utf8");
const key = importSource.match(/const PUBLIC_API_KEY\s*=\s*["']([^"']+)["']/)?.[1];
if (!key) throw new Error("公開Firestore読み取りキーをソースから検出できません。");

const parserContext = {
  window: {},
  console,
  URL,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  module: { exports: {} }
};
parserContext.globalThis = parserContext;
vm.createContext(parserContext);
vm.runInContext(
  readFileSync(resolve(root, "js/garasumado-memo-parse.js"), "utf8"),
  parserContext,
  { filename: "js/garasumado-memo-parse.js" }
);
const MEMO = parserContext.window.LBT_garaMemo || parserContext.module.exports;
if (typeof MEMO?.parseMemo !== "function") throw new Error("収支メモパーサーを初期化できません。");

const DOC_ROOT = "https://firestore.googleapis.com/v1/projects/lbt-garasumado/databases/(default)/documents";
const CANDIDATE_AMOUNT = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+(?:[,，][0-9０-９]{3})*(?![0-9０-９])|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)|(?:欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+(?![0-9０-９])/i;
/* 旧監査の候補総数と比較するため、従来の語句条件も別に保持する。 */
const LEGACY_CANDIDATE_AMOUNT = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i;
const LEGACY_CANDIDATE_ACTION = /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/;
/* 名詞だけでは操作語に数えない。チケットは枚数・動詞を確認して別判定する。 */
const CANDIDATE_ACTION = /報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算/;
const CANDIDATE_DRAW_ACTION = /(?:抽出|ガチャ)(?:結果|を回|を引|で獲得|で入手|で取得|を実行|を実施|を行|した|する|済)|(?:ガチャ|抽出)[：:]?\s*(?:獲得|入手|取得|購入|消費|使用)/;
const CANDIDATE_TICKET_MARKER = /(?:チケット|チケ|抽出🎫)/i;
const CANDIDATE_TICKET_COUNT = /(?:チケット|チケ|抽出🎫)\s*(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))|(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))\s*(?:人格|E\.?G\.?O|エゴ|選択|抽出|ガチャ)?チケ(?:ット)?/i;
const CANDIDATE_TICKET_ACTION = /(?:獲得|入手|取得|付与|支給|消費|使用|購入|買っ|支払|支出|報酬|収入|受領|補填|抽出(?:した|する|結果|後|済|を行う|を実施)|ガチャ(?:結果|で獲得|を回|を引)|消費済)/i;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function unwrapFirestore(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(unwrapFirestore);
  if (value.mapValue) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([field, nested]) => [field, unwrapFirestore(nested)]));
  }
  return Object.fromEntries(Object.entries(value).map(([field, nested]) => [field, unwrapFirestore(nested)]));
}

async function requestDocument(collection, id) {
  const url = DOC_ROOT + "/" + collection + "/" + encodeURIComponent(id) + "?key=" + encodeURIComponent(key);
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000)
      });
      lastStatus = response.status;
      if (response.ok) {
        const body = await response.json();
        return { ok: true, collection, updateTime: body.updateTime || "", doc: unwrapFirestore(body.fields || {}) };
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch {
      lastStatus = 0;
    }
    if (attempt < 2) await delay(300 * (attempt + 1));
  }
  return { ok: false, status: lastStatus };
}

async function fetchSample(id) {
  const attempts = [];
  for (const collection of ["characters", "personas"]) {
    const result = await requestDocument(collection, id);
    if (result.ok) return { ...result, id, attempts };
    attempts.push({ collection, status: result.status });
  }
  return { ok: false, id, attempts, status: attempts.some((a) => a.status === 403) ? 403 : attempts.at(-1)?.status || 0 };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

function isRelated(auditRows, lineNumber) {
  return (auditRows || []).some((entry) => entry && (
    entry.lineIndex === lineNumber ||
    entry.relatedLineIndex === lineNumber ||
    (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === lineNumber))
  ));
}

function stripBalanceAnchors(line) {
  return String(line || "")
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u2212/g, "-")
    .replace(/\u3000/g, " ")
    .replace(/現在\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ")
    .replace(/残り\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ");
}
function isLegacyFinancialCandidateLine(line) {
  if (/^\s*[▶►▷]/.test(String(line || ""))) return false;
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) && LEGACY_CANDIDATE_ACTION.test(withoutBalances);
}

function isFinancialCandidateLine(line) {
  if (/^\s*[▶►▷]/.test(String(line || ""))) return false;
  const withoutBalances = stripBalanceAnchors(line);
  if (!CANDIDATE_AMOUNT.test(withoutBalances)) return false;
  const hasCountedTicketOperation = CANDIDATE_TICKET_MARKER.test(withoutBalances) &&
    (CANDIDATE_TICKET_COUNT.test(withoutBalances) || CANDIDATE_TICKET_ACTION.test(withoutBalances));
  return CANDIDATE_ACTION.test(withoutBalances) ||
    CANDIDATE_DRAW_ACTION.test(withoutBalances) ||
    hasCountedTicketOperation;
}

/* 金額の近くにチケットという語があるだけの価格・説明ラベルを、取引候補から
   明示的に分離する。監査対象から黙って消すのではなく、別カウンターに残す。 */
function isNonTransactionalTicketLabel(line) {
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) &&
    CANDIDATE_TICKET_MARKER.test(withoutBalances) &&
    !CANDIDATE_TICKET_COUNT.test(withoutBalances) &&
    !CANDIDATE_TICKET_ACTION.test(withoutBalances) &&
    !CANDIDATE_ACTION.test(withoutBalances) &&
    !CANDIDATE_DRAW_ACTION.test(withoutBalances);
}

function isNonTransactionalDrawLabel(line) {
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) &&
    /抽出|ガチャ/.test(withoutBalances) &&
    !CANDIDATE_TICKET_COUNT.test(withoutBalances) &&
    !(CANDIDATE_TICKET_MARKER.test(withoutBalances) && CANDIDATE_TICKET_ACTION.test(withoutBalances)) &&
    !CANDIDATE_ACTION.test(withoutBalances) &&
    !CANDIDATE_DRAW_ACTION.test(withoutBalances);
}

function describeCandidateLine(line, coverage) {
  const textLine = String(line || "");
  const amountMatch = CANDIDATE_AMOUNT.exec(textLine);
  const amountTokens = [...textLine.matchAll(/(?:[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)|(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*)/gi)]
    .slice(0, 8)
    .map((match) => ({
      index: match.index,
      currency: /LP|ＬＰ/i.test(match[0]) ? "lp" : "shards",
      digitWidth: (match[0].match(/[0-9０-９]/g) || []).length
    }));
  const markers = [
    { type: "amount", re: /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*|[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/gi },
    { type: "reward-cue", re: /報酬|収入/g },
    { type: "spend-cue", re: /消費|支出|支払|購入|買っ/g },
    { type: "acquisition-cue", re: /獲得|入手|取得|付与|支給|補填|受領|被り|重複/g },
    { type: "draw-cue", re: /(?:抽出|ガチャ)(?:結果|を回|を引|で獲得|で入手|で取得|を実行|を実施|を行|した|する|済)/g },
    { type: "ticket-label", re: /チケット|チケ|抽出🎫/g },
    { type: "balance-cue", re: /現在|残高|所持|残り|保有|→|⇒/g },
    { type: "conversion-cue", re: /変換|換算/g }
  ];
  const tokenShape = [];
  for (const marker of markers) {
    for (const match of textLine.matchAll(marker.re)) {
      tokenShape.push({ index: match.index, type: marker.type });
    }
  }
  tokenShape.sort((a, b) => a.index - b.index);
  const withoutBalances = stripBalanceAnchors(textLine);
  const legacyCueKinds = [];
  if (/報酬|収入/.test(withoutBalances)) legacyCueKinds.push("reward-term");
  if (/消費|支出|支払|購入|買った/.test(withoutBalances)) legacyCueKinds.push("spend-term");
  if (/獲得|入手|取得/.test(withoutBalances)) legacyCueKinds.push("acquisition-term");
  if (/抽出|ガチャ/.test(withoutBalances)) legacyCueKinds.push("draw-term");
  if (/チケット|チケ/.test(withoutBalances)) legacyCueKinds.push("ticket-term");
  const actionKinds = [];
  if (/報酬|収入/.test(textLine)) actionKinds.push("reward");
  if (/消費|支出|支払|購入|買っ/.test(textLine)) actionKinds.push("spend");
  if (/獲得|入手|取得|付与|支給|補填|受領|被り|重複/.test(textLine)) actionKinds.push("acquisition");
  if (CANDIDATE_DRAW_ACTION.test(textLine)) actionKinds.push("draw-operation");
  if (CANDIDATE_TICKET_MARKER.test(textLine)) actionKinds.push("ticket-label");
  if (/現在|残高|所持|残り|保有|→|⇒/.test(textLine)) actionKinds.push("balance-transition");
  if (/変換|換算/.test(textLine)) actionKinds.push("conversion");
  const ticket = MEMO.ticketOf(textLine, { mode: coverage?.section || "income", previousLine: "" });
  const currencyKinds = (value) => value
    ? Object.entries(value).filter(([, amount]) => Number(amount) !== 0).map(([currency]) => currency)
    : [];
  const cleanedLine = stripBalanceAnchors(textLine);
  const classificationFlags = {
    legacyAmount: LEGACY_CANDIDATE_AMOUNT.test(cleanedLine),
    strictAmount: CANDIDATE_AMOUNT.test(cleanedLine),
    transactionAction: CANDIDATE_ACTION.test(cleanedLine),
    drawOperation: CANDIDATE_DRAW_ACTION.test(cleanedLine),
    ticketMarker: CANDIDATE_TICKET_MARKER.test(cleanedLine),
    ticketCount: CANDIDATE_TICKET_COUNT.test(cleanedLine),
    ticketAction: CANDIDATE_TICKET_ACTION.test(cleanedLine),
    hasArrow: /[→⇒]/.test(cleanedLine)
  };
  return {
    lineLength: textLine.length,
    amountTokenCount: amountTokens.length,
    amountTokenShape: amountTokens,
    candidateMatchLength: amountMatch?.[0]?.length || 0,
    candidateMatchDigitWidth: amountMatch ? (amountMatch[0].match(/[0-9０-９]/g) || []).length : 0,
    numericTokenWidths: [...textLine.matchAll(/[0-9０-９]+/g)].map((match) => match[0].length).slice(0, 8),
    tokenShape,
    legacyCueKinds,
    classificationFlags,
    ticketClassified: Boolean(ticket),
    ticketReviewReasonPresent: Boolean(ticket?.reason),
    actionKinds,
    startsWithEffectMarker: /^\s*[▶►▷]/.test(textLine),
    hasBalanceCue: /現在|残高|所持|残り|保有|→|⇒/.test(textLine),
    section: coverage?.section || null,
    status: coverage?.status || null,
    expectedCurrencyKinds: currencyKinds(coverage?.expected),
    detectedCurrencyKinds: currencyKinds(coverage?.detected),
    parserReasonCount: Number(coverage?.parserReasonCount) || 0,
    sourceFinding: Boolean(coverage?.sourceFinding)
  };
}

function numericShape(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(numericShape).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    const safe = numericShape(nested);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

function auditMemo(id, historyIndex, memo) {
  const parsed = MEMO.parseMemo(memo);
  const lines = String(memo || "").split(/\r?\n/);
  const coverages = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
  const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
  const issues = [];
  let candidates = 0;
  let covered = 0;

  let legacyCandidates = 0;
  let legacyTransactionCandidates = 0;
  let nonTransactionalTicketLabels = 0;
  let nonTransactionalDrawLabels = 0;
  let unclassifiedLegacyCues = 0;
  const unclassifiedLegacyCueExamples = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Effect descriptions beginning with ▶/►/▷ are intentionally excluded by
    // the parser's auditLineCoverage and must not be counted as ledger transactions.
    if (!line.trim()) continue;
    const legacyCandidate = isLegacyFinancialCandidateLine(line);
    if (legacyCandidate) legacyCandidates++;
    if (!isFinancialCandidateLine(line)) {
      if (legacyCandidate && isNonTransactionalTicketLabel(line)) nonTransactionalTicketLabels++;
      else if (legacyCandidate && isNonTransactionalDrawLabel(line)) nonTransactionalDrawLabels++;
      else if (legacyCandidate) {
        unclassifiedLegacyCues++;
        if (unclassifiedLegacyCueExamples.length < 10) {
          unclassifiedLegacyCueExamples.push({
            id, historyIndex, lineIndex: i + 1,
            details: describeCandidateLine(line, null)
          });
        }
      }
      continue;
    }
    candidates++;
    if (legacyCandidate) legacyTransactionCandidates++;
    const lineNumber = i + 1;
    const coverage = coverages.find((entry) => entry && entry.lineIndex === lineNumber);
    const relatedAudit = isRelated(audits, lineNumber);
    const relatedReason = reasons.some((entry) => String(entry.line || "").trim() === line.trim());

    if (!coverage) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "missing-line-coverage", details: describeCandidateLine(line, null) });
      continue;
    }
    covered++;
    if (coverage.status === "unresolved") {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unresolved-line", details: describeCandidateLine(line, coverage) });
    } else if (["mismatch", "direction-review"].includes(coverage.status) && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unexplained-mismatch", status: coverage.status, details: describeCandidateLine(line, coverage) });
    } else if (coverage.status === "reviewed-by-parser-reason" && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unshown-parser-reason", details: describeCandidateLine(line, coverage) });
    }
  }

  const hasFinancialCandidate = lines.some((line) => isFinancialCandidateLine(line));
  const hasAmount = hasFinancialCandidate;
  const hasAction = hasFinancialCandidate;
  if (hasAmount && hasAction) {
    const recognized =
      (Number(parsed.income?.lp) || 0) !== 0 ||
      (Number(parsed.income?.shards) || 0) !== 0 ||
      (parsed.spends || []).length > 0 ||
      Object.values(parsed.tickets || {}).some((value) => (Number(value) || 0) > 0) ||
      Object.keys(parsed.pack || {}).length > 0 ||
      (parsed.wins || []).length > 0 ||
      reasons.length > 0 ||
      (parsed.ticketSpends || []).length > 0 ||
      (parsed.sourceAudits || []).some((entry) => entry && entry.severity !== "info");
    if (!recognized) issues.push({ id, historyIndex, lineIndex: null, code: "silent-unparsed-history" });
  }

  const incomeLp = Number(parsed.income?.lp) || 0;
  const incomeShards = Number(parsed.income?.shards) || 0;
  const spentLp = (parsed.spends || []).reduce((sum, row) => sum + Math.abs(Number(row?.lp) || 0), 0);
  const spentShards = (parsed.spends || []).reduce((sum, row) => sum + Math.abs(Number(row?.shards) || 0), 0);
  const reviewStatuses = new Set(["mismatch", "direction-review", "reviewed-by-parser-reason", "candidate-review", "unresolved", "balance-transition-review"]);
  const financial = {
    incomeLp, incomeShards, spentLp, spentShards,
    netLp: incomeLp - spentLp,
    netShards: incomeShards - spentShards,
    reasonCount: reasons.length,
    reviewRows: coverages.filter((entry) => reviewStatuses.has(String(entry?.status || ""))).length
  };
  /* Reviewの診断は本文や理由文を出さず、行位置・section・status・数値方向だけを記録する。 */
  const reviewDetails = coverages
    .filter((entry) => reviewStatuses.has(String(entry?.status || "")))
    .map((entry) => {
      const line = String(entry?.line || "");
      const related = audits.filter((audit) => isRelated([audit], entry.lineIndex));
      return {
        lineIndex: Number(entry.lineIndex) || null,
        section: String(entry.section || ""),
        status: String(entry.status || ""),
        expected: numericShape(entry.expected) ?? null,
        detected: numericShape(entry.detected) ?? null,
        expectedFlows: numericShape(entry.expectedFlows) ?? null,
        detectedFlows: numericShape(entry.detectedFlows) ?? null,
        parserReasonCount: Number(entry.parserReasonCount) || 0,
        sourceFinding: Boolean(entry.sourceFinding),
        hasParserReason: reasons.some((reason) => String(reason.line || "").trim() === line.trim()),
        lineShape: describeCandidateLine(line, entry),
        auditCodes: related.map((audit) => ({
          code: String(audit.code || ""),
          severity: String(audit.severity || "")
        }))
      };
    });

  const spendSignatures = (parsed.spends || []).map(spendSignature).filter(Boolean);

  return { historyIndex, candidates, covered, legacyCandidates, legacyTransactionCandidates, nonTransactionalTicketLabels, nonTransactionalDrawLabels, unclassifiedLegacyCues, unclassifiedLegacyCueExamples, issues, financial, reviewDetails, spendSignatures, coverageStatuses: coverages.reduce((counts, entry) => {
    const status = String(entry?.status || "missing-status");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}), currencyDiscrepancies: (parsed.currencyDiscrepancies || []).length };
}


function historyInputSha256(history) {
  const parserInputs = (Array.isArray(history) ? history : []).map((row) => ({
    name: String(row?.name ?? ""),
    memo: String(row?.memo ?? "")
  }));
  return createHash("sha256").update(JSON.stringify(parserInputs)).digest("hex");
}

function countNonemptyMemos(history) {
  return history.filter((row) => String(row?.memo || "").trim()).length;
}

/* Primary source: the rulebook PDF (source/新リンバスTRPG.pdf), p.14.
   At character creation a PC receives 30 LP and 10 Ego Shards.
   The inferred opening balance of the available history is compatible with
   those resources after setup spending only when it lies in 0..30 LP / 0..10 shards.
   This is a compatibility test, not proof the history contains every transaction. */
const RULE_INITIAL_RESOURCES = Object.freeze({ lp: 30, shards: 10 });

function parsedNet(parsed, currency) {
  const income = Number(parsed?.income?.[currency]) || 0;
  const spends = (parsed?.spends || []).reduce((sum, row) => sum + Math.abs(Number(row?.[currency]) || 0), 0);
  return income - spends;
}

function auditRuleBasedOpening(history, currentBalance) {
  const rows = (Array.isArray(history) ? history : []).map((row) => {
    const memo = String(row?.memo || "");
    const parsed = MEMO.parseMemo(memo);
    return {
      netLp: parsedNet(parsed, "lp"),
      netShards: parsedNet(parsed, "shards"),
      reviewRows: (parsed.financialCoverage || []).filter((entry) =>
        ["mismatch", "direction-review", "reviewed-by-parser-reason", "candidate-review", "unresolved", "balance-transition-review"].includes(String(entry?.status || ""))
      ).length,
      parserReasons: (parsed.reasons || []).length,
      currencyDiscrepancies: (parsed.currencyDiscrepancies || []).length
    };
  });
  const historyNetLp = rows.reduce((sum, row) => sum + row.netLp, 0);
  const historyNetShards = rows.reduce((sum, row) => sum + row.netShards, 0);
  const impliedOpeningLp = Number.isSafeInteger(currentBalance?.lp) ? currentBalance.lp - historyNetLp : null;
  const impliedOpeningShards = Number.isSafeInteger(currentBalance?.shards) ? currentBalance.shards - historyNetShards : null;
  const classify = (value, ceiling) => {
    if (!Number.isSafeInteger(value)) return "not-comparable";
    if (value < 0) return "below-zero: parsed net exceeds current balance";
    if (value > ceiling) return "above-initial-ceiling: missing earlier income/history or parser undercount";
    return "compatible-with-initial-resources-after-setup-spend";
  };
  const lpClass = classify(impliedOpeningLp, RULE_INITIAL_RESOURCES.lp);
  const shardsClass = classify(impliedOpeningShards, RULE_INITIAL_RESOURCES.shards);
  return {
    initialResources: { ...RULE_INITIAL_RESOURCES },
    historyNetLp, historyNetShards,
    currentLp: currentBalance?.lp ?? null,
    currentShards: currentBalance?.shards ?? null,
    impliedOpeningLp, impliedOpeningShards,
    lpClass, shardsClass,
    lpCompatible: lpClass === "compatible-with-initial-resources-after-setup-spend",
    shardsCompatible: shardsClass === "compatible-with-initial-resources-after-setup-spend",
    bothCompatible: lpClass === "compatible-with-initial-resources-after-setup-spend" && shardsClass === "compatible-with-initial-resources-after-setup-spend",
    lpNegative: lpClass === "below-zero: parsed net exceeds current balance",
    shardsNegative: shardsClass === "below-zero: parsed net exceeds current balance",
    lpAboveCeiling: lpClass === "above-initial-ceiling: missing earlier income/history or parser undercount",
    shardsAboveCeiling: shardsClass === "above-initial-ceiling: missing earlier income/history or parser undercount",
    historyRows: (Array.isArray(history) ? history : []).length,
    memoRows: (Array.isArray(history) ? history : []).filter((row) => String(row?.memo || "").trim()).length,
    reviewRows: rows.reduce((sum, row) => sum + row.reviewRows, 0),
    parserReasons: rows.reduce((sum, row) => sum + row.parserReasons, 0),
    currencyDiscrepancies: rows.reduce((sum, row) => sum + row.currencyDiscrepancies, 0)
  };
}

function parseStoredCurrencyAmount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value)
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[，,]/g, "")
    .trim();
  if (!/^\+?\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function storedCurrencyOf(doc) {
  const currency = doc?.currency && typeof doc.currency === "object" ? doc.currency : {};
  return {
    lp: parseStoredCurrencyAmount(currency.lp),
    shards: parseStoredCurrencyAmount(currency.fragment ?? currency.shards ?? currency.fragments)
  };
}

function normalizeExpenseName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[「」『』\"'：:]/g, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ja-JP");
}

/* Signatures are used only for overlap analysis; raw names and free-note text are never emitted. */
function spendSignature(row) {
  const lp = Math.abs(Number(row?.lp) || 0);
  const shards = Math.abs(Number(row?.shards) || 0);
  if (!Number.isSafeInteger(lp) || !Number.isSafeInteger(shards)) return null;
  const normalizedName = normalizeExpenseName(row?.name);
  return {
    exact: createHash("sha256").update(normalizedName + "\\0" + lp + "\\0" + shards).digest("hex"),
    amount: lp + "/" + shards,
    lp,
    shards
  };
}

/* Mirror the importer's freeNotes rule: only rows accepted by purchaseRowOf() in the
   secret/history/memo/setting fields become an untimed purchase scenario. */
function auditFreeNotes(doc) {
  const notes = doc?.freeNotes && typeof doc.freeNotes === "object" ? doc.freeNotes : {};
  const fields = ["secret", "history", "memo", "setting"];
  const allLines = fields.flatMap((field) =>
    String(notes[field] || "").split(/\r?\n/).map((line) => String(line || "").trim()).filter(Boolean)
  );
  const expenseCues = allLines.filter((line) => /購入|消費|支出|支払|買っ/.test(line));
  const acceptedLines = allLines.filter((line) =>
    typeof MEMO.purchaseRowOf === "function" && Boolean(MEMO.purchaseRowOf(line))
  );
  const acceptedSet = new Set(acceptedLines);
  const unrecognizedCues = expenseCues.filter((line) => !acceptedSet.has(line));
  const parsed = MEMO.parseMemo(acceptedLines.join("\n"));
  const signatures = (parsed.spends || []).map(spendSignature).filter(Boolean)
    .filter((spend) => spend.lp > 0 || spend.shards > 0);
  let unrecognizedCueRowsWithGenericSpend = 0;
  let unrecognizedCueGenericSpendLp = 0;
  let unrecognizedCueGenericSpendShards = 0;
  let unrecognizedCueRowsWithCurrencyAmount = 0;
  let unrecognizedCueRowsWithParserReason = 0;
  const unrecognizedCueSpendSignatures = [];
  for (const line of unrecognizedCues) {
    if (/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d|[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/i.test(line)) {
      unrecognizedCueRowsWithCurrencyAmount++;
    }
    const one = MEMO.parseMemo(line);
    const spends = (one.spends || []).map(spendSignature).filter(Boolean);
    const actual = spends.filter((spend) => spend.lp > 0 || spend.shards > 0);
    if (actual.length) unrecognizedCueRowsWithGenericSpend++;
    unrecognizedCueSpendSignatures.push(...actual);
    unrecognizedCueGenericSpendLp += actual.reduce((sum, spend) => sum + spend.lp, 0);
    unrecognizedCueGenericSpendShards += actual.reduce((sum, spend) => sum + spend.shards, 0);
    if ((one.reasons || []).length > 0) unrecognizedCueRowsWithParserReason++;
  }
  return {
    lineCount: allLines.length,
    expenseCueRows: expenseCues.length,
    recognizedPurchaseLines: acceptedLines.length,
    parsedSpendRows: signatures.length,
    cueRowsWithoutPurchaseRow: Math.max(0, expenseCues.length - acceptedLines.length),
    unrecognizedCueRowsWithGenericSpend,
    unrecognizedCueGenericSpendLp,
    unrecognizedCueGenericSpendShards,
    unrecognizedCueRowsWithCurrencyAmount,
    unrecognizedCueRowsWithParserReason,
    unrecognizedCueSpendSignatures,
    acceptedRowsWithoutParsedSpend: Math.max(0, acceptedLines.length - signatures.length),
    spendLp: signatures.reduce((sum, spend) => sum + spend.lp, 0),
    spendShards: signatures.reduce((sum, spend) => sum + spend.shards, 0),
    spendSignatures: signatures
  };
}

function reconcileFreeNotesSpend(historySpendSignatures, freeNotesAudit, residualLp, residualShards) {
  const exactCounts = new Map();
  const amountCounts = new Map();
  for (const spend of historySpendSignatures || []) {
    exactCounts.set(spend.exact, (exactCounts.get(spend.exact) || 0) + 1);
    amountCounts.set(spend.amount, (amountCounts.get(spend.amount) || 0) + 1);
  }
  let exactDuplicateRows = 0;
  let possibleAmountOnlyDuplicateRows = 0;
  let uniqueSpendLpLower = 0;
  let uniqueSpendShardsLower = 0;
  let uniqueSpendLpUpper = 0;
  let uniqueSpendShardsUpper = 0;
  for (const spend of freeNotesAudit?.spendSignatures || []) {
    const exactCount = exactCounts.get(spend.exact) || 0;
    if (exactCount > 0) {
      exactCounts.set(spend.exact, exactCount - 1);
      const amountCount = amountCounts.get(spend.amount) || 0;
      if (amountCount > 0) amountCounts.set(spend.amount, amountCount - 1);
      exactDuplicateRows++;
      continue;
    }
    /* Names can differ between a free-note shorthand and a scenario memo. An amount-only
       match is ambiguous: calculate a lower and upper balance range instead of guessing. */
    const amountCount = amountCounts.get(spend.amount) || 0;
    if (amountCount > 0) {
      amountCounts.set(spend.amount, amountCount - 1);
      possibleAmountOnlyDuplicateRows++;
    } else {
      uniqueSpendLpLower += spend.lp;
      uniqueSpendShardsLower += spend.shards;
    }
    uniqueSpendLpUpper += spend.lp;
    uniqueSpendShardsUpper += spend.shards;
  }
  return {
    exactDuplicateRows,
    possibleAmountOnlyDuplicateRows,
    uniqueSpendLpLower,
    uniqueSpendShardsLower,
    uniqueSpendLpUpper,
    uniqueSpendShardsUpper,
    residualLpAfterFreeNotesLower: Number.isSafeInteger(residualLp) ? residualLp + uniqueSpendLpLower : null,
    residualShardsAfterFreeNotesLower: Number.isSafeInteger(residualShards) ? residualShards + uniqueSpendShardsLower : null,
    residualLpAfterFreeNotesUpper: Number.isSafeInteger(residualLp) ? residualLp + uniqueSpendLpUpper : null,
    residualShardsAfterFreeNotesUpper: Number.isSafeInteger(residualShards) ? residualShards + uniqueSpendShardsUpper : null
  };
}

function toMarkdownReport(report) {
  const summaryRows = [
    ["URL ID", report.inventory.urlCount],
    ["現時点で取得できた文書", report.inventory.fetched],
    ["以前は取得可能だったが今回取得不可", report.inventory.accessRegressions],
    ["取得不可のまま（以前から既知）", report.inventory.stillUnavailable],
    ["履歴行", report.source.historyRows],
    ["メモ付き履歴", report.source.memoRows],
    ["旧条件の金額＋語句候補（比較基準）", report.parser.legacyCandidateRows],
    ["実操作条件を満たす候補行", report.parser.candidateRows],
    ["旧候補のうち実操作条件も満たす行", report.parser.legacyTransactionCandidateRows],
    ["実操作を確認できないチケットラベル（別集計）", report.parser.nonTransactionalTicketLabelRows],
    ["実操作を確認できない抽出／ガチャラベル（別集計）", report.parser.nonTransactionalDrawLabelRows],
    ["旧候補のうち分類できなかった行", report.parser.unclassifiedLegacyCueRows],
    ["候補行の監査coverage", report.parser.coveredCandidateRows],
    ["現在残高セクションの人手確認候補", report.parser.currentBalanceReviewRows],
    ["監査coverage欠落・未解決等", report.parser.issues.length],
    ["通貨不一致／残高関連警告", report.parser.currencyDiscrepancies],
    ["自由メモを監査した全共有データ", report.balance.freeNotesSource.summary.documentsAnalyzed],
    ["自由メモに購入・消費語がある文書", report.balance.freeNotesSource.summary.documentsWithExpenseCues],
    ["自由メモから購入として認識された行", report.balance.freeNotesSource.summary.recognizedPurchaseRows],
    ["購入語はあるが購入行として認識されない行", report.balance.freeNotesSource.summary.expenseCueRowsNotRecognized],
    ["自由メモの未認識購入行を通常パーサーが支出として読めた行", report.balance.freeNotesSource.summary.unrecognizedCueRowsWithGenericSpend],
    ["その未認識行から通常パーサーが読んだLP／欠片支出", report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendLp + " / " + report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendShards],
    ["購入行だが支出としてパースされない行", report.balance.freeNotesSource.summary.acceptedRowsWithoutParsedSpend],
    ["購入行があるのにシナリオメモが無い文書", report.balance.freeNotesSource.summary.documentsWithPurchasesButNoScenarioMemo.length],
    ["残高ブリッジの対象文書（履歴メモ・通貨値あり）", report.balance.summary.eligibleDocuments],
    ["ルール上の初期資源（LP / 欠片）", report.balance.ruleBasedOpening.summary.ruleInitialLp + " / " + report.balance.ruleBasedOpening.summary.ruleInitialShards],
    ["残高アンカーが読めた文書（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpWithAnchors + " / " + report.balance.ruleBasedOpening.summary.shardsWithAnchors],
    ["推定開始残高が初期資源の範囲内（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpOpeningWithinRuleRange + " / " + report.balance.ruleBasedOpening.summary.shardsOpeningWithinRuleRange],
    ["全アンカーで開始残高推定が一致（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpOpeningStableAcrossAnchors + " / " + report.balance.ruleBasedOpening.summary.shardsOpeningStableAcrossAnchors],
    ["最新アンカーから保存残高を再現（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpLatestAnchorMatchesCurrent + " / " + report.balance.ruleBasedOpening.summary.shardsLatestAnchorMatchesCurrent],
    ["LPの残差が負（収支純額が所持LPを上回る）", report.balance.summary.lpResidualNegative],
    ["欠片の残差が負（収支純額が所持欠片を上回る）", report.balance.summary.shardResidualNegative],
    ["旧ベースラインとの履歴件数差", report.source.snapshotDrift.length],
    ["履歴入力指紋未登録", report.source.historyInputFingerprintMissingRows],
    ["履歴入力指紋の内容差", report.source.historyInputFingerprintDrift.length]
  ];
  const lines = [
    "# 硝子窓共有サンプル・ライブ再監査",
    "",
    "共有文書は読み取り専用で取得しました。原文のメモ・名前・本文はログや成果物に保存していません。",
    "",
    "| 指標 | 件数 |",
    "|---|---:|",
    ...summaryRows.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "## 所持通貨と履歴収支の橋渡し",
    "",
    "ここでいう残差は保存残高からメモ内の収入−明示支出を引いた値です。開始残高・履歴開始前の調整が不明なため、正の残差は開始残高や未記録収入で説明できる可能性があります。負の残差は、非負の開始残高だけでは説明できず、未記録支出・収入の過大計上・解析対象外の履歴を確認する必要があります。",
    "",
    "| URL ID | 履歴行 | メモ行 | 保存LP | 収支純額LP | 残差LP | 保存欠片 | 収支純額欠片 | 残差欠片 | 要確認行 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...report.balance.bridges
      .slice()
      .sort((a, b) => (Math.min(a.impliedOpeningLp, a.impliedOpeningShards) - Math.min(b.impliedOpeningLp, b.impliedOpeningShards)))
      .map((row) => "| " + row.id + " | " + row.historyRows + " | " + row.memoRows + " | " + row.currentLp + " | " + row.netLp + " | " + row.impliedOpeningLp + " | " + row.currentShards + " | " + row.netShards + " | " + row.impliedOpeningShards + " | " + row.reviewRows + " |"),
    "",
    "## 自由メモの購入記録を加味した再照合",
    "",
    "硝子窓の取込実装は freeNotes の secret/history/memo/setting にある購入短文を、シナリオ履歴とは別の未帰属購入として扱います。シナリオ履歴の支出と自由メモの支出が同じ名前・金額なら重複として除外し、金額だけが同じ場合は重複か別取引かを決めつけず、残差を範囲で示します。",
    "",
    "| URL ID | 履歴行 | 自由メモ購入行 | LP支出 | 欠片支出 | 未認識cue支出行 | 同行LP支出 | 同行欠片支出 | 履歴のみ残差LP | 自由メモ考慮後LP範囲 | 履歴のみ残差欠片 | 自由メモ考慮後欠片範囲 | cueを追加した場合LP範囲 | cueを追加した場合欠片範囲 | 完全一致重複 | 金額一致のみ |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---|---:|---:|",
    ...report.balance.freeNotesBridge.documents
      .filter((row) => row.expenseCueRows > 0 || row.parsedSpendRows > 0 || row.possibleAmountOnlyDuplicateRows > 0)
      .map((row) => "| " + row.id + " | " + row.historyRows + " | " + row.parsedSpendRows + " | " + row.freeNotesSpendLp + " | " + row.freeNotesSpendShards + " | " + row.unrecognizedCueRowsWithGenericSpend + "/" + row.cueRowsWithoutPurchaseRow + " | " + row.unrecognizedCueGenericSpendLp + " | " + row.unrecognizedCueGenericSpendShards + " | " + row.residualLpBeforeFreeNotes + " | " + row.residualLpAfterFreeNotesLower + "…" + row.residualLpAfterFreeNotesUpper + " | " + row.residualShardsBeforeFreeNotes + " | " + row.residualShardsAfterFreeNotesLower + "…" + row.residualShardsAfterFreeNotesUpper + " | " + row.genericCueResidualLpLower + "…" + row.genericCueResidualLpUpper + " | " + row.genericCueResidualShardsLower + "…" + row.genericCueResidualShardsUpper + " | " + row.genericCueExactDuplicateRows + " | " + row.genericCuePossibleAmountOnlyDuplicateRows + " |"),
    "",
    "### 自由メモ購入あり・シナリオ履歴メモなし",
    "",
    ...report.balance.freeNotesSource.summary.documentsWithPurchasesButNoScenarioMemo.map((row) =>
      "| " + row.id + " | 履歴行 " + row.historyRows + " | 現在LP " + (row.currentLp ?? "—") + " | 現在欠片 " + (row.currentShards ?? "—") + " | 自由メモ購入 " + row.purchaseRows + "行（LP " + row.spendLp + " / 欠片 " + row.spendShards + "） |"
    ),
    "",
    "## ルールブック初期資源との残差分類",
    "",
    "ルールブック PDF p.14 は初期作成時に30 LP・自我の欠片10個を付与します（PDF抽出テキスト data/provenance/core.txt の PAGE 14）。リザルト履歴が初期作成後の全収支を網羅し、初期作成時の購入だけが履歴開始前に行われたと仮定すれば、保存残高 − 履歴純収支は LP 0～30、欠片0～10の範囲に収まるはずです。範囲外は即座に単一原因を意味しませんが、開始前収入・履歴欠落・未記録支出・パーサーの過大/過小計上・古い保存残高を区別する優先調査対象になります。",
    "",
    "| URL ID | 履歴行 | 保存LP | 純収支LP | 推定開始LP | LP分類 | 保存欠片 | 純収支欠片 | 推定開始欠片 | 欠片分類 | 要確認行 |",
    "|---|---:|---:|---:|---:|---|---:|---:|---:|---|---:|",
    ...report.balance.ruleBasedOpening.documents.map((row) =>
      "| " + row.id + " | " + row.historyRows + " | " + row.currentLp + " | " + row.netLp + " | " + row.impliedOpeningLp + " | " + row.lpClass + " | " + row.currentShards + " | " + row.netShards + " | " + row.impliedOpeningShards + " | " + row.shardsClass + " | " + row.reviewRows + " |"
    ),
    "",
    "### 要確認行の数値診断（本文・名称は非出力）",
    "",
    "| URL ID | 履歴行 | メモ内行 | section | status | expected | detected | parser reason | source finding | audit codes |",
    "|---|---:|---:|---|---|---|---|---:|---|---|",
    ...report.balance.bridges.flatMap((row) => row.reviewDetails.map((detail) =>
      "| " + row.id + " | " + detail.historyRow + " | " + (detail.lineIndex ?? "—") + " | " + detail.section + " | " + detail.status + " | " + JSON.stringify(detail.expected) + " | " + JSON.stringify(detail.detected) + " | " + Number(detail.hasParserReason) + " | " + Number(detail.sourceFinding) + " | " + detail.auditCodes.map((audit) => audit.code + ":" + audit.severity).join(",") + " |"
    )),
    "",
    "## 監査coverageの状態別件数",
    "",
    "| 状態 | 件数 |",
    "|---|---:|",
    ...Object.entries(report.parser.coverageStatuses).sort(([a],[b]) => a.localeCompare(b)).map(([name, count]) => `| ${name} | ${count} |`),
    "",
    "## ソーススナップショットの件数差",
    "",
    report.source.snapshotDrift.length
      ? "| ID | 旧履歴数 | 現行履歴数 | 旧メモ数 | 現行メモ数 |\n|---|---:|---:|---:|---:|\n" + report.source.snapshotDrift.map((r) => `| ${r.id} | ${r.expectedHistoryRows} | ${r.actualHistoryRows} | ${r.expectedMemoRows} | ${r.actualMemoRows} |`).join("\n")
      : "差分なし。",
    "",
    "## 履歴入力指紋の内容差（原文は非表示）",
    "",
    report.source.historyInputFingerprintDrift.length
      ? "| ID | 旧SHA-256 | 現行SHA-256 |\n|---|---|---|\n" + report.source.historyInputFingerprintDrift.map((r) => `| ${r.id} | ${r.expectedSha256} | ${r.actualSha256} |`).join("\\n")
      : "差分なし。",
    "",
    "## 監査上の問題（原文は非表示）",
    "",
    report.parser.issues.length
      ? "| ID | 履歴番号 | 行番号 | コード | 状態 |\n|---|---:|---:|---|---|\n" + report.parser.issues.slice(0, 100).map((r) => `| ${r.id} | ${r.historyIndex + 1} | ${r.lineIndex ?? "—"} | ${r.code} | ${r.status || "—"} |`).join("\n")
      : "未解決のcoverage問題は検出されませんでした。",
    "",
    "## 旧候補の未分類構造診断（原文・金額は非表示）",
    "",
    report.parser.unclassifiedLegacyCueExamples.length
      ? "| ID | 履歴番号 | 行番号 | 文字数 | 金額候補数 | 数字幅 | 検出cue |\n|---|---:|---:|---:|---:|---|---|\n" +
        report.parser.unclassifiedLegacyCueExamples.map((r) => `| ${r.id} | ${r.historyIndex + 1} | ${r.lineIndex} | ${r.details.lineLength} | ${r.details.amountTokenCount} | ${r.details.numericTokenWidths.join(",")} | ${r.details.actionKinds.join(",")} |`).join("\\n")
      : "未分類の旧候補はありません。",
    "",
    "`status` が既知の要確認理由にひも付くケースは、原文から断定できない取引として数値を推測せずに残します。"
  ];
  return lines.join("\n") + "\n";
}

const fetched = await mapLimit(baseline.documents, 5, async (entry) => {
  const result = await fetchSample(entry.id);
  if (!result.ok) return { baseline: entry, result };
  const history = Array.isArray(result.doc?.scenarioHistory) ? result.doc.scenarioHistory : [];
  const memoRows = countNonemptyMemos(history);
  const parsedRows = history.map((row, index) => {
    const memo = String(row?.memo || "");
    if (!memo.trim()) return null;
    return auditMemo(entry.id, index, memo);
  }).filter(Boolean);
  return {
    baseline: entry,
    result,
    actualHistoryRows: history.length,
    actualMemoRows: memoRows,
    currentBalance: storedCurrencyOf(result.doc),
    ruleBasedOpeningAudit: auditRuleBasedOpening(history, storedCurrencyOf(result.doc)),
    freeNotesAudit: auditFreeNotes(result.doc),
    historyInputSha256: historyInputSha256(history),
    parsedRows
  };
});

const knownSuccessful = baseline.documents.filter((entry) => entry.previousFetchStatus === "OK");
const accessRegressions = fetched.filter((entry) => entry.baseline.previousFetchStatus === "OK" && !entry.result.ok);
const currentlyUnavailable = fetched.filter((entry) => !entry.result.ok);
const stillUnavailable = fetched.filter((entry) => entry.baseline.previousFetchStatus === "403" && !entry.result.ok).length;
const successful = fetched.filter((entry) => entry.result.ok);
const snapshotDrift = successful.filter((entry) => entry.baseline.previousFetchStatus === "OK" && (
  entry.actualHistoryRows !== entry.baseline.historyRows || entry.actualMemoRows !== entry.baseline.memoRows
)).map((entry) => ({
  id: entry.baseline.id,
  expectedHistoryRows: entry.baseline.historyRows,
  actualHistoryRows: entry.actualHistoryRows,
  expectedMemoRows: entry.baseline.memoRows,
  actualMemoRows: entry.actualMemoRows
}));
const historyInputFingerprintMissing = knownSuccessful.filter((entry) =>
  !/^[0-9a-f]{64}$/.test(String(entry.historyInputSha256 || ""))
);
const historyInputFingerprintDrift = successful.filter((entry) =>
  entry.baseline.previousFetchStatus === "OK" &&
  /^[0-9a-f]{64}$/.test(String(entry.baseline.historyInputSha256 || "")) &&
  entry.historyInputSha256 !== entry.baseline.historyInputSha256
).map((entry) => ({
  id: entry.baseline.id,
  expectedSha256: entry.baseline.historyInputSha256,
  actualSha256: entry.historyInputSha256
}));
const allParsedRows = successful.flatMap((entry) => entry.parsedRows || []);
const issueRows = allParsedRows.flatMap((entry) => entry.issues);
const coverageStatuses = {};
for (const row of allParsedRows) for (const [status, count] of Object.entries(row.coverageStatuses)) coverageStatuses[status] = (coverageStatuses[status] || 0) + count;

/* 現在のcurrencyと履歴収支を橋渡しする。差額は「既知の開始残高」と同義ではなく、
   履歴開始前からの残高・未記録の調整・パーサーの見落としをまとめた残差として扱う。
   特に負の残差は、開始残高が非負である限り、履歴外の支出または収支の過大計上を要確認。 */
const balanceBridges = successful
  .filter((entry) => entry.actualMemoRows > 0 &&
    Number.isSafeInteger(entry.currentBalance?.lp) &&
    Number.isSafeInteger(entry.currentBalance?.shards))
  .map((entry) => {
    const totals = (entry.parsedRows || []).reduce((sum, row) => {
      const money = row.financial || {};
      for (const key of ["incomeLp", "incomeShards", "spentLp", "spentShards", "netLp", "netShards", "reviewRows", "reasonCount"]) {
        sum[key] += Number(money[key]) || 0;
      }
      return sum;
    }, { incomeLp: 0, incomeShards: 0, spentLp: 0, spentShards: 0, netLp: 0, netShards: 0, reviewRows: 0, reasonCount: 0 });
    return {
      id: entry.baseline.id,
      historyRows: entry.actualHistoryRows,
      memoRows: entry.actualMemoRows,
      currentLp: entry.currentBalance.lp,
      currentShards: entry.currentBalance.shards,
      ...totals,
      impliedOpeningLp: entry.currentBalance.lp - totals.netLp,
      impliedOpeningShards: entry.currentBalance.shards - totals.netShards,
      reviewDetails: (entry.parsedRows || []).flatMap((memo) =>
        (memo.reviewDetails || []).map((detail) => ({
          historyRow: (Number(memo.historyIndex) || 0) + 1,
          ...detail
        }))
      )
    };
  });
const ruleBasedOpeningAudits = balanceBridges.map((row) => {
  const audit = successful.find((entry) => entry.baseline.id === row.id)?.ruleBasedOpeningAudit || {};
  return {
    id: row.id,
    historyRows: row.historyRows,
    memoRows: row.memoRows,
    currentLp: row.currentLp,
    currentShards: row.currentShards,
    netLp: row.netLp,
    netShards: row.netShards,
    impliedOpeningLp: row.impliedOpeningLp,
    impliedOpeningShards: row.impliedOpeningShards,
    lpClass: audit.lpClass || "not-comparable",
    shardsClass: audit.shardsClass || "not-comparable",
    lpCompatible: Boolean(audit.lpCompatible),
    shardsCompatible: Boolean(audit.shardsCompatible),
    bothCompatible: Boolean(audit.bothCompatible),
    lpNegative: Boolean(audit.lpNegative),
    shardsNegative: Boolean(audit.shardsNegative),
    lpAboveCeiling: Boolean(audit.lpAboveCeiling),
    shardsAboveCeiling: Boolean(audit.shardsAboveCeiling),
    reviewRows: row.reviewRows,
    reasonCount: row.reasonCount
  };
});
const ruleBasedOpeningSummary = {
  ruleInitialLp: RULE_INITIAL_RESOURCES.lp,
  ruleInitialShards: RULE_INITIAL_RESOURCES.shards,
  eligibleDocuments: ruleBasedOpeningAudits.length,
  lpCompatibleAfterSetupSpend: ruleBasedOpeningAudits.filter((row) => row.lpCompatible).length,
  shardsCompatibleAfterSetupSpend: ruleBasedOpeningAudits.filter((row) => row.shardsCompatible).length,
  bothCompatibleAfterSetupSpend: ruleBasedOpeningAudits.filter((row) => row.bothCompatible).length,
  lpBelowZero: ruleBasedOpeningAudits.filter((row) => row.lpNegative).length,
  shardsBelowZero: ruleBasedOpeningAudits.filter((row) => row.shardsNegative).length,
  lpAboveInitialCeiling: ruleBasedOpeningAudits.filter((row) => row.lpAboveCeiling).length,
  shardsAboveInitialCeiling: ruleBasedOpeningAudits.filter((row) => row.shardsAboveCeiling).length
};

const freeNotesBridgeRows = balanceBridges.map((row) => {
  const entry = successful.find((candidate) => candidate.baseline.id === row.id);
  const freeNotesAudit = entry?.freeNotesAudit || {
    lineCount: 0, expenseCueRows: 0, recognizedPurchaseLines: 0, parsedSpendRows: 0,
    cueRowsWithoutPurchaseRow: 0, acceptedRowsWithoutParsedSpend: 0,
    unrecognizedCueRowsWithGenericSpend: 0, unrecognizedCueGenericSpendLp: 0, unrecognizedCueGenericSpendShards: 0,
    unrecognizedCueRowsWithCurrencyAmount: 0, unrecognizedCueRowsWithParserReason: 0,
    spendLp: 0, spendShards: 0, spendSignatures: []
  };
  const scenarioSpendSignatures = (entry?.parsedRows || []).flatMap((memo) => memo.spendSignatures || []);
  const unrecognizedCueReconciliation = reconcileFreeNotesSpend(
    scenarioSpendSignatures,
    { spendSignatures: freeNotesAudit.unrecognizedCueSpendSignatures || [] },
    row.impliedOpeningLp,
    row.impliedOpeningShards
  );
  return {
    id: row.id,
    historyRows: row.historyRows,
    currentLp: row.currentLp,
    currentShards: row.currentShards,
    residualLpBeforeFreeNotes: row.impliedOpeningLp,
    residualShardsBeforeFreeNotes: row.impliedOpeningShards,
    ...{
      lineCount: freeNotesAudit.lineCount,
      expenseCueRows: freeNotesAudit.expenseCueRows,
      recognizedPurchaseLines: freeNotesAudit.recognizedPurchaseLines,
      parsedSpendRows: freeNotesAudit.parsedSpendRows,
      cueRowsWithoutPurchaseRow: freeNotesAudit.cueRowsWithoutPurchaseRow,
      acceptedRowsWithoutParsedSpend: freeNotesAudit.acceptedRowsWithoutParsedSpend,
      unrecognizedCueRowsWithGenericSpend: freeNotesAudit.unrecognizedCueRowsWithGenericSpend,
      unrecognizedCueGenericSpendLp: freeNotesAudit.unrecognizedCueGenericSpendLp,
      unrecognizedCueGenericSpendShards: freeNotesAudit.unrecognizedCueGenericSpendShards,
      unrecognizedCueRowsWithCurrencyAmount: freeNotesAudit.unrecognizedCueRowsWithCurrencyAmount,
      unrecognizedCueRowsWithParserReason: freeNotesAudit.unrecognizedCueRowsWithParserReason,
      freeNotesSpendLp: freeNotesAudit.spendLp,
      freeNotesSpendShards: freeNotesAudit.spendShards
    },
    ...reconcileFreeNotesSpend(
      scenarioSpendSignatures,
      freeNotesAudit,
      row.impliedOpeningLp,
      row.impliedOpeningShards
    ),
    genericCueExactDuplicateRows: unrecognizedCueReconciliation.exactDuplicateRows,
    genericCuePossibleAmountOnlyDuplicateRows: unrecognizedCueReconciliation.possibleAmountOnlyDuplicateRows,
    genericCueCandidateLp: freeNotesAudit.unrecognizedCueGenericSpendLp,
    genericCueCandidateShards: freeNotesAudit.unrecognizedCueGenericSpendShards,
    genericCueResidualLpLower: unrecognizedCueReconciliation.residualLpAfterFreeNotesLower,
    genericCueResidualLpUpper: unrecognizedCueReconciliation.residualLpAfterFreeNotesUpper,
    genericCueResidualShardsLower: unrecognizedCueReconciliation.residualShardsAfterFreeNotesLower,
    genericCueResidualShardsUpper: unrecognizedCueReconciliation.residualShardsAfterFreeNotesUpper
  };
});
const freeNotesBridgeSummary = {
  eligibleDocuments: freeNotesBridgeRows.length,
  documentsWithAnyFreeNotes: freeNotesBridgeRows.filter((row) => row.lineCount > 0).length,
  documentsWithExpenseCues: freeNotesBridgeRows.filter((row) => row.expenseCueRows > 0).length,
  documentsWithRecognizedFreeNotesPurchases: freeNotesBridgeRows.filter((row) => row.parsedSpendRows > 0).length,
  recognizedFreeNotesPurchaseRows: freeNotesBridgeRows.reduce((sum, row) => sum + row.parsedSpendRows, 0),
  recognizedFreeNotesSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.freeNotesSpendLp, 0),
  recognizedFreeNotesSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.freeNotesSpendShards, 0),
  documentsWithExpenseCueRowsNotRecognizedAsPurchase: freeNotesBridgeRows.filter((row) => row.cueRowsWithoutPurchaseRow > 0).length,
  expenseCueRowsNotRecognizedAsPurchase: freeNotesBridgeRows.reduce((sum, row) => sum + row.cueRowsWithoutPurchaseRow, 0),
  unrecognizedCueRowsWithGenericSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithGenericSpend, 0),
  unrecognizedCueGenericSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendLp, 0),
  unrecognizedCueGenericSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendShards, 0),
  unrecognizedCueRowsWithCurrencyAmount: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithCurrencyAmount, 0),
  unrecognizedCueRowsWithParserReason: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithParserReason, 0),
  rowsAcceptedAsPurchaseButNotParsedAsSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.acceptedRowsWithoutParsedSpend, 0),
  rowsExactlyDuplicatedWithScenarioSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.exactDuplicateRows, 0),
  rowsPotentiallyDuplicatedByAmountOnly: freeNotesBridgeRows.reduce((sum, row) => sum + row.possibleAmountOnlyDuplicateRows, 0),
  lpNegativeBefore: freeNotesBridgeRows.filter((row) => row.residualLpBeforeFreeNotes < 0).length,
  lpNegativeAfterPossibleUniqueFreeNotesLower: freeNotesBridgeRows.filter((row) => row.residualLpAfterFreeNotesLower < 0).length,
  lpNegativeAfterPossibleUniqueFreeNotesUpper: freeNotesBridgeRows.filter((row) => row.residualLpAfterFreeNotesUpper < 0).length,
  shardsNegativeBefore: freeNotesBridgeRows.filter((row) => row.residualShardsBeforeFreeNotes < 0).length,
  shardsNegativeAfterPossibleUniqueFreeNotesLower: freeNotesBridgeRows.filter((row) => row.residualShardsAfterFreeNotesLower < 0).length,
  shardsNegativeAfterPossibleUniqueFreeNotesUpper: freeNotesBridgeRows.filter((row) => row.residualShardsAfterFreeNotesUpper < 0).length,
  documentsWithGenericCueSpends: freeNotesBridgeRows.filter((row) => row.unrecognizedCueRowsWithGenericSpend > 0).length,
  genericCueSpendRows: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithGenericSpend, 0),
  genericCueSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendLp, 0),
  genericCueSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendShards, 0),
  lpNegativeAfterGenericCueLower: freeNotesBridgeRows.filter((row) => row.genericCueResidualLpLower < 0).length,
  lpNegativeAfterGenericCueUpper: freeNotesBridgeRows.filter((row) => row.genericCueResidualLpUpper < 0).length,
  shardsNegativeAfterGenericCueLower: freeNotesBridgeRows.filter((row) => row.genericCueResidualShardsLower < 0).length,
  shardsNegativeAfterGenericCueUpper: freeNotesBridgeRows.filter((row) => row.genericCueResidualShardsUpper < 0).length
};

const freeNotesSourceSummary = {
  documentsAnalyzed: successful.length,
  documentsWithAnyFreeNotes: successful.filter((entry) => (entry.freeNotesAudit?.lineCount || 0) > 0).length,
  documentsWithExpenseCues: successful.filter((entry) => (entry.freeNotesAudit?.expenseCueRows || 0) > 0).length,
  documentsWithRecognizedPurchases: successful.filter((entry) => (entry.freeNotesAudit?.parsedSpendRows || 0) > 0).length,
  recognizedPurchaseRows: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.parsedSpendRows || 0), 0),
  recognizedSpendLp: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.spendLp || 0), 0),
  recognizedSpendShards: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.spendShards || 0), 0),
  documentsWithExpenseCuesNotRecognized: successful.filter((entry) => (entry.freeNotesAudit?.cueRowsWithoutPurchaseRow || 0) > 0).length,
  expenseCueRowsNotRecognized: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.cueRowsWithoutPurchaseRow || 0), 0),
  unrecognizedCueRowsWithGenericSpend: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithGenericSpend || 0), 0),
  unrecognizedCueGenericSpendLp: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueGenericSpendLp || 0), 0),
  unrecognizedCueGenericSpendShards: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueGenericSpendShards || 0), 0),
  unrecognizedCueRowsWithCurrencyAmount: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithCurrencyAmount || 0), 0),
  unrecognizedCueRowsWithParserReason: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithParserReason || 0), 0),
  acceptedRowsWithoutParsedSpend: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.acceptedRowsWithoutParsedSpend || 0), 0),
  documentsWithPurchasesButNoScenarioMemo: successful
    .filter((entry) => entry.actualMemoRows === 0 && (entry.freeNotesAudit?.parsedSpendRows || 0) > 0)
    .map((entry) => ({
      id: entry.baseline.id,
      historyRows: entry.actualHistoryRows,
      currentLp: entry.currentBalance?.lp ?? null,
      currentShards: entry.currentBalance?.shards ?? null,
      purchaseRows: entry.freeNotesAudit.parsedSpendRows,
      spendLp: entry.freeNotesAudit.spendLp,
      spendShards: entry.freeNotesAudit.spendShards
    }))
};

const balanceBridgeSummary = {
  eligibleDocuments: balanceBridges.length,
  excludedNoMemoOrUnreadableBalance: successful.length - balanceBridges.length,
  lpResidualNegative: balanceBridges.filter((row) => row.impliedOpeningLp < 0).length,
  lpResidualZero: balanceBridges.filter((row) => row.impliedOpeningLp === 0).length,
  lpResidualPositive: balanceBridges.filter((row) => row.impliedOpeningLp > 0).length,
  shardResidualNegative: balanceBridges.filter((row) => row.impliedOpeningShards < 0).length,
  shardResidualZero: balanceBridges.filter((row) => row.impliedOpeningShards === 0).length,
  shardResidualPositive: balanceBridges.filter((row) => row.impliedOpeningShards > 0).length,
  negativeLpIds: balanceBridges.filter((row) => row.impliedOpeningLp < 0).map((row) => row.id),
  negativeShardIds: balanceBridges.filter((row) => row.impliedOpeningShards < 0).map((row) => row.id)
};
const report = {
  inventory: {
    urlCount: baseline.documents.length,
    fetched: successful.length,
    accessRegressions: accessRegressions.length,
    stillUnavailable
  },
  source: {
    historyRows: successful.reduce((sum, entry) => sum + entry.actualHistoryRows, 0),
    memoRows: successful.reduce((sum, entry) => sum + entry.actualMemoRows, 0),
    /* Emit all live IDs and hashes only while bootstrapping missing baselines. */
    historyInputFingerprintMissingRows: historyInputFingerprintMissing.length,
    historyInputFingerprintDrift,
    historyInputFingerprints: historyInputFingerprintMissing.length
      ? successful.filter((entry) => entry.baseline.previousFetchStatus === "OK")
          .map((entry) => ({ id: entry.baseline.id, sha256: entry.historyInputSha256 }))
      : [],
    snapshotDrift
  },
  parser: {
    legacyCandidateRows: allParsedRows.reduce((sum, row) => sum + row.legacyCandidates, 0),
    legacyTransactionCandidateRows: allParsedRows.reduce((sum, row) => sum + row.legacyTransactionCandidates, 0),
    candidateRows: allParsedRows.reduce((sum, row) => sum + row.candidates, 0),
    coveredCandidateRows: allParsedRows.reduce((sum, row) => sum + row.covered, 0),
    nonTransactionalTicketLabelRows: allParsedRows.reduce((sum, row) => sum + row.nonTransactionalTicketLabels, 0),
    nonTransactionalDrawLabelRows: allParsedRows.reduce((sum, row) => sum + row.nonTransactionalDrawLabels, 0),
    unclassifiedLegacyCueRows: allParsedRows.reduce((sum, row) => sum + row.unclassifiedLegacyCues, 0),
    unclassifiedLegacyCueExamples: allParsedRows.flatMap((row) => row.unclassifiedLegacyCueExamples || []).slice(0, 20),
    currentBalanceReviewRows: coverageStatuses["current-balance-review"] || 0,
    currencyDiscrepancies: allParsedRows.reduce((sum, row) => sum + row.currencyDiscrepancies, 0),
    coverageStatuses,
    issues: issueRows
  },
  balance: {
    interpretation: "ルールブック初期資源は30 LP / 自我の欠片10。シナリオ開始時点の推定残高は、開始前の人格・アイテム購入などにより低くなり得る。現在/現座の残高アンカーと、それ以前にパーサが認識した収支から開始残高を各チェックポイントごとに逆算し、値が安定するか・0～初期資源上限内か・最新アンカーから保存残高へ再現できるかを確認する。",
    summary: balanceBridgeSummary,
    bridges: balanceBridges,
    freeNotesBridge: {
      summary: freeNotesBridgeSummary,
      documents: freeNotesBridgeRows
    },
    freeNotesSource: {
      summary: freeNotesSourceSummary
    },
    ruleBasedOpening: {
      summary: ruleBasedOpeningSummary,
      documents: ruleBasedOpeningAudits
    }
  }
};

const markdown = toMarkdownReport(report);
console.log(markdown);
console.log(JSON.stringify({
  summary: {
    urls: report.inventory.urlCount,
    fetched: report.inventory.fetched,
    accessRegressions: report.inventory.accessRegressions,
    stillUnavailable: report.inventory.stillUnavailable,
    historyRows: report.source.historyRows,
    memoRows: report.source.memoRows,
    legacyCandidateRows: report.parser.legacyCandidateRows,
    legacyTransactionCandidateRows: report.parser.legacyTransactionCandidateRows,
    candidateRows: report.parser.candidateRows,
    coveredCandidateRows: report.parser.coveredCandidateRows,
    nonTransactionalTicketLabelRows: report.parser.nonTransactionalTicketLabelRows,
    nonTransactionalDrawLabelRows: report.parser.nonTransactionalDrawLabelRows,
    unclassifiedLegacyCueRows: report.parser.unclassifiedLegacyCueRows,
    currentBalanceReviewRows: report.parser.currentBalanceReviewRows,
    issueCount: report.parser.issues.length,
    currencyDiscrepancies: report.parser.currencyDiscrepancies,
    balanceBridgeDocuments: report.balance.summary.eligibleDocuments,
    freeNotesSourceDocumentsAnalyzed: report.balance.freeNotesSource.summary.documentsAnalyzed,
    freeNotesSourceDocumentsWithExpenseCues: report.balance.freeNotesSource.summary.documentsWithExpenseCues,
    freeNotesSourceDocumentsWithRecognizedPurchases: report.balance.freeNotesSource.summary.documentsWithRecognizedPurchases,
    freeNotesSourceRecognizedPurchaseRows: report.balance.freeNotesSource.summary.recognizedPurchaseRows,
    freeNotesSourceSpendLp: report.balance.freeNotesSource.summary.recognizedSpendLp,
    freeNotesSourceSpendShards: report.balance.freeNotesSource.summary.recognizedSpendShards,
    freeNotesSourceUnrecognizedExpenseCues: report.balance.freeNotesSource.summary.expenseCueRowsNotRecognized,
    freeNotesSourceUnrecognizedCueGenericSpendRows: report.balance.freeNotesSource.summary.unrecognizedCueRowsWithGenericSpend,
    freeNotesSourceUnrecognizedCueGenericSpendLp: report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendLp,
    freeNotesSourceUnrecognizedCueGenericSpendShards: report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendShards,
    freeNotesSourceUnrecognizedCueCurrencyAmountRows: report.balance.freeNotesSource.summary.unrecognizedCueRowsWithCurrencyAmount,
    freeNotesSourceUnrecognizedCueRowsWithParserReason: report.balance.freeNotesSource.summary.unrecognizedCueRowsWithParserReason,
    freeNotesSourcePurchasesWithoutScenarioMemo: report.balance.freeNotesSource.summary.documentsWithPurchasesButNoScenarioMemo.length,
    freeNotesSourceUnparsedAcceptedRows: report.balance.freeNotesSource.summary.acceptedRowsWithoutParsedSpend,
    freeNotesDocumentsWithExpenseCues: report.balance.freeNotesBridge.summary.documentsWithExpenseCues,
    freeNotesDocumentsWithRecognizedPurchases: report.balance.freeNotesBridge.summary.documentsWithRecognizedFreeNotesPurchases,
    freeNotesRecognizedPurchaseRows: report.balance.freeNotesBridge.summary.recognizedFreeNotesPurchaseRows,
    freeNotesSpendLp: report.balance.freeNotesBridge.summary.recognizedFreeNotesSpendLp,
    freeNotesSpendShards: report.balance.freeNotesBridge.summary.recognizedFreeNotesSpendShards,
    freeNotesCueRowsUnrecognized: report.balance.freeNotesBridge.summary.expenseCueRowsNotRecognizedAsPurchase,
    freeNotesExactDuplicatePurchaseRows: report.balance.freeNotesBridge.summary.rowsExactlyDuplicatedWithScenarioSpend,
    freeNotesPossibleDuplicateByAmountRows: report.balance.freeNotesBridge.summary.rowsPotentiallyDuplicatedByAmountOnly,
    freeNotesGenericCueSpendRows: report.balance.freeNotesBridge.summary.genericCueSpendRows,
    freeNotesGenericCueSpendLp: report.balance.freeNotesBridge.summary.genericCueSpendLp,
    freeNotesGenericCueSpendShards: report.balance.freeNotesBridge.summary.genericCueSpendShards,
    lpNegativeAfterGenericCueLower: report.balance.freeNotesBridge.summary.lpNegativeAfterGenericCueLower,
    lpNegativeAfterGenericCueUpper: report.balance.freeNotesBridge.summary.lpNegativeAfterGenericCueUpper,
    shardsNegativeAfterGenericCueLower: report.balance.freeNotesBridge.summary.shardsNegativeAfterGenericCueLower,
    shardsNegativeAfterGenericCueUpper: report.balance.freeNotesBridge.summary.shardsNegativeAfterGenericCueUpper,
    lpNegativeAfterFreeNotesLower: report.balance.freeNotesBridge.summary.lpNegativeAfterPossibleUniqueFreeNotesLower,
    lpNegativeAfterFreeNotesUpper: report.balance.freeNotesBridge.summary.lpNegativeAfterPossibleUniqueFreeNotesUpper,
    shardsNegativeAfterFreeNotesLower: report.balance.freeNotesBridge.summary.shardsNegativeAfterPossibleUniqueFreeNotesLower,
    shardsNegativeAfterFreeNotesUpper: report.balance.freeNotesBridge.summary.shardsNegativeAfterPossibleUniqueFreeNotesUpper,
    ruleBasedOpeningDocuments: report.balance.ruleBasedOpening.summary.eligibleDocuments,
    ruleBasedLpCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.lpCompatibleAfterSetupSpend,
    ruleBasedShardCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.shardsCompatibleAfterSetupSpend,
    ruleBasedBothCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.bothCompatibleAfterSetupSpend,
    ruleBasedLpBelowZero: report.balance.ruleBasedOpening.summary.lpBelowZero,
    ruleBasedShardBelowZero: report.balance.ruleBasedOpening.summary.shardsBelowZero,
    ruleBasedLpAboveInitialCeiling: report.balance.ruleBasedOpening.summary.lpAboveInitialCeiling,
    ruleBasedShardAboveInitialCeiling: report.balance.ruleBasedOpening.summary.shardsAboveInitialCeiling,
    negativeLpResidualDocuments: report.balance.summary.lpResidualNegative,
    negativeShardResidualDocuments: report.balance.summary.shardResidualNegative,
    snapshotDriftRows: report.source.snapshotDrift.length,
    historyInputFingerprintMissingRows: report.source.historyInputFingerprintMissingRows,
    historyInputFingerprintDriftRows: report.source.historyInputFingerprintDrift.length
  },
  snapshotDrift: report.source.snapshotDrift,
  historyInputFingerprintDrift: report.source.historyInputFingerprintDrift,
  historyInputFingerprints: report.source.historyInputFingerprints,
  issueCodes: report.parser.issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {}),
  balanceBridgeSummary: report.balance.summary,
  balanceBridges: report.balance.bridges,
  freeNotesSourceSummary: report.balance.freeNotesSource.summary,
  freeNotesBridgeSummary: report.balance.freeNotesBridge.summary,
  freeNotesBridgeDocuments: report.balance.freeNotesBridge.documents,
  ruleBasedOpeningSummary: report.balance.ruleBasedOpening.summary,
  ruleBasedOpeningDocuments: report.balance.ruleBasedOpening.documents,
  reviewDetailsCount: report.balance.bridges.reduce((sum, row) => sum + row.reviewDetails.length, 0),
  reviewDetails: report.balance.bridges.flatMap((row) => row.reviewDetails.map((detail) => ({ id: row.id, ...detail }))),
  issues: report.parser.issues.slice(0, 100),
  unclassifiedLegacyCueExamples: report.parser.unclassifiedLegacyCueExamples
}, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (successful.length < knownSuccessful.length || accessRegressions.length > 0 ||
    report.parser.issues.length > 0 || report.parser.unclassifiedLegacyCueRows > 0 ||
    report.source.historyInputFingerprintMissingRows > 0 ||
    report.source.historyInputFingerprintDrift.length > 0) {
  process.exitCode = 1;
}
