import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("操作・保存シートは保存対象と出力対象を先行ラベルで区別する", () => {
  assert.match(app, /scope: "このビルド"/);
  assert.match(app, /scope: "所持データ"/);
  assert.match(app, /scope: "出力"/);
  assert.match(app, /className: "utility-sheet-scope"/);
  assert.match(refinements, /\.utility-sheet-scope \{ width: fit-content;/);
});

test("操作・保存シートはキーボードフォーカスを循環し、起動元へ戻す", () => {
  assert.match(app, /const utilitySheetRef = React\.useRef\(null\);/);
  assert.match(app, /const getFocusable = \(\) => Array\.from\(utilitySheetRef\.current\?\.querySelectorAll\('/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /const utilityReturnFocusRef = React\.useRef\(null\);/);
  assert.match(app, /const openUtilities = \(event\) => \{/);
  assert.match(app, /utilityReturnFocusRef\.current = trigger instanceof HTMLElement \? trigger : null;/);
  assert.match(app, /if \(trigger && document\.contains\(trigger\)\) trigger\.focus\(\);/);
  assert.match(app, /onOpenUtilities: openUtilities/);
  assert.match(app, /onClose: closeUtilities/);
});
