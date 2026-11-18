import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("../assets/v74-ledger-multicolumn.css");
const source = read("../js/OtherSections.js");

test("リザルト一覧はPC3列・タブレット2列・スマホ1列で表示する", () => {
  assert.match(css, /\.ledger-cards\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/s);
  assert.match(css, /@media \(min-width: 701px\) and \(max-width: 1100px\)[\s\S]*?\.ledger-cards\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ledger-cards\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /\.ledger-card-wrap \.ledger-card \.card-body\.ledger-card-body\s*\{[^}]*display: flex !important;[^}]*flex-direction: column !important/s);
});

test("複列カードでも獲得資源と支出を識別できる", () => {
  assert.match(css, /--ledger-lp:\s*#f0d18b/);
  assert.match(css, /--ledger-shards:\s*#8bd5df/);
  assert.match(css, /--ledger-cost:\s*#f0a079/);
  assert.match(css, /\.ledger-card-income > \.ledger-pair:first-child\s*\{[^}]*background:/s);
  assert.match(css, /\.ledger-card-income > \.ledger-pair:nth-child\(2\)\s*\{[^}]*background:/s);
  assert.match(css, /\.ledger-card-income \.ledger-card-spent\s*\{[^}]*border-left:[^}]*var\(--ledger-cost\)/s);
});

test("一覧カードと入力・明細の境界は暗色背景から独立して見える", () => {
  assert.match(css, /--ledger-card-border:\s*#746759/);
  assert.match(css, /\.ledger-card-wrap \.ledger-card\s*\{[^}]*border:[^}]*var\(--ledger-card-border\)/s);
  assert.match(css, /\.ledger-card-wrap \.ledger-card \.card-header\s*\{[^}]*background:\s*var\(--ledger-card-head\) !important/s);
  assert.match(css, /\.ledger-results-search,[\s\S]*?\.ledger-results-sort\s*\{[^}]*border-color:\s*var\(--ledger-card-border\)/);
  assert.match(css, /\.ledger-result-summary\s*\{[^}]*border:\s*1px solid #655a4e/s);
});

test("100件以上でもページ単位の配列切り出しと件数表示を維持する", () => {
  assert.match(source, /const RESULTS_PAGE_SIZE = 12/);
  assert.match(source, /Math\.ceil\(sortedResults\.length \/ RESULTS_PAGE_SIZE\)/);
  assert.match(source, /sortedResults\.slice\([\s\S]{0,160}RESULTS_PAGE_SIZE/);
  assert.match(source, /sortedResults\.length/);
});
