import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const designSystem = readFileSync(new URL("../assets/design-system.css", import.meta.url), "utf8");
const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("大罪選択チップは明色の背景でも暗字で通常テキストのコントラスト契約を守る", () => {
  ["憤怒", "色欲", "怠惰", "暴食", "憂鬱", "嫉妬", "特殊"].forEach((sin) => {
    assert.match(designSystem, new RegExp(`\\.chip\\[data-sin="${sin}"\\]\\.is-active`));
  });
  assert.match(designSystem, /\.chip\[data-sin="嫉妬"\]\.is-active,\n\.chip\[data-sin="特殊"\]\.is-active \{\n  color: #0a0a0a;/);
});

test("弱点耐性バッジは白字4.5:1以上となる監査済み背景色を使う", () => {
  assert.match(designSystem, /--res-弱点:#a46935;/);
});

test("所持・強化の選択セグメントと精神の動的出典フィルタは状態をARIAへ伝える", () => {
  assert.match(sections, /button\.setAttribute\("aria-pressed", String\(value === key\)\);/);
  assert.match(sections, /className: "segmented", role: "tablist", "aria-label": "強化カテゴリ"/);
  assert.match(sections, /role: "tab", "aria-selected": category === entry\.value/);
  assert.match(sections, /className: "segmented", role: "tablist", "aria-label": "同期・MAXフィルタ"/);
  assert.match(sections, /role: "tab", "aria-selected": syncRankFilter === key/);
});
