import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const start = source.indexOf("const SupportSection =");
const end = source.indexOf("const EGO_RANKS =", start);
assert.ok(start >= 0 && end > start, "SupportSection source should be present");
const component = source.slice(start, end);

test("support passives explain that a second click/tap equips the selected item", () => {
  assert.match(component, /const \[selectedSlotType, setSelectedSlotType\] = React\.useState\(null\)/);
  assert.match(component, /const \[equipHintShown, setEquipHintShown\] = React\.useState\(false\)/);
  assert.match(component, /もう一度クリック／タップすると装備できます/);
  assert.match(component, /selectedSlotType === slotType/);
  assert.match(component, /if \(isSameSelected\) \{\s*tryEquip\(s, slotType\)/);
  assert.match(component, /onClick: \(\) => handleSupportItemClick\(s, slotType\)/);
  assert.match(component, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.doesNotMatch(component, /onDoubleClick: \(\) => tryEquip\(s, slotType\)/);
  assert.match(component, /同じカードをもう一度クリック／タップするか、詳細の装備ボタンを押してください。/);
});
