import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LEAK_WORDS } from "../tools/text-leaks.mjs";

/* ---------------------------------------------------------------------------
   文字化け（U+FFFD）と非日本語の混入を、全ソースで検査する。

   なぜ要るか（実測）: write ツールで長い日本語コメントを書くと、実際に
   U+FFFD や中国語が混ざって書き込まれた。既存の U+FFFD 検査は画面 JS だけ、
   崩れた英語断片（opted / Ariel / necessities）はどこにも見なかった。
   素通りした状態で「anchor が合わない」と誤診して無関係なコードを直すが、
   本当はスクリプト自体が書けていなかった。検出側を先に固める。
   --------------------------------------------------------------------------- */

const SCAN_DIRS = ["js", "tests", "tools", "data"];
const SCAN_EXT = [".js", ".mjs", ".json", ".html", ".css"];

/* 正当な既存コード。混入ではなく正しい語なので検査から外す。 */
const SCAN_SKIP = new Set([
  "tools/text-leaks.mjs",
  "tests/text-integrity.test.mjs",
  "tests/browser-load-gate.test.mjs",
  "tests/ledger-provenance.test.mjs",
  "tools/apply-support-source.mjs"
]);

function scanFiles(dir, acc = []) {
  for (const name of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
    const file = `${dir}/${name}`;
    if (SCAN_SKIP.has(file)) continue;
    if (SCAN_EXT.some((e) => name.endsWith(e))) acc.push(file);
  }
  return acc;
}

function eachSourceLine(visit) {
  for (const dir of SCAN_DIRS) {
    for (const file of scanFiles(dir)) {
      let src;
      try { src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8"); } catch { continue; }
      src.split(/\r?\n/).forEach((line, i) => visit(line, `${file}:${i + 1}`));
    }
  }
}

test("全ソースに文字化け（U+FFFD）が混ざっていない", () => {
  const dirty = [];
  eachSourceLine((line, at) => {
    if (line.includes("\uFFFD")) dirty.push(`${at}  ${line.trim().slice(0, 100)}`);
  });
  assert.deepEqual(dirty, [], "文字化けのある行:\n" + dirty.join("\n"));
});

test("全ソースに非日本語の混入（実測で起きた語）が無い", () => {
  const leaked = [];
  eachSourceLine((line, at) => {
    if (line.includes("\uFFFD")) return;
    for (const word of LEAK_WORDS) {
      if (line.includes(word)) { leaked.push(`${at}  [${word}]  ${line.trim().slice(0, 100)}`); break; }
    }
  });
  assert.deepEqual(leaked, [], "混入のある行:\n" + leaked.join("\n"));
});