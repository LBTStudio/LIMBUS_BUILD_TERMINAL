import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { auditRuleBasedOpening, summarizeBalanceCuePatterns } from "../tools/rule-based-opening-audit.mjs";
const context = { window: {}, console, module: { exports: {} } };
vm.createContext(context);
vm.runInContext(readFileSync(new URL("../js/garasumado-memo-parse.js", import.meta.url), "utf8"), context);
const memo = context.window.LBT_garaMemo;

test("stable note balances infer a stable starting amount", () => {
  const history = [
    { name: "first", memo: "90LP：現在100LP\n29欠片：現在39欠片" },
    { name: "second", memo: "20LP：現在120LP\n5欠片：現在44欠片" }
  ];
  const audit = auditRuleBasedOpening(history, { lp: 120, shards: 44 }, memo);
  assert.equal(audit.ruleAnalysis.lp.openingAnchors.historyArrayOrder.stableAcrossAnchors, true);
  assert.equal(audit.ruleAnalysis.lp.openingAnchors.historyArrayOrder.inferredOpening, 10);
  assert.equal(audit.ruleAnalysis.shards.openingAnchors.historyArrayOrder.inferredOpening, 10);
  assert.equal(audit.ruleAnalysis.lp.openingAnchors.historyArrayOrder.latestAnchor.matchesSavedCurrent, true);
});

test("inconsistent checkpoints are not treated as a stable opening", () => {
  const history = [
    { name: "first", memo: "90LP：現在100LP" },
    { name: "second", memo: "20LP：現在150LP" }
  ];
  const audit = auditRuleBasedOpening(history, { lp: 150, shards: 0 }, memo);
  assert.equal(audit.ruleAnalysis.lp.openingAnchors.historyArrayOrder.stableAcrossAnchors, false);
  assert.equal(audit.ruleAnalysis.lp.openingAnchors.historyArrayOrder.distinctOpeningEstimates, 2);
});

test("balance cue inventory separates current words from arrow transitions without outputting note text", () => {
  const summary = summarizeBalanceCuePatterns([
    { memo: "90LP：現在100LP\n消費100LP→残り0LP" }
  ]);
  assert.equal(summary.memoRows, 1);
  assert.equal(summary.cueLines, 2);
  assert.equal(summary.currentWordLines, 1);
  assert.equal(summary.otherBalanceWordLines, 1);
  assert.equal(summary.arrowLines, 1);
  assert.equal(summary.lpLines, 2);
  assert.ok(summary.patternCounts["current-word+lp+amount-before+amount-after"]);
  assert.ok(summary.patternCounts["balance-word+arrow+lp+amount-before+amount-after+action"]);
});
