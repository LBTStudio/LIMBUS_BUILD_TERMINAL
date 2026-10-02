import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

/* 所持ライブラリのタブ切り替えで並び順が漏れる件の回帰テスト。
 *
 * 所持ライブラリは人格 / E.G.O の 2 タブで sortBy（並び順）を共有する。
 * 「同期順」だけは人格タブにしか option が無い。素のまま引き継がれると
 *   - E.G.O タブで sortBy が "sync" のまま残り、<select> に該当 option が
 *     無くなって空欄になる
 *   - さらに「No.順」は人格では No.、E.G.O では「ランク・No.順」として
 *     働くので、意図しない並びが初めに適用される
 * タブ切替時に、人才タブ専用の並び順を既定へ戻す。 */

/* OtherSections.js はブラウザ前提なので、必要な最小スタブだけを載せる。 */
const ctx = { window: {}, console, URL, TextEncoder, TextDecoder };
vm.createContext(ctx);
const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("reconcileRosterSortWithTab が定義されている", () => {
  assert.match(source, /const reconcileRosterSortWithTab = \(sortBy, libraryTab\) =>/);
  assert.match(source, /const ROSTER_PERSONA_ONLY_SORTS = new Set\(\["sync"\]\);/);
});

test("タブ切替のボタンが並び順を照合している", () => {
  const tabClicks = [...source.matchAll(/onClick: \(\) => \{ setSortBy\(\(prev\) => reconcileRosterSortWithTab\(prev, "([^"]+)"\)\); setLibraryTab\("[^"]+"\); \}/g)];
  assert.equal(tabClicks.length, 2, `2つのタブが並び順を照合している（実際 ${tabClicks.length}）`);
  const targets = tabClicks.map((m) => m[1]).sort();
  assert.deepEqual(targets, ["egos", "personas"]);
});

test("同期順は E.G.O タブで既定へ戻る", () => {
  // 関数を切り出して実行する（ブラウザ依存を避けて纯粹に検証）
  const fn = new Function(
    "sortBy",
    "libraryTab",
    "ROSTER_PERSONA_ONLY_SORTS",
    "return (libraryTab !== 'personas' && ROSTER_PERSONA_ONLY_SORTS.has(sortBy) ? 'added' : sortBy);"
  );
  const SORTS = new Set(["sync"]);

  assert.equal(fn("sync", "egos", SORTS), "added", "E.G.O タブでは同期順が解除される");
  assert.equal(fn("sync", "personas", SORTS), "sync", "人格タブでは同期順を維持");
  // 両タブで使える並び順は持ち越される
  for (const v of ["added", "name", "number"]) {
    assert.equal(fn(v, "egos", SORTS), v, `${v} は E.G.O タブでも維持される`);
    assert.equal(fn(v, "personas", SORTS), v, `${v} は人格タブでも維持される`);
  }
});

test("実際のコードとテストの期待が食い違わないこと", () => {
  // ソース上の式を eval して、手書きの期待と一致するか見る。
  // 取り出した本体は式だけなので return を被せる。
  const body = /const reconcileRosterSortWithTab = \(sortBy, libraryTab\) =>\s*([\s\S]*?);\n/.exec(source);
  assert.ok(body, "関数の実体が見つかること");
  const expr = body[1].trim().replace(/;$/, "");
  assert.ok(expr.startsWith("(") && expr.endsWith(")"), `取り出した本体が式であること: ${expr}`);
  const fn = new Function("sortBy", "libraryTab", "ROSTER_PERSONA_ONLY_SORTS", `return ${expr};`);
  const SORTS = new Set(["sync"]);
  assert.equal(fn("sync", "egos", SORTS), "added");
  assert.equal(fn("sync", "personas", SORTS), "sync");
  assert.equal(fn("number", "egos", SORTS), "number");
  assert.equal(fn("added", "egos", SORTS), "added");
});