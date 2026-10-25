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


test("リザルト明細はマーカー・種別・数量・コストを横並びにし、操作を初期表示から退避する", () => {
  assert.match(sections, /className: "ledger-result-object-list"/);
  assert.match(sections, /className: "ledger-result-object-marker"[\s\S]{0,100}"−"/);
  assert.match(sections, /className: "ledger-result-object-quantity"/);
  assert.match(sections, /className: "ledger-result-object-actions"/);
  assert.match(sections, /className: "ledger-result-object-action-menu"/);
  assert.match(resultCss, /\.ledger-card \.ledger-result-object-row\s*\{[^}]*grid-template-columns:[^}]*minmax/s);
  assert.match(resultCss, /\.ledger-result-object-action-menu\s*\{[^}]*position:\s*absolute/s);
});

test("人格に登録された特殊強化だけを直下へ表示し、効果文は操作時に展開する", () => {
  assert.match(sections, /entry\.ref\?\.kind === "rosterPersona"/);
  assert.match(sections, /owner\?\.build\?\.enhancements/);
  assert.match(sections, /window\.DB\?\.special_enhancements/);
  assert.match(sections, /className: "ledger-object-enhancements"/);
  assert.match(sections, /"特殊強化：" \+ name/);
  assert.match(sections, /className: "ledger-object-enhancement-details"/);
  assert.match(sections, /onToggle: \(event\) => \{[\s\S]{0,260}scrollIntoView\(/);
  assert.match(sections, /h\("summary", null, "効果を表示"\)/);
  assert.match(resultCss, /\.ledger-object-enhancements\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(resultCss, /\.ledger-object-enhancement-details\[open\]\s*\{[^}]*flex:\s*1 1 100%/s);
});


test("コンパクトなリザルト行はレイヤー外で既存の2段配置を上書きする", () => {
  const newline = String.fromCharCode(10);
  const layerStart = resultCss.indexOf("@layer v67-persona-redesign {");
  const compactStart = resultCss.indexOf("/* リザルト明細：通常は低い1行");
  const layerClose = resultCss.lastIndexOf(newline + "}" + newline + newline, compactStart);
  assert.ok(layerStart >= 0 && layerClose > layerStart && compactStart > layerClose,
    "sections.css の通常ルールより強い、レイヤー外の上書きを使う");

  const nameStart = resultCss.indexOf(".ledger-card .ledger-result-object-row .ledger-row-name {", compactStart);
  const costStart = resultCss.indexOf(".ledger-card .ledger-result-object-row .ledger-row-cost {", compactStart);
  assert.ok(nameStart > compactStart && costStart > compactStart, "名称とコストの専用ルールがある");
  const nameRule = resultCss.slice(nameStart, resultCss.indexOf("}", nameStart));
  const costRule = resultCss.slice(costStart, resultCss.indexOf("}", costStart));
  assert.ok(nameRule.includes("grid-column:auto") && nameRule.includes("grid-row:auto"));
  assert.ok(costRule.includes("grid-column:auto") && costRule.includes("grid-row:auto"));
});
