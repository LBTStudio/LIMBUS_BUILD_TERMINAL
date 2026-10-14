import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* ---------------------------------------------------------------------------
   createElement の入れ子検査。

   js/OtherSections.js は JSX ではなく `h("div", { className: "..." }, ...)` で
   書いてあるため、閉じ括弧を1つ落としても構文は通り（`node --check` は green）、
   描画だけが崩れる。実例: リザルトカードの `card-header` の閉じ括弧が無く、
   `card-body` がヘッダーの子になっていた。ヘッダーは display:flex なので本文が
   383px のうち 201px まで潰れ、日本語が1文字ずつ折り返されて「全部縦文字」になる。

   守るべき性質:
     - card-body は card-header の内側に入らない。Card は単なる div ラッパで
       header/body のスロットを持たない（ui.js:141）。2つの字は兄弟でなければならない。
     - 括弧の対応が合っている（これ自体は構文であり green/fail ではないが、
       他の検査が意味を持つための前提なので固定する）

   検査そのものは「className の文字列 → その要素呼び出しの ( ) 区間」を
   追う。className の直後に (…) は無いので、プロパティオブジェクトの } を
   見つけて、その次の ( を呼び出しの開始括弧として特定する。
   --------------------------------------------------------------------------- */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/* LBT_OTHER_SECTIONS は「別の版に同じ検査が通るか」を確かめるための口。
    과거の不具合は HEAD 版（48ea317）で検出できる。 */
const sections = (process.env.LBT_OTHER_SECTIONS
  ? readFileSync(process.env.LBT_OTHER_SECTIONS, "utf8")
  : read("../js/OtherSections.js")).replace(/\r\n/g, "\n");

/* pos 以降で最初に意味を持つ文字の位置を返す。
   コメントと文字列は読み飛ばす。意味のある文字なら pos 自身を返す。 */
function skipNoise(src, pos) {
  for (let i = pos; i < src.length; i += 1) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length - 1 : end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length - 1 : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) break;
        j += 1;
      }
      i = Math.min(j, src.length - 1);
      continue;
    }
    return i;
  }
  return src.length;
}

/* 対応する閉じ括弧の位置。未対応なら -1。 */
function matchBracket(src, open) {
  const openCh = src[open];
  const closeCh = openCh === "{" ? "}" : openCh === "(" ? ")" : "]";
  const stack = [closeCh];
  let i = open + 1;
  while (i < src.length && stack.length) {
    i = skipNoise(src, i);
    const c = src[i];
    if (c === "{" || c === "(" || c === "[") stack.push(c === "{" ? "}" : c === "(" ? ")" : "]");
    else if (c === "}" || c === ")" || c === "]") {
      if (stack[stack.length - 1] === c) stack.pop();
      else return -1; // 並びが崩れている
    }
    i += 1;
  }
  return stack.length ? -1 : i - 1;
}

/* className: "<prefix>…" の要素呼び出し区間を返す。 */
function callsWithClassName(prefix) {
  const needle = `className: "${prefix}`;
  const out = [];
  let from = 0;
  for (;;) {
    const at = sections.indexOf(needle, from);
    if (at < 0) break;
    from = at + needle.length;
    /* className はプロパティオブジェクトの先頭にあるので、直前の { が
       そのオブジェクトの開始。後ろへ探すと children の { に掴まる。 */
    let k = at - 1;
    while (k >= 0 && sections[k] !== "{") k -= 1;
    if (k < 0) continue;
    /* この要素呼び出しの開き括弧は props の直前（h("div", { … ) の "("）。 */
    const open = sections.lastIndexOf("(", k);
    if (open < 0) continue;
    const close = matchBracket(sections, open);
    if (close < 0) continue;
    out.push({ open, close, line: sections.slice(0, open).split("\n").length });
  }
  return out;
}

test("括弧の対応が取れている（構文が壊れていない）", () => {
  const open = (sections.match(/\(/g) || []).length;
  const close = (sections.match(/\)/g) || []).length;
  assert.equal(open, close, `丸括弧の数が一致する（${open} / ${close}）`);
  assert.equal(matchBracket(sections, sections.indexOf("(", sections.indexOf("const LedgerPanel"))) > 0, true);
});

test("card-body が card-header の内側に入っていない", () => {
  const headers = callsWithClassName("card-header");
  const bodies = callsWithClassName("card-body");
  assert.ok(headers.length > 5, `card-header があること（実際 ${headers.length}）`);
  assert.ok(bodies.length > 5, `card-body があること（実際 ${bodies.length}）`);

  const nested = bodies.filter((b) => headers.some((hd) => hd.open < b.open && b.close <= hd.close));
  assert.deepEqual(
    nested.map((b) => `${b.line}行目`),
    [],
    "card-body は card-header の内側に入った組がないこと（入れ子にすると本文が潰れ、日本語が縦に積まれる）"
  );
});

test("リザルトカードは header と body が兄弟になっている", () => {
  /* 2026-10-15 の回帰。card-header の閉じ括弧が1つ落ちていた。
     同じ取り違えが再発しないよう、カード本体の並びを直接見る。 */
  const body = callsWithClassName("card-body").find((b) => b.line > 3500 && b.line < 3700);
  assert.ok(body, "リザルトカードの card-body があること");
  const header = callsWithClassName("card-header").find((hd) => hd.line < body.line && body.line - hd.line < 20);
  assert.ok(header, "card-body の直前に card-header があること");
  assert.ok(header.close < body.open, `header が body より前に閉じていること（header ${header.line}行目 / body ${body.line}行目）`);
});