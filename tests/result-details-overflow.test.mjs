import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const resultCss = read("../assets/v67-persona-redesign.css");
const sections = read("../js/OtherSections.js");

test("リザルトの折りたたみ詳細は長い文字列をカード内で折り返す", () => {
  assert.match(sections, /className: "ledger-result-details"/);
  assert.match(sections, /className: "ledger-result-detail-content stack-2"/);
  const ticketRule = resultCss.match(/\.ledger-result-detail-content \.gacha-held-ticket\s*\{([^}]*)\}/s);
  assert.ok(ticketRule, "折りたたみ詳細専用のチップ表示ルールがある");
  assert.match(ticketRule[1], /white-space:\s*normal/);
  assert.match(ticketRule[1], /overflow-wrap:\s*anywhere/);
  assert.match(ticketRule[1], /min-width:\s*0/);
  assert.match(resultCss, /\.ledger-result-summary\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(resultCss, /\.ledger-detail-group\s*\{[^}]*min-width:\s*0/s);
});
