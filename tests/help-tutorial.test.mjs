import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const sectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("初歩チュートリアルは実際の人格編集ボタン名とゲーム上の同期設定を区別している", () => {
  const tutorial = appSource.indexOf("はじめに：人格を選ぶ・作る");
  const edit = appSource.indexOf("◈ 同期化して手動編集", tutorial);
  const exit = appSource.indexOf("編集を終了（内容は保持）", tutorial);
  const custom = appSource.indexOf("＋ カスタム人格", tutorial);
  const detailedGroups = appSource.indexOf("groups.map((g) =>");

  assert.ok(tutorial >= 0, "初歩チュートリアルが存在する");
  assert.ok(edit > tutorial, "現行の手動編集ボタン名が記載されている");
  assert.ok(exit > edit, "現行の編集終了ボタン名が記載されている");
  assert.ok(appSource.slice(tutorial, detailedGroups).includes("ゲーム上の同期ランク"), "編集モードとゲーム上の同期ランクを区別している");
  assert.ok(custom > tutorial, "創作人格の操作を案内する");
  assert.ok(tutorial < detailedGroups, "初歩チュートリアルは詳細ガイドより上にある");
  assert.match(personaSource, /isSynced \? "✓ 編集を終了（内容は保持）" : "◈ 同期化して手動編集"/);
});

test("E.G.Oの案内は簡易詳細の表示と解析モードを区別している", () => {
  assert.ok(appSource.includes("装備済み枠を押すと右側に簡易詳細が表示されます。全文の確認・編集は、その詳細で「解析を開始」を押します。"));
  assert.match(sectionsSource, /state\.egoManual \? " 解析を終了" : " 解析を開始"/);
  assert.match(sectionsSource, /dispatch\(\{ type: "SAVE_EGO_BUILD", rank: detailSlot \}\)/);
  assert.ok(appSource.includes("必要な自我の欠片が不足していると解析を開始できません。"));
});

test("クイック検索と各一覧のフィルターの対象を混同しない", () => {
  assert.ok(appSource.includes("人格一覧では名前・効果・キーワードに加え、大罪・所属・耐性・所持条件など"));
  assert.ok(appSource.includes("E.G.O一覧では名前・効果・キーワードに加え、ランク・必要資源／除外資源・所持条件など"));
  assert.ok(appSource.includes("同期ランク／同期MAXは一覧の共通検索条件ではなく"));
  assert.match(personaSource, /filterSins\.length/);
  assert.match(personaSource, /filterAffs\.length/);
  assert.match(sectionsSource, /requiredResources/);
  assert.match(sectionsSource, /excludedResources/);
  assert.doesNotMatch(appSource, /大罪、耐性、所持、同期状態で絞り込めます/);
});

test("保存ガイドは自動保存・作業状態JSON・所持ライブラリを区別する", () => {
  assert.ok(appSource.includes("通常の編集内容はブラウザー内に自動保存されます"));
  assert.ok(appSource.includes("編集中のビルド全体をJSONファイルに書き出す"));
  assert.ok(appSource.includes("保存時に範囲は選びません"));
  assert.ok(appSource.includes("読み込み画面で反映する範囲を確認してから適用します"));
  assert.ok(appSource.includes("これは現在の作業状態を保存する操作とは別です"));
  assert.match(appSource, /const \{ ui, \.\.\.data \} = state/);
  assert.match(appSource, /label: "現在の作業状態を保存"/);
  assert.match(appSource, /label: "所持ライブラリを保存"/);
  assert.match(stateSource, /phase: "saved", savedAt: Date\.now\(\), error: ""/);
  assert.match(stateSource, /phase: "error", savedAt: null, error:/);
});

test("操作案内は現行のショートカットと入力中の取り消し挙動を説明している", () => {
  assert.ok(appSource.includes("PCでは入力欄の外でCtrl+Z"));
  assert.ok(appSource.includes("入力欄にカーソルがある間は、Ctrl+Zは文字入力の取り消しを優先します。"));
  assert.ok(appSource.includes("クイック検索はPCではCtrl+K（Macでは⌘K）、スマートフォンでは検索ボタンから開きます。"));
  assert.match(appSource, /if \(isCtrl && e\.key === "k"\)/);
  assert.match(appSource, /if \(isTyping\) return/);
});

test("使い方の案内はPCとスマートフォンのナビゲーション位置を正しく記載する", () => {
  assert.ok(appSource.includes("PCでは画面左側のナビゲーション、スマートフォンでは画面下部のタブ"));
  assert.ok(appSource.includes("「操作・保存」から保存や復元などの操作も開けます。"));
});

test("使い方のカードはモバイル幅で一列レイアウトを維持する", () => {
  assert.match(guideCss, /\.guide-quick,\.guide-items\s*\{\s*grid-template-columns:1fr;/);
});
