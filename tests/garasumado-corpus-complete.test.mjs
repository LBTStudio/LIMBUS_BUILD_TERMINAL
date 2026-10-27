import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const MEMO = (() => {
  const source = readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "garasumado-memo-parse.js" });
  return context.window.LBT_garaMemo;
})();

const memoCorpus = readFileSync(new URL("./fixtures/garasumado-memo-corpus.txt", import.meta.url), "utf8");
const resultLogCorpus = readFileSync(new URL("./fixtures/result-log-corpus.txt", import.meta.url), "utf8");

const amountPattern = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i;
const currencyPattern = /(?:LP|ＬＰ|自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片)|LP|ＬＰ/i;
const moneyActionPattern = /報酬|収入|消費|支出|支払|購入|買っ|抽出|ガチャ|チケット|チケ|獲得|入手|取得|補填|変換|換算|使用|行使|同期|解除|サポスロ/i;
const explicitSpendVerb = /消費|支出|支払|購入|買っ|使用|行使|補填|変換|換算/i;

function splitSamples(source) {
  const sessions = [];
  const orphans = [];
  let current = null;
  let pendingTitle = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (pendingTitle !== null) {
      const close = line.indexOf("】");
      if (close < 0) {
        pendingTitle += " " + line;
        continue;
      }
      pendingTitle = (pendingTitle + " " + line.slice(0, close).trim()).trim();
      current = { title: pendingTitle, lines: [] };
      pendingTitle = null;
      const tail = line.slice(close + 1).trim();
      if (tail) current.lines.push(tail);
      continue;
    }
    if (line.startsWith("【")) {
      if (current) sessions.push(current);
      const close = line.indexOf("】");
      if (close < 0) {
        current = null;
        pendingTitle = line.slice(1).trim();
        continue;
      }
      current = { title: line.slice(1, close).trim(), lines: [] };
      const tail = line.slice(close + 1).trim();
      if (tail) current.lines.push(tail);
      continue;
    }
    /* 1件だけ、原文が閉じ括弧「】」だけで見出しを閉じているサンプルがある。
       明確な見出しの誤記として別サンプル化し、前のシナリオへ混ぜない。 */
    const closingOnlyTitle = line.match(/^([^【】]+)】$/);
    if (closingOnlyTitle && !amountPattern.test(line) && !moneyActionPattern.test(line)) {
      if (current) sessions.push(current);
      current = { title: closingOnlyTitle[1].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(rawLine);
    else if (line) orphans.push({ line: rawLine, index: orphans.length + 1 });
  }
  if (pendingTitle !== null) orphans.push({ line: "閉じ括弧のない見出し: " + pendingTitle, index: 0 });
  if (current) sessions.push(current);
  return { sessions, orphans };
}

function hasRelatedAudit(audits, lineIndex) {
  return audits.some((entry) => entry && (
    entry.lineIndex === lineIndex ||
    entry.relatedLineIndex === lineIndex ||
    (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === lineIndex))
  ));
}

function rowHasReason(reasons, sourceLine) {
  return reasons.some((entry) => String(entry && entry.line || "").trim() === sourceLine.trim());
}

function withoutBalance(line) {
  return line.replace(/(?:現在|現座|残高|残り)\s*(?:(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片))\s*)?[：:]?\s*[+＋\-−]?\s*[0-9０-９][0-9０-９,，]*(?:\s*(?:LP|ＬＰ|(?:自我の)?(?:欠片|かけら|欠けら|カケラ|けっか|欠け片)))?/gi, " ");
}

function auditCorpus(label, source, expectedCount) {
  const split = splitSamples(source);
  assert.deepEqual(split.orphans, [], label + ": 見出しに帰属しないサンプル本文がある");
  assert.equal(split.sessions.length, expectedCount, label + ": 全サンプルを区切れていない");
  const issues = [];
  let auditedAmountRows = 0;
  let auditedActionRows = 0;
  let balanceOnlyRows = 0;
  let unitlessSpendRows = 0;
  let coverageRows = 0;
  let sourceRows = 0;

  for (const session of split.sessions) {
    const memo = session.lines.join("\n");
    const parsed = MEMO.parseMemo(memo);
    const coverage = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
    const coverageByLine = new Map(coverage.map((row) => [row.lineIndex, row]));
    let mode = "income";

    for (let index = 0; index < session.lines.length; index++) {
      const sourceLine = String(session.lines[index] || "").trim();
      const lineIndex = index + 1;
      if (!sourceLine) continue;
      if (/^[・･]\s*(?:支出|支払)/.test(sourceLine)) {
        mode = "spend";
        continue;
      }
      if (/^[・･].*(?:現在|残高)/.test(sourceLine)) {
        mode = "current";
        continue;
      }
      const amountLike = amountPattern.test(sourceLine);
      const actionLike = moneyActionPattern.test(sourceLine);
      const explicitAudit = hasRelatedAudit(audits, lineIndex);
      const reason = rowHasReason(reasons, sourceLine);
      const finding = coverageByLine.get(lineIndex);
      if (amountLike) auditedAmountRows++;
      if (amountLike && actionLike) auditedActionRows++;
      if (finding) {
        coverageRows++;
        if (finding.status === "unresolved") {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: financialCoverage が unresolved: " + sourceLine);
        }
        if (["mismatch", "direction-review", "reviewed-by-parser-reason"].includes(finding.status)
            && !explicitAudit && !reason) {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: " + finding.status + " の理由が利用者へ届かない: " + sourceLine);
        }
      }

      const balanceMarker = /(?:現在|現座|残高|残り)/.test(sourceLine);
      const transactionVerb = explicitSpendVerb.test(sourceLine);
      const afterBalanceRemoval = withoutBalance(sourceLine);
      const isOnlyBalanceInSpend = mode === "spend" && balanceMarker && !transactionVerb
        && !amountPattern.test(afterBalanceRemoval);
      if (isOnlyBalanceInSpend) {
        balanceOnlyRows++;
        const positiveSpendForThisLine = (parsed.spends || []).some((entry) =>
          String(entry.raw || "").trim() === sourceLine &&
          ((Number(entry.lp) || 0) > 0 || (Number(entry.shards) || 0) > 0)
        );
        if (positiveSpendForThisLine) {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: 現在残高を支出額へ誤計上: " + sourceLine);
        }
        if (!finding && !explicitAudit && !reason) {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: 支出欄の残高だけの行に要確認記録がない: " + sourceLine);
        }
        continue;
      }

      if (amountLike && mode !== "current") {
        if (!finding && !explicitAudit && !reason) {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: 金額行が coverage/audit/reason のどれにも紐付いていない: " + sourceLine);
        }
      }

      const hasUnitlessTerminalAmount = /(?:^|[^0-9０-９])[0-9０-９][0-9０-９,，]*\s*[)）】」』、，。]?\s*$/.test(sourceLine);
      const isRecordedConsumable = (parsed.consumedItems || []).some((entry) =>
        String(entry.raw || "").trim() === sourceLine
      );
      const isRecordedTicket = (parsed.ticketSpends || []).some((entry) =>
        String(entry.raw || "").trim() === sourceLine
      );
      const hasUnpricedSpendCandidate = mode === "spend" && !currencyPattern.test(sourceLine)
        && (balanceMarker || hasUnitlessTerminalAmount)
        && !isRecordedConsumable && !isRecordedTicket
        && !/^(?:抽出|人格抽出|E\.?G\.?O\.?抽出).*?(?:通常人格|特異人格)/i.test(sourceLine);
      if (hasUnpricedSpendCandidate) {
        unitlessSpendRows++;
        if (!finding && !explicitAudit && !reason) {
          issues.push(label + " / " + session.title + " / " + lineIndex + "行: 単位なしの支出候補が無言で落ちた: " + sourceLine);
        }
      }
    }

    sourceRows += session.lines.length;
  }

  assert.ok(auditedAmountRows > 100, label + ": 金額候補行が監査対象に入っていない (" + auditedAmountRows + ")");
  assert.ok(coverageRows > 0, label + ": financialCoverage が生成されていない");
  return {
    label, samples: split.sessions.length, sourceRows,
    auditedAmountRows, auditedActionRows, balanceOnlyRows, unitlessSpendRows, coverageRows,
    issueCount: issues.length, issues: issues.slice(0, 18)
  };
}

test("メモ/結果ログの全サンプルを再区切りし、金額行・残高行・単位省略支出の見落としを監査する", () => {
  const memoResult = auditCorpus("メモコーパス", memoCorpus, 71);
  const resultResult = auditCorpus("結果ログコーパス", resultLogCorpus, 126);
  const failures = [memoResult, resultResult].flatMap((summary) => summary.issues.map((item) => summary.label + ": " + item));
  assert.deepEqual(failures.slice(0, 18), [],
    "コーパス全件で検出漏れ/残高誤計上/警告未伝達が見つかりました:\n" +
    failures.slice(0, 18).join("\n") + (failures.length > 18 ? "\n…残り" + (failures.length - 18) + "件" : ""));
  assert.equal(memoResult.samples, 71);
  assert.equal(resultResult.samples, 126);
});

test("単位なし支出と現在残高だけの行は金額を捏造せず、原文確認の理由を残す", () => {
  const rows = [
    "90LP：現在100LP",
    "・支出",
    "東部親指ソルダードII　87",
    "南部センク協会5課フィクサー　現在52LP",
    "ラ・マンチャランド 理髪師　現在28"
  ];
  const parsed = MEMO.parseMemo(rows.join("\n"));
  assert.equal(parsed.income.lp, 90, "収入額と現在残高を取り違えない");
  for (const raw of rows.slice(2)) {
    assert.ok(
      parsed.reasons.some((entry) => String(entry.line || "").trim() === raw.trim()),
      "支出候補を黙って捨てず、通貨の推測もせず理由を残す: " + raw
    );
    assert.equal(
      parsed.spends.some((entry) => String(entry.raw || "").trim() === raw.trim()
        && ((Number(entry.lp) || 0) > 0 || (Number(entry.shards) || 0) > 0)),
      false,
      "明示されていない金額/残高を支出額として捏造しない: " + raw
    );
  }
});
