import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("名前がある人格パッシブは編集可能状態でも既定で閲覧カードを表示する", () => {
  assert.match(source, /const isPassiveReadView = !!state\.pas\?\.name && !forceEdit;/);
  assert.match(source, /if \(isPassiveReadView\) return h\("div", \{ className: "stack-6 passive-read-workspace" \}/);
  assert.match(source, /h\(PassiveCard, \{ title: "PERSONA PASSIVE \/ 人格パッシブ", pas: state\.pas, sin: primarySin \}\)/);
});

test("パッシブ閲覧カードには明示的な編集入口とカード復帰経路がある", () => {
  assert.match(source, /onClick: \(\) => setForceEdit\(true\) \}, "この枠を編集"/);
  assert.match(source, /onClick: \(\) => setForceEdit\(false\) \}, "\\u30AB\\u30FC\\u30C9\\u8868\\u793A\\u306B\\u623B\\u3059"/);
  assert.match(source, /state\.pas2Enabled && state\.pas2\?\.name \? h\(PassiveCard/);
});
