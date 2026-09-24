# apply-corpus-updates head-matcher plan

## Context

`tools/provenance/apply-corpus-updates.mjs` maps 192 DB text fragments (190
missing + 2 truncated, detected by `auditPersonas`) onto the paragraph corpus
(`data/provenance/*.paragraphs.txt`) and rewrites DB fields with the canonical
text. 150/192 already resolve; **42 remain `head-not-found`**.

The 42 fall into two distinct root causes. Both are *block-boundary* problems,
not head-matching problems.

## Root cause A — block cut short by a fake `の人格` heading (28 of 42)

`findPersonaBlock` ends a persona block at the next match of
`/「[^」\n]*の人格」/`. Persona **buff definitions** are written on the source
page as `[ラ・マンチャランド 理髪師の人格専用効果]`, `[ラ・マンチャランド 神父の人格専用効果]`,
`[ラ・マンチャランド 姫の人格専用効果]`. These contain the substring `の人格` and
therefore match the heading regex, truncating the block *before* the buff
definition text that the DB holds. Confirmed on 理髪師/神父/姫/王子
(`blockEnd` lands exactly on the `専用効果` line).

Fix: exclude the 専用効果 pattern from the block-boundary regex, e.g.
`/「(?![^」\n]*専用効果)[^」\n]*の人格」/g`.

## Root cause B — persona block ends at the next persona heading, dropping
## trailing buff/skill text that belongs to the current persona (14 of 42)

The 3 ラ・マンチャランド buffs are multi-tier (`Ⅰ/Ⅱ/Ⅲ`) and their definitions
span the boundary to the next persona's heading. The DB `desc` is a concatenation
of all three tiers; the corpus block stops at tier Ⅰ. Same mechanism affects
other multi-paragraph persona fields.

Fix: after locating the block end, scan backward from the boundary for
continuation lines that are part of the current persona's buff/skill definition
(not a new `「...の人格」` heading) and extend `end` to include them.

## Root cause C — DB/corpus wording drift (covers the rest)

Even when the block is correct, `findMatchingParagraph`'s 30-char exact prefix
needle fails on small linguistic differences:

- `矢-死を4得る` (DB) vs `矢-死4を得る` (corpus) — particle `を` relocated
- `的中時` (DB) vs `中時` (corpus) — `的` dropped
- `を1得る` (DB) vs `1を` (corpus) — number/particle swap
- `回避成功時` vs `避成功時`
- `クイックを1得る` vs `クイック1を得る`

Fix: replace the single 30-char needle with a **progressive fuzzy head match**:
strip a small set of leading/trailing particles (`の`, `を`, `は`, `が`, `に`,
`で`, `と`, `や`, `も`, `や`, `ら`, `へ`, `か`, `の`, `や`, `だ`, `である`,
`ます`, `た`, `る`) from both the DB head and the corpus candidate, then take
the longest match; fall back to the existing 10-char minimum. Keep the existing
tail-anchor logic unchanged.

## Files to change

- `tools/provenance/apply-corpus-updates.mjs` — `findNextPersonaHeading`,
  `findPersonaBlock`, `findMatchingParagraph`.

## Files to add (no DB change)

- `tools/provenance/_blockdiag.mjs` — diagnostic (already present, keep).

## Validation

1. `node tools/provenance/apply-corpus-updates.mjs` (dry-run) → expect
   `抽出失敗: 0件`, `更新対象: 192件`.
2. `node tools/provenance/apply-corpus-updates.mjs --write` → DB updated.
3. Re-run `auditPersonas` → expect 0 missing + 0 truncated.
4. `node tests/db-provenance.test.mjs` must still pass.
5. `git diff --stat data/db.json` reviewed by hand; only intended text fields
   change.

## Out of scope

- No DB writes until all 42 resolve and tests pass.
- No branch creation; work on `kilo/morning-finch-bob`, PR to `main`.