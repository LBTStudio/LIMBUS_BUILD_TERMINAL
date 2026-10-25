import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("同期編集中は編集欄を既定表示し、閲覧専用の人格だけカードを既定にする", () => {
  // 同期編集（editable）では編集欄、閲覧専用ではカードを既定とし、利用者の明示選択を優先する。
  assert.match(source, /const hasAnyPassive = !!state\.pas\?\.name \|\| extras\.some\(\(pas\) => pas && pas\.name\);/);
  assert.match(source, /const isPassiveReadView = hasAnyPassive && \(forceEdit === null \? !editable : forceEdit === false\);/);
  assert.match(source, /const \[forceEdit, setForceEdit\] = React\.useState\(null\);/);
  assert.match(source, /if \(isPassiveReadView\) return h\("div", \{ className: "stack-6 passive-read-workspace" \}/);
  assert.match(source, /h\(PassiveCard, \{ title: "PERSONA PASSIVE \/ 人格パッシブ", pas: state\.pas, sin: primarySin, scope: passiveGlossaryScope \}\)/);
});

test("追加パッシブは上限なしで増やせ、常時効果を効果欄と分離して編集できる", () => {
  assert.match(source, /dispatch\(\{ type: "ADD_EXTRA_PASSIVE" \}\)/);
  assert.match(source, /dispatch\(\{ type: "PATCH_EXTRA_PASSIVE", index, patch \}\)/);
  assert.match(source, /dispatch\(\{ type: "REMOVE_EXTRA_PASSIVE", index \}\)/);
  assert.match(source, /extras\.map\(\(pas, index\) => renderEditor\(pas/);
  assert.match(source, /label: "常時効果（任意）"/);
  assert.match(source, /value: pas\.always \|\| ""/);
  assert.match(source, /"追加パッシブを追加"/);
  assert.doesNotMatch(source, /パッシブ2を追加/);
});

test("パッシブ閲覧カードには明示的な編集入口とカード復帰経路がある", () => {
  assert.match(source, /onClick: \(\) => setForceEdit\(true\) \}, "この枠を編集"/);
  assert.match(source, /onClick: \(\) => setForceEdit\(false\) \}, "カード表示に戻す"/);
  assert.match(source, /extras\.map\(\(pas, index\) => \(pas && pas\.name/);
  // 編集欄側からも、名前が入っていれば常にカード表示へ戻せる。
  assert.match(source, /state\.pas\?\.name \? h\(Button, \{ variant: "ghost", size: "sm", icon: "eye"/);
});
