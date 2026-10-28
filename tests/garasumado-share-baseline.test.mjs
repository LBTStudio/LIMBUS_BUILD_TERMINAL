import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const baseline = JSON.parse(readFileSync(new URL("./fixtures/garasumado-share-url-baseline.json", import.meta.url), "utf8"));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));

function historyInputFingerprint(doc) {
  const history = Array.isArray(doc?.scenarioHistory) ? doc.scenarioHistory : [];
  const parserInputs = history.map((row) => ({
    name: String(row?.name ?? ""),
    memo: String(row?.memo ?? "")
  }));
  return createHash("sha256").update(JSON.stringify(parserInputs)).digest("hex");
}


test("98件の硝子窓共有URL監査ベースラインを重複なく保持する", () => {
  const rows = baseline.documents;
  assert.equal(rows.length, 98, "過去に監査したURL 98件をすべて管理する");
  assert.equal(new Set(rows.map((row) => row.id)).size, 98, "IDの重複がない");
  assert.equal(rows.filter((row) => row.previousFetchStatus === "OK").length, 95, "取得成功は95文書");
  assert.equal(rows.filter((row) => row.previousFetchStatus === "403").length, 3, "取得不可は既知の3文書");
  assert.deepEqual(
    rows.filter((row) => row.previousFetchStatus === "403").map((row) => row.id).sort(),
    baseline.unavailableIds.slice().sort(),
    "取得不可IDの一覧と各文書ステータスが一致する"
  );
});

test("95文書の過去監査集計値と文書別の値が一致する", () => {
  const fetched = baseline.documents.filter((row) => row.previousFetchStatus === "OK");
  const sum = (key) => fetched.reduce((total, row) => total + Number(row[key] || 0), 0);
  assert.equal(sum("historyRows"), baseline.historicalSummary.historyRows, "履歴行の合計");
  assert.equal(sum("memoRows"), baseline.historicalSummary.memoRows, "メモ付き行の合計");
  assert.equal(sum("reviewRows"), baseline.historicalSummary.rowsNeedingReview, "要確認行の合計");
  assert.equal(sum("historyRows"), 1149);
  assert.equal(sum("memoRows"), 1090);
  assert.equal(sum("reviewRows"), 108);
  assert.equal(baseline.documents.filter((row) => row.parsedNet === null && row.previousFetchStatus === "OK").length, 0);
});

test("固定fixtureと過去のライブ監査の差分を隠さず列挙する", () => {
  const fixtureIds = Object.keys(fixture);
  const auditIds = new Set(baseline.documents.map((row) => row.id));
  const shared = baseline.documents.filter((row) => Object.hasOwn(fixture, row.id));
  assert.equal(fixtureIds.length, baseline.fixtureComparison.fixtureDocumentCount);
  assert.equal(shared.length, baseline.fixtureComparison.urlIdsAlsoInFixture);

  const outsideBaseline = fixtureIds.filter((id) => !auditIds.has(id)).sort();
  assert.deepEqual(outsideBaseline, baseline.fixtureComparison.fixtureIdsNotInUrlBaseline.slice().sort());

  const actualDrift = shared.filter((row) => {
    const history = fixture[row.id]?.doc?.scenarioHistory || [];
    const memos = history.filter((entry) => String(entry?.memo || "").trim()).length;
    return history.length !== row.historyRows || memos !== row.memoRows;
  }).map((row) => {
    const history = fixture[row.id]?.doc?.scenarioHistory || [];
    return {
      id: row.id,
      reportHistoryRows: row.historyRows,
      fixtureHistoryRows: history.length,
      reportMemoRows: row.memoRows,
      fixtureMemoRows: history.filter((entry) => String(entry?.memo || "").trim()).length
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(
    actualDrift,
    baseline.fixtureComparison.knownStaleSnapshots.slice().sort((a, b) => a.id.localeCompare(b.id)),
    "既知の古いスナップショット8件を明示し、差分を黙って無視しない"
  );
  assert.equal(actualDrift.length, 8);
});

test("50件の固定fixtureは履歴の行数だけでなく名前・メモ内容の指紋も固定する", () => {
  const fingerprints = baseline.fixtureComparison.fixtureSnapshotFingerprints;
  assert.equal(fingerprints.length, baseline.fixtureComparison.fixtureDocumentCount);
  assert.equal(baseline.fixtureComparison.historyInputFingerprintSchema, "scenarioHistory-name-memo-v1");
  assert.deepEqual(
    fingerprints.map((row) => row.id).slice().sort(),
    Object.keys(fixture).sort(),
    "全50 fixture IDに履歴入力の指紋がある"
  );
  for (const row of fingerprints) {
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.equal(
      row.sha256,
      historyInputFingerprint(fixture[row.id]?.doc),
      row.id + " のfixtureが同じ行数のまま内容だけ変わっても検出する"
    );
  }
});
