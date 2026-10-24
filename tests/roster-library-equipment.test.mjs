import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(ROOT, "js/OtherSections.js"), "utf8");
const helperNames = [
  "getRosterLibraryTypePresentation",
  "getRosterLibraryEquipAction",
  "getRosterLibraryEquipBlockReason"
];
const context = vm.createContext({});
const helperSource = helperNames.map((name) => {
  const pattern = new RegExp("^function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}", "m");
  const match = source.match(pattern);
  assert.ok(match, "missing helper: " + name);
  return match[0];
}).join("\n\n");
vm.runInContext(helperSource, context);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("record details use labels appropriate to all four equipment types", () => {
  assert.equal(context.getRosterLibraryTypePresentation("personas").equipLabel, "この人格を装備する");
  assert.equal(context.getRosterLibraryTypePresentation("egos").equipLabel, "このE.G.Oを装備する");
  assert.equal(context.getRosterLibraryTypePresentation("supports").equipLabel, "このサポートパッシブを装備する");
  assert.equal(context.getRosterLibraryTypePresentation("spirits").equipLabel, "この精神を装備する");
  assert.equal(context.getRosterLibraryTypePresentation("supports").detailTitle, "SUPPORT PASSIVE DETAIL / サポートパッシブ");
  assert.equal(context.getRosterLibraryTypePresentation("unknown"), null);
});

test("record equipment maps each library type to its dedicated reducer action", () => {
  const src = { name: "sample" };
  assert.deepEqual(plain(context.getRosterLibraryEquipAction({ type: "personas", entry: { uid: "p1", mode: "n", no: 1 }, src })), {
    type: "EQUIP_PERSONA", mode: "n", no: 1, src
  });
  assert.deepEqual(plain(context.getRosterLibraryEquipAction({ type: "egos", entry: { uid: "e1", rank: "HE" }, src })), {
    type: "SET_EGO_SLOT", rank: "HE", value: src
  });
  assert.deepEqual(plain(context.getRosterLibraryEquipAction({ type: "supports", entry: { uid: "s1" }, src })), {
    type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: "s1", equipped: true
  });
  assert.deepEqual(plain(context.getRosterLibraryEquipAction({ type: "spirits", entry: { uid: "sp1" }, src })), {
    type: "SET_ROSTER_SPIRIT_EQUIPPED", uid: "sp1", equipped: true
  });
  assert.equal(context.getRosterLibraryEquipAction({ type: "supports", entry: {} }), null);
  assert.equal(context.getRosterLibraryEquipAction({ type: "items", entry: { uid: "i1" } }), null);
});

test("record equipment allows normal-slot replacement and still enforces death-only unlock", () => {
  const normal = { type: "supports", entry: { uid: "s1", slot: "normal" } };
  const death = { type: "supports", entry: { uid: "s2", slot: "death" } };
  // Full normal slots are replaced by the reducer; the UI must not block the request.
  assert.equal(context.getRosterLibraryEquipBlockReason(normal, { supports: [{}, {}] }, []), null);
  assert.equal(context.getRosterLibraryEquipBlockReason(normal, { supports: [{}] }, []), null);
  assert.equal(context.getRosterLibraryEquipBlockReason(normal, { supports: [{}, {}, {}] }, [{ name: "サポートスロット追加" }]), null);
  // Death-only passives still require their dedicated enhancement.
  assert.equal(context.getRosterLibraryEquipBlockReason(death, { supports: [] }, []), "死亡後専用スロットが未開放です");
  assert.equal(context.getRosterLibraryEquipBlockReason(death, { supports: [] }, [{ name: "死亡後パッシブ追加" }]), null);
  assert.equal(context.getRosterLibraryEquipBlockReason({ type: "egos", entry: {} }, { supports: [] }, []), null);
});

test("support and spirit rows track the actual equipped state and use type-specific presentation/actions", () => {
  assert.match(source, /equipped: entry\.equipped === true\s*\|\|\s*\(state\.supports \|\| \[\]\)\.some/);
  assert.match(source, /case "supports":\s*return \{ type: "SET_ROSTER_SUPPORT_EQUIPPED"/);
  assert.match(source, /case "spirits":\s*return \{ type: "SET_ROSTER_SPIRIT_EQUIPPED"/);
  assert.match(source, /presentation\.equipLabel/);
  assert.doesNotMatch(source, /item\.type === "personas" \? "この人格を装備する" : "このE\.G\.Oを装備する"/);
  assert.doesNotMatch(source, /toast\("この種類の項目は装備できません",\s*"assertive"\)/);
  const equipStart = source.indexOf("const equipItem = (item) => {");
  const equipEnd = source.indexOf("\n    /* 既存アカウント向け。", equipStart);
  const equipHandler = source.slice(equipStart, equipEnd);
  assert.ok(equipStart >= 0 && equipEnd > equipStart, "record equipment handler exists");
  assert.doesNotMatch(equipHandler, /toast\("この種類の項目は装備できません",\s*"assertive"\)/);
  assert.doesNotMatch(equipHandler, /toast\(blockReason,\s*"assertive"\)/);
});
