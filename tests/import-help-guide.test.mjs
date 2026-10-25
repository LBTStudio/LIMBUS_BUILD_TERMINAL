import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(resolve(ROOT, "js/App.js"), "utf8");
const notes = readFileSync(resolve(ROOT, "パッチノート.txt"), "utf8");

test("使い方に人格テキスト取込と硝子窓移行の手順がある", () => {
  assert.ok(app.includes('title: "人格データをテキストで流し込む"'));
  assert.ok(app.includes('title: "硝子窓の公開人格を移行する"'));
  assert.ok(app.includes("完成データを分けて入力"));
  assert.ok(app.includes("一括テキストを貼り付け"));
  assert.ok(app.includes("硝子窓URLから移行"));
  assert.ok(app.includes("同期人格として反映"));
  assert.ok(app.includes("操作箇所の見取り図。番号は下の手順に対応します。"));
  assert.ok(app.includes('diagram: "workspace"'));
  assert.ok(app.includes('diagram: "personaText"'));
  assert.ok(app.includes('diagram: "personaUrl"'));
});

test("使い方にリザルトのテキスト取込と硝子窓一括取込の手順がある", () => {
  assert.ok(app.includes('key: "imports", label: "記録を取り込む"'));
  assert.ok(app.includes('title: "テキスト流し込みでリザルトを記録する"'));
  assert.ok(app.includes('title: "硝子窓のシナリオ履歴を一括で取り込む"'));
  assert.ok(app.includes("硝子窓から一括取り込む"));
  assert.ok(app.includes("変換を確定する"));
  assert.ok(app.includes('diagram: "ledgerText"'));
  assert.ok(app.includes('diagram: "ledgerUrl"'));
  assert.ok(app.includes("data:image/svg+xml;charset=utf-8,"));
});

test("パッチノートは日付見出しと従来の追加・修正形式を使う", () => {
  assert.ok(notes.includes("最終編集日: 2026年10月25日"));
  assert.ok(notes.includes("■ 2026-09-16〜2026-10-25 / 更新履歴（日本時間）"));
  assert.ok(notes.includes("■ 2026-10-25 / 使い方に取り込み手順を追加"));
  assert.ok(notes.includes("追加: 人格データのテキスト流し込み"));
  assert.ok(notes.includes("修正: パッチノート冒頭の説明を整理"));
  assert.ok(!notes.includes("284コミットの進行を確認"));
});
