import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const state = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const items = readFileSync(new URL("../js/ItemCodex.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

test("端末内自動保存は成功と失敗を区別し、保存不能時に状態を握り潰さない", () => {
  assert.match(state, /const \[saveStatus, setSaveStatus\] = React\.useState/);
  assert.match(state, /phase: "saved", savedAt: Date\.now\(\), error: ""/);
  assert.match(state, /phase: "error", savedAt: null, error:/);
  assert.match(state, /saveStatus/);
  assert.match(app, /const saveStateLabel = saveStatus\.phase/);
  assert.match(app, /backup\.textContent = "\\u4F5C\\u696D\\u72B6\\u614B\\u3092\\u4FDD\\u5B58"/);
  assert.match(app, /anchor\.dataset\.autosave = saveStateLabel/);
  assert.match(app, /anchor\.dataset\.autosaveState = saveStatus\.phase/);
  assert.match(app, /anchor\.setAttribute\("aria-label", `\\u30AF\\u30A4\\u30C3\\u30AF\\u691C\\u7D22\\u3002\$\{saveStateLabel\}`\)/);
  assert.ok(app.indexOf("const saveStateLabel") < app.indexOf("window.App = App;"), "自動保存状態の副作用はAppコンポーネント内に置く");
  assert.match(app, /return \(\) => indicator\.remove\(\);/);
});

test("保存導線の用語を統一し、部分復元前に適用範囲を要約する", () => {
  assert.match(app, /label: "\\u73FE\\u5728\\u306E\\u4F5C\\u696D\\u72B6\\u614B\\u3092\\u4FDD\\u5B58"/);
  assert.match(app, /keywords: \["\\u72B6\\u614B\\u3092\\u30A8\\u30AF\\u30B9\\u30DD\\u30FC\\u30C8"/);
  assert.match(app, /\(c\.keywords \|\| \[\]\)\.some\(\(keyword\) => keyword\.toLowerCase\(\)\.includes\(ql\)\)/);
  assert.match(app, /const selectedImportGroups = importData/);
  assert.match(app, /const selectedImportLabel = selectedImportGroups\.length/);
  assert.match(app, /className: "import-apply-summary"/);
  assert.match(app, /\\u4ECA\\u56DE\\u306E\\u9069\\u7528\\u7BC4\\u56F2\\uFF1A", selectedImportLabel/);
  assert.match(app, /disabled: selectedImportGroups\.length === 0/);
});

test("クイック検索のE.G.O・アイテム候補は詳細画面へ移動するだけで装備・導入しない", () => {
  assert.match(app, /E\.G\.O：\$\{ego\.name\}/);
  assert.match(app, /アイテム：\$\{item\.name\}/);
  assert.match(app, /currentSection: "ego", egoSearchTarget:/);
  assert.match(app, /currentSection: "items-build", itemSearchTarget:/);
  assert.match(app, /DB\.specialItems/);
  assert.doesNotMatch(app.slice(app.indexOf("const egoHits"), app.indexOf("const cmdFiltered")), /SET_EGO_SLOT|ADD_ITEM/);
  assert.match(sections, /const searchTargetId = state\.ui\?\.itemSearchTarget\?\.id/);
  assert.match(sections, /setPickerQuery\(String\(target\.name \|\| target\.id\)\)/);
  assert.match(sections, /const searchTarget = state\.ui\?\.egoSearchTarget/);
  assert.match(sections, /setSelected\(target\)/);
});


 
 
test("作業状態の部分インポートは全ての永続履歴・初期設定をカテゴリに含める", () => {
  const drawLogField = ["gacha", "Log"].join("");
  assert.equal((app.match(/key: "gacha"/g) || []).length, 1, "抽選カテゴリは重複しない");
  assert.ok(app.includes(`fields: ["${drawLogField}","draws","appliedDrawBatchIds","tickets"]`));
  assert.ok(app.includes('fields: ["favorites","historyRecent"]'));
  const personaGroup = app.slice(app.indexOf('{ key: "persona"'), app.indexOf("\n", app.indexOf('{ key: "persona"')));
  const itemGroup = app.slice(app.indexOf('{ key: "items"'), app.indexOf("\n", app.indexOf('{ key: "items"')));
  assert.ok(personaGroup.includes('"initiative"'), "イニシアチブを復元する");
  assert.ok(itemGroup.includes('"initialItems"'), "初期所持アイテムの定義を復元する");
  assert.ok(state.includes('"hp","san","initiative","speed"'));
  assert.ok(state.includes('"enhancements","initialItems","draws"'));
  assert.ok(state.includes(`"historyRecent","${drawLogField}","appliedDrawBatchIds","tickets"]`));
});

test("未解決の旧チケットデータは妥当な配列／マップ形式で検証し、保持対象から外さない", () => {
  assert.match(app, /if \(data\.tickets !== void 0\)/);
  assert.ok(app.includes('return "tickets[" + badIndex + "] はオブジェクトではありません"'));
  assert.match(app, /return \"tickets は配列またはオブジェクトではありません\"/);
  assert.ok(app.includes('fields: ["gachaLog","draws","appliedDrawBatchIds","tickets"]'));
  assert.ok(state.includes('"historyRecent","gachaLog","appliedDrawBatchIds","tickets"]'));
});

test("インポート検証は配列項目と所持データの形を事前に検証する", () => {
  assert.ok(app.includes("const arrayFields = ["));
  assert.ok(app.includes("if (data[field] !== void 0 && !Array.isArray(data[field]))"));
  assert.ok(app.includes('if (!data.roster || typeof data.roster !== "object" || Array.isArray(data.roster))'));
  assert.ok(app.includes('if (!data.roster) return "roster 単体ファイルに所持データがありません"'));
});


test("保存フィールド・インポートカテゴリ・APPLY_PARTIAL許可リストは相互に整合する", () => {
  const groupBlock = app.match(/const IMPORT_GROUPS = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(groupBlock, "IMPORT_GROUPS を読み取れる");
  const groupedFields = [...groupBlock.matchAll(/fields:\s*\[([^\]]*)\]/g)]
    .flatMap(([, list]) => [...list.matchAll(/"([^"]+)"/g)].map(([, field]) => field));

  const partialStart = state.indexOf('case "APPLY_PARTIAL": {');
  const allowStart = state.indexOf("const ALLOWED = [", partialStart);
  const allowEnd = state.indexOf("];", allowStart);
  assert.ok(partialStart >= 0 && allowStart > partialStart && allowEnd > allowStart,
    "APPLY_PARTIAL の許可リストを読み取れる");
  const allowedFields = [...state.slice(allowStart, allowEnd).matchAll(/"([^"]+)"/g)]
    .map(([, field]) => field);

  assert.deepEqual([...new Set(groupedFields)].sort(), [...groupedFields].sort(),
    "同じフィールドを複数カテゴリへ重複登録しない");
  assert.deepEqual(groupedFields.filter((field) => !allowedFields.includes(field)), [],
    "UIカテゴリにある全フィールドをreducerも受け入れる");

  const initStart = state.indexOf("const INIT_STATE = {");
  const initEnd = state.indexOf("\n};", initStart);
  assert.ok(initStart >= 0 && initEnd > initStart, "INIT_STATE を読み取れる");
  const initFields = [...state.slice(initStart, initEnd).matchAll(/^  ([A-Za-z_$][\w$]*):/gm)]
    .map(([, field]) => field);
  const deliberateExclusions = new Set([
    "schemaVersion", "ui", "shareImageBlockedReason", "egoManual", "selfStatusCandidates"
  ]);
  const missingCategories = initFields.filter((field) =>
    !groupedFields.includes(field) && !deliberateExclusions.has(field)
  );
  assert.deepEqual(missingCategories, [],
    "新しい永続フィールドはカテゴリへ追加するか、意図的な除外理由を明示する");
});


test("通帳の金額・チケット数は部分一致の数値として取り込まず、明細パスで拒否する", () => {
  const groups = app.match(/const IMPORT_GROUPS = \[[\s\S]*?\n\];/)?.[0];
  const validateStart = app.indexOf("function validateImportData(data) {");
  const validateEnd = app.indexOf("\nfunction importStateFromFile", validateStart);
  const context = vm.createContext({});
  vm.runInContext(`${groups}\n${app.slice(validateStart, validateEnd)}\nglobalThis.validateImportData = validateImportData;`, context);
  const validate = context.validateImportData;
  assert.match(validate({ schemaVersion: 5, results: [
    { id: "r1", income: { lp: "100abc", shards: 0 } }
  ] }), /results\[0\]\.income\.lp/);
  assert.match(validate({ schemaVersion: 5, entries: [
    { id: "e1", cost: { lp: "2.5", shards: 0 } }
  ] }), /entries\[0\]\.cost\.lp/);
  assert.match(validate({ schemaVersion: 5, results: [
    { id: "r1", income: { lp: "1,200", shards: 0, tickets: { persona: "2x" } } }
  ] }), /results\[0\]\.income\.tickets\.persona/);
  assert.equal(validate({ schemaVersion: 5, results: [
    { id: "r1", income: { lp: "1,200", shards: 0, tickets: { persona: "2", pack: { A: 3 } } } }
  ] }), null, "桁区切りを含む妥当な整数データは受け入れる");

  assert.match(validate({ schemaVersion: 5, inventory: [
    { uid: "i1", itemId: "bandage", quantity: "12abc" }
  ] }), /inventory\[0\]\.quantity/, "不正な所持数量を黙って12個へ読み替えない");
  assert.match(validate({ schemaVersion: 5, inventory: [
    { uid: "i1", itemId: "bandage", quantity: 1.5 }
  ] }), /inventory\[0\]\.quantity/, "小数の所持数量を拒否する");
  assert.match(validate({ schemaVersion: 5, inventory: [
    { uid: "i1", itemId: "bandage", quantity: 1 },
    { uid: "i2", itemId: "bandage", quantity: 1 }
  ] }), /inventory\[1\] に重複 itemId/, "同じアイテムの重複行で最大所持数を迂回させない");
  assert.match(validate({ schemaVersion: 5, inventory: [
    { uid: "i1", quantity: 1 }
  ] }), /inventory\[0\]\.itemId/, "表示先のないアイテム行はインポート前に拒否する");
  assert.match(validate({ schemaVersion: 5, customItems: [
    { id: "c1", name: "用品", maxOwned: "5pcs" }
  ] }), /customItems\[0\]\.maxOwned/, "不正な所持上限も部分一致で解釈しない");
  assert.equal(validate({ schemaVersion: 5, inventory: [
    { uid: "i1", itemId: "bandage", quantity: "2" }
  ], customItems: [
    { id: "c1", name: "用品", maxOwned: "5" }
  ] }), null, "旧ファイル互換の整数文字列は受け入れる");
});

test("JSONインポートはレコード配列の不正要素を適用前に拒否する", () => {
  const groups = app.match(/const IMPORT_GROUPS = \[[\s\S]*?\n\];/)?.[0];
  const validateStart = app.indexOf("function validateImportData(data) {");
  const validateEnd = app.indexOf("\nfunction importStateFromFile", validateStart);
  assert.ok(groups, "カテゴリ定義が取得できる");
  assert.ok(validateStart >= 0 && validateEnd > validateStart, "インポート検証器が取得できる");
  const validator = app.slice(validateStart, validateEnd);
  const context = vm.createContext({});
  vm.runInContext(`${groups}\n${validator}\nglobalThis.validateImportData = validateImportData;`, context);
  const validate = context.validateImportData;

  assert.match(validate({ schemaVersion: 5, results: [null] }), /results\[0\]/);
  assert.match(validate({ schemaVersion: 5, entries: ["broken"] }), /entries\[0\]/);
  assert.match(validate({ schemaVersion: 5, personaSrc: { name: "Custom", skills: "broken" } }),
    /personaSrc\.skills は配列ではありません/);
  assert.match(validate({ schemaVersion: 5, personaSrc: {
    name: "Custom", skills: [{ rank: "スキル1", dice: "broken" }]
  } }), /personaSrc\.skills\[0\]\.dice は配列ではありません/);
  assert.match(validate({ schemaVersion: 5, roster: {
    personas: [{ uid: "p1", build: { skills: "broken" } }]
  } }), /roster\.personas\[0\]\.build\.skills は配列ではありません/);
  assert.match(validate({ schemaVersion: 5, roster: {
    personas: [{ uid: "p1", build: { skills: [{ rank: "スキル1", dice: "broken" }] } }]
  } }), /roster\.personas\[0\]\.build\.skills\[0\]\.dice は配列ではありません/);
  assert.match(validate({ schemaVersion: 5, draws: [{ batchHash: "broken" }] }), /draws\[0\]\.records/);
  assert.match(validate({ schemaVersion: 5, draws: [{ records: [] }] }), /draws\[0\] に batchHash または commit/);
  assert.equal(validate({ schemaVersion: 5, draws: [{ batchHash: "valid-hash", records: [] }] }), null,
    "有効な抽選証明は受け入れる");
  assert.match(validate({ schemaVersion: 5, draws: [{ batchHash: "valid-hash", records: [null] }] }),
    /draws\[0\]\.records\[0\]/, "抽選記録の内部要素も検証する");
  assert.match(validate({ schemaVersion: 5, results: [
    { id: "same", name: "A" }, { id: "same", name: "B" }
  ] }), /results\[1\] に重複ID/, "同じリザルトIDはインポート前に拒否する");
  assert.match(validate({ schemaVersion: 5, entries: [
    { id: "same", name: "A" }, { id: "same", name: "B" }
  ] }), /entries\[1\] に重複ID/, "同じ明細IDはインポート前に拒否する");
  assert.match(validate({ schemaVersion: 5, roster: { personas: [
    { uid: "p1", no: 1, mode: "n" }, { uid: "p2", no: 1, mode: "n" }
  ] } }), /roster\.personas\[1\] に重複人格/, "所持人格のNo重複を拒否する");
  assert.match(validate({ schemaVersion: 5, roster: { egos: [
    { uid: "e1", rank: "ZAYIN", no: 1 }, { uid: "e2", rank: "ZAYIN", no: 1 }
  ] } }), /roster\.egos\[1\] に重複E\.G\.O/, "所持E.G.Oのランク・No重複を拒否する");
  assert.match(validate({ schemaVersion: 5, roster: { supports: [
    { uid: "s1", name: "同名サポート" }, { uid: "s2", name: "同名サポート" }
  ] } }), /roster\.supports\[1\] に重複名称/, "同名サポートの重複所持を拒否する");
  assert.match(validate({ _lbtRosterOnly: true, roster: { personas: [null] } }), /roster\.personas\[0\]/);
  assert.equal(validate({ schemaVersion: 5, results: [], entries: [], draws: [], roster: {
    personas: [], egos: [], supports: [], spirits: []
  } }), null, "正常な空セーブは受け入れる");
});


test("リザルトの収入は0以上の安全な整数に限り、報酬入力後にまとめて確定する", () => {
  const addStart = sections.indexOf("const addResult = () =>");
  const addEnd = sections.indexOf("const applyGarasumadoImport", addStart);
  const addResult = sections.slice(addStart, addEnd);
  assert.ok(addStart >= 0 && addEnd > addStart, "新規リザルトの保存処理を見つける");
  assert.match(addResult, /parseNonNegativeInteger/);
  assert.match(addResult, /Number\.isSafeInteger\(parsed\)/);
  assert.match(addResult, /incomeLp === null \|\| incomeShards === null/);
  assert.match(addResult, /setNewResultError\(/);
  assert.match(sections, /"aria-invalid": newResultError\.startsWith\("獲得LP"\)/);
  assert.match(sections, /"aria-invalid": newResultError\.startsWith\("獲得欠片"\)/);
  const rewardItemsAt = sections.indexOf('aria-label: "報酬アイテム"', addStart);
  const commitAt = sections.indexOf("入力した内容をまとめて記録", addStart);
  assert.ok(rewardItemsAt > addStart && commitAt > rewardItemsAt, "報酬入力の後ろに確定操作を置く");
});

test("Buildの所持品検索は別名・効果を扱い、クイック検索から同じ検索欄へ到達する", () => {
  assert.match(sections, /className: "inv-pick-search"/);
  assert.match(sections, /item\.searchAliases/);
  assert.match(sections, /item\.effect/);
  assert.match(sections, /const searchTargetId = state\.ui\?\.itemSearchTarget\?\.id/);
  assert.match(app, /currentSection: "items-build", itemSearchTarget:/);
  assert.match(app, /DB\.specialItems/);
});
