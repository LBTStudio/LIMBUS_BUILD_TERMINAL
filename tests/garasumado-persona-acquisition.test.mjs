import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");

function load() {
  const window = {
    DB: {
      items: [],
      normal_personas: [],
      tokui_personas: [],
      egos: [],
      support_passives: [],
      death_passives: [],
      spirits: []
    }
  };
  const context = { window, console, module: { exports: {} } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "js/garasumado-roster-import.js" });
  return { api: { toDispatchActions: window.LBT_toDispatchActions }, window };
}

function personaManifest({ mode = "t", no = 30, source = "buy", cost } = {}) {
  const persona = { kind: "persona", name: "特異人格テスト", mode, no: String(no), ...(cost ? { price: cost } : {}) };
  const item = {
    key: "personas:特異人格テスト",
    group: "personas",
    name: "特異人格テスト",
    source,
    spends: [],
    via: [],
    needsAttribution: false,
    identityCandidates: [persona],
    candidates: [persona],
    picked: persona
  };
  return {
    item,
    manifest: { groups: [{ id: "personas", label: "所持人格", items: [item] }], scenarios: [] }
  };
}

test("Glass Window purchase imports preserve the selected persona mode and include an explicit cost", () => {
  const { api } = load();
  const { item, manifest } = personaManifest();
  const result = api.toDispatchActions(manifest, [item.key], {
    ownsPersona: true,
    purchaseCost: (kind, persona, context) => {
      assert.equal(kind, "persona");
      assert.equal(persona.mode, "t");
      assert.equal(context.ownsPersona, true);
      return { lp: 200, shards: 0 };
    }
  });

  assert.equal(result.actions.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.actions[0])),
    {
      type: "ADD_ROSTER",
      no: "30",
      mode: "t",
      via: [],
      source: "buy",
      purchase: true,
      historicalImport: true,
      cost: { lp: 200, shards: 0 }
    }
  );
});

test("Glass Window import never silently changes a persona with unknown mode into a normal persona", () => {
  const { api } = load();
  const { item, manifest } = personaManifest({ mode: undefined, source: "given" });
  item.picked.mode = undefined;
  item.identityCandidates[0].mode = undefined;
  item.candidates[0].mode = undefined;
  const result = api.toDispatchActions(manifest, [item.key], {});

  assert.equal(result.actions.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /通常／特異の人格種別を特定できません/);
});

test("a historical purchase without a resolvable price is not recorded as a free purchase", () => {
  const { api } = load();
  const { item, manifest } = personaManifest();
  const result = api.toDispatchActions(manifest, [item.key], {
    ownsPersona: false,
    purchaseCost: () => null
  });

  assert.equal(result.actions.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /価格を特定できません/);
});
