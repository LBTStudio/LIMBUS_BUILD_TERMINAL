import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const itemSource = readFileSync(new URL("../js/ItemCodex.js", import.meta.url), "utf8");
const mobilePreview = readFileSync(new URL("../mobile-preview.html", import.meta.url), "utf8");

test("モバイルの下部ナビゲーションは横スクロールせず全機能を2段で常時表示し、操作・保存を右端に収める", () => {
  const v64r94 = refinements.slice(refinements.indexOf("v64r94"));
  const v64r95 = refinements.slice(refinements.indexOf("v64r95"));
  assert.match(v64r94, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(v64r94, /grid-template-rows: repeat\(2, 52px\)/);
  assert.match(v64r94, /\.rail \{[\s\S]*?overflow: hidden;/);
  assert.match(v64r94, /\.rail \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;/);
  assert.match(v64r95, /\.topbar \.topbar-actions \{ display: none !important; \}/);
  assert.match(v64r95, /\.topbar > \.utility-trigger \{[\s\S]*?min-width: 104px;/);
  assert.match(v64r94, /grid-template-rows: var\(--topbar-h\) minmax\(0, 1fr\) !important;/);
  assert.match(v64r94, /--lbt-mobile-rail-h: calc\(114px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(v64r94, /\.focus \{ padding-bottom: calc\(var\(--lbt-mobile-rail-h\) \+ 12px\); \}/);
  assert.match(v64r94, /padding: 4px 4px calc\(4px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(v64r94, /bottom: var\(--lbt-mobile-rail-h\);/);
  assert.match(v64r95, /\.focus,\s*\.rail \{\s*min-height: 0 !important;/);
  const v64r100 = refinements.slice(refinements.indexOf("v64r100"));
  assert.match(v64r100, /@media \(min-width: 641px\) and \(max-width: 1024px\) and \(max-height: 520px\)/);
  assert.match(v64r100, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(v64r100, /grid-template-rows: repeat\(2, 40px\)/);
  assert.match(v64r100, /height: var\(--lbt-landscape-rail-h\);/);
});

test("アイテム画面はDBアイテムではなくアイテムとして案内する", () => {
  assert.match(appSource, /subtitle: "アイテムを選択・一覧へ導入"/);
  assert.match(itemSource, /"ITEMS"/);
  assert.match(itemSource, /"アイテムを選択"/);
  assert.doesNotMatch(itemSource, /DBアイテム/);
});

test("実機のモバイル確認ページは端末全画面に追従し、確認フレーム由来のスクロールバーを出さない", () => {
  assert.match(mobilePreview, /\.device \{[\s\S]*?overflow: hidden;/);
  assert.match(mobilePreview, /@media \(max-width: 430px\) \{[\s\S]*?body \{ display: block; width: 100vw; min-height: 100dvh; height: 100dvh; padding: 0; overflow: hidden; \}/);
  assert.match(mobilePreview, /\.device \{ width: 100vw; max-width: none; height: 100dvh; border: 0;/);
});
