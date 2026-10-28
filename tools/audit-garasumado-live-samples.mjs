#!/usr/bin/env node
/**
 * Read-only live regression audit for the 98 shared URLs gathered on 2026-10-27.
 *
 * Do not persist document bodies or print memo text: shared records can contain
 * user-written notes and names. The committed baseline contains inventory
 * metadata only; parser checks run against current Firestore documents.
 */
import { readFileSync, appendFileSync } from "node:fs";
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
    !CANDIDATE_TICKET_ACTION.test(withoutBalances) &&
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

  return { candidates, covered, legacyCandidates, legacyTransactionCandidates, nonTransactionalTicketLabels, nonTransactionalDrawLabels, unclassifiedLegacyCues, unclassifiedLegacyCueExamples, issues, coverageStatuses: coverages.reduce((counts, entry) => {
    const status = String(entry?.status || "missing-status");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}), currencyDiscrepancies: (parsed.currencyDiscrepancies || []).length };
}

function countNonemptyMemos(history) {
  return history.filter((row) => String(row?.memo || "").trim()).length;
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
    ["旧ベースラインとの履歴件数差", report.source.snapshotDrift.length]
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
const allParsedRows = successful.flatMap((entry) => entry.parsedRows || []);
const issueRows = allParsedRows.flatMap((entry) => entry.issues);
const coverageStatuses = {};
for (const row of allParsedRows) for (const [status, count] of Object.entries(row.coverageStatuses)) coverageStatuses[status] = (coverageStatuses[status] || 0) + count;
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
    snapshotDriftRows: report.source.snapshotDrift.length
  },
  snapshotDrift: report.source.snapshotDrift,
  issueCodes: report.parser.issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {}),
  issues: report.parser.issues.slice(0, 100),
  unclassifiedLegacyCueExamples: report.parser.unclassifiedLegacyCueExamples
}, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (successful.length < knownSuccessful.length || accessRegressions.length > 0 || report.parser.issues.length > 0 || report.parser.unclassifiedLegacyCueRows > 0) {
  process.exitCode = 1;
}
