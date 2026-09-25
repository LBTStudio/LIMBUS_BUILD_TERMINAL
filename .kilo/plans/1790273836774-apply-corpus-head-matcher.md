# apply-corpus-updates: fix remaining 42 head-not-found failures

## Context

`tools/provenance/apply-corpus-updates.mjs` rewrites DB text fields from the
paragraph corpus (`data/provenance/*.paragraphs.txt`). It currently resolves
150/192 targets; **42 remain `head-not-found`**. All 42 are `head-not-found`
(0 `block-not-found`).

State: working tree is byte-identical to HEAD `f2019ab` on
`kilo/morning-finch-bob`. `origin/errata-v65r67-source-update` is an open PR
awaiting merge to `main` and touches only `data/db.json` (no corpus files) —
verified irrelevant to this task.

## Verified root cause (one, not two or three)

`findMatchingParagraph` anchors on a 30→10 char exact `canon()` prefix of the
DB text. Where the DB head and the corpus differ in the first ~8 characters,
every needle length fails at once. Verified patterns (DB → corpus):

| DB | corpus |
|----|--------|
| `矢-死を4得る` | `矢-死4を得る` (`を4`↔`4を`) |
| `的中時、振動を2付与` | `的中時、振動2を付与` |
| `的中時出血1を付与` | `的中時出血1を付与` (identical) — short text, falls below min len |
| `クイックを1得る` | `クイック1を得る` |
| `回避成功時呼吸1獲得` | `回避成功時呼吸1を得る` |
| `的中時破裂2付与` | `的中時破裂2を付与` |
| `過半数的中時充電を5得る` | `過半数的中時充電5を得る` |
| `使用時高揚を1得る` | `使用時高揚1を得る` |
| `戦闘開始時メインターゲットの出血の数が10以上なら` | identical |
| `R開始時HP最大値-10` | `R開始時HP最大値と現在HPが10減少` (genuine content change) |

These are real errata-driven wording differences, not extraction bugs. The
corpus is authoritative, so the fix is to *locate the DB text inside the block
with a fuzzy head*, then return the corpus span between the fuzzy head and the
tail anchor — letting the corpus wording overwrite the DB wording.

**Cause A (fake `の人格` heading) was investigated and REJECTED**: the buff
definitions are written `[ラ・マンチャランド 理髪師の人格専用効果]` (opening
bracket `[`, not `「`), so the boundary regex `/「[^」\n]*の人格」/g` never
matches them. Confirmed: 理髪師 block is 1175 chars ending at the next real
persona heading. No regex change needed.

**Cause B (multi-tier buff spanning heading boundary) was REJECTED**: the
Ⅰ/Ⅱ/Ⅲ buff tiers all sit inside the correctly-sized block. No block-extension
needed.

## Design

Replace the single-needle head loop in `findMatchingParagraph` with a
**progressive fuzzy head anchor**:

1. `core = canonDb` (the full DB canon text).
2. For `headLen` from `min(core.length, 40)` down to `8`:
   - `head = core.slice(0, headLen)`.
   - `idx = canonBlock.indexOf(head)`. If `idx >= 0`, accept as the head anchor.
   - Else, try `head` with one leading particle stripped from
     `{の,を,は,が,に,で,と,や,も,へ,か,だ}` and/or one trailing particle from
     `{る,た,ます,です,だ,である}`. If a stripped variant is found, accept it
     and record `headLag` (chars skipped at the DB head) so the raw offset
     mapping accounts for them.
3. Minimum accepted head length stays at 8; if nothing matches, return
   `{ found: false }` (same failure signal as today).
4. Keep the existing tail-anchor (`lastIndexOf` on the DB tail) and the
   existing paragraph→raw offset mapping unchanged.

Safety limits:
- Only strip ≤2 chars total (one leading + one trailing particle).
- Never fall back to unanchored substring search — that would risk mapping a
  DB fragment onto an unrelated persona's text.
- The returned span is always `canonBlock[headIdx .. tailIdx]`, so the corpus
  wording (authoritative) overwrites the DB wording. No invented content.

## Files to change

- `tools/provenance/apply-corpus-updates.mjs` — `findMatchingParagraph`
  head-anchor loop only. No other function changes.

## Files to add (diagnostics only, no DB change)

- `tools/provenance/_headpat.mjs` — head-drift pattern diagnostic (already
  present).

## Validation

1. `node tools/provenance/apply-corpus-updates.mjs` (dry-run) → expect
   `抽出失敗: 0件`, `更新対象: 192件`.
2. `node tools/provenance/apply-corpus-updates.mjs --write` → DB updated.
3. Re-run audit (dry-run re-runs `auditPersonas`) → expect 0 missing + 0
   truncated.
4. `node tests/db-provenance.test.mjs` must still pass.
5. `git diff --stat data/db.json` reviewed by hand; every changed value must be
   a wording variant of the corpus text (no invented content).

## Out of scope

- No DB writes until all 42 resolve and tests pass.
- No branch creation; work on `kilo/morning-finch-bob`, PR to `main`.
- No changes to `db-provenance.mjs` (the audit logic); this task is confined to
  the update tool.