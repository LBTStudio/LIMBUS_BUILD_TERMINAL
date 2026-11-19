import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../exports/リンバスTRPG_戦術スキル期待値ランキング.html", import.meta.url), "utf8");
const mainMatch = html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/);
assert.ok(mainMatch, "ranking tool main script exists");
const mainScript = mainMatch[1];

function embeddedJson(id) {
  const re = new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)<\\\\/script>');
  const match = html.match(re);
  assert.ok(match, "embedded JSON exists: " + id);
  return JSON.parse(match[1]);
}

function parseHelpers() {
  const start = mainScript.indexOf("const CONDITION_FILTER_IDS=");
  const end = mainScript.indexOf("function formatModifierReason", start);
  assert.ok(start >= 0 && end > start, "modifier parser source exists");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    mainScript.slice(start, end) + "\nglobalThis.__audit = { kindMods, conditionClasses };",
    context
  );
  return context.__audit;
}

function createToolHarness() {
  const defaults = {
    q: { type: "text", value: "" },
    source: { type: "select-one", value: "" },
    kind: { type: "select-one", value: "" },
    slot: { type: "select-one", value: "" },
    type: { type: "select-one", value: "" },
    sin: { type: "select-one", value: "" },
    sort: { type: "select-one", value: "selected" },
    includePassive: { type: "checkbox", checked: false },
    includeEffect: { type: "checkbox", checked: false },
    includeExtra: { type: "checkbox", checked: true },
    excludeCounter: { type: "checkbox", checked: false },
    excludeDefense: { type: "checkbox", checked: false },
    excludeNormal: { type: "checkbox", checked: false },
    includeConditional: { type: "checkbox", checked: false },
    condStatus: { type: "checkbox", checked: true },
    condResource: { type: "checkbox", checked: true },
    condStats: { type: "checkbox", checked: true },
    condTeam: { type: "checkbox", checked: true },
    condTrigger: { type: "checkbox", checked: true },
    condOther: { type: "checkbox", checked: true }
  };
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const value = defaults[id] || { type: "text", value: "", checked: false };
      elements.set(id, {
        id,
        type: value.type,
        value: value.value || "",
        checked: !!value.checked,
        textContent: "",
        innerHTML: "",
        disabled: false,
        nextElementSibling: { textContent: "" },
        classList: { toggle() {} },
        addEventListener() {},
        setAttribute() {}
      });
    }
    return elements.get(id);
  }
  const document = {
    getElementById(id) {
      if (id === "persona-data" || id === "appendix-data") {
        return { textContent: JSON.stringify(embeddedJson(id)) };
      }
      return element(id);
    },
    querySelector(selector) {
      if (selector === "#mSkills") return element("mSkills");
      return element(selector.replace(/^#/, ""));
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return { click() {} };
    }
  };
  const context = { document };
  vm.createContext(context);
  vm.runInContext(
    mainScript + "\nglobalThis.__tool = { records, selectedValue, conditionalBonus, dieMetric, render };",
    context,
    { timeout: 15000 }
  );
  return { tool: context.__tool, element };
}

test("conditional modifier parser recognizes conditional, scoped, and typed power", () => {
  const { kindMods } = parseHelpers();
  const dice = [
    { roll: "2d6", effect: "銃撃" },
    { roll: "2d8", effect: "斬撃" }
  ];
  const result = kindMods("自分の呼吸が7以上ならスキル威力+2", "斬撃", dice).reasons[0];
  assert.equal(result.value, 2);
  assert.equal(result.scope, "all");
  assert.equal(result.conditional, true);
  assert.ok(Array.from(result.conditionCategories).includes("resource"));
  assert.deepEqual(Array.from(result.targets), [0, 1]);

  const status = kindMods("対象の火傷が6以上なら最後のダイス威力+3", "斬撃", dice).reasons[0];
  assert.equal(status.value, 3);
  assert.equal(status.scope, "last");
  assert.deepEqual(Array.from(status.targets), [1]);
  assert.ok(Array.from(status.conditionCategories).includes("status"));

  const typed = kindMods("銃撃ダイス威力+2", "斬撃", dice).reasons[0];
  assert.equal(typed.value, 2);
  assert.equal(typed.scope, "matching");
  assert.deepEqual(Array.from(typed.targets), [0]);
});

test("first, last, all-dice and ranged power modifiers use correct dice scope", () => {
  const { kindMods } = parseHelpers();
  const dice = [{ roll: "2d6" }, { roll: "2d7" }, { roll: "2d8" }];
  const first = kindMods("最初のダイスのダイス威力+1~2", "斬撃", dice).reasons[0];
  const last = kindMods("最後のダイス威力+1～3", "斬撃", dice).reasons[0];
  const all = kindMods("全ダイス威力+0~1", "斬撃", dice).reasons[0];

  assert.equal(first.value, 2);
  assert.deepEqual(Array.from(first.targets), [0]);
  assert.equal(first.conditional, true);
  assert.equal(last.value, 3);
  assert.deepEqual(Array.from(last.targets), [2]);
  assert.equal(last.conditional, true);
  assert.equal(all.value, 1);
  assert.deepEqual(Array.from(all.targets), [0, 1, 2]);
  assert.equal(all.conditional, true);
});

test("uncapped per-unit formulas remain visible but are not assigned a fabricated value", () => {
  const { kindMods } = parseHelpers();
  const result = kindMods("自分の探求した知識-1だけスキル威力増加", "斬撃", [{ roll: "2d6" }]).reasons[0];
  assert.equal(result.conditional, true);
  assert.equal(result.unresolved, true);
  assert.equal(result.value, null);
});

test("target-side power penalties and match-power changes are not counted as own skill power", () => {
  const { kindMods } = parseHelpers();
  const dice = [{ roll: "2d6" }, { roll: "2d8" }];
  assert.equal(kindMods("対象のスキル威力-1", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("対象のダイス威力が1減少", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("マッチ開始時：対象のマッチ威力-2", "斬撃", dice).reasons.length, 0);
});

test("the embedded complete dataset loads and exposes conditional candidates", () => {
  const { tool } = createToolHarness();
  const records = Array.from(tool.records);
  const personas = new Set(records.map(row => row.persona.name));
  const conditional = records.reduce((sum, row) =>
    sum +
    (row.passCandidates || []).filter(item => item.conditional).length +
    (row.effectCandidates || []).filter(item => item.conditional).length, 0);
  const unresolved = records.reduce((sum, row) =>
    sum +
    (row.passCandidates || []).filter(item => item.unresolved).length +
    (row.effectCandidates || []).filter(item => item.unresolved).length, 0);

  assert.ok(records.length > 2300, "full ranking dataset should be loaded");
  assert.ok(personas.size > 350, "all Persona sources should be included");
  assert.ok(conditional > 1000, "conditional modifiers should not silently disappear");
  assert.ok(unresolved > 0, "unquantifiable formulas must remain explicitly unresolved");
  assert.ok(html.includes('data-sort="conditional"'), "conditional EV column is sortable");
  assert.ok(html.includes('id="includeConditional"'), "conditional EV master toggle exists");
});

test("conditional filters change selected EV, and breakdown columns do not double-count conditional EV", () => {
  const { tool, element } = createToolHarness();
  const row = Array.from(tool.records).find(item =>
    item.persona.name === "剣契殺手A" && item.skill.name === "剣軌"
  );
  assert.ok(row, "known conditional skill fixture exists");

  element("includePassive").checked = true;
  element("includeEffect").checked = true;
  element("includeConditional").checked = false;
  assert.equal(tool.selectedValue(row), 18);

  element("includeConditional").checked = true;
  assert.equal(tool.selectedValue(row), 20);
  assert.equal(tool.conditionalBonus(row), 2);

  const firstDie = tool.dieMetric(row, 0);
  assert.equal(firstDie.effect, row.dieRows[0].effect);
  assert.equal(firstDie.conditional, 1);
  assert.equal(firstDie.all, firstDie.base + firstDie.passive + firstDie.effect + firstDie.conditional);

  element("condResource").checked = false;
  assert.equal(tool.selectedValue(row), 18);
  assert.equal(tool.conditionalBonus(row), 0);
});

test("last-die-only conditional bonus is not spread to the other dice", () => {
  const { tool, element } = createToolHarness();
  const row = Array.from(tool.records).find(item =>
    item.persona.name === "メリアニア工房フィクサー" && item.skill.name === "危機一髪の爆破"
  );
  assert.ok(row, "last-die condition fixture exists");
  element("includeConditional").checked = true;
  element("condStats").checked = true;

  const values = row.dieRows.map((_, index) => tool.dieMetric(row, index).conditional);
  assert.equal(values[values.length - 1], 6);
  assert.ok(values.slice(0, -1).every(value => value === 0));
});

test("rendered ranking rows keep twelve cells after adding conditional EV", () => {
  const { tool, element } = createToolHarness();
  tool.render();
  const htmlRow = element("rows").innerHTML.match(/<tr>([\s\S]*?)<\/tr>/);
  assert.ok(htmlRow, "ranking row rendered");
  assert.equal((htmlRow[1].match(/<td\b/g) || []).length, 12);
});
