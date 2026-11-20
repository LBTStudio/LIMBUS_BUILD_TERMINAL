import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* DB衛生監査(tools/provenance/audit-db-hygiene.mjs)の回帰テスト。
 *
 * three-book監査が原典との「内容」を照合するのに対し、衛生監査はDB自体の
 * 構造・文字・改行・コロンの健全性を全コレクションに対して機械検査する:
 *   - エラッタ未適用の旧表記（混乱終了時）
 *   - 置換文字・制御文字・私用領域・二重エンコード
 *   - 原典の折返し位置にない改行（語途中改行）
 *   - 原典にないコロン（使用時：等のラベル区切りを転記時に混入する）
 *   - 必須フィールドの欠落・型異常
 *   - rank書式・派生メタデータ・名前一意性などの形式異常
 *
 * 監査は0件を報告すべきである。原典候補との内容差は three-book監査の
 * 管轄（delegated）、原典候補がフィールドを持たない改行は照合不能
 * （unverifiable）として違反から除外する。 */
const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "provenance", "audit-db-hygiene.mjs");

test("DB衛生監査は全コレクションで確認済みの不備を0件報告する", () => {
  const run = spawnSync(process.execPath, [scriptPath, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(run.status, 0, `監査が失敗した:\n${run.stderr || ""}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.violations.length, 0, `確認済みの不備:\n${report.violations.join("\n")}`);
  assert.ok(report.checked.strings > 1000, "全文字列を走査している");
  assert.ok(report.checked.linebreakVerifiedFields > 100, "改行照合が実施されている");
});

test("コロン混入は核照合では等価、コロン保持核では区別されて検出される", async () => {
  const audit = await import(`file://${scriptPath.replace(/\\/g, "/")}`);
  /* 核照合はコロンの有無を無視する: 現行の内容差監査と同じ緩さ。 */
  assert.equal(audit.core("使用時：次のRにクイック1を得る"), audit.core("使用時　次のRにクイック1を得る"));
  /* コロン保持核は、コロンの混入・欠落を内容差として区別する。 */
  assert.notEqual(audit.coreKeepColon("使用時：次のRにクイック1を得る"), audit.coreKeepColon("使用時　次のRにクイック1を得る"));
  assert.equal(audit.coreKeepColon("使用時：次のRにクイック1を得る"), audit.coreKeepColon("使用時：\n次のRにクイック1を得る"));
});

test("語途中改行ではない改行でも、コロンの混入は違反として報告される", async () => {
  const audit = await import(`file://${scriptPath.replace(/\\/g, "/")}`);
  const before = audit.violations.length;
  /* 改行位置自体は原典の空白位置とも文境界でもないが、まずコロン混入を
     見つけることを検証する: 改行照合と同じ core 同値が前提の照合パス。 */
  audit.verifyLineBreaks(
    "probe_kind", "probe_record", "probe_label",
    " 使用時：クイック1。\n次の行ラベル",
    " 使用時　クイック1。　次の行ラベル"
  );
  const added = audit.violations.slice(before);
  assert.ok(
    added.some((v) => v.includes("probe_kind/probe_record/probe_label") && v.includes("コロン位置が原典と異なる")),
    `コロン混入が検出されない: ${JSON.stringify(added)}`
  );
  /* 反対に、コロンが原典どおりなら違反にならない（語途中改行は別問題として
     ここでは起きない位置で照合する）。 */
  const before2 = audit.violations.length;
  audit.verifyLineBreaks(
    "probe_kind", "probe_record2", "probe_label",
    " 使用時：クイック1。\n\n次の行ラベル",
    " 使用時：クイック1。　次の行ラベル"
  );
  const added2 = audit.violations.slice(before2);
  assert.equal(added2.length, 0, `原典どおりのコロンは違反でない:\n${added2.join("\n")}`);
});
