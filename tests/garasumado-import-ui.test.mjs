import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ---------------------------------------------------------------------------
   取り込み画面の構成。

   所持を1件ずつ並べて個別に操作する作りでは、項目数だけ手順が増える。
   1シナリオ＝1リザルトのカードに割当済みの所持を最初から出し、
   利用者が触るのはカード内の未決行と未割当プールだけにする。
   シミュレーションは実際に入る action と同じ純関数から出す。
   --------------------------------------------------------------------------- */

const ui = readFileSync(new URL("../js/garasumado-import-ui.js", import.meta.url), "utf8");

test("1シナリオ＝1リザルトのカードがある", () => {
  assert.match(ui, /function ResultCard\(\{ block, scenarioOptions, sourceOptions, onPickIdentity \}\)/);
  assert.match(ui, /"gara-group gara-result"/);
  /* 照合済みの所持は最初からカードの中に出る。 */
  assert.match(ui, /block\.items\.map\(\(item\) => h\("div", \{/);
  assert.match(ui, /gara-row-assigned/);
});

test("照合の階級が表示に現れる", () => {
  assert.match(ui, /const TIER_NOTE = \{/);
  for (const k of ["A", "C", "D", "M"]) assert.match(ui, new RegExp(k + ": "));
  assert.match(ui, /TIER_NOTE\[item\.tier\]/);
});

test("カードの中で個別に帰属先と入手方法を選べる", () => {
  assert.match(ui, /"aria-label": item\.name \+ " の帰属先シナリオ"/);
  assert.match(ui, /"aria-label": item\.name \+ " の入手方法"/);
  assert.match(ui, /onPickIdentity\(item\.key, \{ pickedScenario: event\.target\.value \}\)/);
  assert.match(ui, /onPickIdentity\(item\.key, \{ source: event\.target\.value \}\)/);
});

test("未割当は1件ずつ並べず、一括操作だけ出す", () => {
  assert.match(ui, /function UnassignedPool\(\{ items, onPickIdentity, onAssignAll \}\)/);
  /* 上限 40 枚だけ出して、残りは数で示す。 */
  assert.match(ui, /items\.slice\(0, 40\)/);
  assert.match(ui, /onAssignAll\(""\)/);
  assert.match(ui, /onAssignAll\("given"\)/);
});

test("画面は draft（純関数）から描画する", () => {
  assert.match(ui, /const draft = React\.useMemo\(\(\) => \{/);
  assert.match(ui, /window\.LBT_buildResultDraft/);
  /* 集計を画面側でやり直さない。 */
  assert.match(ui, /draft\.blocks\.filter\(\(b\) => b\.items\.length\)\.map\(\(block\) => h\(ResultCard/);
  assert.match(ui, /h\(UnassignedPool, \{ items: draft\.unassigned/);
});

test("シミュレーションは常設で、実際の取り込みと一致する", () => {
  assert.match(ui, /シミュレーション：リザルト \$\{draft\.simulation\.results\}件・所持 \$\{draft\.simulation\.held\}件/);
  /* 完了条件も draft の値に従う（画面が別に数えない）。 */
  assert.match(ui, /const pendingCount = draft \? \(draft\.simulation\.awaitingSource \|\| 0\) : 0;/);
});

test("選択状態は draft にも渡る（シミュレーションの取り込み内容の一致）", () => {
  assert.match(ui, /const chosen = Object\.keys\(picked\)\.filter\(\(k\) => picked\[k\]\);/);
  assert.match(ui, /selected: chosen,/);
});

test("GarasumadoGroup（1件ずつ並べる一覧）は画面から消えている", () => {
  /* 定義が残っていても、画面から描画されていないこと。 */
  assert.doesNotMatch(ui, /h\(GarasumadoGroup, \{/);
});