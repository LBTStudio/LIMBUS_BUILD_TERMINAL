import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* 折返し空白監査(tools/provenance/audit-db-wrap-spaces.mjs)の回帰テスト。
 *
 * PDF写識で語中・括弧直前・句読点直後へ入った半角スペースは、紙面の折返しに
 * 由来する転記痕跡であり、パレット・MEMO・JSON・共有HTMLの全出力経路へ出る。
 * 三-book監査は内容を、衛生監査は改行位置と文字種を検査するが、半角スペースは
 * どちらの対象外だったため、個別指着で潰しても次の転記で再発していた。
 *
 * この監査はDB全文から空白候補（日本語・数字・閉じ括弧・ASCII字の直後）を抽出し、
 * 原典コーパスと突き合わせる:
 *   - 名前に含まれる空白（蜘蛛の巣 親指の親方 等）は保持
 *   - 原典が実際に空白を書く位置は保持
 *   - 原典が段落を分ける位置は \n（段落）に戻す
 *   - 名前の綴りが空白で壊れている場合は正規名へ戻す
 *   - それ以外は転記痕跡として除去
 *
 * 監査は0件を報告すべきである。1件でも出たら data/db.json に転記痕跡が残存している。 */
const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "provenance", "audit-db-wrap-spaces.mjs");

const run = () => {
  const result = spawnSync(process.execPath, [scriptPath, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  assert.ifError(result.error);
  return { result, report: JSON.parse(result.stdout) };
};

test("折返し空白監査は全DBで転記痕跡を0件報告する", () => {
  const { result, report } = run();
  const detail = report.findings.map((f) => `  ${f.path} [${f.verdict}]\n    - ${f.before}\n    + ${f.after}`).join("\n");
  assert.equal(report.findings.length, 0, `折返し空白が残存:\n${detail}`);
  /* 候補0件なら走査していない疑いがある。抽出が生きていることを確認する。 */
  assert.ok(report.candidates > 50, `抽出候補=${report.candidates}。走査が機能していない疑い`);
  assert.equal(result.status, 0, "違反がないなら終了コードは0");
});

test("監査は原典に実在する空白を痕跡と誤って数えない", () => {
  /* 名前に含まれる空白は転記痕跡ではない。正的名字を持つ要素が原典に存在する。 */
  const { report } = run();
  const suspects = report.findings.filter((f) => f.verdict === "defect");
  for (const finding of suspects) {
    assert.ok(
      !/\u30B9\u30D4\u30FC\u30C5\u306E\u5E30 [^\s]/.test(finding.before),
      `名前の空白を痕跡と判定した: ${finding.path} / ${finding.before.slice(0, 40)}`
    );
  }
});