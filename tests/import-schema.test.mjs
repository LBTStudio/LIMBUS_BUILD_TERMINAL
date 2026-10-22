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


test("部分インポートは出力除外マップの型と真偽値を検証する", () => {
  assert.equal(validate({ outputExclude: "broken" }), "outputExclude はオブジェクトではありません");
  assert.equal(validate({ outputExclude: { memo: "broken" } }), "outputExclude.memo はオブジェクトではありません");
  assert.equal(validate({ outputExclude: { memo: { "基本情報": "yes" } } }), "outputExclude.memo.基本情報 は真偽値ではありません");
  assert.equal(validate({ outputExclude: { memo: { "基本情報": true }, palette: {} } }), null);
});

test("部分インポートは数式上書きとE.G.Oスロットの形状を検証する", () => {
  assert.equal(validate({ builtinFormulasOverride: "broken" }), "builtinFormulasOverride はオブジェクトではありません");
  assert.equal(validate({ builtinFormulasOverride: { MT: true } }), "builtinFormulasOverride.MT は文字列またはnullではありません");
  assert.equal(validate({ builtinFormulasOverride: { MT: "{速度}+{QB}", DM: null } }), null);

  assert.equal(validate({ egoSlots: "broken" }), "egoSlots はオブジェクトではありません");
  assert.equal(validate({ egoSlots: { ZAYIN: "broken" } }), "egoSlots.ZAYIN はオブジェクトまたはnullではありません");
  assert.equal(validate({ egoSlots: { UNKNOWN: null } }), "egoSlots.UNKNOWN は未知のランクです");
  assert.equal(validate({ egoSlots: { ZAYIN: null, TETH: { no: 2, name: "試験E.G.O" } } }), null);
});

test("壊れた出力除外・数式上書き・E.G.Oスロットを起動時に正規化する", () => {
  const base = JSON.parse(JSON.stringify(w.INIT_STATE));
  const normalized = w.LBT_normalizeStateShape({
    ...base,
    outputExclude: { memo: "broken", palette: { "パレット": "yes", "基本情報": true } },
    builtinFormulasOverride: { MT: true, DM: "{速度}+{QB}", DT: null },
    egoSlots: "broken",
    ui: { previewCollapsed: "broken" },
    pas: "broken",
    pas2: ["broken"]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.outputExclude)), {
    memo: {},
    palette: { "基本情報": true }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.builtinFormulasOverride)), {
    DM: "{速度}+{QB}",
    DT: null
  });
  assert.deepEqual(Object.keys(normalized.egoSlots).sort(), ["ALEPH", "HE", "TETH", "WAW", "ZAYIN"].sort());
  assert.ok(Object.values(normalized.egoSlots).every((slot) => slot === null));
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.ui.previewCollapsed)), {});
  assert.equal(typeof normalized.pas, "object");
  assert.equal(Array.isArray(normalized.pas2), false);
});
