import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("B-type production layout keeps the navigation, work area, and preview as three distinct columns", () => {
  const css = read("../assets/b-type-workbench.css");
  const app = read("../js/App.js");
  assert.match(css, /--rail-w:\s*190px/);
  assert.match(css, /--preview-w:\s*220px/);
  assert.match(css, /\.app\s*\{\s*grid-template-columns:\s*var\(--rail-w\) minmax\(0, 1fr\) var\(--preview-w\)/);
  assert.match(app, /className: "rail"/);
  assert.match(app, /className: "focus"/);
  assert.match(app, /React\.createElement\(LivePreview, \{ state, dispatch \}\)/);
});

test("B-type refinement styles the real home launcher and workbench controls responsively", () => {
  const css = read("../assets/b-type-workbench.css");
  assert.match(css, /\.home-hero\s*\{/);
  assert.match(css, /\.home-task-grid\s*\{/);
  assert.match(css, /\.status-strip\s*\{/);
  assert.match(css, /\.subtabs\s*\{/);
  assert.match(css, /@media \(max-width: 1099px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
