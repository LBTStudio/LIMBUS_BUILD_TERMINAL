import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");

test("操作・保存シートは保存対象と出力対象を先行ラベルで区別する", () => {
  assert.match(app, /scope: "このビルド"/);
  assert.match(app, /scope: "所持データ"/);
  assert.match(app, /scope: "出力"/);
  assert.match(app, /className: "utility-sheet-scope"/);
  assert.match(refinements, /\.utility-sheet-scope \{ width: fit-content;/);
});
