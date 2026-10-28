import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const MEMO = (() => {
  const source = readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_garaMemo;
})();
const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));

test("全角変換した実サンプルでも通貨合計行を支出として誤計上しない", () => {
  const source = samples.mMIbGr32lGZix60RDmoN.doc.scenarioHistory.find(
    (row) => row.name === "鏡屈折鉄道1号線『Orientation』"
  );
  assert.ok(source, "実サンプルを固定参照できる");
  const mutate = (memo) => memo.replace(/LP/g, "ＬＰ").replace(/欠片/g, "欠け片")
    .replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xFEE0))
    .replace(/,/g, "，").replace(/\n/g, "\r\n");
  const original = MEMO.parseMemo(source.memo);
  const changed = MEMO.parseMemo(mutate(source.memo));
  const total = (rows, key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  assert.equal(changed.income.lp, original.income.lp);
  assert.equal(changed.income.shards, original.income.shards);
  assert.equal(total(changed.spends, "lp"), total(original.spends, "lp"));
  assert.equal(total(changed.spends, "shards"), total(original.spends, "shards"));
  assert.deepEqual(
    Array.from(changed.financialCoverage, (row) => row.status),
    Array.from(original.financialCoverage, (row) => row.status)
  );
});

test("メモ原文・リザルトログの全コーパスをシナリオ単位で個別監査する", () => {
  const corpora = [
    {
      name: "garasumado-memo-corpus",
      path: "./fixtures/garasumado-memo-corpus.txt",
      expectedScenarios: 71
    },
    {
      name: "result-log-corpus",
      path: "./fixtures/result-log-corpus.txt",
      expectedScenarios: 125
    }
  ];
  const amountPattern = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|欠け片)|(?:欠片|かけら|欠けら|カケラ|欠け片)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i;
  const actionPattern = /報酬|収入|消費|支出|支払|購入|買った|変換|交換|補填|抽出|ガチャ|チケット|チケ|獲得|入手|取得|解放|使用|使った|換算|還元/;
  const issues = [];
  let auditedScenarios = 0;
  let auditedActionRows = 0;
  let withFinancialSignals = 0;
  const splitScenarios = (content) => {
    const blocks = [];
    let current = [];
    for (const line of String(content || "").split(/\r?\n/)) {
      if (/^\s*【/.test(line) && current.some((part) => part.trim())) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      current.push(line);
    }
    if (current.some((part) => part.trim())) blocks.push(current.join("\n").trim());
    return blocks.filter(Boolean);
  };

  for (const corpus of corpora) {
    const raw = readFileSync(new URL(corpus.path, import.meta.url), "utf8");
    const scenarios = splitScenarios(raw);
    assert.equal(scenarios.length, corpus.expectedScenarios,
      corpus.name + ": 原文シナリオ数を固定（コーパスの消失・分割ずれを検出）");
    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
      const memo = scenarios[scenarioIndex];
      const label = corpus.name + "#" + (scenarioIndex + 1) + " " +
        (memo.split(/\r?\n/).find((line) => line.trim()) || "").slice(0, 80);
      const parsed = MEMO.parseMemo(memo);
      const coverage = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
      const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
      const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
      const lines = memo.split(/\r?\n/);
      let scenarioHasFinancialSignals = false;
      auditedScenarios++;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (!amountPattern.test(line) || !actionPattern.test(line)) continue;
        scenarioHasFinancialSignals = true;
        auditedActionRows++;
        const relatedAudit = audits.some((entry) => entry &&
          (entry.lineIndex === lineIndex + 1 ||
           entry.relatedLineIndex === lineIndex + 1 ||
           (Array.isArray(entry.relatedLines) &&
             entry.relatedLines.some((row) => row.lineIndex === lineIndex + 1))));
        const relatedReason = reasons.some((entry) => String(entry.line || "").trim() === line.trim());
        const rowCoverage = coverage.find((entry) => entry && entry.lineIndex === lineIndex + 1);

        if (!rowCoverage && !relatedAudit && !relatedReason) {
          issues.push(label + ": 金額・操作行にcoverage/audit/reasonなし (" +
            (lineIndex + 1) + "行目): " + line.trim().slice(0, 100));
          continue;
        }
        if (rowCoverage?.status === "unresolved") {
          issues.push(label + ": 未解決状態で黙って通過 (" +
            (lineIndex + 1) + "行目): " + line.trim().slice(0, 100));
        }
        if (["mismatch", "direction-review", "reviewed-by-parser-reason"].includes(rowCoverage?.status) &&
            !relatedAudit && !relatedReason) {
          issues.push(label + ": 要確認の状態を利用者に説明する監査根拠がない (" +
            (lineIndex + 1) + "行目): " + line.trim().slice(0, 100));
        }
      }

      if (scenarioHasFinancialSignals) {
        withFinancialSignals++;
        const hasOutput =
          (Number(parsed.income?.lp) || 0) !== 0 ||
          (Number(parsed.income?.shards) || 0) !== 0 ||
          (parsed.spends || []).length > 0 ||
          Object.values(parsed.tickets || {}).some((value) => (Number(value) || 0) > 0) ||
          Object.keys(parsed.pack || {}).length > 0 ||
          (parsed.wins || []).length > 0 ||
          (parsed.reasons || []).length > 0 ||
          (parsed.sourceAudits || []).some((entry) => entry && entry.severity !== "info");
        if (!hasOutput) {
          issues.push(label + ": 金額・操作の記述を含むのに出力も警告もない");
        }
      }
    }
  }

  assert.equal(auditedScenarios, 196, "2種類の原文コーパス全196シナリオを個別に処理");
  assert.ok(auditedActionRows > 20, "金額・操作行も行単位で照合（実際 " + auditedActionRows + "行）");
  assert.ok(withFinancialSignals > 20, "取引候補を含むシナリオを実際に検証（実際 " + withFinancialSignals + "件）");
  assert.equal(issues.length, 0,
    "原文コーパスの無言の検出漏れ（先頭20件）:\n" +
    issues.slice(0, 20).join("\n") +
    (issues.length > 20 ? "\n……残り" + (issues.length - 20) + "件" : ""));
});


test("サポートスロット解放で現在残高しかない行は、支出額を推測せず監査理由を残す", () => {
  const examples = [
    "サポートスロット解放　現在99欠片",
    "・支出\nサポスロ解放　現在21欠片",
    "人差し指紙片のサポートスロット解放　現在99欠片"
  ];
  for (const memo of examples) {
    const parsed = MEMO.parseMemo(memo);
    const line = memo.split(/\r?\n/).find((row) => /解放/.test(row));
    const coverage = (parsed.financialCoverage || []).find((row) => row && row.line === line);
    assert.ok(coverage, "行単位のcoverageを保持: " + memo);
    assert.ok(["reviewed-by-parser-reason", "current-balance-review"].includes(coverage.status), "残高由来の金額は自動計上せず要確認状態: " + memo);
    assert.ok((parsed.reasons || []).some((row) =>
      String(row.line || "").trim() === line.trim() && /支出額を残高から逆算せず/.test(row.reason)),
      "残高だけから費用を捏造しない理由を表示: " + memo);
    assert.equal(Number(parsed.income?.shards) || 0, 0, "残高99欠片などを収入扱いしない: " + memo);
    assert.equal((parsed.spends || []).reduce((sum, row) => sum + (Number(row.shards) || 0), 0), 0,
      "費用不明の行に欠片支出を捏造しない: " + memo);
  }
});


test("全サンプルの支出欄にある残高のみの明細を保持し、残高を収支へ誤計上しない", () => {
  const amountPattern = /(?:(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|欠け片)\s*(?:(?:報酬|収入|獲得|入手|支出|支払|消費|購入|変換|補填)\s*)?[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|欠け片))/i;
  const balanceMarker = /(?:現在|現座|残り|残高)/;
  const currencyMarker = /(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ|欠け片)/i;
  const explicitAction = /消費|支出|支払|購入|買っ|使用|行使|抽出|ガチャ|獲得|入手|取得|解放|変換|換算|交換/;
  const removeBalances = (raw) => String(raw || "").normalize("NFKC")
    .replace(/(?:現在|現座|残高|残り)\s*(?:所持|保有)?\s*[:：]?\s*(?:LP|欠片|かけら|欠けら|カケラ|欠け片)?\s*[:：]?\s*-?\d+(?:\s*\+\s*\d+)*(?:\s*(?:LP|欠片|かけら|欠けら|カケラ|欠け片))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|欠片|かけら|欠けら|カケラ|欠け片))?)?/gi, " ")
    .replace(/(?:LP|欠片|かけら|欠けら|カケラ|欠け片)\s*(?:現在|現座|残高|残り)\s*[:：]?\s*-?\d+(?:\s*\+\s*\d+)*(?:\s*(?:LP|欠片|かけら|欠けら|カケラ|欠け片))?/gi, " ");
  const isBalanceOnlyLine = (line) => balanceMarker.test(line) && currencyMarker.test(line) &&
    !amountPattern.test(removeBalances(line));
  const splitScenarios = (content) => {
    const blocks = [];
    let current = [];
    for (const line of String(content || "").split(/\r?\n/)) {
      if (/^\s*【/.test(line) && current.some((part) => part.trim())) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      current.push(line);
    }
    if (current.some((part) => part.trim())) blocks.push(current.join("\n").trim());
    return blocks.filter(Boolean);
  };
  const units = [];
  for (const path of ["./fixtures/garasumado-memo-corpus.txt", "./fixtures/result-log-corpus.txt"]) {
    const raw = readFileSync(new URL(path, import.meta.url), "utf8");
    for (const [index, memo] of splitScenarios(raw).entries()) {
      units.push({ label: path + "#" + (index + 1), memo });
    }
  }
  for (const [sampleId, sample] of Object.entries(samples)) {
    if (!sample || sample.coll !== "characters") continue;
    const doc = sample.doc || {};
    for (const [index, row] of (doc.scenarioHistory || []).entries()) {
      if (row && String(row.memo || "").trim()) {
        units.push({ label: sampleId + "/" + (row.name || ("履歴" + (index + 1))), memo: String(row.memo) });
      }
    }
  }

  const issues = [];
  let auditedBalanceOnlyRows = 0;
  let auditedSpendSectionRows = 0;
  for (const unit of units) {
    const parsed = MEMO.parseMemo(unit.memo);
    const lines = unit.memo.split(/\r?\n/);
    let mode = "income";
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      const section = MEMO.sectionOf(line);
      if (section === "spend" || section === "current") mode = section;
      if (!line || !isBalanceOnlyLine(line)) continue;
      auditedBalanceOnlyRows++;

      /* 純粋な現在残高を単独で解析しても収入・支出にしてはいけない。 */
      const isolated = MEMO.parseMemo(line);
      const isolatedIncome = (Number(isolated.income?.lp) || 0) + (Number(isolated.income?.shards) || 0);
      const isolatedSpend = (isolated.spends || []).reduce((sum, row) =>
        sum + (Number(row.lp) || 0) + (Number(row.shards) || 0), 0);
      if (isolatedIncome !== 0 || isolatedSpend !== 0) {
        issues.push(unit.label + ": 残高のみの行を単独解析で収支へ計上 (" + (lineIndex + 1) + "行目): " + line);
      }

      if (mode !== "spend") continue;
      auditedSpendSectionRows++;
      const rowCoverage = (parsed.financialCoverage || []).find((row) => row && row.lineIndex === lineIndex + 1);
      const relatedAudit = (parsed.sourceAudits || []).some((entry) => entry &&
        (entry.lineIndex === lineIndex + 1 || entry.relatedLineIndex === lineIndex + 1 ||
         (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === lineIndex + 1))));
      const relatedReason = (parsed.reasons || []).some((entry) =>
        String(entry.line || "").trim() === line.trim());
      if (!rowCoverage && !relatedAudit && !relatedReason) {
        issues.push(unit.label + ": 支出欄の残高のみの行に監査状態・理由なし (" + (lineIndex + 1) + "行目): " + line);
        continue;
      }
      if (rowCoverage && rowCoverage.status === "unresolved") {
        issues.push(unit.label + ": 支出欄の残高のみの行が未解決で無言通過 (" + (lineIndex + 1) + "行目): " + line);
      }
      if (rowCoverage && rowCoverage.detected &&
          ((Number(rowCoverage.detected.lp) || 0) !== 0 || (Number(rowCoverage.detected.shards) || 0) !== 0)) {
        issues.push(unit.label + ": 残高のみの行に金額が検出された (" + (lineIndex + 1) + "行目): " + line);
      }
      if (!relatedAudit && !relatedReason) {
        issues.push(unit.label + ": 支出欄の残高のみの行に要確認根拠が届かない (" + (lineIndex + 1) + "行目): " + line);
      }
    }
  }

  assert.ok(auditedBalanceOnlyRows > 100, "全サンプルを横断して現在残高だけの行を検証（実際 " + auditedBalanceOnlyRows + "行）");
  assert.ok(auditedSpendSectionRows > 10, "支出セクション内の残高のみの行を検証（実際 " + auditedSpendSectionRows + "行）");
  assert.equal(issues.length, 0,
    "残高行の誤計上・監査漏れ（先頭20件）:\n" +
    issues.slice(0, 20).join("\n") +
    (issues.length > 20 ? "\n……残り" + (issues.length - 20) + "件" : ""));
});


test("残高表記の順序違いと品名中の数字から支出額を捏造しない", () => {
  const balanceOnlyRows = [
    "南部センク協会5課フィクサー　現在52LP",
    "包帯2個、異常震域、空回りの怠惰　現在1077LP",
    "涙剣CT3介助　現在1524LP",
    "20区ユロージヴィ団員 LP現在8",
    "鬼門同期化　残り欠片81"
  ];
  for (const line of balanceOnlyRows) {
    const parsed = MEMO.parseMemo("・支出\n" + line);
    assert.equal(Number(parsed.income?.lp) || 0, 0, "LP残高を収入にしない: " + line);
    assert.equal(Number(parsed.income?.shards) || 0, 0, "欠片残高を収入にしない: " + line);
    assert.equal((parsed.spends || []).reduce((sum, row) => sum + (Number(row.lp) || 0) + (Number(row.shards) || 0), 0),
      0, "品名の5課・2個・CT3などを費用にしない: " + line);
    const coverage = (parsed.financialCoverage || []).find((row) => row && row.line === line);
    assert.ok(coverage, "支出欄の残高行にcoverageを残す: " + line);
    assert.ok(["reviewed-by-parser-reason", "current-balance-review"].includes(coverage.status), "金額不明は要確認状態: " + line);
    assert.ok((parsed.reasons || []).some((row) => String(row.line || "").trim() === line.trim()),
      "要確認理由を原文へ紐付ける: " + line);
  }

  const purchase = MEMO.parseMemo("・支出\n南部ディエーチ協会4課フィクサーの人格+知識探求購入：現在123LP");
  assert.equal(purchase.spends[0]?.lp || 0, 0, "購入語があっても現在123LPを費用にしない");
  assert.ok(purchase.reasons.some((row) => /支出金額が読み取れない/.test(row.reason)),
    "購入品名にある4課を支出額として採らず要確認にする");

  const mixed = MEMO.parseMemo("LP報酬 49　現在93LP");
  assert.equal(mixed.income.lp, 49, "現在残高を除外して明示されたLP報酬49は保持する");
});

