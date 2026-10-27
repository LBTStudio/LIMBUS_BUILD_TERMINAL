import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function readFixture(path) {
  return readFileSync(new URL("./fixtures/" + path, import.meta.url), "utf8");
}

function loadMemoParser() {
  const source = readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "garasumado-memo-parse.js" });
  return context.window.LBT_garaMemo;
}

const MEMO = loadMemoParser();
const allSamples = JSON.parse(readFixture("garasumado-samples.json"));
const publicExamples = JSON.parse(readFixture("garasumado-public-examples.json"));
const memoCorpus = readFixture("garasumado-memo-corpus.txt");
const resultLogCorpus = readFixture("result-log-corpus.txt");

function splitHeadingCorpus(sourceName, sourceText) {
  const records = [];
  let current = null;
  for (const line of sourceText.split(/\r?\n/)) {
    if (/^【/.test(line)) {
      if (current) records.push(current);
      current = { source: sourceName, name: line.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      records.push({ source: sourceName, name: sourceName + "（見出し前）", lines: [line] });
    }
  }
  if (current) records.push(current);
  return records.map((row) => ({ ...row, memo: row.lines.join("\n") }));
}

const corpora = [
  ...splitHeadingCorpus("garasumado-memo-corpus.txt", memoCorpus),
  ...splitHeadingCorpus("result-log-corpus.txt", resultLogCorpus)
];

const hasCurrencyAmount = (line) =>
  /(?:[+＋\-−－]?\s*[0-9０-９][0-9０-９,，]*(?:\s*[+＋]\s*[0-9０-９][0-9０-９,，]*)*\s*(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|かけら|欠けら|カケラ|けっか|欠け片)|(?:LP|ＬＰ|自我の(?:破片|欠片)|欠片|かけら|欠けら|カケラ|けっか|欠け片)\s*[:：]?\s*[+＋\-−－]?\s*[0-9０-９])/i.test(line);

const hasTransactionWord = (line) =>
  /報酬|収入|消費|支出|支払|購入|買っ|使用|行使|抽出|ガチャ|チケット|チケ|獲得|入手|取得|受領|付与|支給|補填|変換|換算|交換|被り|重複/.test(line);

const isCurrencyOnlyTotalLine = (line) =>
  /^\s*(?:[0-9０-９,，]+\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|けっか|欠け片)\s*){1,2}$/i.test(line);

function auditCandidateLines(memo) {
  const candidates = [];
  let section = "income";
  const lines = String(memo || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const normalized = line.normalize("NFKC");
    const trimmed = normalized.trim();
    if (!trimmed) continue;

    if (/^[・•]?\s*(?:支出|支払い|支払)(?:\s|[:：]|$)/.test(trimmed)) {
      section = "spend";
      continue;
    }
    if (/^[・•]?\s*(?:現在|残高)\s*$/.test(trimmed)) {
      section = "current";
      continue;
    }
    if (/^[・•]?\s*(?:報酬|収入)\s*$/.test(trimmed)) {
      section = "income";
      continue;
    }

    const hasTicketCount = /チケット|チケ|抽出🎫/.test(line) &&
      (/[x×]\s*[0-9０-９]|[0-9０-９]+\s*枚|報酬|消費|支出|購入|獲得|入手|取得|抽出|ガチャ/.test(line));
    const hasBalancePair = hasCurrencyAmount(line) && /(?:現在|現座|残り|残高)/.test(line) &&
      /(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|けっか|欠け片)/i.test(line);
    const hasUnitlessSpendAmount = section === "spend" &&
      /(?:^|\s)[+\-−]?\d[\d,]*\s*$/.test(normalized) &&
      !/(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|けっか|欠け片|チケット|d\d)/i.test(line) &&
      /[^\d\s]+/.test(normalized);

    if (hasUnitlessSpendAmount ||
        hasTicketCount ||
        (hasCurrencyAmount && (hasTransactionWord(line) ||
          (section !== "current" && (hasBalancePair ||
            !(section === "spend" && isCurrencyOnlyTotalLine(trimmed))))))) {
      candidates.push({ lineIndex: index + 1, line, section, hasUnitlessSpendAmount });
    }
  }
  return candidates;
}

function relatedToLine(entries, lineIndex, sourceLine) {
  return (entries || []).some((entry) => entry && (
    entry.lineIndex === lineIndex ||
    entry.relatedLineIndex === lineIndex ||
    (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row && row.lineIndex === lineIndex)) ||
    String(entry.line || "").trim() === sourceLine.trim()
  ));
}

test("監査資材の全件数を固定し、隠れた未検証サンプルの増減を検知する", () => {
  const sampleRows = Object.values(allSamples);
  const chars = sampleRows.filter((row) => row && row.coll === "characters");
  const personas = sampleRows.filter((row) => row && row.coll === "personas");
  const history = chars.flatMap((row) => Array.isArray(row.doc?.scenarioHistory) ? row.doc.scenarioHistory : []);
  const nonemptyHistory = history.filter((row) => String(row?.memo || "").trim());

  assert.equal(chars.length, 49, "匿名化した全キャラクターサンプル");
  assert.equal(personas.length, 1, "独立した人格サンプル");
  assert.equal(history.length, 642, "キャラクターサンプル内の全履歴");
  assert.equal(nonemptyHistory.length, 620, "原文メモがある履歴");
  assert.equal(splitHeadingCorpus("memo", memoCorpus).length, 71, "取引メモコーパス全件");
  assert.equal(splitHeadingCorpus("result", resultLogCorpus).length, 125, "リザルトログコーパス全件");
  assert.equal(publicExamples.examples.length, 10, "公開人格フィールドの参照サンプル全件");
  assert.ok(publicExamples.examples.every((row) => row && row.record && typeof row.record === "object"),
    "全公開人格サンプルが構造化レコードとして読み込める");
});

test("取引メモ71件とリザルトログ125件を行単位で監査し、未解析を黙って通さない", () => {
  const issues = [];
  const totals = {
    records: 0,
    candidateRows: 0,
    matched: 0,
    sourceReviewed: 0,
    parserReviewed: 0,
    noncurrencyEffects: 0,
    directionReview: 0,
    mismatches: 0
  };

  for (const record of corpora) {
    totals.records++;
    const parsed = MEMO.parseMemo(record.memo);
    const coverage = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
    const lines = auditCandidateLines(record.memo);

    for (const candidate of lines) {
      totals.candidateRows++;
      const entry = coverage.find((row) => row && row.lineIndex === candidate.lineIndex);
      const reasonForLine = relatedToLine(reasons, candidate.lineIndex, candidate.line);
      const auditForLine = relatedToLine(audits, candidate.lineIndex, candidate.line);

      if (!entry) {
        issues.push(record.source + " / " + record.name + " / " + candidate.lineIndex +
          "行目: 金額・取引候補行に financialCoverage がない: " + candidate.line.trim().slice(0, 100));
        continue;
      }

      switch (entry.status) {
        case "matched": totals.matched++; break;
        case "source-reviewed": totals.sourceReviewed++; break;
        case "reviewed-by-parser-reason": totals.parserReviewed++; break;
        case "noncurrency-effect-recorded": totals.noncurrencyEffects++; break;
        case "direction-review": totals.directionReview++; break;
        case "mismatch": totals.mismatches++; break;
      }

      if (entry.status === "unresolved") {
        issues.push(record.source + " / " + record.name + " / " + candidate.lineIndex +
          "行目: 未解決のままです: " + candidate.line.trim().slice(0, 100));
      }
      if (["mismatch", "direction-review"].includes(entry.status) && !auditForLine && !reasonForLine) {
        issues.push(record.source + " / " + record.name + " / " + candidate.lineIndex +
          "行目: 収支差異が利用者に伝わる監査根拠と結び付いていません: " + candidate.line.trim().slice(0, 100));
      }
      if (entry.status === "reviewed-by-parser-reason" && !auditForLine && !reasonForLine) {
        issues.push(record.source + " / " + record.name + " / " + candidate.lineIndex +
          "行目: 要確認状態に対応する監査根拠がありません: " + candidate.line.trim().slice(0, 100));
      }
      if (candidate.hasUnitlessSpendAmount && entry.status !== "source-reviewed") {
        issues.push(record.source + " / " + record.name + " / " + candidate.lineIndex +
          "行目: 通貨単位のない支出額が推測計上されているか、明示的な要確認になっていません");
      }
    }
  }

  assert.equal(totals.records, 196, "独立サンプルを全件監査した");
  assert.ok(totals.candidateRows > 500, "金額・操作の候補行を十分な数だけ照合した（" + totals.candidateRows + "）");
  assert.equal(issues.length, 0,
    "コーパス全件の行単位監査で問題があります:\n" +
    issues.slice(0, 20).join("\n") +
    (issues.length > 20 ? "\n……残り " + (issues.length - 20) + " 件" : "") +
    "\n集計: " + JSON.stringify(totals));
});
