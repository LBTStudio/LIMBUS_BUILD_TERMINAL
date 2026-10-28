import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("リザルトのテキスト流し込みはアクセシブルな安定IDを持つ", () => {
  assert.match(source, /textPanel\s*&&\s*h\("div",\s*\{\s*id: "ledger-text-import-panel",\s*role: "region",\s*"aria-label": "テキスト流し込み"/);
});

test("入力パネルを開いたとき、スクロールとフォーカスを行う実装が存在する", () => {
  const sharedImportEffect = source.includes("[importPanel, textPanel, heldOpen]");
  const legacyTextEffect = source.includes('if (!textPanel || typeof document === "undefined") return;');
  assert.ok(sharedImportEffect || legacyTextEffect, "共有取り込みエフェクトまたは旧テキスト専用エフェクトが必要です");
  assert.match(source, /const scroller = panel\.closest\("\.focus"\);/);
  assert.match(source, /scroller\.scrollTop = Math\.max\(0, top - 12\);/);
  assert.ok(
    source.includes('target.focus({ preventScroll: true });') ||
    source.includes('textarea.focus({ preventScroll: true });'),
    "入力欄へフォーカスを渡す必要があります"
  );
});
