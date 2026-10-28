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
const CANDIDATE_AMOUNT = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i;
const CANDIDATE_ACTION = /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/;
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

function auditMemo(id, historyIndex, memo) {
  const parsed = MEMO.parseMemo(memo);
  const lines = String(memo || "").split(/\r?\n/);
  const coverages = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
  const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
  const issues = [];
  let candidates = 0;
  let covered = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || !CANDIDATE_AMOUNT.test(line) || !CANDIDATE_ACTION.test(line)) continue;
    candidates++;
    const lineNumber = i + 1;
    const coverage = coverages.find((entry) => entry && entry.lineIndex === lineNumber);
    const relatedAudit = isRelated(audits, lineNumber);
    const relatedReason = reasons.some((entry) => String(entry.line || "").trim() === line.trim());

    if (!coverage) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "missing-line-coverage" });
      continue;
    }
    covered++;
    if (coverage.status === "unresolved") {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unresolved-line" });
    } else if (["mismatch", "direction-review"].includes(coverage.status) && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unexplained-mismatch", status: coverage.status });
    } else if (coverage.status === "reviewed-by-parser-reason" && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unshown-parser-reason" });
    }
  }

  const hasAmount = CANDIDATE_AMOUNT.test(String(memo || ""));
  const hasAction = CANDIDATE_ACTION.test(String(memo || ""));
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

  return { candidates, covered, issues, coverageStatuses: coverages.reduce((counts, entry) => {
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
    ["金額＋操作語の候補行", report.parser.candidateRows],
    ["候補行の監査coverage", report.parser.coveredCandidateRows],
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
    candidateRows: allParsedRows.reduce((sum, row) => sum + row.candidates, 0),
    coveredCandidateRows: allParsedRows.reduce((sum, row) => sum + row.covered, 0),
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
    candidateRows: report.parser.candidateRows,
    coveredCandidateRows: report.parser.coveredCandidateRows,
    issueCount: report.parser.issues.length,
    currencyDiscrepancies: report.parser.currencyDiscrepancies,
    snapshotDriftRows: report.source.snapshotDrift.length
  },
  snapshotDrift: report.source.snapshotDrift,
  issueCodes: report.parser.issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {}),
  issues: report.parser.issues.slice(0, 100)
}, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (successful.length < knownSuccessful.length || accessRegressions.length > 0 || report.parser.issues.length > 0) {
  process.exitCode = 1;
}
