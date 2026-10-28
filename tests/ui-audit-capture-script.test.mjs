import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../tools/ui/capture-ui-audit.mjs", import.meta.url), "utf8");

test("mobile screenshot audit follows the top-bar preview control, not the hidden edge rail", () => {
  assert.match(script, /const previewSelector=mobile\?"\.preview-mobile-toggle":"#lbt-preview-edge-toggle";/);
  assert.match(script, /mobile\?"preview-toggle-before-tap":"preview-toggle-hover"/);
  assert.match(script, /mobile\?"モバイル上部バーのプレビュー操作（タップ前）"/);
});

test("record import screenshots use the real DOM structure rendered by OtherSections", () => {
  assert.match(script, /page\.locator\("textarea\.ledger-textarea"\)\.last\(\)/);
  assert.match(script, /page\.locator\("\.ledger-gara-wrap"\)\.filter\(\{has:page\.locator\("textarea\.ledger-textarea"\)\}\)\.last\(\)/);
  assert.match(script, /page\.locator\("\.ledger-gara-wrap"\)\.filter\(\{hasText:"硝子窓から一括取り込む"\}\)\.last\(\)/);
  assert.match(script, /page\.locator\("\.ledger-gara-wrap"\)\.filter\(\{hasText:"所持人格リストを取り込む"\}\)\.last\(\)/);
  assert.doesNotMatch(script, /#ledger-text-import-panel|#ledger-glass-import-panel/);
});

test("localhost screenshot audit isolates expected external analytics noise without hiding app errors", () => {
  assert.match(script, /page\.route\("\*\*\/cdn-cgi\/rum\*\*"/);
  assert.match(script, /lbt-recovery\.lbtstudio-share\.workers\.dev\/api\/stats\/\*\*/);
  assert.match(script, /message\.includes\("ERR_BLOCKED_BY_CLIENT"\)/);
});


test("preview-control metrics include the mobile top-bar button and check duplicates on both viewports", () => {
  assert.match(script, /querySelectorAll\("#lbt-preview-edge-toggle,\.preview-mobile-toggle/);
  assert.match(script, /const previewControls=\(m\.layoutElements\|\|\[\]\)\.filter/);
  assert.match(script, /if\(previewControls\.length>1\) audit\.layoutWarnings\.push\(\{name:base,type:"duplicate-preview-controls"/);
  assert.doesNotMatch(script, /if\(view==="mobile"\)\s*\{\s*const previewControls/);
});
