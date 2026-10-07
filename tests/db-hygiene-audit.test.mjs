import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* DB衛生監査(tools/provenance/audit-db-hygiene.mjs)の回帰テスト。
 *
 * three-book監査が原典との「内容」を照合するのに対し、衛生監査はDB自体の
 * 構造・文字・改行の健全性を全コレクションに対して機械検査する:
 *   - エラッタ未適用の旧表記（混乱終了時）
 *   - 置換文字・制御文字・私用領域・二重エンコード
 *   - 原典の折返し位置にない改行（語途中改行）
 *   - 必須フィールドの欠落・型異常
 *   - rank書式・派生メタデータ・名前一意性などの形式異常
 *
 * 監査は0件を報告すべきである。原典候補との内容差は three-book監査の
 * 管轄（delegated）、原典候補がフィールドを持たない改行は照合不能
 * （unverifiable）として違反から除外する。 */
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "provenance", "audit-db-hygiene.mjs");

test("DB衛生監査は全コレクションで確認済みの不備を0件報告する", () => {
  const run = spawnSync(process.execPath, [script, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(run.status, 0, `監査が失敗した:\n${run.stderr || ""}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.violations.length, 0, `確認済みの不備:\n${report.violations.join("\n")}`);
  assert.ok(report.checked.strings > 1000, "全文字列を走査している");
  assert.ok(report.checked.linebreakVerifiedFields > 100, "改行照合が実施されている");
});
