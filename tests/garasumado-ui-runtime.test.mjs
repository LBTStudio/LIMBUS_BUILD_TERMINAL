import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   取り込み画面が「読めて・描ける」ことを実行で確認する。

   実測した障害（2026-10-17）:
   帰属先の選択肢（scenarioOptions）が load() の中の一時変数で、描画側から
   参照していたため、画面を開いた瞬間に
     ReferenceError: scenarioOptions is not defined
   でレンダリングが落ちていた。

   ソースの正規表現検査では「宣言がある」「参照がある」ことしか見なくて、
   両者が同じスコープかが見えなかった。だから実行して初めて分かった。
   ここではコンポーネントを実行して、描画までに未定義参照が出ないことを見る。
   --------------------------------------------------------------------------- */

const ui = readFileSync(new URL("../js/garasumado-import-ui.js", import.meta.url), "utf8");

/* React を最小限だけ実装して、コンポーネントを実際に走らせる。 */
function loadPanel(manifest) {
  const element = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) });
  const hooks = { useState: (v) => [typeof v === "function" ? v() : v, () => {}], useRef: (v) => ({ current: v }), useMemo: (fn) => fn(), useEffect: () => {}, useLayoutEffect: () => {} };
  const w = {
    React: {
      createElement: element,
      useState: hooks.useState,
      useRef: hooks.useRef,
      useMemo: hooks.useMemo,
      useEffect: hooks.useEffect,
      useLayoutEffect: hooks.useLayoutEffect
    },
    window: {},
    console: { log() {}, warn() {}, error() {} },
    LBT_parseShareUrl: () => null,
    LBT_fetchGarasumadoDocument: async () => null,
    LBT_buildGarasumadoManifest: () => manifest,
    LBT_annotateManifest: (m) => m,
    LBT_annotateOperations: () => [],
    LBT_toDispatchActions: () => ({ actions: [], skipped: [] }),
    LBT_buildResultDraft: () => ({ blocks: [], unassigned: [], simulation: { results: 0, held: 0, lp: 0, shards: 0, unassigned: 0, awaitingSource: 0 } }),
    LBT_buildNameIndex: () => null,
    LBT_resolveCandidates: () => [],
    LBT_garasumado: { SOURCES: [{ id: "buy", label: "購入" }] },
    Button: element,
    Icon: () => null,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true })
  };
  w.window = w;
  w.globalThis = w;
  const ctx = vm.createContext(w);
  vm.runInContext(ui, ctx, { filename: "garasumado-import-ui.js" });
  return w;
}

test("取り込み画面は未定義参照を出さずに描ける", () => {
  const manifest = {
    scenarios: [{ key: "scenario:0", name: "第一夜", memo: "メモ", income: { lp: 100, shards: 0 }, tickets: {} }],
    groups: [{ id: "personas", label: "人格", items: [{ key: "personas:X", name: "黒雲会組員", kinds: [{ kind: "persona", no: 1, mode: "n" }] }] }],
    counts: { total: 1, ops: 0, unknownName: 0, included: 1, lineOn: 0, pickMode: 0, unresolved: 0, spiritsExcluded: 0 },
    lines: []
  };

  const w = loadPanel(manifest);
  assert.equal(typeof w.GarasumadoImportPanel, "function", "パネルが定義されている");

  /* scenarioOptions のような描画側の識別子がコンポーネントスコープにあるか。 */
  assert.match(ui, /const scenarioOptions = manifest/, "帰属先の選択肢はコンポーネントスコープで持つ");
  assert.doesNotMatch(ui, /const scenarioOptions = \(annotated\.scenarios/, "load() の一時変数にはしない");
});

test("パネルを描画しても ReferenceError が出ない（スコープ未定義を捕まえる）", () => {
  /* 描画経路で参照される識別子が、コンポーネントのスコープに無いと
     画面を開いた瞬間に落ちる。宣言と参照が同じスコープかを、
     ソース看得ずに実行して確かめる。 */
  const manifest = {
    scenarios: [{ key: "scenario:0", name: "第一夜", memo: "m", income: { lp: 1, shards: 0 }, tickets: {} }],
    groups: [{ id: "personas", label: "人格", items: [{ key: "personas:X", name: "X", kinds: [{ kind: "persona", no: 1, mode: "n" }] }] }],
    counts: { total: 1, ops: 0, unknownName: 0, included: 1, lineOn: 0, pickMode: 0, unresolved: 0, spiritsExcluded: 0 },
    lines: []
  };
  const w = loadPanel(manifest);
  const Panel = w.GarasumadoImportPanel;
  assert.equal(typeof Panel, "function", "パネルが定義されている");

  /* 描画時に例外が出たら、未定義識別子の参照（描画だけのバグ）。 */
  assert.doesNotThrow(() => {
    w.React.createElement(Panel, { onClose() {}, onApply() {} });
  }, "描画中に未定義参照が出ると画面が真っ白になる");
});

