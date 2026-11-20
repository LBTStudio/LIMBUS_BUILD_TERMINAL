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
    ["includeConditional", "includePassive", "includeEffect", "condStatus", "condResource", "condStats", "condTeam", "condTargetStatus", "condTargetType", "condTargetAffiliation", "targetConditionFilter", "resourceSupportPassiveNames", "condTrigger", "condOther"]
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
  vm.runInContext(`
    globalThis.api = { kindMods, uniqueEffectText, conditionClasses, targetConditionDetails, affiliationFromName, resourceSupplyFor, passiveBonus, skillBonus, conditionalPerDie, conditionalBonus };
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
  assert.deepEqual(Array.from(api.targetConditionDetails("対象が指令対象ならスキル威力+2")), [{ kind: "targetStatus", value: "指令対象" }]);
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
  assert.equal(excluded.excludedRecipient, true);
  assert.equal(api.skillBonus({ type: "斬撃", effect: allyBuff, dice }, nCorp).bonus, 0);

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

test("選択したサポートパッシブの資源供給・獲得量補正を所属と発動条件を保って反映する", () => {
  const { api, controls, context } = loadHelpers();
  context.EMBEDDED_DB.support_passives = [
    { name: "釘と金槌", cond: "憤怒x2 色欲x2 保有", effect: "狂信の獲得量とN社の釘の付与量+1" },
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
  assert.deepEqual(api.resourceScalingDetails("呼吸5ごとにスキル威力+1"), { resource: "呼吸", per: 5, self: true });
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
