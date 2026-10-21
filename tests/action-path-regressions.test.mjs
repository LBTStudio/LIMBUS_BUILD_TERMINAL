import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const otherSections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const interactionCss = readFileSync(new URL("../assets/v68-interaction-a11y.css", import.meta.url), "utf8");

test("人格未装備でもカスタム人格・テキスト流し込みの操作が一覧ヘッダーに残る", () => {
  const start = personaSource.indexOf("人格未装備でも、カスタム作成とテキスト取り込みは常に利用可能にする。");
  const end = personaSource.indexOf("(!equippedPersona || codexExpanded) &&", start);
  assert.ok(start >= 0 && end > start, "人格一覧の見出しとボタン群が存在する");
  const block = personaSource.slice(start, end);
  assert.match(block, /className: "pw-listbar"/);
  assert.match(block, /className: "pw-listbar-actions"/);
  assert.match(block, /className: "persona-custom-trigger"/);
  assert.match(block, /className: "persona-draft-import-trigger"/);
  assert.doesNotMatch(block, /equippedPersona\s*&&/);
  assert.doesNotMatch(block, /role:\s*"button"/, "操作ボタンを内包する親はボタン役割にしない");
  assert.match(block, /className: "pw-listbar-toggle"/);
  assert.match(block, /aria-controls: "persona-list-region"/);
});

test("人格編集開始とE.G.O解析開始は通常時にもボタンとして視認できる", () => {
  assert.match(personaSource, /className: "persona-edit-toggle"/);
  assert.match(personaSource, /"aria-pressed": isSynced/);
  assert.match(otherSections, /className: "ego-analysis-toggle btn btn-sm "/);
  assert.match(otherSections, /"aria-pressed": state\.egoManual/);
  assert.match(interactionCss, /\.persona-edit-toggle\.btn-secondary/);
  assert.match(interactionCss, /\.ego-analysis-toggle\.btn-secondary/);
});

test("所持人格の同期ランク・MAXは操作前に実コストと返還不可を表示する", () => {
  assert.match(otherSections, /初回設定時：同期ランク/);
  assert.match(otherSections, /syncCosts\?\.rank\?\.shards/);
  assert.match(otherSections, /syncCosts\?\.max\?\.shards/);
  assert.match(interactionCss, /\.roster-sync-cost-note/);
  assert.match(interactionCss, /\.roster-sync-ops\s*\{/);
});
