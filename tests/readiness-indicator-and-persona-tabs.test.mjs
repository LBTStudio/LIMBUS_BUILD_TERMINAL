import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const preview = readFileSync(new URL("../js/LivePreview.js", import.meta.url), "utf8");
const personaCss = readFileSync(new URL("../assets/persona-codex.css", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("セッション前の要確認集計は人格・スキル・パッシブだけを対象にする", () => {
  const readinessBlock = app.slice(app.indexOf("function getSessionReadiness"), app.indexOf("window.LBT_getSessionReadiness"));
  assert.match(app, /function getSessionReadiness\(s\)/);
  assert.match(readinessBlock, /\{ id: "persona", label: "人格" \}/);
  assert.match(readinessBlock, /\{ id: "skill", label: "スキル" \}/);
  assert.match(readinessBlock, /\{ id: "passive", label: "パッシブ" \}/);
  assert.doesNotMatch(readinessBlock, /\{ id: "ego", label:/);
  assert.match(app, /window\.LBT_getSessionReadiness = getSessionReadiness/);
  assert.match(preview, /● 要確認 \$\{readiness\.length\}/);
  assert.match(preview, /currentSection: readiness\[0\]\?\.id \|\| "persona"/);
  assert.match(workspaceCss, /\.preview-readiness/);
});

test("モバイル人格分類はラベルを押し潰さず横スクロールで到達可能にする", () => {
  assert.match(personaCss, /@media \(max-width: 640px\) \{\s*\.persona-workspace \.codex-modes/);
  assert.match(personaCss, /overflow-x: auto/);
  assert.match(personaCss, /min-width: max-content/);
  assert.match(personaCss, /white-space: nowrap/);
  assert.match(personaCss, /scroll-snap-type: x proximity/);
});
