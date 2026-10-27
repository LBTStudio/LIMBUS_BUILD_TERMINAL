import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const auditCss = readFileSync(new URL("../assets/v69-mobile-ui-audit.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("スマートフォンではプレビューの操作を本文に重ねず、上部バーから開閉できる", () => {
  assert.match(index, /assets\/v69-mobile-ui-audit\.css\?v=[0-9a-f]{8}/);
  assert.match(app, /className: "preview-mobile-toggle"[\s\S]{0,300}"aria-expanded": previewOpen/);
  assert.match(auditCss, /@media \(max-width: 640px\)[\s\S]*?\.preview-edge-toggle,[\s\S]*?\.preview-reopen \{\s*display: none !important;/);
  assert.match(auditCss, /\.preview-mobile-toggle \{\s*display: inline-flex/);
});

test("スマートフォンの見出しに旧プレビュータブ用の余白を残さない", () => {
  assert.match(workspace, /\.section-title-row \{[\s\S]*?padding-right: 48px;/);
  assert.match(auditCss, /\.section-title-row \{\s*padding-right: 0;/);
});

