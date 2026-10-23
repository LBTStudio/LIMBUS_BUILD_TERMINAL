import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditPersonaKeywords, detectPersonaKeywordCandidates, loadPersonaDb } from "../tools/persona-keyword-audit.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const db = loadPersonaDb();
const personas = [...db.normal_personas, ...db.tokui_personas];

test("smoke detector finds concrete operations and conditions rather than name-only mentions", () => {
  const expected = [
    ["normal", 18, "笑う顔たち"],
    ["normal", 92, "ヴィリーブ工房フィクサーA"],
    ["normal", 93, "ヴィリーブ工房フィクサーB"],
    ["normal", 117, "歯車の教団信者"]
  ];
  for (const [mode, no, name] of expected) {
    const pool = mode === "normal" ? db.normal_personas : db.tokui_personas;
    const persona = pool.find((entry) => entry.no === no && entry.name === name);
    assert.ok(persona, "fixture exists: " + name);
    assert.ok(detectPersonaKeywordCandidates(persona).has("煙"), "detector should identify smoke operations for " + name);
    assert.ok(persona.keywords.includes("煙"), "reviewed smoke tag is explicitly present for " + name);
  }
});

test("a broad random-status mention is not expanded into five unsupported tags", () => {
  const persona = {
    passive_effect: "ランダムで火傷・出血・振動・破裂・沈潜のうちランダムに1種を2付与する",
    keywords: []
  };
  const detected = detectPersonaKeywordCandidates(persona);
  for (const keyword of ["火傷", "出血", "振動", "破裂", "沈潜"]) {
    assert.equal(detected.has(keyword), false, "random-list mention must not auto-classify " + keyword);
  }
  assert.deepEqual(persona.keywords, [], "detector must never mutate source tags");
});

test("an explicit repeated-status relationship is surfaced as a candidate without mutating tags", () => {
  const persona = { skills: [{ effect: "対象の煙2ごとにダメージ量+1", dice: [] }], keywords: [] };
  const detected = detectPersonaKeywordCandidates(persona);
  assert.ok(detected.has("煙"));
  assert.equal(persona.keywords.length, 0);
  assert.ok(detected.get("煙")[0].excerpt.includes("煙"));
});

test("audit distinguishes uncovered candidates from tagged rows lacking strong text evidence", () => {
  const report = auditPersonaKeywords(db);
  assert.equal(report.personaCount, personas.length);
  assert.equal(report.byKeyword["煙"].tagged, 4);
  assert.equal(report.missingTagCandidates.some((row) => row.keyword === "煙"), false);
  assert.ok(Array.isArray(report.taggedWithoutStrongEvidence));
});

test("filter UI does not truncate tags and exposes OR/AND and affiliation controls", () => {
  const codex = readFileSync(resolve(ROOT, "js/PersonaCodex.js"), "utf8");
  assert.doesNotMatch(codex, /allKws\.slice\(0,\s*PDF_KEYWORD_ORDER\.length\)/);
  assert.match(codex, /ui\.filterMatch === "all"/);
  assert.match(codex, /いずれか一致/);
  assert.match(codex, /すべて一致/);
  assert.match(codex, /affiliations\.map\(\(aff\)/);
  assert.match(codex, /countKeywordInPool\(k\)/);
  assert.match(codex, /ui\.rosterBuildFilter !== "all"/);
  assert.match(codex, /rosterBuildFilter: "all"/);
});