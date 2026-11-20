import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../exports/リンバスTRPG_戦術スキル期待値ランキング.html", import.meta.url), "utf8");
const mainMatch = html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/);
assert.ok(mainMatch, "ranking tool main script exists");
const mainScript = mainMatch[1];

function embeddedJson(id) {
  const re = new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>');
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
    condTargetStatus: { type: "checkbox", checked: true },
    condTargetType: { type: "checkbox", checked: true },
    targetConditionFilter: { type: "search", value: "" },
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

test("own match-power bonuses are detected while target-side and ally-side changes are excluded", () => {
  const { kindMods } = parseHelpers();
  const dice = [{ roll: "2d6" }, { roll: "2d8" }];
  assert.equal(kindMods("対象のスキル威力-1", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("対象のダイス威力が1減少", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("マッチ開始時：対象のマッチ威力-2", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("対象のマッチ威力+1", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("味方のマッチ威力+2", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("マッチ威力+2を味方に付与", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("味方全体にマッチ威力増加1を付与", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("後方の味方2名に次のRにマッチ威力増加1を付与", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("対象が味方ならマッチ威力が10増加しダメージ量が0に固定", "斬撃", dice).reasons.length, 0);
  assert.equal(kindMods("マッチ威力+2", "斬撃", dice).reasons.length, 0, "ownerless match power is ambiguous and must not be added");
  assert.equal(kindMods("マッチ進行時にマッチ威力+1", "斬撃", dice).reasons.length, 1);
  const duel = kindMods("決闘宣布を付与したキャラクターが付与されたキャラクターとマッチ進行時にマッチ威力+1、マッチ回数2ごとにマッチ威力+1（最大3）", "斬撃", dice).reasons;
  assert.deepEqual(Array.from(duel, item => item.value), [1, null], "the per-match cap is not an actual match-count measurement");
  assert.equal(duel[1].unresolved, true);

  const own = kindMods("自分のマッチ威力+1", "斬撃", dice).reasons[0];
  assert.equal(own.value, 1);
  assert.equal(own.scope, "all");
  assert.equal(own.conditional, false);

  const conditional = kindMods("対象が火傷状態ならマッチ威力+1", "斬撃", dice).reasons[0];
  assert.equal(conditional.value, 1);
  assert.equal(conditional.conditional, true);

  const dynamic = kindMods("対象の振動6ごとにマッチ威力増加（最大3）", "斬撃", dice).reasons[0];
  assert.equal(dynamic.value, null, "the target vibration count is not known from the skill text");
  assert.equal(dynamic.conditional, true);
  assert.equal(dynamic.unresolved, true);
  assert.equal(kindMods("自分の充電が10以上ならマッチ威力が10増加する", "斬撃", dice).reasons.length, 0, "resource conditions are not evaluated for match power");
  const suffix = kindMods("数値が5ならマッチ威力増加1", "斬撃", dice).reasons[0];
  assert.equal(suffix.value, 1);
  assert.equal(suffix.conditional, true);
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
  assert.equal(tool.selectedValue(row), 18, "呼吸の持続・減衰を確定できないため、閾値補正を加算しない");
  assert.equal(tool.conditionalBonus(row), 0);
  const breathThreshold=row.effectCandidates.find(item=>item.resourceName==="呼吸");
  assert.ok(breathThreshold,"呼吸の閾値補正は候補として残る");
  assert.equal(breathThreshold.value,null);
  assert.equal(breathThreshold.unresolved,true);
  assert.equal(breathThreshold.resourceSupply.total,2,"本人が当該スキル使用時に得る呼吸2は把握できるが、前ラウンド分は未確定");

  const firstDie = tool.dieMetric(row, 0);
  assert.equal(firstDie.effect, row.dieRows[0].effect);
  assert.equal(firstDie.conditional, 0, "未確定の呼吸閾値はダイスEVへ加算しない");
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
  assert.equal(values[values.length - 1], 0, "the max HP-loss cap is not a measured HP-loss amount");
  assert.ok(values.every(value => value === 0));
  const candidate = row.effectCandidates.find(item => item.resourceScaling && item.targets.includes(row.dieRows.length - 1));
  assert.ok(candidate, "the last-die HP-loss scaling remains visible as a candidate");
  assert.equal(candidate.value, null);
  assert.equal(candidate.unresolved, true);
});

test("R社第4群の別人格を分離し、正しいサイチーム長へ条件補正を帰属する", () => {
  const { tool, element } = createToolHarness();
  const rows = Array.from(tool.records);
  const ceres = rows.filter(item => item.persona.name === "R社第4群トナカイチーム ケレス");
  const sais = rows.find(item =>
    item.persona.name === "R社第4群サイチーム隊長 サンジェルマン" && item.skill.name === "大地強打"
  );
  assert.equal(ceres.length, 5, "Ceres keeps only its five source-page skills");
  assert.ok(!ceres.some(item => item.skill.name === "大地強打"), "the Sais-team leader's skill is not attributed to Ceres");
  assert.ok(sais, "the sixth skill belongs to the Sais-team leader");
  assert.equal(sais.base, 23.5, "40-3d10 baseline EV");
  assert.ok(sais.effectCandidates.some(item => item.label === "スキル威力" && item.value === 5 && item.conditional));
  assert.ok(!sais.passCandidates.some(item => item.label === "マッチ威力"), "charge-conditioned match-power passive is outside match-power scope");

  element("includePassive").checked = true;
  element("includeEffect").checked = true;
  element("includeConditional").checked = true;
  element("condResource").checked = true;
  element("condTrigger").checked = true;
  assert.equal(tool.selectedValue(sais), 28.5, "resource-conditioned match-power +1 is not added");

  assert.match(sais.persona.passives, /我らは前しか見えぬ/);
  assert.match(sais.persona.passives, /進め、進め、踏み砕け/);
  assert.doesNotMatch(ceres[0].persona.passives, /我らは前しか見えぬ|進め、進め、踏み砕け/);

  const flor = rows.find(item => item.persona.name === "笑う顔たち フロル").persona;
  const norman = rows.find(item => item.persona.name === "南部ツヴァイ協会4課部長 ノーマン").persona;
  assert.equal(flor.skills.length, 5);
  assert.equal(flor.unique.length, 0, "Norman's passives are not OCR-recovered onto Flore");
  assert.ok(!flor.skills.find(skill => skill.name === "感覚喪失").dice.some(die => /盾はお前|ノム|速度 4d2/.test(die.effect || "")));
  assert.deepEqual(Array.from(norman.skills, skill => skill.name), ["ヴァカめ", "自分を守るために", "牽制", "囲えノム", "逆襲ノム！！"]);
  assert.match(norman.passives, /俺が上で、お前が下ノム/);
  assert.ok(norman.unique.some(item => item.name === "あなたの盾"));
});

test("別冊の全プロフィールを原本ページ単位に分け、欠落カードを補完する", () => {
  const appendix = embeddedJson("appendix-data");
  assert.equal(appendix.length, 278);
  assert.equal(appendix.filter(persona => persona.source_profile_verified).length, 101);

  const byName = new Map(appendix.map(persona => [persona.name, persona]));
  const cherik = byName.get("バラのスパナ工房代表 チェリク");
  const spino = byName.get("バラのスパナ工房フィクサー スピノ");
  const benisakura = byName.get("バラのスパナ工房フィクサー ベニサクラ");
  assert.deepEqual(cherik.pages, [150, 151]);
  assert.deepEqual(spino.pages, [152, 153]);
  assert.deepEqual(benisakura.pages, [154, 155]);
  assert.deepEqual(spino.skills.map(skill => skill.name), [
    "残業代計算", "仕事を終えたら朝になってる", "今時間ねぇんだよ", "急ごしらえの魔改造スパナ", "超振動スパナ[遅延回路]"
  ]);
  assert.equal(byName.get("南部ツヴァイ協会4課部長 ノーマン").skills.length, 5);

  for (const persona of appendix.filter(item => item.source_profile_verified)) {
    assert.ok(persona.passives?.trim(), persona.name + " has source-verified passives");
    for (const skill of persona.skills) {
      assert.ok(skill.dice.length > 0, persona.name + "/" + skill.name + " has dice");
      for (const die of skill.dice) {
        assert.ok(persona.pages.includes(die.page), persona.name + "/" + skill.name + " contains a die outside its source pages");
      }
    }
  }
});

test("appendix OCR passive blocks are detached from their source dice across the dataset", () => {
  const { tool } = createToolHarness();
  const personas = new Set(Array.from(tool.records, row => row.persona));
  const appendix = Array.from(personas).filter(persona => persona.source === "別冊");
  const contaminated = appendix.flatMap(persona =>
    (persona.skills || []).flatMap(skill =>
      (skill.dice || []).filter(die => /\n速度\s+\d+d\d+[\s\S]*名称[\s\S]*発動条件/.test(die.effect || ""))
    )
  );
  assert.equal(contaminated.length, 0, "OCR passive sections must not remain attached to individual dice");
});

test("rendered ranking rows keep twelve cells after adding conditional EV", () => {
  const { tool, element } = createToolHarness();
  tool.render();
  const htmlRow = element("rows").innerHTML.match(/<tr>([\s\S]*?)<\/tr>/);
  assert.ok(htmlRow, "ranking row rendered");
  assert.equal((htmlRow[1].match(/<td\b/g) || []).length, 12);
});

test("メリアニア工房代表スピノのマッチ敗北時-15は今回EVに加算しない", () => {
  const { tool, element } = createToolHarness();
  element("includeConditional").checked = true;
  const rows = Array.from(tool.records).filter(row =>
    row.persona.name === "メリアニア工房代表 スピノ" &&
    ["支援", "万歳突撃"].includes(row.skill.name)
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const penalty = row.effectCandidates.find(item => /スキル威力-15/.test(item.source || ""));
    assert.ok(penalty, row.skill.name + " の負の補正を検出する");
    assert.equal(penalty.value, -15);
    assert.equal(penalty.afterResolution, true);
    assert.equal(penalty.conditional, true);
    assert.equal(tool.conditionalBonus(row, "all", "effect"), 0,
      "敗北後の威力減少を現在の攻撃EVへ含めない");
  }
});

test("エドガー家継承者クロムの回数依存ペナルティは未確定の候補として残す", () => {
  const { tool } = createToolHarness();
  const row = Array.from(tool.records).find(item =>
    item.persona.name === "エドガー家継承者 クロム" &&
    item.skill.name === "今こそ運命の刻だ"
  );
  assert.ok(row);
  const penalty = row.effectCandidates.find(item => item.label === "数値未確定の威力減少");
  assert.ok(penalty, "動的な負の威力補正を補正内訳に表示する");
  assert.equal(penalty.value, null);
  assert.equal(penalty.unresolved, true);
  assert.equal(penalty.conditional, true);
});
