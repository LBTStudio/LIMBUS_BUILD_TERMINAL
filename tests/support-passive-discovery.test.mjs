import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/sections.css", import.meta.url), "utf8");
const start = source.indexOf("const SupportSection =");
const end = source.indexOf("const EGO_RANKS =", start);
assert.ok(start >= 0 && end > start, "SupportSection source should be present");
const component = source.slice(start, end);

test("every support passive click/tap shows a nearby hint; the next click equips", () => {
  assert.match(component, /const \[selectedSlotType, setSelectedSlotType\] = React\.useState\(null\)/);
  assert.match(component, /const \[supportEquipHint, setSupportEquipHint\] = React\.useState\(null\)/);
  assert.doesNotMatch(component, /equipHintShown/);
  assert.match(component, /getBoundingClientRect\?\.\(\)/);
  assert.match(component, /const hasPointerPoint = Number\.isFinite\(event\?\.clientX\)/);
  assert.match(component, /const maxLeft = Math\.max\(12, viewportWidth - 252\)/);
  assert.match(component, /setSupportEquipHint\(/);
  assert.match(component, /showSupportEquipHint\(event, result\.message, result\.ok \? "success" : "hint"\)/);
  assert.match(component, /もう一度クリック／タップで装備！/);
  assert.match(component, /すでに装備中だよ！/);
  assert.match(component, /onClick: \(event\) => handleSupportItemClick\(s, slotType, event\)/);
  assert.match(component, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(component, /support-equip-pop/);
  assert.match(component, /role: "status"/);
  assert.doesNotMatch(component, /toast\("もう一度クリック／タップ/);
  assert.match(component, /選択中のカードをもう一度クリック／タップするか、詳細の装備ボタンを押してください。/);
});

test("owned-only catalogue keeps death-only passives out of normal-slot candidates", () => {
  assert.match(component, /const supportCatalog = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot !== "death"\) : DB\.support_passives;/);
  assert.match(component, /const deathCatalogSource = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot === "death"\) : DB\.death_passives;/);
});

test("support passive pop stays near the tap, fits mobile widths, and respects reduced-motion", () => {
  assert.match(css, /\.support-equip-pop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /max-width:\s*min\(240px, calc\(100vw - 24px\)\)/);
  assert.match(css, /@media \(max-width: 640px\)\s*\{\s*\.support-equip-pop/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.support-equip-pop\s*\{\s*animation:\s*none/s);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /@keyframes support-equip-pop-in/);
});