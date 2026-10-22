import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function load() {
  const context = {
    window: { DB: db },
    console,
    URL,
    TextEncoder,
    TextDecoder,
    React: {
      useReducer: () => {},
      useRef: () => ({ current: null }),
      useState: () => [null, () => {}],
      useEffect: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);

  // App.js のインポート検証部だけを評価し、UIマウントに依存せず実際の validator を試す。
  const start = appSource.indexOf("const IMPORT_GROUPS = [");
  const end = appSource.indexOf("\nfunction importStateFromFile", start);
  assert.ok(start >= 0 && end > start, "IMPORT_GROUPS と validateImportData が存在する");
  vm.runInContext(
    appSource.slice(start, end) + "\nwindow.__testValidateImportData = validateImportData;",
    context
  );
  return context;
}

const context = load();
const w = context.window;
const validate = w.__testValidateImportData;

test("部分インポートは数式を配列のオブジェクトとして検証する", () => {
  assert.equal(validate({ formulas: "broken" }), "formulas は配列ではありません");
  assert.equal(validate({ formulas: [null] }), "formulas[0] はオブジェクトではありません");
  assert.equal(validate({ formulas: ["broken"] }), "formulas[0] はオブジェクトではありません");
  assert.equal(validate({ formulas: [{ id: "f-1", name: "A", expr: "1+1" }] }), null);
});

test("部分インポートは既定ステータスの null を許可し、不正な型は拒否する", () => {
  assert.equal(validate({ defaultStatuses: null }), null);
  assert.equal(validate({ defaultStatuses: "broken" }), "defaultStatuses は配列ではありません");
  assert.equal(validate({ defaultStatuses: [null] }), "defaultStatuses[0] はオブジェクトではありません");
  assert.equal(validate({ defaultStatuses: [{ label: "障壁", initial: 0, max: 10 }] }), null);
});

test("既存の保存データに壊れた数式リストがあっても起動用stateを配列へ正規化する", () => {
  const base = JSON.parse(JSON.stringify(w.INIT_STATE));
  const wrongType = w.LBT_normalizeStateShape({ ...base, formulas: "broken" });
  assert.deepEqual(JSON.parse(JSON.stringify(wrongType.formulas)), []);

  const badEntries = w.LBT_normalizeStateShape({
    ...base,
    formulas: [null, "broken", { id: "f-2", name: "保全した式", expr: "1+1" }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(badEntries.formulas)), [
    { id: "f-2", name: "保全した式", expr: "1+1" }
  ]);
});

test("既存の保存データの既定ステータスが壊れていても起動時に安全な既定へ戻す", () => {
  const base = JSON.parse(JSON.stringify(w.INIT_STATE));
  const wrongType = w.LBT_normalizeStateShape({ ...base, defaultStatuses: "broken" });
  assert.equal(wrongType.defaultStatuses, null);

  const badEntries = w.LBT_normalizeStateShape({ ...base, defaultStatuses: [null, { label: "HP", initial: 0, max: "hp" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(badEntries.defaultStatuses)), [
    { label: "HP", initial: 0, max: "hp" }
  ]);
});
