import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");

test("モバイルのセクション補助文は右端プレビュー展開タブを避け、見出しの次行へ配置する", () => {
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.section-title-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(css, /\.section-title-row \{[\s\S]*?padding-right: 48px;/);
  assert.match(css, /\.section-subtitle \{[\s\S]*?flex: 1 0 100%;[\s\S]*?margin-left: 0;/);
});


const auditCss = readFileSync(new URL("../assets/v69-mobile-ui-audit.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("スマートフォンではプレビューの操作を本文に重ねず、上部バーから開閉できる", () => {
  assert.match(indexSource, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
  assert.match(appSource, /className: "preview-mobile-toggle"[\s\S]{0,300}"aria-expanded": previewOpen/);
  assert.match(auditCss, /@media \(max-width: 640px\)[\s\S]*?\.preview-edge-toggle,[\s\S]*?\.preview-reopen \{\s*display: none !important;/);
  assert.match(auditCss, /\.preview-mobile-toggle \{\s*display: inline-flex/);
});

test("スマートフォンの見出しに旧プレビュータブ用の余白を残さない", () => {
  assert.match(auditCss, /\.section-title-row \{\s*padding-right: 0;/);
});
