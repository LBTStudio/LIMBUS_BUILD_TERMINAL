import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";

/* 誤字監査(tools/provenance/audit-db-typos.mjs)の回帰テスト。
 *
 * 1. 実データの監査は DB 側の誤字を 0 件報告し、辞書の監視対象語が
 *    有事に検出可能である（検出器の構造が空振りでない）ことを検査する。
 * 2. 変異テスト:熟語の一部だけが誤記された一時 DB
 *    （バリヤ・震動・クイツク）で、監査が所定の語を違反として
 *    報告することを確かめる。原典コーパスに誤変種が存在しないため
 *    抑制されずに残る。 */
const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "provenance", "audit-db-typos.mjs");
const realDbPath = path.resolve(path.dirname(scriptPath), "..", "..", "data", "db.json");

function runAudit(extraArgs) {
  return spawnSync(process.execPath, [scriptPath, "--json", ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
}

test("誤字監査は全DBでDB側の誤字を0件報告し、判定列を検査している", () => {
  const run = runAudit([]);
  assert.equal(run.status, 0, `監査が失敗した:\n${run.stderr || ""}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.findings.length, 0, `誤字候補:\n${JSON.stringify(report.findings, null, 1)}`);
  assert.ok(report.checked.strings > 1000, "全文字列を走査している");
  assert.ok(Array.isArray(report.dictionaryDeadKeys), "報告は辞書状態を含む");
});

test("誤字の変異テスト: 一時DBに紛れた誤字を個別に検出する", async () => {
  const tmpDir = await mkdtemp(path.join(process.env.TEMP || "/tmp", "typo-audit-"));
  const cases = [
    ["バリヤを得る", "バリア", "バリヤ"],
    ["震動3を付与", "振動", "震動"],
    ["クイツク2を得る", "クイック", "クイツク"]
  ];
  try {
    await writeFile(path.join(tmpDir, "empty-items.json"), "[]", "utf8");
    for (const [injected, right, wrong] of cases) {
      const dbJson = JSON.parse(await readFile(realDbPath, "utf8"));
      const persona = dbJson.support_passives[0] || dbJson.spirits[0];
      const field = "effect" in persona ? "effect" : "always_effect";
      persona[field] = `戦闘開始時：${injected}`;
      const dbFile = path.join(tmpDir, `db-${wrong}.json`);
      await writeFile(dbFile, JSON.stringify(dbJson), "utf8");
      const run = runAudit(["--db", dbFile, "--items", path.join(tmpDir, "empty-items.json")]);
      assert.equal(run.status, 1, `${wrong} の誤字が検出されない:\n${run.stdout || ""}`);
      const report = JSON.parse(run.stdout);
      const hit = report.findings.find((f) => f.wrong === wrong);
      assert.ok(hit, `${wrong} が findings に含まれない:\n${JSON.stringify(report.findings)}`);
      assert.equal(hit.right, right);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
