import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "tools", "provenance", "audit-db-typos.mjs");
const dbPath = path.join(root, "data", "db.json");
const itemsPath = path.join(root, "data", "items.json");
const provenanceDir = path.join(root, "data", "provenance");

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, "--json", ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
}

test("全DB・アイテムの誤字／体裁監査が0件を報告する", () => {
  const result = run();
  assert.ifError(result.error);
  assert.equal(result.status, 0, `監査が失敗した:\n${result.stderr || result.stdout}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findings.length, 0, JSON.stringify(report.findings, null, 2));
  assert.ok(report.checked.strings > 10000, `走査文字列が少なすぎる: ${report.checked.strings}`);
});

test("連続句読点を検出し、E.G.O::の正規記法は誤検出しない", () => {
  const source = readFileSync(dbPath, "utf8");
  const db = JSON.parse(source);
  const persona = db.tokui_personas.find((entry) => entry?.name === "蜘蛛の巣 中指の親方");
  assert.ok(persona, "検査対象の人格が存在する");
  assert.ok(persona.passive_effect.includes("レーヴァテイン状態なら、HPが"), "重複読点を修正した本文を保持している");
  persona.passive_effect = persona.passive_effect.replace(
    "レーヴァテイン状態なら、HPが",
    "レーヴァテイン状態なら、、HPが"
  );

  const tempDir = mkdtempSync(path.join(tmpdir(), "lbt-effect-text-audit-"));
  try {
    const tempDbPath = path.join(tempDir, "db.json");
    writeFileSync(tempDbPath, JSON.stringify(db), "utf8");
    const result = run(["--db", tempDbPath, "--items", itemsPath, "--dir", provenanceDir]);
    assert.ifError(result.error);
    assert.equal(result.status, 1, "注入した破損を監査が検出する");
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.findings.some((finding) => finding.rule === "duplicate-punctuation" && finding.wrong === "、、"),
      `連続読点を検出していない: ${JSON.stringify(report.findings)}`
    );

    const eGoNotation = "ロボトミーE.G.O::愛と憎悪の名の下に";
    assert.equal(
      /(?:[、。]{2,}|，{2,}|,{2,}|：{2,}|；{2,}|;{2,}|．{2,}|[、。][,，;；]|[,，;；][、。])/.test(eGoNotation),
      false,
      "E.G.O::の正規記法に該当しない"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
