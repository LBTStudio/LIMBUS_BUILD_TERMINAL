import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("同期編集中は編集欄を既定表示し、閲覧専用の人格だけカードを既定にする", () => {
  // 同期編集（editable）では編集欄、閲覧専用ではカードを既定とし、利用者の明示選択を優先する。
  assert.match(source, /const isPassiveReadView = !!state\.pas\?\.name && \(forceEdit === null \? !editable : forceEdit === false\);/);
  assert.match(source, /const \[forceEdit, setForceEdit\] = React\.useState\(null\);/);
  assert.match(source, /if \(isPassiveReadView\) return h\("div", \{ className: "stack-6 passive-read-workspace" \}/);
  assert.match(source, /h\(PassiveCard, \{ title: "PERSONA PASSIVE \/ 人格パッシブ", pas: state\.pas, sin: primarySin \}\)/);
});

test("パッシブ2には常時効果の記入欄があり、効果欄と分離して編集できる", () => {
  assert.match(source, /label: "\\u5E38\\u6642\\u52B9\\u679C2\\uFF08\\u4EFB\\u610F\\uFF09"/);
  assert.match(source, /value: state\.pas2\.always \|\| "", disabled: !editable, onChange: \(e\) => patchPas2\(\{ always: e\.target\.value \}\)/);
});

test("パッシブ閲覧カードには明示的な編集入口とカード復帰経路がある", () => {
  assert.match(source, /onClick: \(\) => setForceEdit\(true\) \}, "この枠を編集"/);
  assert.match(source, /onClick: \(\) => setForceEdit\(false\) \}, "\\u30AB\\u30FC\\u30C9\\u8868\\u793A\\u306B\\u623B\\u3059"/);
  assert.match(source, /state\.pas2Enabled && state\.pas2\?\.name \? h\(PassiveCard/);
  // 編集欄側からも、名前が入っていれば常にカード表示へ戻せる。
  assert.match(source, /!!state\.pas\?\.name && \/\* @__PURE__ \*\/ React\.createElement\(Button, \{ variant: "ghost", size: "sm", icon: "eye"/);
});
