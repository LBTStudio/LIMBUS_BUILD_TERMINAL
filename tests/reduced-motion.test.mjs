import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

// prefers-reduced-motion の設定が JS 側にも伝わっていることを検証する。
//
// CSS には既に @media (prefers-reduced-motion: reduce) で
// scroll-behavior: auto がある。しかしスクロール系 API に
// behavior: "smooth" を明示するとそちらが優先され、CSS のガードを迂回する。
// そのため JS 側にも分岐が必要で、ここはその分岐と、
// 全スクロール call site がその分岐を通っていることを確認する。

function loadUi(matchMediaImpl) {
  const context = {
    window: { matchMedia: matchMediaImpl },
    document: { body: null, createElement: () => ({ classList: { add() {}, remove() {} }, setAttribute() {}, style: {} }), head: null },
    console,
    setTimeout,
    clearTimeout,
    React: {
      createElement: () => ({}),
      Component: class {},
      useState: () => [null, () => {}],
      useRef: () => ({ current: null }),
      useEffect: () => {},
      useCallback: (f) => f,
      useMemo: (f) => f(),
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../js/ui.js", import.meta.url), "utf8"), context);
  return context.window;
}

const prefersReduce = (matches) => () => ({ matches, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} });

test("OS が-motion を許可する設定なら scrollBehavior は smooth を返す", () => {
  const win = loadUi(prefersReduce(false));
  assert.equal(typeof win.scrollBehavior, "function");
  assert.equal(win.scrollBehavior(), "smooth");
});

test("OS が reduce を要求する設定なら scrollBehavior は auto を返す", () => {
  const win = loadUi(prefersReduce(true));
  assert.equal(win.scrollBehavior(), "auto");
});

test("matchMedia を持たない環境でも例外を投げずに従来挙動へ寄せる", () => {
  const win = loadUi(() => {
    throw new Error("matchMedia unsupported");
  });
  assert.equal(win.scrollBehavior(), "smooth");
});

// コメント内の言及は判定から除外する。行頭判定だとコメントの
// 並び方によって漏れるため、本体を除去してから走査する。
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

test('スクロール call site に behavior: "smooth" の直書きが残っていない', () => {
  const files = ["../js/PersonaCodex.js", "../js/App.js", "../js/OtherSections.js", "../js/SkillDeck.js", "../js/LivePreview.js", "../js/ItemCodex.js", "../js/ui.js"];
  const offenders = [];
  for (const rel of files) {
    stripComments(readFileSync(new URL(rel, import.meta.url), "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (/behavior:\s*"smooth"/.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("persona 側のスクロールはすべて scrollBehavior() を通る", () => {
  const src = stripComments(readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8"));
  const calls = [...src.matchAll(/(scrollIntoView|scrollTo)\s*\(\s*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(calls.length >= 5, `スクロール call site が 5 箇所以上あることを前提とする（実際 ${calls.length}）`);
  const hardcoded = calls.filter((c) => /behavior:\s*"smooth"/.test(c));
  assert.deepEqual(hardcoded, []);
});