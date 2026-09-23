# Errata Latest Edition Source Update (V65r67)

## Summary

Adopted the Errata latest editions (エラッタ最新版) as canonical sources for the LIMBUS_BUILD_TERMINAL provenance system. The three core PDFs were replaced with their updated versions, and all dependent tooling and corpus data were regenerated accordingly.

## Changes

### 1. Source PDFs (new canonical)
- `sources/エラッタ最新版/新リンバスTRPG.pdf` (378 pages)
- `sources/エラッタ最新版/新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf` (177 pages)
- `sources/エラッタ最新版/新リンバスTRPG-特定抽出パック第一弾.pdf` (248 pages, +4 from previous)

Old tracked PDFs retained at `sources/*.pdf` for reference.

### 2. Provenance tooling
- `tools/provenance/detect_pdf_data.py`: Updated `SOURCES` dictionary with new SHA256 digests and page counts.
- `tools/provenance/extract_pdf_corpus.py`: Updated `TARGETS` to point at the new errata PDFs.

### 3. Corpus data (regenerated)
- `data/provenance/core.txt`, `core.paragraphs.txt`
- `data/provenance/supplement.txt`, `supplement.paragraphs.txt`
- `data/provenance/pack1.txt`, `pack1.paragraphs.txt`

## Findings

### Content differences detected (215 DB-text mismatches)
- Persona naming: 「所属」→「鏡世界」, 「の世界」 suffix added
- Timing marker renames: 「R終了時」→「復帰時」, etc.
- Text edits: 「敵の」 removal, 「所属：XX」 annotations added
- Pack1 shop section expanded: pages 225-228 added (身体強化, E.G.O精神, 特殊E.G.O)

### Known limitations
- `ambiguous_table_columns: pack1:226` — new shop pages not yet parsed by the existing `shop_ranges()` adapter. Recorded as a gap, not silently skipped.
- 5 provenance tests fail due to corpus changes (data issue, not code defect).

### Test results
- `node --test "tests/*.test.mjs"`: 242 pass, 5 fail, 0 skip
- The 5 failures are expected given the corpus update; they will resolve once DB entries are aligned with the new errata text.

## Scope
- No DB (`data/db.json`) modifications in this PR.
- No test deletions or refactoring.
- Provenance metadata integrity preserved.
- No PDFs deleted.