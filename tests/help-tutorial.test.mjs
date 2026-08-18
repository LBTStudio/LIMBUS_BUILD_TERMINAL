import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("使い方の初歩チュートリアルは詳細ガイドより前に同期化と創作人格を案内する", () => {
  const tutorial = appSource.indexOf("はじめに：人格を選ぶ・作る");
  const sync = appSource.indexOf("◇ 同期化して手動編集");
  const custom = appSource.indexOf("＋ カスタム人格");
  const detailedGroups = appSource.indexOf("groups.map((g) =>");

  assert.ok(tutorial >= 0, "初歩チュートリアルが存在する");
  assert.ok(sync > tutorial, "同期化の操作を案内する");
  assert.ok(custom > tutorial, "創作人格の操作を案内する");
  assert.ok(tutorial < detailedGroups, "初歩チュートリアルは詳細ガイドより上にある");
});

test("使い方のカードはモバイル幅で一列レイアウトを維持する", () => {
  assert.match(guideCss, /\.guide-quick,\.guide-items\s*\{\s*grid-template-columns:1fr;/);
});
