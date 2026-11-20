import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../exports/リンバスTRPG_戦術スキル期待値ランキング.html", import.meta.url), "utf8");
const scriptMarker = '<script>\n"use strict";';
const scriptStart = html.indexOf(scriptMarker);
assert.notEqual(scriptStart, -1, "ランキングHTMLのメインスクリプトが見つかる");
const scriptBodyStart = scriptStart + "<script>\n".length;
const scriptEnd = html.indexOf("</script>", scriptBodyStart);
const script = html.slice(scriptBodyStart, scriptEnd);

function sourceBetween(startMarker, endMarker) {
  const start = script.indexOf(startMarker);
  const end = script.indexOf(endMarker, start);
  assert.notEqual(start, -1, `スクリプト内に ${startMarker} が存在する`);
  assert.notEqual(end, -1, `スクリプト内に ${endMarker} が存在する`);
  return script.slice(start, end);
}

function loadHelpers() {
  const controls = Object.fromEntries(
    ["includeConditional", "includePassive", "includeEffect", "condStatus", "condResource", "condStats", "condTeam", "condTargetStatus", "condTargetStats", "condTargetType", "condTargetAffiliation", "targetConditionFilter", "resourceSupportPassiveNames", "condTrigger", "condOther"]
      .map((id) => [id, { checked: true, value: "" }])
  );
  controls.includePassive.checked = false;
  controls.includeEffect.checked = false;
  const context = { $: (id) => controls[id] ?? { checked: false }, EMBEDDED_DB: { support_passives: [] } };
  vm.createContext(context);
  vm.runInContext(sourceBetween("const CONDITION_FILTER_IDS=", "function formatModifierReason"), context);
  vm.runInContext(sourceBetween("function formatModifierReason", "function passiveBonus"), context);
  vm.runInContext(sourceBetween("function passiveBonus", "function deferredSkillBonus"), context);
  vm.runInContext(sourceBetween("function targetConditionMatches", "function selectedValue"), context);
  vm.runInContext(sourceBetween("function affiliationFromName", "function addAppendix"), context);
  vm.runInContext(sourceBetween("function normalizeDbPersona", "function addPersona"), context);
  vm.runInContext(`
    globalThis.api = { kindMods, uniqueEffectText, formatModifierReason, conditionClasses, targetConditionDetails, targetConditionMatches, resourceScalingDetails, affiliationFromName, normalizeDbPersona, resourceSupplyFor, passiveBonus, skillBonus, conditionalPerDie, conditionalBonus };
  `, context);
  return { api: context.api, controls, context };
}

test("無条件・呼吸条件・最大値付き条件を区別して数値化する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const plain = api.kindMods("スキル威力+1", "斬撃", dice).reasons;
  const conditional = api.kindMods("自分の呼吸が7以上ならスキル威力+2", "斬撃", dice).reasons;
  const capped = api.kindMods("呼吸5ごとにスキル威力+1（最大2）", "斬撃", dice).reasons;

  assert.equal(plain.length, 1);
  assert.equal(plain[0].value, 1);
  assert.equal(plain[0].conditional, false);
  assert.equal(conditional.length, 1);
  assert.equal(conditional[0].value, 2);
  assert.equal(conditional[0].conditional, true);
  assert.deepEqual(Array.from(conditional[0].conditionCategories), ["resource"]);
  assert.equal(capped[0].value, null, "最大値は資源を実際に獲得できる量を証明しない");
  assert.equal(capped[0].unresolved, true);
  assert.equal(capped[0].resourceScaling, true);
  assert.equal(capped[0].conditional, true);
});

test("最初・最後・銃撃ダイスの適用範囲を個別に識別する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "銃撃" }, { effect: "斬撃" }, { effect: "銃撃" }];
  const first = api.kindMods("最初のダイス威力+3", "斬撃", dice).reasons[0];
  const last = api.kindMods("マッチ開始時：最後のダイス威力+1", "斬撃", dice).reasons[0];
  const bullet = api.kindMods("銃撃ダイス威力+2", "斬撃", dice).reasons[0];

  assert.equal(first.scope, "first");
  assert.deepEqual(Array.from(first.targets), [0]);
  assert.equal(last.scope, "last");
  assert.deepEqual(Array.from(last.targets), [2]);
  assert.equal(last.conditional, true);
  assert.equal(bullet.scope, "matching");
  assert.deepEqual(Array.from(bullet.targets), [0, 2]);
});

test("対象側の威力低下・マッチ威力・ダメージ量は攻撃側の威力補正に混入しない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }];
  for (const text of ["対象のダイス威力が1減少", "対象のスキル威力-1", "マッチ威力+2", "ダメージ量+3"]) {
    assert.equal(api.kindMods(text, "斬撃", dice).reasons.length, 0, text);
  }
});

test("句点を越えて別の条件を引き継がない", () => {
  const { api } = loadHelpers();
  const reasons = api.kindMods("自分の呼吸が7以上ならスキル威力+2。スキル威力+1", "斬撃", [{ effect: "" }]).reasons;
  assert.equal(reasons.length, 2);
  assert.equal(reasons[0].conditional, true);
  assert.equal(reasons[1].conditional, false);
});

test("数値を確定できない可変量は候補として残し、加算値を捏造しない", () => {
  const { api } = loadHelpers();
  const result = api.kindMods("自分の探求した知識-1だけスキル威力増加", "斬撃", [{ effect: "" }]).reasons[0];
  assert.equal(result.conditional, true);
  assert.equal(result.unresolved, true);
  assert.equal(result.value, null);
});

test("別人格カードが連結された固有バフ説明は人格境界で切り落とす", () => {
  const { api } = loadHelpers();
  const cleaned = api.uniqueEffectText({
    name: "探求した知識",
    desc: "ディエーチ協会フィクサーの特定スキル威力上昇\n「南部ディエーチ協会5課フィクサー シオンの\n人\n格」\n探求した知識の数だけ攻撃スキル威力増加（最低1、最大3）"
  });
  assert.match(cleaned, /探求した知識/);
  assert.doesNotMatch(cleaned, /攻撃スキル威力増加/);
  assert.doesNotMatch(cleaned, /シオン/);
});

test("条件フィルター・補正元チェック・全体ON/OFFで加算値が一貫する", () => {
  const { api, controls } = loadHelpers();
  const row = {
    dieRows: [{}, {}],
    passCandidates: [],
    effectCandidates: [{
      conditional: true, unresolved: false, value: 2, targets: [0, 1], conditionCategories: ["resource"]
    }]
  };

  assert.equal(api.conditionalBonus(row, "selected", "effect"), 0, "スキル効果の選択がOFFなら選択EVに加算しない");
  assert.equal(api.conditionalBonus(row, "all", "effect"), 4, "内訳欄は選択EVの補正元チェックに依存しない");
  assert.equal(api.conditionalBonus(row, "potential", "effect"), 4, "候補EVは補正元チェック・全体ON/OFFに依存しない");
  controls.includeEffect.checked = true;
  assert.equal(api.conditionalBonus(row, "selected", "effect"), 4);
  controls.condResource.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 0, "該当カテゴリをOFFにすると候補・加算から除外");
  controls.condResource.checked = true;
  controls.includeConditional.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 0, "条件補正全体OFFでは加算しない");
  assert.equal(api.conditionalBonus(row, "potential", "effect"), 4, "候補値は全体OFFでも確認できる");
});


test("改行で分かれた段階補正を別々に数え、後続のダメージ量条件を混ぜない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const staged = api.kindMods(
    "1以上：スキル威力+1\n4以上：スキル威力+1\n5以上：スキル威力+1",
    "斬撃",
    dice
  ).reasons;
  assert.deepEqual(Array.from(staged, item => item.value), [1, 1, 1]);
  assert.ok(staged.every(item => item.conditional));

  const adjacent = api.kindMods(
    "生体材料が10以上ならスキル威力+2\n消費した生体材料2ごとにダメージ量+1（最大8）",
    "斬撃",
    dice
  ).reasons;
  assert.equal(adjacent.length, 1, "damage-amount scaling must not make the fixed skill-power bonus unresolved");
  assert.equal(adjacent[0].value, 2);
  assert.equal(adjacent[0].conditional, true);
});

test("人格名・状態・速度差を条件にしたマッチ威力補正を拾う", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const examples = [
    ["対象の出血4ごとにマッチ威力+1（最大3）", null],
    ["対象の振動の数だけマッチ威力増加（最大3）", null],
    ["対象の火傷が8以上ならマッチ威力+2", 2],
    ["自分の速度差2ごとにマッチ威力+1（最大3）", null],
    ["対象の沈潜数だけマッチ威力+1（最大2）", null],
    ["対象が5種類以上のデバフを保有するならマッチ威力+1", 1]
  ];
  for (const [source, expected] of examples) {
    const result = api.kindMods(source, "斬撃", dice).reasons;
    assert.equal(result.length, 1, source);
    assert.equal(result[0].value, expected, source);
    assert.equal(result[0].conditional, true, source);
    if(expected===null)assert.equal(result[0].unresolved,true,source);
  }
});


test("対象状態と対象種別・所属を分離して抽出し、個別フィルターに連動する", () => {
  const { api, controls } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const source = "使用時：対象にN社の釘があれば、スキル威力+1。対象が機械融和生命体ならばさらにスキル威力+3";
  const parsed = api.kindMods(source, "貫通", dice).reasons;
  assert.equal(parsed.length, 2);
  assert.deepEqual(Array.from(parsed[0].targetConditions, x => [x.kind, x.value]), [["targetStatus", "N社の釘"]]);
  assert.deepEqual(Array.from(parsed[1].targetConditions, x => [x.kind, x.value]), [["targetType", "機械融和生命体"]]);
  assert.ok(parsed[0].conditionCategories.includes("targetStatus"));
  assert.ok(parsed[1].conditionCategories.includes("targetType"));
  const row = { dieRows: [{}, {}], passCandidates: [], effectCandidates: parsed };
  assert.equal(api.conditionalBonus(row, "all", "effect"), 8);
  controls.condTargetStatus.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 6);
  controls.condTargetStatus.checked = true;
  controls.condTargetType.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 2);
});

test("対象条件の種類を任意の明示名で抽出し、対象条件なしと混同しない", () => {
  const { api } = loadHelpers();
  const found = api.targetConditionDetails("対象が牙狩の血鬼ならばスキル威力+2");
  assert.deepEqual(Array.from(found, x => [x.kind, x.value]), [["targetType", "牙狩の血鬼"]]);
  const commandTarget = api.targetConditionDetails("対象が指令対象ならスキル威力+2");
  assert.equal(commandTarget.length, 1);
  assert.equal(commandTarget[0].kind, "targetStatus");
  assert.equal(commandTarget[0].value, "指令対象");
  assert.deepEqual(Array.from(api.targetConditionDetails("自分の呼吸が7以上ならスキル威力+2")), []);
});

test("資源の数・段階ごとに増える補正は上限値だけで実効値を確定しない", () => {
  const { api } = loadHelpers();
  for (const source of [
    "自分の狂信2ごとにスキル威力+1（最大10）",
    "呼吸5ごとにスキル威力+1（最大2）",
    "対象のN社の釘1ごとにスキル威力+1（最大3）"
  ]) {
    const reason = api.kindMods(source, "斬撃", [{ effect: "" }]).reasons[0];
    assert.equal(reason.value, null, source);
    assert.equal(reason.unresolved, true, source);
  }
});


test("対象条件テキストフィルターは選択した対象だけを期待値へ反映する", () => {
  const { api, controls } = loadHelpers();
  const parsed = api.kindMods("対象にN社の釘があればスキル威力+1。対象が機械融和生命体ならスキル威力+3", "貫通", [{ effect: "" }]).reasons;
  const row = { dieRows: [{}], passCandidates: [], effectCandidates: parsed };
  assert.equal(api.conditionalBonus(row, "all", "effect"), 4);
  controls.targetConditionFilter.value = "機械融和生命体";
  assert.equal(api.conditionalBonus(row, "all", "effect"), 3);
  controls.targetConditionFilter.value = "N社の釘";
  assert.equal(api.conditionalBonus(row, "all", "effect"), 1);
  controls.targetConditionFilter.value = "牙狩の血鬼";
  assert.equal(api.conditionalBonus(row, "all", "effect"), 0);
  const blood = api.kindMods("対象が血鬼または血袋ならスキル威力+2", "斬撃", [{ effect: "" }]).reasons;
  const bloodRow = { dieRows: [{}], passCandidates: [], effectCandidates: blood };
  controls.targetConditionFilter.value = "";
  assert.equal(api.conditionalBonus(bloodRow, "all", "effect"), 2);
  controls.targetConditionFilter.value = "牙狩の血鬼";
  assert.equal(api.conditionalBonus(bloodRow, "all", "effect"), 2, "血鬼または血袋は牙狩の血鬼検索にも一致する");
});


test("対象が状態異常を保有する条件は対象種別ではなく対象状態に分類する", () => {
  const { api } = loadHelpers();
  const status = api.targetConditionDetails("対象が出血状態ならスキル威力+1");
  const type = api.targetConditionDetails("対象が機械融和生命体ならスキル威力+3");
  assert.equal(status[0].kind, "targetStatus");
  assert.equal(type[0].kind, "targetType");
});

test("対象状態・対象数値の段階比例条件も個別フィルターへ分類する", () => {
  const { api } = loadHelpers();
  const statusText = "使用時：対象の火傷と振動の合計が7ごとにスキル威力+1（最大2）";
  const status = api.targetConditionDetails(statusText);
  assert.deepEqual(Array.from(status, x => [x.kind, x.value]), [["targetStatus", "火傷と振動の合計"]]);
  const statusModifier = api.kindMods(statusText, "斬撃", [{ effect: "" }]).reasons[0];
  assert.ok(statusModifier.conditionCategories.includes("targetStatus"));
  assert.deepEqual(Array.from(statusModifier.targetConditions, x => [x.kind, x.value]), [["targetStatus", "火傷と振動の合計"]]);

  const debuffText = "メインターゲットのデバフの種類2ごとにスキル威力+1";
  const debuffs = api.targetConditionDetails(debuffText);
  assert.deepEqual(Array.from(debuffs, x => [x.kind, x.value]), [["targetStatus", "デバフの種類"]]);

  const speedText = "対象との速度差2ごとにスキル威力+1";
  const speed = api.targetConditionDetails(speedText);
  assert.deepEqual(Array.from(speed, x => [x.kind, x.value]), [["targetStat", "速度差"]]);
  const speedModifier = api.kindMods(speedText, "斬撃", [{ effect: "" }]).reasons[0];
  assert.ok(speedModifier.conditionCategories.includes("targetStat"));

  const hp = api.targetConditionDetails("対象の失ったHP10ごとにダメージ量+1");
  assert.deepEqual(Array.from(hp, x => [x.kind, x.value]), [["targetStat", "失ったHP"]]);

  const namedStatus = api.targetConditionDetails("対象の紅梅が10ならスキル威力+1");
  assert.deepEqual(Array.from(namedStatus, x => [x.kind, x.value]), [["targetStatus", "紅梅"]]);

  const mixed = api.targetConditionDetails("対象が束縛状態かつ速度が1ならばスキル威力+6");
  assert.ok(mixed.some(x => x.kind === "targetStat" && x.value === "速度"));
  assert.ok(mixed.some(x => x.kind === "targetStatus" && /束縛状態/.test(x.value)));

  const relativeSpeed = api.targetConditionDetails("自分の速度が対象の速度より高ければスキル威力+2");
  assert.ok(relativeSpeed.some(x => x.kind === "targetStat" && x.value === "速度"));

  const targetDebuffs = api.targetConditionDetails("メインターゲットに付与されたデバフの種類1つごとにスキル威力+1");
  assert.ok(targetDebuffs.some(x => x.kind === "targetStatus" && x.value === "デバフの種類"));

  const matchCount = api.targetConditionDetails("対象とのマッチ回数2ごとにマッチ威力+2");
  assert.ok(matchCount.some(x => x.kind === "targetStat" && x.value === "マッチ回数"));
});


test("人格・別冊・パッシブ全データを走査し、上限値だけの資源補正を加算しない", () => {
  const { api } = loadHelpers();
  const embedded = (id) => {
    const open = '<script id="' + id + '" type="application/json">';
    const start = html.indexOf(open);
    assert.notEqual(start, -1, "embedded JSON exists: " + id);
    const contentStart = start + open.length;
    const end = html.indexOf("</script>", contentStart);
    assert.notEqual(end, -1, "embedded JSON closes: " + id);
    return JSON.parse(html.slice(contentStart, end));
  };
  const db = embedded("persona-data");
  const appendix = embedded("appendix-data");
  const personas = [...(db.normal_personas || []), ...(db.tokui_personas || []), ...appendix];
  let scannedSkills = 0;
  let resourceScalingCandidates = 0;
  const targetTypes = new Set();
  const targetStatuses = new Set();
  for (const persona of personas) {
    for (const skill of persona.skills || []) {
      scannedSkills++;
      const fields = [skill.effect || "", ...(skill.dice || []).map(die => die.effect || "")];
      for (const source of fields) {
        for (const item of api.kindMods(source, skill.type || "", skill.dice || []).reasons) {
          if (item.resourceScaling) {
            resourceScalingCandidates++;
            assert.equal(item.value, null, persona.name + " / " + (skill.name || skill.rank));
            assert.equal(item.unresolved, true, persona.name + " / " + (skill.name || skill.rank));
          }
          if ((item.targetConditions || []).length) assert.equal(item.conditional, true, persona.name + " / " + (skill.name || skill.rank));
          for (const target of item.targetConditions || []) {
            if (target.kind === "targetType") targetTypes.add(target.value);
            if (target.kind === "targetStatus") targetStatuses.add(target.value);
          }
        }
      }
    }
    for (const source of [persona.passive_effect, persona.passive_always, persona.passives]) {
      if (typeof source !== "string" || !source) continue;
      for (const item of api.kindMods(source, "攻撃", []).reasons) {
        if (item.resourceScaling) {
          resourceScalingCandidates++;
          assert.equal(item.value, null, persona.name + " / passive");
          assert.equal(item.unresolved, true, persona.name + " / passive");
        }
      }
    }
    for (const unique of persona.unique_buffs || persona.unique || []) {
      const source = [unique.name, unique.desc, unique.effect].filter(Boolean).join(" ");
      for (const item of api.kindMods(source, "攻撃", []).reasons) {
        if (item.resourceScaling) {
          resourceScalingCandidates++;
          assert.equal(item.value, null, persona.name + " / " + unique.name);
          assert.equal(item.unresolved, true, persona.name + " / " + unique.name);
        }
      }
    }
  }
  assert.ok(scannedSkills > 2000, "main and appendix skill records are included");
  assert.ok(resourceScalingCandidates > 400, "resource/stack-scaled modifiers were audited");
  assert.ok(targetTypes.has("機械融和生命体"));
  assert.ok([...targetTypes].some(value => value.includes("血鬼")));
  assert.ok(targetStatuses.has("N社の釘"));
  const support = db.support_passives || [];
  assert.ok(support.some(item => item.name === "釘と金槌"));
  assert.ok(support.some(item => item.name === "処断の歓喜"));
});


test("マッチ威力は資源比例補正と共鳴補正を計算対象にしない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  for (const source of [
    "自分の呼吸2ごとにマッチ威力+1（最大3）",
    "自分の充電5ごとにマッチ威力+1（最大2）",
    "自分の充電が10以上ならマッチ威力+1",
    "嫉妬共鳴3以上ならマッチ威力+2",
    "嫉妬共鳴数だけマッチ威力増加（最大3）"
  ]) {
    assert.equal(api.kindMods(source, "斬撃", dice, { passive_effect: "R開始時、自分に呼吸10を得る" }).reasons.length, 0, source);
  }
  const statusBased = api.kindMods("対象の火傷が8以上ならマッチ威力+2", "斬撃", dice).reasons;
  assert.equal(statusBased.length, 1, "ordinary target-state conditions remain supported");
  assert.equal(statusBased[0].value, 2);
  const targetDebuffCount = api.kindMods("対象が5種類以上のデバフを保有するならマッチ威力+1", "斬撃", dice).reasons[0];
  assert.ok(targetDebuffCount.conditionCategories.includes("targetStatus"));
  assert.ok(!targetDebuffCount.conditionCategories.includes("resource"), "generic target-state possession is not a resource condition");
  const affiliationBased = api.kindMods("対象がN社所属ならマッチ威力+1", "斬撃", dice).reasons;
  assert.equal(affiliationBased.length, 1, "attack-target affiliation conditions remain supported");
  assert.equal(affiliationBased[0].value, 1);
});

test("メインターゲットと攻撃対象の所属条件を対象所属として分類する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const cases = [
    "メインターゲットがN社所属ならスキル威力+2",
    "メインターゲットの所属がN社ならスキル威力+2",
    "攻撃対象がN社所属ならスキル威力+2",
    "攻撃対象の所属がN社ならスキル威力+2"
  ];

  for (const effect of cases) {
    const reason = api.kindMods(effect, "斬撃", dice, { affiliation: "W社" }).reasons[0];
    assert.ok(reason, effect);
    assert.deepEqual(Array.from(reason.targetConditions, item => [item.kind, item.value]), [["targetAffiliation", effect.includes("の所属が") ? "N社" : "N社所属"]]);
    assert.ok(reason.conditionCategories.includes("targetAffiliation"), effect);
    assert.ok(!reason.conditionCategories.includes("team"), effect);
    assert.equal(reason.excludedRecipient, false, effect);
  }
});

test("サブターゲットの所属・存在条件を対象条件として分類する", () => {
  const { api } = loadHelpers();
  const affiliation = api.kindMods("サブターゲットがN社所属ならスキル威力+2", "斬撃", [{ effect: "" }]).reasons[0];
  assert.ok(affiliation);
  assert.deepEqual(Array.from(affiliation.targetConditions, item => [item.kind, item.value]), [["targetAffiliation", "N社所属"]]);
  assert.ok(affiliation.conditionCategories.includes("targetAffiliation"));
  assert.ok(!affiliation.conditionCategories.includes("team"));

  const absent = api.targetConditionDetails("サブターゲットがいないならスキル威力+1");
  assert.deepEqual(Array.from(absent, item => [item.kind, item.value]), [["targetStatus", "いない"]]);
});

test("攻撃対象の所属条件と、所属を受け手にするバフを別扱いにする", () => {
  const { api, controls } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const target = api.kindMods("対象がN社所属ならスキル威力+2", "斬撃", dice, { affiliation: "W社" }).reasons[0];
  assert.equal(target.conditional, true);
  assert.deepEqual(Array.from(target.targetConditions, item => [item.kind, item.value]), [["targetAffiliation", "N社所属"]]);
  assert.ok(target.conditionCategories.includes("targetAffiliation"));
  assert.equal(api.conditionalBonus({ dieRows: [{}, {}], passCandidates: [], effectCandidates: [target] }, "all", "effect"), 4);
  controls.condTargetAffiliation.checked = false;
  assert.equal(api.conditionalBonus({ dieRows: [{}, {}], passCandidates: [], effectCandidates: [target] }, "all", "effect"), 0);

  assert.equal(api.affiliationFromName("南部リウ協会5課フィクサー アニス"), "南部リウ協会");
  assert.equal(api.affiliationFromName("薬指点描派 スチューデントB"), "薬指点描派");
  assert.equal(api.affiliationFromName("の終止符事務所"), "終止符事務所");
  assert.equal(api.affiliationFromName("バラのスパナ工房"), "バラのスパナ工房", "organization-internal の must be preserved");
  const endMarkerText = "舞台開始時、最初のRの終止符事務所所属の味方のスキル威力+1";
  const endMarkerPersona = { affiliation: "終止符事務所" };
  const endMarkerReason = api.kindMods(endMarkerText, "斬撃", dice, endMarkerPersona).reasons[0];
  assert.equal(endMarkerReason.recipientScope, "affiliation");
  assert.equal(endMarkerReason.recipientAffiliation, "終止符事務所");
  assert.equal(endMarkerReason.excludedRecipient, false);
  assert.equal(endMarkerReason.conditional, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect: endMarkerText, dice }, endMarkerPersona).bonus, 2);

  const nCorp = { name: "N社人格", affiliation: "N社" };
  const wCorp = { name: "W社人格", affiliation: "W社" };
  const buffText = "N社所属の味方にスキル威力+2を付与";
  const nBuff = api.kindMods(buffText, "斬撃", dice, nCorp).reasons[0];
  const wBuff = api.kindMods(buffText, "斬撃", dice, wCorp).reasons[0];
  assert.equal(nBuff.recipientScope, "affiliation");
  assert.equal(nBuff.excludedRecipient, false);
  assert.equal(nBuff.conditional, false, "recipient affiliation is resolved against the evaluated identity, not treated as target affiliation");
  assert.equal(api.skillBonus({ type: "斬撃", effect: buffText, dice }, nCorp).bonus, 4);
  assert.equal(wBuff.excludedRecipient, true);
  assert.equal(api.skillBonus({ type: "斬撃", effect: buffText, dice }, wCorp).bonus, 0);
  const reverseBuff = "スキル威力+2をN社所属の味方に付与";
  assert.equal(api.skillBonus({ type: "斬撃", effect: reverseBuff, dice }, nCorp).bonus, 4);
  assert.equal(api.skillBonus({ type: "斬撃", effect: reverseBuff, dice }, wCorp).bonus, 0);
  const genericReverseBuff = "スキル威力+2を味方に付与";
  assert.equal(api.skillBonus({ type: "斬撃", effect: genericReverseBuff, dice }, nCorp).bonus, 0);
  const passiveRecipient = api.passiveBonus({ ...nCorp, unique: [{ name: "所属支援", desc: buffText }] }, { type: "斬撃", dice });
  assert.equal(passiveRecipient.bonus, 4);
  assert.equal(passiveRecipient.candidates[0].conditional, false, "matching affiliation buffs remain ordinary modifiers even in unique-buff sources");

  const allyBuff = "味方全体にスキル威力+2を付与";
  const excluded = api.kindMods(allyBuff, "斬撃", dice, nCorp).reasons[0];
  assert.equal(excluded.excludedRecipient, false, "自分を除外しない味方全体への付与は本人にも適用する");
  assert.equal(excluded.recipientScope, "self");
  assert.equal(api.skillBonus({ type: "斬撃", effect: allyBuff, dice }, nCorp).bonus, 4);

  const selfBuff = "自分にスキル威力+2";
  assert.equal(api.skillBonus({ type: "斬撃", effect: selfBuff, dice }, wCorp).bonus, 4);

  const targetStatus = api.kindMods("対象の振動6ごとにスキル威力+1（最大3）", "斬撃", dice, nCorp).reasons[0];
  assert.equal(targetStatus.excludedRecipient, false, "a target-state condition is not a buff recipient");
  assert.equal(targetStatus.resourceScaling, true);
  assert.equal(targetStatus.value, null);
  const targetGrant = api.kindMods("対象にスキル威力+2を付与", "斬撃", dice, nCorp).reasons[0];
  assert.equal(targetGrant.excludedRecipient, true, "a modifier granted to the target is not the evaluated identity's own modifier");
});


test("資源比例補正は同一人格の開始時・当該スキル使用時の自己獲得だけを数える", () => {
  const { api } = loadHelpers();
  const persona = {
    name: "N社握らんとする者",
    passive_effect: "R開始時、自分に狂信1を得る",
    passive_always: "",
    unique: []
  };
  const skill = {
    type: "斬撃",
    effect: "使用時：狂信2を得る。マッチ勝利時：次のRに狂信3を得る",
    dice: [{ effect: "" }, { effect: "" }]
  };
  const item = api.kindMods("自分の狂信2ごとにスキル威力+1（最大10）", "斬撃", skill.dice, persona, skill).reasons[0];
  assert.equal(item.resourceName, "狂信");
  assert.equal(item.resourceSupply.total, 3);
  assert.equal(item.value, 1);
  assert.equal(item.unresolved, false);
  assert.equal(item.conditional, true);
  assert.deepEqual(Array.from(item.resourceSupply.notes), ["パッシブ +1", "当該スキル使用時 +2"]);
});

test("前ラウンドに同じスキルを再使用する場合の資源獲得を数え、1R限定資源の即時獲得は持ち越さない", () => {
  const { api } = loadHelpers();
  const skill = {
    name: "罪悪を貫く釘",
    type: "貫通",
    effect: "マッチ勝利時：次のRに狂信4を得る",
    dice: [{ effect: "" }]
  };
  const persona = {
    name: "N社握る者",
    unique_buffs: [{ name: "狂信", max: 10, desc: "[1R] 数値2ごとにダメージ量が1増加" }],
    skills: [skill]
  };
  const supply = api.resourceSupplyFor(persona, skill, "狂信");
  assert.equal(supply.total, 4, "同じスキルを前ラウンドに使用して得た次R分は本人の蓄積として数える");
  assert.equal(supply.maximum, 10);

  const immediateSkill = {
    name: "即時獲得",
    type: "斬撃",
    effect: "使用時：狂信2を得る",
    dice: [{ effect: "" }]
  };
  const immediate = api.resourceSupplyFor({
    unique_buffs: [{ name: "狂信", max: 10, desc: "[1R] 数値2ごとにダメージ量が1増加" }],
    skills: [immediateSkill]
  }, immediateSkill, "狂信");
  assert.equal(immediate.total, 2, "当該スキル使用時の獲得は加算する");
  assert.equal(immediate.unresolved, false, "1R限定の即時獲得を前ラウンドから持ち越さない");
});

test("資源の明示上限と前ラウンドのスキル選択上限を適用する", () => {
  const { api } = loadHelpers();
  const strongest = {
    name: "大釘打ち",
    effect: "マッチ敗北時：次のRに狂信3を得る",
    dice: [{ effect: "" }]
  };
  const weaker = {
    name: "狂的な浄化",
    effect: "マッチ勝利時：次のRに狂信1を得る",
    dice: [{ effect: "" }]
  };
  const persona = {
    unique_buffs: [{ name: "狂信", max: 10, desc: "[1R] 数値2ごとにダメージ量が1増加" }],
    skills: [strongest, weaker]
  };
  const supply = api.resourceSupplyFor(persona, strongest, "狂信");
  assert.equal(supply.total, 3, "前ラウンドに使えるスキルは最大1つとして最大供給を採用");
  assert.equal(supply.maximum, 10);

  const capped = api.resourceSupplyFor({
    unique_buffs: [{ name: "狂信", max: 5, desc: "[1R] 狂信" }],
    passive_effect: "R開始時、自分に狂信4を得る",
    skills: [strongest]
  }, strongest, "狂信");
  assert.equal(capped.rawTotal, 7);
  assert.equal(capped.total, 5, "資源そのものの最大蓄積量を超えない");

  const branchingSkill = {
    effect: "使用時：狂信2を得る。マッチ勝利時：次のRに狂信1を得る。マッチ敗北時：次のRに狂信3を得る",
    dice: [{ effect: "" }]
  };
  const branching = api.resourceSupplyFor({
    unique_buffs: [{ name: "狂信", max: 10, desc: "[1R] 狂信" }],
    skills: [branchingSkill]
  }, branchingSkill, "狂信");
  assert.equal(branching.total, 5, "当該Rの使用時+2と、前Rの勝利/敗北のどちらか一方だけを加算する");
});

test("実データのN社人格は狂信10ではなく本人が次Rへ持ち越せる量で評価する", () => {
  const { api } = loadHelpers();
  const open = '<script id="persona-data" type="application/json">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1);
  const contentStart = start + open.length;
  const end = html.indexOf("</script>", contentStart);
  const db = JSON.parse(html.slice(contentStart, end));
  const all = [...(db.normal_personas || []), ...(db.tokui_personas || [])];
  const byName = (name) => all.find(persona => persona.name === name);
  const attainable = (persona) => Math.max(0, ...(persona.skills || []).map(skill =>
    api.resourceSupplyFor(persona, skill, "狂信").total
  ));

  const hammer = byName("N社大鎚");
  const smallHammer = byName("N社小鎚");
  const holder = byName("N社握る者");
  assert.ok(hammer && smallHammer && holder, "N社の該当人格データが存在する");
  assert.equal(hammer.unique_buffs[0].max, 10);
  assert.equal(attainable(hammer), 3, "大鎚は前ラウンドのマッチ敗北による狂信3が本人の最大供給");
  assert.equal(attainable(smallHammer), 1, "小鎚は前ラウンドのマッチ勝利による狂信1が本人の最大供給");
  assert.equal(attainable(holder), 4, "握る者は本人のスキルによる次R狂信4を数え、ランダムな味方への付与を本人保証として扱わない");
  const holderSupply=api.resourceSupplyFor(holder,holder.skills.find(item=>item.name==="罪悪を貫く釘"),"狂信");
  assert.ok(holderSupply.notes.some(note=>note.includes("本人への付与が保証されないため除外")),"ランダムな味方への狂信付与を本人獲得に混ぜず、除外理由を表示する");

  for (const [persona,skill,expected] of [
    [hammer,hammer.skills.find(item=>item.name==="大釘打ち"),1],
    [smallHammer,smallHammer.skills[0],0],
    [holder,holder.skills.find(item=>item.name==="罪悪を貫く釘"),2]
  ]) {
    const uniqueText=api.uniqueEffectText(persona.unique_buffs[0]);
    assert.match(uniqueText,/狂信2ごとに/,"固有バフの『数値』は固有バフ名の蓄積量として読む");
    const scaled=api.kindMods(uniqueText,skill.type,skill.dice,persona,skill).reasons.find(item=>item.resourceScaling);
    assert.ok(scaled,persona.name+" の狂信比例スキル威力が抽出される");
    assert.equal(scaled.value,expected,persona.name+" は本人の到達可能量から比例補正を算出する");
    assert.equal(scaled.resourceSupply.total,attainable(persona));
  }

  const holderSkill=holder.skills.find(item=>item.name==="罪悪を貫く釘");
  const impossible=api.kindMods("自分の狂信が10以上ならスキル威力+2",holderSkill.type,holderSkill.dice,holder,holderSkill).reasons[0];
  assert.equal(impossible.value,0,"本人の到達量4では狂信10以上の条件を成立扱いにしない");
  assert.equal(impossible.unresolved,false);
  assert.equal(impossible.resourceSupply.total,4);
  const reachable=api.kindMods("自分の狂信が4以上ならスキル威力+2",holderSkill.type,holderSkill.dice,holder,holderSkill).reasons[0];
  assert.equal(reachable.value,2,"到達可能な閾値は通常どおり評価する");
  assert.deepEqual(Array.from(api.targetConditionDetails("対象の狂信が10以上ならスキル威力+2"),item=>[item.kind,item.value]),[["targetStatus","狂信"]]);
  const target=api.kindMods("対象の狂信が10以上ならスキル威力+2",holderSkill.type,holderSkill.dice,holder,holderSkill).reasons[0];
  assert.equal(target.value,2,"対象側の蓄積条件は本人の資源量で判定せず、対象条件として扱う");
  assert.equal(target.unresolved,false);
  assert.ok(target.conditionCategories.includes("resource"));
});

test("選択したサポートパッシブの資源供給・獲得量補正を所属と発動条件を保って反映する", () => {
  const { api, controls, context } = loadHelpers();
  context.EMBEDDED_DB.support_passives = [
    { name: "釘と金槌", cond: "憤怒x2 色欲x2 保有", effect: "N社狂信者所属の人格のみ発動。狂信の獲得量とN社の釘の付与量+1" },
    { name: "処断の歓喜", cond: "色欲x6 保有", effect: "N社狂信者所属の人格のみ発動。R開始時、狂信1を得る。" }
  ];
  controls.resourceSupportPassiveNames.value = "釘と金槌、処断の歓喜";
  const persona = { name: "N社握らんとする者", affiliation: "N社", passive_effect: "R開始時、自分に狂信1を得る" };
  const skill = { type: "斬撃", effect: "使用時：狂信2を得る", dice: [{ effect: "" }] };
  const item = api.kindMods("自分の狂信2ごとにスキル威力+1（最大10）", "斬撃", skill.dice, persona, skill).reasons[0];
  assert.equal(item.resourceSupply.total, 6, "own grants 3 + 釘と金槌 gain bonus 2 + 処断の歓喜 grant 1");
  assert.equal(item.value, 3);
  assert.equal(item.conditional, true);
  assert.ok(item.resourceSupply.notes.some(x => x.includes("釘と金槌")));
  assert.ok(item.resourceSupply.notes.some(x => x.includes("処断の歓喜")));

  const nonN = api.resourceSupplyFor({ name: "W社人格", affiliation: "W社" }, skill, "狂信");
  assert.equal(nonN.total, 2, "N社-only support passive is not applied to W社");
});

test("所有者が省略された呼吸式は自己資源として扱い、対象側資源は除外する", () => {
  const { api } = loadHelpers();
  const ownResource = api.resourceScalingDetails("呼吸5ごとにスキル威力+1");
  assert.equal(ownResource.resource, "呼吸");
  assert.equal(ownResource.per, 5);
  assert.equal(ownResource.self, true);
  assert.equal(api.resourceScalingDetails("対象の出血5ごとにスキル威力+1"), null);
  assert.equal(api.resourceScalingDetails("自分の呼吸と対象の破裂の合計10ごとにスキル威力+1"), null);
});

test("初期弾丸数を資源供給に含め、効果側の最大値で加算量を制限する", () => {
  const { api } = loadHelpers();
  const persona = { name: "ロボトミーE.G.O:厳粛な哀悼", bullets: 20 };
  const skill = { type: "斬撃", effect: "", dice: [{ effect: "" }] };
  const item = api.kindMods("自分の弾丸5ごとにスキル威力+1（最大4）", "斬撃", skill.dice, persona, skill).reasons[0];
  assert.equal(item.resourceSupply.total, 20);
  assert.equal(item.value, 4);
  assert.equal(item.unresolved, false);
});

test("スキル獲得量増加のサポートパッシブはラウンド開始時供給に重複適用しない", () => {
  const { api, controls, context } = loadHelpers();
  context.EMBEDDED_DB.support_passives = [
    { name: "循環呼吸", cond: "傲慢x5 保有", effect: "スキルで獲得する呼吸獲得量+1。マッチ勝利時、呼吸3を得る" }
  ];
  controls.resourceSupportPassiveNames.value = "循環呼吸";
  const persona = { passive_effect: "R開始時、自分に呼吸3を得る" };
  const skill = { effect: "使用時：呼吸2を得る", dice: [{ effect: "" }] };
  const supply = api.resourceSupplyFor(persona, skill, "呼吸");
  assert.equal(supply.total, 6, "round-start 3 + skill grant 2 + skill-only support gain 1");
});

test("倍率型のサポート資源補正は加算値に偽装せず未確定として残す", () => {
  const { api, controls, context } = loadHelpers();
  context.EMBEDDED_DB.support_passives = [
    { name: "プラス電力発電装置", cond: "怠惰x3 保有", effect: "充電を得る時充電獲得量を1.5倍にし、充電を消費する時スキル威力+1" }
  ];
  controls.resourceSupportPassiveNames.value = "プラス電力発電装置";
  const supply = api.resourceSupplyFor({}, { effect: "使用時：充電2を得る" }, "充電");
  assert.equal(supply.total, 2);
  assert.equal(supply.unresolved, true);
  assert.ok(supply.unknown.includes("プラス電力発電装置"));
});

test("条件付き自己パッシブの資源獲得は候補として数え、発動条件を保持する", () => {
  const { api } = loadHelpers();
  const persona = { name: "N社中鎚 ガブナー", passive_effect: "HPが50%未満または混乱状態なら狂信3を得る" };
  const supply = api.resourceSupplyFor(persona, { effect: "" }, "狂信");
  assert.equal(supply.known, true);
  assert.equal(supply.total, 3);
  assert.equal(supply.conditional, true);
});

test("味方への付与・対象側資源・次ラウンドの獲得を自分の使用時資源へ混入しない", () => {
  const { api } = loadHelpers();
  const persona = {
    name: "N社握らんとする者",
    passive_effect: "R開始時、N社所属の味方に狂信2を付与",
    unique: []
  };
  const skill = { type: "斬撃", effect: "使用時：次のRに狂信4を得る。マッチ勝利時：狂信3を得る", dice: [{ effect: "" }] };
  const item = api.kindMods("自分の狂信2ごとにスキル威力+1（最大10）", "斬撃", skill.dice, persona, skill).reasons[0];
  assert.equal(item.value, null);
  assert.equal(item.unresolved, true);
  assert.equal(item.resourceSupply.known, false);
  const target = api.kindMods("対象の狂信2ごとにスキル威力+1（最大10）", "斬撃", skill.dice, persona, skill).reasons[0];
  assert.equal(target.value, null);
  assert.equal(target.unresolved, true);
});

test("カンパネルラの狂信は固有上限10ではなく本人の現実的な供給量5で評価する", () => {
  const { api } = loadHelpers();
  const open = '<script id="appendix-data" type="application/json">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1);
  const contentStart = start + open.length;
  const end = html.indexOf("</script>", contentStart);
  const appendix = JSON.parse(html.slice(contentStart, end));
  const persona = appendix.find(item => item.name === "N社 握らんとする者 カンパネルラ");
  assert.ok(persona, "カンパネルラの別冊人格データが存在する");
  assert.equal(persona.unique.find(item => item.name === "狂信").max, 10);
  const skill = persona.skills.find(item => item.name === "聖断");
  const supply = api.resourceSupplyFor(persona, skill, "狂信");
  assert.equal(supply.total, 5, "使用時の狂信2と、前ラウンドにマッチ勝利して持ち越す狂信3を合算");
  assert.equal(supply.unresolved, false);
  const scaled = api.kindMods("狂信2ごとにスキル威力+1（最大10）", skill.type, skill.dice, persona, skill).reasons.find(item => item.resourceScaling);
  assert.equal(scaled.value, 2, "本人が到達できる狂信5から比例補正は+2");
});

test("自分を含む5名以上を要求する狂信付与は単独人格の到達量に含めない", () => {
  const { api } = loadHelpers();
  const persona = {
    name: "N社 握らんとする者",
    affiliation: "N社",
    passive_always: "生存しているN社狂信者が自分を含めて5名以上いるならN社狂信者にダメージ量増加1と狂信1を付与",
    unique_buffs: [{ name: "狂信", max: 10, type: "バフ", desc: "スキル威力+1（最大10）" }]
  };
  const supply = api.resourceSupplyFor(persona, { effect: "" }, "狂信");
  assert.equal(supply.total, 0, "5名のN社編成を単独人格の標準評価へ持ち込まない");
  assert.equal(supply.known, true);
  assert.ok(supply.excluded.some(item => item.includes("味方編成条件")));
  assert.ok(supply.notes.some(item => item.includes("味方編成条件")));
});

test("持続期間の根拠がない資源は前ラウンドの獲得分を現在値へ持ち越さない", () => {
  const { api } = loadHelpers();
  const persona = {
    skills: [{ name: "前ラウンドの呼吸獲得", effect: "使用時：呼吸2を得る", dice: [] }]
  };
  const supply = api.resourceSupplyFor(persona, { effect: "" }, "呼吸");
  assert.equal(supply.total, 0);
  assert.equal(supply.unresolved, true, "呼吸の持続・減衰根拠がないため前ラウンド分は未確定");
});

test("実データのN社握らんとする者は5名編成の狂信付与を除外し本人の次R獲得2で評価する", () => {
  const { api } = loadHelpers();
  const open = '<script id="persona-data" type="application/json">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1);
  const contentStart = start + open.length;
  const end = html.indexOf("</script>", contentStart);
  const db = JSON.parse(html.slice(contentStart, end));
  const persona = (db.tokui_personas || []).find(item => item.name === "N社握らんとする者");
  assert.ok(persona, "実データの対象人格が存在する");
  const skill = persona.skills.find(item => item.name === "自滅的浄化");
  const supply = api.resourceSupplyFor(persona, skill, "狂信");
  assert.equal(supply.total, 2, "本人のスキルによる次R獲得2のみを採用");
  assert.ok(supply.excluded.some(item => item.includes("味方編成条件")), "自分を含むN社狂信者5名条件を除外理由として保持");
  assert.equal(supply.unresolved, false);
});

test("N社中鎚の狂信はHP条件と前ラウンドのスキル獲得を合わせても6が到達上限", () => {
  const { api } = loadHelpers();
  const open = '<script id="appendix-data" type="application/json">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1);
  const contentStart = start + open.length;
  const end = html.indexOf("</script>", contentStart);
  const appendix = JSON.parse(html.slice(contentStart, end));
  const persona = appendix.find(item => item.name === "N社中鎚 ガブナー");
  assert.ok(persona, "N社中鎚の別冊人格データが存在する");
  assert.equal(persona.unique.find(item => item.name === "狂信").max, 10);
  const skill = persona.skills.find(item => item.name === "もう……無い。");
  const supply = api.resourceSupplyFor(persona, skill, "狂信");
  assert.equal(supply.total, 6, "HP50%未満または混乱時の自己獲得3と、前ラウンドの過半数的中による次R獲得3");
  assert.equal(supply.unresolved, false);
});


test("自分を除外した味方への威力付与を評価対象本人の補正に混ぜない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const excludedTexts = [
    "自分以外の味方全体にスキル威力+2を付与",
    "自分を除く味方3名にスキル威力+2を付与",
    "自分を除いて味方全員にスキル威力+2を付与",
    "自分が付与したスキル威力+2を味方に付与"
  ];

  for (const text of excludedTexts) {
    const reason = api.kindMods(text, "斬撃", dice, { affiliation: "N社" }).reasons[0];
    assert.ok(reason, text + " の補正記述を検出する");
    assert.equal(reason.excludedRecipient, true, text + " は他者への付与として除外する");
    assert.equal(api.skillBonus({ type: "斬撃", effect: text, dice }, { affiliation: "N社" }).bonus, 0, text);
  }

  const included = "自分を含む味方全体にスキル威力+2を付与";
  const selfReason = api.kindMods(included, "斬撃", dice, { affiliation: "N社" }).reasons[0];
  assert.equal(selfReason.excludedRecipient, false, "自分を含むと明記された付与は本人にも適用する");
  assert.equal(selfReason.recipientScope, "self");
  assert.equal(api.skillBonus({ type: "斬撃", effect: included, dice }, { affiliation: "N社" }).bonus, 4);

  for (const sharedRecipient of [
    "自分と最大HPが最も高い味方1名にスキル威力+2を付与",
    "自分とエドガー家継承者人格の味方にスキル威力+2を付与"
  ]) {
    const shared = api.kindMods(sharedRecipient, "斬撃", dice, { affiliation: "N社" }).reasons[0];
    assert.equal(shared.excludedRecipient, false, sharedRecipient + " は本人も付与対象に含む");
    assert.equal(shared.recipientScope, "self");
    assert.equal(api.skillBonus({ type: "斬撃", effect: sharedRecipient, dice }, { affiliation: "N社" }).bonus, 4);
  }
});


test("複合所属名を正しく解決し、同所属バフだけを本人へ適用する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];

  const fourthAffiliation = api.affiliationFromName("第四銀工房輪刃派代表 ヨーゼフ");
  const lamanchaAffiliation = api.affiliationFromName("ラ・マンチャランド第一区画血鬼 カグラ");
  const musicAffiliation = api.affiliationFromName("笛吹きの音楽隊指導官 サンジェルマン");
  assert.equal(fourthAffiliation, "第四銀工房輪刃派");
  assert.equal(lamanchaAffiliation, "ラ・マンチャランド第一区画");
  assert.equal(musicAffiliation, "笛吹きの音楽隊");
  assert.equal(api.normalizeDbPersona({ name: "第四銀工房輪刃派フィクサー", skills: [] }, "通常", "基本").affiliation, fourthAffiliation,
    "通常人格もDB側の所属欠落を名前から補完する");

  const fourthBuff = "第四銀工房輪刃派の味方に斬撃威力増加1を付与";
  const fourth = api.kindMods(fourthBuff, "斬撃", dice, { affiliation: fourthAffiliation }).reasons[0];
  assert.equal(fourth.recipientScope, "affiliation");
  assert.equal(fourth.excludedRecipient, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect: fourthBuff, dice }, { affiliation: fourthAffiliation }).bonus, 2);

  const timedFourthBuff = api.kindMods("R開始時：第四銀工房輪刃派の味方に斬撃威力増加1を付与", "斬撃", dice, { affiliation: fourthAffiliation }).reasons[0];
  assert.equal(timedFourthBuff.recipientScope, "affiliation");
  assert.equal(timedFourthBuff.excludedRecipient, false);
  assert.equal(timedFourthBuff.conditional, true, "開始時の発動タイミングは候補として残す");

  const lamanchaBuff = "ラ・マンチャランド所属の血鬼の味方に斬撃威力増加1を付与";
  const lamancha = api.kindMods(lamanchaBuff, "斬撃", dice, { affiliation: lamanchaAffiliation }).reasons[0];
  assert.equal(lamancha.recipientScope, "affiliation");
  assert.equal(lamancha.excludedRecipient, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect: lamanchaBuff, dice }, { affiliation: lamanchaAffiliation }).bonus, 2);

  const districtOnly = "ラ・マンチャランド第一区画所属の血鬼の味方にスキル威力+2を付与";
  const genericLamancha = api.kindMods(districtOnly, "斬撃", dice, { affiliation: "ラ・マンチャランド" }).reasons[0];
  assert.equal(genericLamancha.excludedRecipient, true, "一般所属だけでは区画限定の付与対象に含めない");

  const sameAffiliation = "自分と同じ所属の味方にスキル威力+2を付与";
  const sameAffiliationReason = api.kindMods(sameAffiliation, "斬撃", dice, { affiliation: "N社" }).reasons[0];
  assert.equal(sameAffiliationReason.recipientScope, "affiliation");
  assert.equal(sameAffiliationReason.excludedRecipient, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect: sameAffiliation, dice }, { affiliation: "N社" }).bonus, 4);
});


test("対象が味方・敵である条件を対象種別へ分類し、編成条件と混同しない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }];
  const ally = api.kindMods("対象が味方ならスキル威力+1", "斬撃", dice).reasons[0];
  const enemy = api.kindMods("対象が敵ならスキル威力+1", "斬撃", dice).reasons[0];
  const team = api.kindMods("味方が3人以上ならスキル威力+1", "斬撃", dice).reasons[0];

  assert.equal(ally.targetConditions[0].kind, "targetType");
  assert.ok(ally.conditionCategories.includes("targetType"));
  assert.ok(!ally.conditionCategories.includes("team"), "対象が味方かどうかは編成人数条件ではない");
  assert.equal(enemy.targetConditions[0].kind, "targetType");
  assert.ok(enemy.conditionCategories.includes("targetType"));
  assert.ok(!enemy.conditionCategories.includes("team"));
  assert.ok(team.conditionCategories.includes("team"), "味方人数そのものを参照する条件は編成条件に残す");
});


test("対象条件検索が未満・以下・逆向きの状態付与・速度比較を拾う", () => {
  const { api } = loadHelpers();
  const details = api.targetConditionDetails([
    "対象の出血が10未満ならスキル威力+1",
    "対象のHPが50％以下ならスキル威力+2",
    "自分の速度が対象より2以上高ければスキル威力+1",
    "対象より速度が高いならスキル威力+1",
    "対象の速度が自分より高ければスキル威力+1",
    "対象の貫通耐性が弱点ならダメージ量+7",
    "獲物の印が対象にあるならマッチ威力+2"
  ].join("。"));

  assert.ok(details.some(x => x.kind === "targetStatus" && x.value === "出血"));
  assert.ok(details.some(x => x.kind === "targetStat" && x.value === "HP"));
  assert.ok(details.some(x => x.kind === "targetStat" && x.value === "速度"));
  assert.ok(details.some(x => x.kind === "targetStat" && x.value === "貫通耐性"));
  assert.ok(details.some(x => x.kind === "targetStatus" && x.value === "獲物の印"));
  assert.ok(api.targetConditionMatches({ kind: "targetStat", value: "速度" }, "速度"));
  assert.ok(api.targetConditionMatches({ kind: "targetStatus", value: "出血" }, "出血"));

  const bleed = api.kindMods("対象の出血が10未満ならスキル威力+1", "斬撃", [{ effect: "" }]).reasons[0];
  const hp = api.kindMods("対象のHPが50％以下ならスキル威力+2", "斬撃", [{ effect: "" }]).reasons[0];
  assert.ok(bleed.conditionCategories.includes("targetStatus"));
  assert.ok(hp.conditionCategories.includes("stats"));
  assert.ok(hp.conditionCategories.includes("targetStat"), "対象側の数値条件は専用カテゴリにも分類する");
});


test("対象数値条件フィルターを状態条件・種別条件から独立して切り替えられる", () => {
  const { api, controls } = loadHelpers();
  const row = {
    dieRows: [{}],
    passCandidates: [],
    effectCandidates: [{
      conditional: true, unresolved: false, value: 2, targets: [0], conditionCategories: ["targetStat"]
    }]
  };

  assert.equal(api.conditionalBonus(row, "all", "effect"), 2);
  controls.condTargetStats.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 0);
  controls.condTargetStats.checked = true;
  controls.condTargetStatus.checked = false;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 2, "対象の数値条件は状態条件フィルターから独立する");
});


test("R社第四群の所属バフとチーム別バフを別々に適用する", () => {
  const { api } = loadHelpers();
  const commander = api.normalizeDbPersona({ name: "R社第四群 司令官", skills: [] }, "通常", "基本");
  const rabbit = api.normalizeDbPersona({ name: "R社第4群ウサギチーム シオン", skills: [] }, "通常", "基本");
  const dice = [{ effect: "銃撃" }, { effect: "銃撃" }];

  assert.equal(commander.affiliation, "R社第四群");
  assert.equal(rabbit.affiliation, "R社第四群", "数字表記の第4群も漢数字の第四群へ正規化する");
  assert.equal(commander.team, "第四群司令官");
  assert.equal(rabbit.team, "ウサギチーム");

  const affiliationBuff = "R社第四群所属の味方にスキル威力+2を付与";
  const affiliationReason = api.kindMods(affiliationBuff, "斬撃", dice, rabbit).reasons[0];
  assert.equal(affiliationReason.recipientScope, "affiliation");
  assert.equal(affiliationReason.excludedRecipient, false);
  const numericAffiliation = api.kindMods("R社第4群所属の味方にスキル威力+2を付与", "斬撃", dice, rabbit).reasons[0];
  assert.equal(numericAffiliation.excludedRecipient, false, "第4群と第四群の表記差を同一所属として扱う");

  const teamBuff = "ウサギチーム：銃撃ダイスのダイス威力+2";
  const rabbitReason = api.kindMods(teamBuff, "銃撃", dice, rabbit).reasons[0];
  const commanderReason = api.kindMods(teamBuff, "銃撃", dice, commander).reasons[0];
  assert.equal(rabbitReason.recipientScope, "team");
  assert.equal(rabbitReason.excludedRecipient, false);
  assert.equal(commanderReason.recipientScope, "team");
  assert.equal(commanderReason.excludedRecipient, true, "ウサギチーム限定の補正を司令官へ加算しない");
});

test("特殊な所属名を名前から正しく復元する", () => {
  const { api } = loadHelpers();
  const blackCloud = api.normalizeDbPersona({ name: "黒雲会副組長 ヨーゼフ", skills: [] }, "通常", "基本");
  const pirate = api.normalizeDbPersona({ name: "双鉤海賊団副船長 アリス", skills: [] }, "通常", "基本");

  assert.equal(blackCloud.affiliation, "黒雲会", "役職名の副組を所属名に混ぜない");
  assert.equal(pirate.affiliation, "双鉤海賊団");

  const dice = [{ effect: "" }];
  const blackBuff = api.kindMods("黒雲会所属の味方にスキル威力+2を付与", "斬撃", dice, blackCloud).reasons[0];
  const pirateBuff = api.kindMods("双鉤海賊団所属の味方にスキル威力+2を付与", "斬撃", dice, pirate).reasons[0];
  assert.equal(blackBuff.recipientScope, "affiliation");
  assert.equal(blackBuff.excludedRecipient, false);
  assert.equal(pirateBuff.recipientScope, "affiliation");
  assert.equal(pirateBuff.excludedRecipient, false);
});


test("同所属でも自分以外と指定された付与は本人に加算しない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const effect = "自分以外の炎拳事務所所属の味方にスキル威力+2を付与";
  const persona = { affiliation: "炎拳事務所" };
  const reason = api.kindMods(effect, "斬撃", dice, persona).reasons[0];

  assert.equal(reason.recipientScope, "other");
  assert.equal(reason.excludedRecipient, true);
  assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, persona).bonus, 0);
});

test("直前の文で指定された自分以外の味方への追加威力付与を本人に加算しない", () => {
  const { api } = loadHelpers();
  const effect = "攻撃後、対象が混乱するか死亡したなら、自分を除くSANが最も高い味方に次のRにて貫通ダメージ量増加1を付与。対象が薬指所属なら追加で貫通威力増加1を付与";
  const dice = [{ effect }];
  const reason = api.kindMods(effect, "斬撃", dice, {}).reasons.find(item => item.source === "貫通威力増加1");

  assert.ok(reason, "後続の追加威力付与を検出する");
  assert.equal(reason.recipientScope, "other");
  assert.equal(reason.excludedRecipient, true);
  assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, {}).bonus, 0);

  const selfEffect = "攻撃後：自分以外の味方全員に貫通ダメージ量増加1を付与。対象が薬指所属なら追加でスキル威力+2";
  const selfReason = api.kindMods(selfEffect, "斬撃", dice, {}).reasons[0];
  assert.ok(selfReason);
  assert.equal(selfReason.excludedRecipient, false, "後続が本人の威力補正なら直前の受け手を引き継がない");
});

test("選出対象の味方への付与は適用先未確定として加算を保留する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const cases = [
    ["最もHPが少ないヴィリーブ工房所属の味方2名へスキル威力+2を付与", { affiliation: "ヴィリーブ工房" }],
    ["HPが最も少ないヴィリーブ工房所属の味方2名へスキル威力+2を付与", { affiliation: "ヴィリーブ工房" }],
    ["ラ・マンチャランド所属の血鬼の味方に優先してスキル威力+2を付与", { affiliation: "ラ・マンチャランド" }],
    ["ランダムな味方1名にスキル威力+2を付与", {}],
    ["味方2名にスキル威力+2を付与", {}]
  ];

  for (const [effect, persona] of cases) {
    const reason = api.kindMods(effect, "斬撃", dice, persona).reasons[0];
    assert.equal(reason.recipientScope, "allySelection", effect);
    if(effect.includes("ヴィリーブ工房")) assert.equal(reason.recipientAffiliation, "ヴィリーブ工房", "選出条件の前置きは所属名に混ぜない");
    assert.equal(reason.recipientUnresolved, true, effect);
    assert.equal(reason.excludedRecipient, false, effect);
    assert.equal(reason.unresolved, true, effect);
    assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, persona).bonus, 0, effect);
    assert.match(api.formatModifierReason(reason), /受け手未確定/);
  }
});

test("ランダムに選ばれた味方の指令の印スキルへの威力補正は本人へ加算しない", () => {
  const { api } = loadHelpers();
  const effect = "戦闘開始時：ランダムな人差し指所属の味方1名の指令の印スキルのスキル威力+2";
  const dice = [{ effect: "" }, { effect: "" }];
  const reason = api.kindMods(effect, "斬撃", dice, {}).reasons[0];

  assert.ok(reason, "指令の印スキルへの威力補正を検出する");
  assert.equal(reason.recipientScope, "allySelection");
  assert.equal(reason.recipientUnresolved, true);
  assert.equal(reason.excludedRecipient, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, {}).bonus, 0);
});

test("前の同所属条件が後続の味方付与へ漏れない", () => {
  const { api } = loadHelpers();
  const effect = "使用時：自分と同じ所属のキャラクターがスキル4を使う時、使う味方の数だけスキル威力+2（最大6）\n戦闘開始時：両隣の味方に嫉妬威力増加1を付与";
  const reasons = api.kindMods(effect, "斬撃", [{ effect: "" }], {
    name: "ダンダダダダ工房所属フィクサー レミス"
  }).reasons;
  const allyGrant = reasons.find(item => item.source === "威力増加1");

  assert.ok(allyGrant, "後続の味方への威力付与を検出する");
  assert.equal(allyGrant.recipientScope, "other");
  assert.equal(allyGrant.excludedRecipient, true);
});

test("前の自分以外への付与が後続の本人威力補正を除外しない", () => {
  const { api } = loadHelpers();
  const effect = "戦闘開始時：自分以外の味方全員に嫉妬威力増加1を付与\n使用時：自分にスキル威力+2";
  const reasons = api.kindMods(effect, "斬撃", [{ effect: "" }], {}).reasons;
  const ally = reasons.find(item => item.source === "威力増加1");
  const self = reasons.find(item => item.source === "スキル威力+2");

  assert.ok(ally);
  assert.equal(ally.excludedRecipient, true);
  assert.ok(self);
  assert.equal(self.excludedRecipient, false);
  assert.notEqual(self.recipientScope, "other");
});

test("前の味方付与が後続の本人威力補正へ漏れない", () => {
  const { api } = loadHelpers();
  const effect = "戦闘開始時：両隣の味方に嫉妬威力増加1を付与\n使用時：自分にスキル威力+2を付与";
  const reasons = api.kindMods(effect, "斬撃", [{ effect: "" }], {}).reasons;
  const self = reasons.find(item => item.source === "スキル威力+2");

  assert.ok(self, "後続の本人威力補正を検出する");
  assert.equal(self.excludedRecipient, false);
  assert.notEqual(self.recipientScope, "other");
});

test("状態名を挟んだ両隣の味方への威力増加付与を本人に加算しない", () => {
  const { api, controls } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const effect = "戦闘開始時：両隣の味方に嫉妬威力増加1を付与";
  const reason = api.kindMods(effect, "斬撃", dice, {}).reasons[0];

  assert.ok(reason, "威力増加の記述を検出する");
  assert.equal(reason.recipientScope, "other");
  assert.equal(reason.excludedRecipient, true);
  const row = { dieRows: [{}, {}], passCandidates: [], effectCandidates: [reason] };
  controls.includeEffect.checked = true;
  controls.includeConditional.checked = true;
  assert.equal(api.conditionalBonus(row, "all", "effect"), 0);
});

test("同所属の味方が別スキルを使う条件を受け手指定と誤認しない", () => {
  const { api } = loadHelpers();
  const effect = "使用時：自分と同じ所属のキャラクターがスキル4を使う時、使う味方の数だけスキル威力+2（最大6）";
  const reason = api.kindMods(effect, "斬撃", [{ effect: "" }], {
    name: "ダンダダダダ工房所属フィクサー レミス"
  }).reasons[0];

  assert.ok(reason, "威力補正を検出する");
  assert.equal(reason.recipientScope, "selfOrUnspecified");
  assert.equal(reason.excludedRecipient, false);
  assert.equal(reason.unresolved, true, "人数が不明な条件値は加算しない");
});

test("味方が使用する別スキルへの威力補正は本人のスキル威力に混ぜない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  for (const effect of [
    "使用時：前方の味方1名の使用するスキルが嫉妬スキルならスキル威力+2",
    "後方の味方の使用しているスキルが打撃属性ならスキル威力+2"
  ]) {
    const reason = api.kindMods(effect, "斬撃", dice, {}).reasons[0];
    assert.ok(reason, effect);
    assert.equal(reason.recipientScope, "allySelection", effect);
    assert.equal(reason.recipientUnresolved, true, effect);
    assert.equal(reason.excludedRecipient, false, effect);
    assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, {}).bonus, 0, effect);
  }
});

test("他の味方の人数を参照する自己威力補正を他者への付与と誤認しない", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  for (const effect of [
    "使用時：群れたハイエナ所属の他の味方1名ごとにスキル威力+1（最大5）",
    "自分以外の味方の数だけスキル威力+1"
  ]) {
    const reason = api.kindMods(effect, "斬撃", dice, { affiliation: "群れたハイエナ" }).reasons[0];
    assert.ok(reason, effect);
    assert.equal(reason.excludedRecipient, false, effect);
    assert.notEqual(reason.recipientScope, "other", effect);
  }
});

test("自分を除外しない味方全体への付与は本人にも適用する", () => {
  const { api } = loadHelpers();
  const dice = [{ effect: "" }, { effect: "" }];
  const effect = "味方全体にスキル威力+1を付与";
  const reason = api.kindMods(effect, "斬撃", dice, {}).reasons[0];

  assert.equal(reason.recipientScope, "self");
  assert.equal(reason.excludedRecipient, false);
  assert.equal(reason.recipientUnresolved, false);
  assert.equal(api.skillBonus({ type: "斬撃", effect, dice }, {}).bonus, 2);
});
