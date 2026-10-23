import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("抽選確認は確定時の画面状態ではなく、申込時の条件を履歴に使う", () => {
  const requestStart = source.indexOf("const requestDraw = () =>");
  const cancelStart = source.indexOf("const cancelDraw = () =>", requestStart);
  assert.ok(requestStart >= 0 && cancelStart > requestStart, "抽選申込と取消処理が存在する");
  const requestBlock = source.slice(requestStart, cancelStart);
  assert.match(
    requestBlock,
    /setPending\(\{\s*seed,\s*out,\s*request:\s*\{\s*route,\s*pay,\s*pack:\s*activePack,\s*ticketKind,\s*times\s*\}\s*\}\)/,
    "抽選ルート・支払い・パック・チケット種別・回数を申込時に保存する"
  );

  const commitStart = source.indexOf("const commitDrawAsync = async () =>");
  const logStart = source.indexOf("const drawLogEntry =", commitStart);
  const transactionStart = source.indexOf("const transaction =", logStart);
  assert.ok(commitStart >= 0 && logStart > commitStart && transactionStart > logStart);
  const commitBlock = source.slice(commitStart, transactionStart);
  assert.match(commitBlock, /const request = pending\.request \|\| \{ route, pay, pack: activePack, ticketKind, times \}/);
  assert.match(commitBlock, /route:\s*request\.route/);
  assert.match(commitBlock, /times:\s*request\.times/);
  assert.doesNotMatch(commitBlock, /\n\s*route,\s*\n\s*times,/,
    "変更後のフォーム値を抽選ログのルート／回数へ流用しない");
});

test("抽選確認中は条件の操作をロックし、キャンセル後に変更させる", () => {
  const controlsStart = source.indexOf('ROUTES.map((r) => h("button"');
  const confirmStart = source.indexOf('pending && h("div", { className: "gacha-confirm"', controlsStart);
  assert.ok(controlsStart >= 0 && confirmStart > controlsStart);
  const controls = source.slice(controlsStart, confirmStart);

  // route / pack / payment / specific-or-choice ticket / times / draw button
  const lockCount = [...controls.matchAll(/disabled:\s*!!pending/g)].length;
  assert.ok(lockCount >= 7, `確認中の設定・申込操作を7か所以上ロックする（実際: ${lockCount}）`);
  assert.match(source, /確認中は抽出方法・パック・支払い方法・回数を固定しています。変更する場合は「まだ引かない」で戻ってください/);
  assert.match(source, /onClick: cancelDraw }, "まだ引かない"/);
});
