import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/persona-inventory-audit.js", import.meta.url), "utf8");
const db = {
  normal_personas: [
    { no: 1, name: "南部リウ協会3課フィクサーの人格" },
    { no: 2, name: "剣契殺手Aの人格" },
    { no: 3, name: "ワン家呪殺僧の人格" }
  ],
  tokui_personas: [{ no: 7, name: "黒獣-午 筆頭の人格" }]
};

function auditState(state) {
  const window = { DB: db };
  vm.runInNewContext(source, { window });
  return JSON.parse(JSON.stringify(window.LBT_auditPersonaInventory(state)));
}

test("初期作成で記録した人格が現在所持に無ければ不足として検出する", () => {
  const result = auditState({
    results: [{
      id: "res-initial", name: "初期作成",
      initialPersona: { method: "selected", mode: "n", no: "1", name: "南部リウ協会3課フィクサーの人格" }
    }],
    roster: { personas: [] }, draws: []
  });
  assert.equal(result.initialConfigured, true);
  assert.equal(result.expectedCount, 1);
  assert.equal(result.actualCount, 0);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].name, "南部リウ協会3課フィクサーの人格");
});

test("初期取得・リザルト取得・非重複抽出を現在所持と照合する", () => {
  const result = auditState({
    results: [
      { id: "res-initial", name: "初期作成", initialPersona: { method: "random", mode: "n", no: "1", name: "" } },
      { id: "res-1", name: "第一夜", personaAcquisitions: [{ mode: "n", no: "2", name: "剣契殺手Aの人格", source: "text-import" }] }
    ],
    roster: { personas: [{ mode: "n", no: "1" }, { mode: "n", no: "2" }, { mode: "n", no: "3" }] },
    appliedDrawBatchIds: ["active-draw-1"],
    draws: [{ batchHash: "active-draw-1", records: [{ kind: "persona", item: { kind: "persona", mode: "n", no: 2, name: "剣契殺手Aの人格" }, duplicate: false }] }]
  });
  assert.equal(result.expectedCount, 2);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.missing.length, 0);
  assert.equal(result.unrecorded.length, 1);
  assert.equal(result.unrecorded[0].no, "3");
});

test("重複抽出は新しい所持人格として数えない", () => {
  const result = auditState({
    results: [{ id: "res-initial", name: "初期作成", initialPersona: { method: "selected", mode: "n", no: "1" } }],
    roster: { personas: [{ mode: "n", no: "1" }, { mode: "n", no: "2" }] },
    appliedDrawBatchIds: ["duplicate-draw"],
    draws: [{ batchHash: "duplicate-draw", records: [{ kind: "themePack", item: { kind: "themePack", name: "剣契殺手Aの人格" }, duplicate: true }] }]
  });
  assert.equal(result.expectedCount, 1);
  assert.equal(result.missing.length, 0);
  assert.equal(result.unrecorded.length, 1);
});

test("テーマパック名はDBで一意に解決し、特異人格は別IDとして照合する", () => {
  const result = auditState({
    results: [{ id: "res-initial", name: "初期作成", initialPersona: { method: "selected", mode: "n", no: "1" } }],
    roster: { personas: [{ mode: "n", no: "1" }, { mode: "n", no: "2" }, { mode: "t", no: "7" }] },
    appliedDrawBatchIds: ["theme-draw"],
    draws: [{ batchHash: "theme-draw", pack: "本に成った者たちⅠ", records: [
      { kind: "themePack", pack: "本に成った者たちⅠ", item: { kind: "themePack", name: "剣契殺手Aの人格" }, duplicate: false },
      { kind: "specialPersona", item: { kind: "specialPersona", no: 7, name: "黒獣-午 筆頭の人格" }, duplicate: false }
    ] }]
  });
  assert.equal(result.expectedCount, 3);
  assert.equal(result.matchedCount, 3);
  assert.equal(result.missing.length, 0);
  assert.equal(result.unrecorded.length, 0);
});

test("初期人格の方法だけ指定し、人格を選ばなかった状態を不完全として返す", () => {
  const result = auditState({
    results: [{ id: "res-initial", name: "初期作成", initialPersona: { method: "random", mode: "", no: "" } }],
    roster: { personas: [] }, draws: []
  });
  assert.equal(result.initialConfigured, false);
  assert.equal(result.initialNeedsPersona, true);
});


test("Undo後も抽選証明が残る場合は、所持取得として誤警告せず適用状態を未確定として示す", () => {
  const result = auditState({
    results: [{ id: "res-initial", name: "初期作成", initialPersona: { method: "unknown" } }],
    roster: { personas: [] }, appliedDrawBatchIds: [],
    draws: [{ batchHash: "undone-proof-only", records: [{
      kind: "persona", item: { kind: "persona", mode: "n", no: 2, name: "剣契殺手Aの人格" }, duplicate: false
    }] }]
  });
  assert.equal(result.missing.length, 0, "Undo済みの証明を取得漏れとして扱わない");
  assert.equal(result.unresolvedDraws, 1, "適用状態が戻った証明を未照合として示す");
});

test("適用中の抽選バッチは所持から消えていれば不足として検出する", () => {
  const result = auditState({
    results: [{ id: "res-initial", name: "初期作成", initialPersona: { method: "unknown" } }],
    roster: { personas: [] }, appliedDrawBatchIds: ["active-missing"],
    draws: [{ batchHash: "active-missing", records: [{
      kind: "persona", item: { kind: "persona", mode: "n", no: 2, name: "剣契殺手Aの人格" }, duplicate: false
    }] }]
  });
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].no, "2");
});
