import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("../assets/v76-interaction-audit.css");
const audit = read("../tools/ui/capture-ui-audit.mjs");

test("sticky build tabs stay above scrollable catalog content", () => {
  assert.match(css, /\.build-tabs\.is-b-workbench\s*\{[^}]*z-index:\s*24\s*;/s);
});

test("1280px support detail audit accepts header clearance while requiring the adjacent column", () => {
  assert.match(audit, /columnCount !== 2/);
  assert.match(audit, /breakpointLayout.detailLeft < breakpointLayout.mainRight - 2/);
  assert.match(audit, /breakpointLayout.detailTop - breakpointLayout.mainTop > 80/);
  assert.doesNotMatch(audit, /Math\.abs\(breakpointLayout\.detailTop - breakpointLayout.mainTop\) > 4/);
});
