import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const parserSource = readFileSync(new URL("../js/persona-draft-import.js", import.meta.url), "utf8");

function parseDraft(text) {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  return context.window.LBT_parsePersonaDraft(text);
}

const base = `人格名：「見出し表記検証 人格」
HP：150 SAN：55 速度：1d5+2
斬撃：普通 貫通：抵抗 打撃：弱点`;

[
  "戦術スキル番号：0",
  "戦術スキル：0",
  "戦術スキル 0",
  "戦術 0",
  "0："
].forEach((heading) => {
  test(`テキスト流し込みは「${heading}」から戦術番号を認識する`, () => {
    const result = parseDraft(`${base}
${heading}
連続斬り
斬撃：憤怒
2d9：命中時、確認
戦術スキル：0-2
返し斬り
貫通反撃：嫉妬
1d8：命中時、派生を確認`);

    assert.equal(result.ok, true);
    assert.equal(result.persona.skills.length, 2);
    assert.equal(result.persona.skills[0].rank, "スキル0");
    assert.equal(result.persona.skills[0].name, "連続斬り");
    assert.equal(result.persona.skills[1].rank, "スキル0-2");
    assert.equal(result.persona.skills[1].name, "返し斬り");
    assert.equal(result.persona.skills[1].type, "貫通反撃");
  });
});
