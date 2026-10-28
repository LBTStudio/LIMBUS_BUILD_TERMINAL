import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { auditRuleBasedOpening } from "../tools/rule-based-opening-audit.mjs";
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
