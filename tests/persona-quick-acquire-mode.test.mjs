import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const resolverSource = readFileSync(new URL("../js/roster-resolver.js", import.meta.url), "utf8");
const codexSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");

function loadResolver() {
  const normal = { no: 30, name: "通常人格" };
  const special = { no: 30, name: "特異人格" };
  const context = { window: { DB: { normal_personas: [normal], tokui_personas: [special] } }, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(resolverSource, context, { filename: "js/roster-resolver.js" });
  return { resolve: context.window.LBT_resolvePersonaMode, normal, special };
}

test("人格カードの複製オブジェクトでも一覧由来の通常/特異モードを保持する", () => {
  const { resolve, normal, special } = loadResolver();
  assert.equal(resolve(normal), "n");
  assert.equal(resolve(special), "t");
  const decoratedSpecial = { ...special, decoratedForCard: true };
  assert.equal(resolve(decoratedSpecial), null, "別参照の表示オブジェクトから種別を推測しない");
  assert.equal(resolve(decoratedSpecial, "t"), "t", "カード側で確定している種別を優先する");
  assert.equal(resolve({ ...normal, decoratedForCard: true }, "n"), "n");
});

test("クイック獲得と詳細獲得は元の一覧モードを獲得処理へ渡す", () => {
  assert.match(codexSource, /onQuickAcquire\(p, mode\)/);
  assert.match(codexSource, /\(persona, modeHint\) => acquirePersona\(persona, modeHint\)/);
  assert.match(codexSource, /acquirePersona\(selectedPersonaView, currentMode\)/);
  assert.match(codexSource, /const personaModeFor = \(persona, modeHint\) => window\.LBT_resolvePersonaMode\?\.\(persona, modeHint\) \|\| null/);
});

test("指定購入は残高不足で reducer が拒否する前に理由を出す", () => {
  const guard = codexSource.indexOf("const affordability = window.LBT_purchaseAffordability?.(state, cost)");
  const dispatch = codexSource.indexOf('dispatch({ type: "ADD_ROSTER", mode: personaMode', guard);
  const success = codexSource.indexOf("toast(successMessage ||", guard);
  assert.ok(guard >= 0, "共通購入処理に残高チェックがある");
  assert.ok(dispatch > guard, "残高確認後にだけ action を dispatch する");
  assert.ok(success > dispatch, "成功通知は dispatch 行の後に限る");
  assert.match(codexSource.slice(guard, dispatch), /!affordability\.ok/);
});
