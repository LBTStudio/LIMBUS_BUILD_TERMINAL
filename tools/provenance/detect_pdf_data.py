#!/usr/bin/env python3
"""Single PDF detection entry point. Raw capture is NOT typed-data approval.

Full-source audits fail closed on unimplemented/ambiguous data. The pack-shop
scope is independently bounded by source table headings, never by DB contents.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from extract_pdf_corpus import ColumnEdges, page_lines, page_rules, page_verticals
from extract_pack_data import find_sections, next_section_page

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "core": ("新リンバスTRPG.pdf", 378, "23c1a091fc8e64deb23da7f0d29535586c32892b1daca8d4afed74250bbc3172"),
    "supplement": ("新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf", 177, "960f86e371d08491c220d6ad67db911387282db550451976a5202332615a8958"),
    "annex": ("[別冊] 新リンバスTRPG サプリメント 『アンロックド・シンク』 別冊.pdf", 630, "f7a5a4b7d6671124697ec7a51745f6a98837909e326093ac7d8010bd83d94c06"),
    "pack1": ("新リンバスTRPG-特定抽出パック第一弾.pdf", 244, "9225ce7460edac87a1286f74f7caaad1ce5f87a8b095dd61f124b02e8a06b0e2"),
}
SCHEMA_VERSION = 1
SPIRIT_FIELDS = {"常時発動": "always_effect", "士気低下効果": "morale_effect", "混乱効果": "confuse_effect"}
HEADERS = {"名称", "発動条件＆効果", "効果", "価格"}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def compact(value):
    # Punctuation, digits, operators and letter case remain significant.
    return re.sub(r"\s+", "", str(value))


def horizontal_segments(page):
    lines = set()
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "re" and item[1].height < 1.5 and item[1].width > 10:
                r = item[1]
                lines.add((round(r.x0, 2), round(r.x1, 2), round(r.y0, 2)))
            elif item[0] == "l":
                a, b = item[1:]
                if abs(a.y - b.y) < .5 and abs(a.x - b.x) > 10:
                    lines.add((round(min(a.x, b.x), 2), round(max(a.x, b.x), 2), round(a.y, 2)))
    return sorted(lines)


def boundaries_at(segments, x):
    # Thick/double borders describe one boundary, not multiple empty cells.
    result = []
    for y in sorted({y for left, right, y in segments if left < x < right}):
        if not result or y - result[-1] > 1.5:
            result.append(y)
    return result


def center(row):
    return (row["y0"] + row["y1"]) / 2


@dataclass
class Document:
    key: str
    filename: str
    sha256: str
    pages: list
    rules: list
    verticals: list
    segments: list
    sections: dict

    @classmethod
    def read(cls, key, path=None):
        filename, count, expected_hash = SOURCES[key]
        path = path or ROOT / "sources" / filename
        actual_hash = digest(path.read_bytes())
        if actual_hash != expected_hash:
            raise ValueError(f"source_hash_mismatch: {key}")
        with pymupdf.open(path) as pdf:
            if len(pdf) != count:
                raise ValueError(f"page_count_mismatch: {key}")
            pages = [page_lines(page) for page in pdf]
            rules = [page_rules(page) for page in pdf]
            verticals = [page_verticals(page) for page in pdf]
            segments = [horizontal_segments(page) for page in pdf]
            sections = find_sections(pdf)
            edges = ColumnEdges()
            for rows in pages:
                edges.observe(rows)
            for p, rows in enumerate(pages):
                for i, row in enumerate(rows):
                    row.update(id=f"{key}:{p + 1}:{i}", page=p,
                               frameRight=edges.edge_for(row, verticals[p]))
        return cls(key, filename, actual_hash, pages, rules, verticals, segments, sections)


def section_range(doc, name):
    start = doc.sections.get(name)
    if start is None:
        return []
    return list(range(start, next_section_page(doc.sections, start, len(doc.pages))))


def shop_ranges(doc):
    indexes = section_range(doc, "ショップ")
    headings = {}
    for p in indexes:
        for row in doc.pages[p]:
            if row["text"] in ("サポートパッシブ", "精神の種類"):
                headings.setdefault(row["text"], p)
    if set(headings) != {"サポートパッシブ", "精神の種類"}:
        raise ValueError(f"missing_shop_headings: {doc.key}")
    support, spirits = headings["サポートパッシブ"], headings["精神の種類"]
    if support >= spirits:
        raise ValueError("shop_heading_order")
    # This adapter's current contract is the two tables in pack1. Other shop
    # sections also contain enhancements and items; they stay unresolved.
    return {"support_passives": list(range(support, spirits)),
            "spirits": list(range(spirits, indexes[-1] + 1))}


def table_entries(doc, indexes, body_cell_count=2):
    """Record boundary = name-column border, NOT condition vocabulary.

    Centered names can straddle a border with the glyph bounding-box top.
    Their centers, including numeric-only name fragments, determine ownership.
    An unnamed cell at the next page top continues the preceding record.
    """
    entries = []
    for p in indexes:
        bounds = sorted({x for x, _, _ in doc.verticals[p]})
        if len(bounds) != 2:
            raise ValueError(f"ambiguous_table_columns: {doc.key}:{p + 1}: {bounds}")
        left, right = bounds
        rows = sorted(doc.pages[p], key=lambda r: (center(r), r["x0"]))
        name_rules = boundaries_at(doc.segments[p], left - 10)
        body_rules = boundaries_at(doc.segments[p], (left + right) / 2)
        if not name_rules or not body_rules:
            raise ValueError(f"missing_table_rules: {doc.key}:{p + 1}")
        groups = {}
        for row in rows:
            y = center(row)
            # Explicit table bounds exclude title/description/footer only.
            if not name_rules[0] <= y < name_rules[-1] or row["text"] in HEADERS:
                continue
            band = sum(boundary <= y for boundary in name_rules)
            groups.setdefault(band, []).append(row)
        for band, group in sorted(groups.items()):
            names = [r for r in group if r["x0"] < left]
            prices = [r for r in group if r["x0"] >= right]
            body = [r for r in group if left <= r["x0"] < right]
            continuing = not names and not prices
            if prices:
                entry = {"name_rows": names, "price_rows": prices, "cells": [], "rows": []}
                entries.append(entry)
            elif names and entries and not entries[-1]["name_rows"] and band == min(groups):
                # Condition + price can be on the preceding page while the
                # vertically centered name is on this page with the effect.
                entry = entries[-1]
                entry["name_rows"] = names
            elif continuing and entries and band == min(groups):
                entry = entries[-1]
            else:
                raise ValueError(f"orphan_table_continuation: {doc.key}:{p + 1}:{band}")
            entry["rows"].extend(group)
            cells = {}
            for row in body:
                cell = sum(y <= center(row) for y in body_rules)
                cells.setdefault(cell, []).append(row)
            for _, cell_rows in sorted(cells.items()):
                # A page-start continuation belongs to the previous body cell.
                if continuing and len(entry["cells"]) >= body_cell_count:
                    entry["cells"][-1].extend(cell_rows)
                else:
                    entry["cells"].append(cell_rows)
    if any(not e["name_rows"] or not e["price_rows"] for e in entries):
        raise ValueError(f"incomplete_table_record: {doc.key}")
    return entries


def evidence(rows):
    return [row["id"] for row in rows]


def joined(rows):
    # These table cells are prose; only explicit field labels split them.
    # Preserve all printed punctuation and spaces. Never guess missing text.
    return "".join(r["text"] for r in rows)


def shop_candidates(doc):
    candidates = []
    for kind, indexes in shop_ranges(doc).items():
        for entry in table_entries(doc, indexes, 2 if kind == "support_passives" else 1):
            price_text = compact(joined(entry["price_rows"]))
            unit = "LP" if kind == "support_passives" else "欠片"
            match = re.fullmatch(r"(\d+)" + unit, price_text)
            if not match:
                raise ValueError(f"invalid_price: {price_text}")
            record = {"name": joined(entry["name_rows"])}
            refs = {"name": evidence(entry["name_rows"])}
            transforms = {"name": "join-centered-name"}
            cells = entry["cells"]
            if kind == "support_passives":
                if len(cells) != 2:
                    raise ValueError(f"support_cell_count: {record['name']}: {len(cells)}")
                record.update(cond=joined(cells[0]), effect=joined(cells[1]), lp=int(match[1]))
                refs.update(cond=evidence(cells[0]), effect=evidence(cells[1]), lp=evidence(entry["price_rows"]))
                transforms.update(cond="join-cell", effect="join-cell", lp="price-LP")
            else:
                record.update(price=int(match[1]), **{field: "" for field in SPIRIT_FIELDS.values()})
                refs["price"] = evidence(entry["price_rows"])
                transforms["price"] = "price-欠片"
                field = None
                for row in [r for cell in cells for r in cell]:
                    label = re.match(r"^(常時発動|士気低下効果|混乱効果)[：:](.*)", row["text"])
                    if label:
                        field = SPIRIT_FIELDS[label[1]]
                        if field in refs:
                            raise ValueError(f"duplicate_spirit_field: {record['name']}/{field}")
                        record[field] = label[2]
                        refs[field] = [row["id"]]
                        transforms[field] = f"strip-label:{label[1]}"
                    elif field:
                        record[field] += row["text"]
                        refs[field].append(row["id"])
                    else:
                        raise ValueError(f"orphan_spirit_text: {row['id']}")
                if not record["morale_effect"] or not record["confuse_effect"]:
                    raise ValueError(f"incomplete_spirit: {record['name']}")
            pages = sorted({r["page"] + 1 for r in entry["rows"]})
            candidate = {"id": f"{doc.key}/{kind}/{entry['rows'][0]['id']}",
                         "kind": kind, "source": doc.key, "pages": pages,
                         "data": record, "fields": refs, "transforms": transforms,
                         "row_ids": evidence(entry["rows"])}
            candidates.append(candidate)
    return candidates


def validate_candidates(doc, candidates):
    """Round-trip every field and every source row, including short values.

    Candidate inventory is compared against independently rebuilt table cells.
    Deleting a candidate, its citations, or a one-character value must fail.
    """
    rows = {r["id"]: r for page in doc.pages for r in page}
    expected = {kind: table_entries(doc, indexes, 2 if kind == "support_passives" else 1)
                for kind, indexes in shop_ranges(doc).items()}
    issues = []
    for kind, entries in expected.items():
        actual = [c for c in candidates if c["kind"] == kind]
        if len(actual) != len(entries):
            issues.append({"code": "record_count", "kind": kind, "expected": len(entries), "actual": len(actual)})
        expected_rows = [r["id"] for e in entries for r in e["rows"]]
        actual_rows = [rid for c in actual for rid in c["row_ids"]]
        if sorted(expected_rows) != sorted(actual_rows):
            issues.append({"code": "row_coverage", "kind": kind})
    names = set()
    for candidate in candidates:
        path = candidate["id"]
        name_key = (candidate["kind"], candidate["data"]["name"])
        if name_key in names:
            issues.append({"code": "duplicate_name", "path": path})
        names.add(name_key)
        covered = []
        for field, refs in candidate["fields"].items():
            covered.extend(refs)
            if not refs or any(r not in rows for r in refs):
                issues.append({"code": "invalid_citation", "path": path, "field": field})
                continue
            source = joined([rows[r] for r in refs])
            transform = candidate["transforms"][field]
            if transform.startswith("price-"):
                match = re.fullmatch(r"(\d+)" + re.escape(transform[6:]), compact(source))
                value = int(match[1]) if match else None
            elif transform.startswith("strip-label:"):
                value = re.sub(r"^" + re.escape(transform.split(":", 1)[1]) + r"[：:]", "", source, count=1)
            elif transform in ("join-cell", "join-centered-name"):
                value = source
            else:
                issues.append({"code": "unknown_transform", "path": path, "field": field})
                continue
            if candidate["data"].get(field) != value:
                issues.append({"code": "field_roundtrip", "path": path, "field": field})
        if sorted(covered) != sorted(candidate["row_ids"]):
            issues.append({"code": "field_coverage", "path": path})
        for field, value in candidate["data"].items():
            if value != "" and field not in candidate["fields"]:
                issues.append({"code": "uncited_field", "path": path, "field": field})
    return issues


def plan_registration(db, candidates):
    """Pure, idempotent import plan: never overwrite a name collision."""
    import copy
    result = copy.deepcopy(db)
    changes, issues = [], []
    for candidate in candidates:
        kind, incoming = candidate["kind"], candidate["data"]
        if kind not in ("support_passives", "spirits"):
            issues.append({"code": "unsupported_registration", "path": candidate["id"]})
            continue
        matches = [r for r in result.get(kind, []) if r.get("name") == incoming["name"]]
        if len(matches) > 1 or (matches and matches[0] != incoming):
            issues.append({"code": "db_conflict", "path": candidate["id"], "name": incoming["name"]})
        elif not matches:
            result.setdefault(kind, []).append(copy.deepcopy(incoming))
            changes.append({"kind": kind, "name": incoming["name"], "source": candidate["source"], "pages": candidate["pages"]})
    return result, changes, issues


def safe_path(path):
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(ROOT) or resolved == ROOT:
        raise ValueError("output_path_outside_workspace")
    if not resolved.parent.is_dir():
        raise ValueError(f"output_parent_missing: {resolved.parent}")
    return resolved


def atomic_json(path, value, indent=1):
    import os
    import tempfile
    path = safe_path(path)
    text = json.dumps(value, ensure_ascii=False, indent=indent) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if Path(temporary).exists():
            Path(temporary).unlink()


def source_inventory(documents, candidates):
    """Account for every page. Unowned text remains unresolved, not discarded.

    This deliberately over-reports narrative pages until their exclusion is
    reviewed. A raw archive is not proof that all rules have been structured.
    """
    owned = {rid for c in candidates for rid in c["row_ids"]}
    pages = []
    for doc in documents:
        section = "unclassified"
        titles = {p: title for title, p in doc.sections.items()}
        for p, rows in enumerate(doc.pages):
            section = titles.get(p, section)
            pending = [r["id"] for r in rows if r["id"] not in owned]
            pages.append({"source": doc.key, "page": p + 1, "section": section,
                          "rows": len(rows), "mapped_rows": len(rows) - len(pending),
                          "unresolved_rows": len(pending),
                          "status": "empty_page_review" if not rows else "unresolved" if pending else "mapped"})
    return pages


def ledger_content_digest(documents, candidates):
    h = hashlib.sha256()
    for doc in documents:
        h.update(json_text([doc.key, doc.sha256, doc.sections]).encode())
        for p, rows in enumerate(doc.pages):
            h.update(json_text([p, rows, doc.segments[p], doc.verticals[p]]).encode())
    h.update(json_text(candidates).encode())
    return h.hexdigest()


def write_ledger(path, documents, candidates, inventory):
    """Atomically replace an evidence database, not the application's database."""
    import os
    import tempfile
    path = safe_path(path)
    fd, temp = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    os.close(fd)
    try:
        with sqlite3.connect(temp) as conn:
            conn.execute("PRAGMA foreign_keys=ON")
            conn.executescript("""
                CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE sources(id TEXT PRIMARY KEY, filename TEXT NOT NULL, sha256 TEXT NOT NULL, pages INTEGER NOT NULL);
                CREATE TABLE pages(source TEXT REFERENCES sources(id), page INTEGER, status TEXT NOT NULL, section TEXT NOT NULL,
                    geometry TEXT NOT NULL, PRIMARY KEY(source,page));
                CREATE TABLE lines(id TEXT PRIMARY KEY, source TEXT, page INTEGER, text TEXT NOT NULL, geometry TEXT NOT NULL,
                    FOREIGN KEY(source,page) REFERENCES pages(source,page));
                CREATE TABLE candidates(id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT REFERENCES sources(id), data TEXT NOT NULL);
                CREATE TABLE evidence(candidate TEXT REFERENCES candidates(id), field TEXT, position INTEGER,
                    line TEXT REFERENCES lines(id), transform TEXT NOT NULL, PRIMARY KEY(candidate,field,position));
            """)
            conn.executemany("INSERT INTO metadata VALUES (?,?)", [
                ("schema_version", str(SCHEMA_VERSION)), ("pymupdf", pymupdf.__version__),
                ("content_sha256", ledger_content_digest(documents, candidates)),
                ("notice", "Raw capture is not full typed-data approval")])
            page_lookup = {(p["source"], p["page"]): p for p in inventory}
            for doc in documents:
                conn.execute("INSERT INTO sources VALUES (?,?,?,?)", (doc.key, doc.filename, doc.sha256, len(doc.pages)))
                for p, rows in enumerate(doc.pages):
                    summary = page_lookup[(doc.key, p + 1)]
                    geometry = {"horizontal": doc.segments[p], "vertical": doc.verticals[p]}
                    conn.execute("INSERT INTO pages VALUES (?,?,?,?,?)",
                                 (doc.key, p + 1, summary["status"], summary["section"], json_text(geometry)))
                    conn.executemany("INSERT INTO lines VALUES (?,?,?,?,?)", [
                        (r["id"], doc.key, p + 1, r["text"], json_text(r)) for r in rows])
            for candidate in candidates:
                conn.execute("INSERT INTO candidates VALUES (?,?,?,?)",
                             (candidate["id"], candidate["kind"], candidate["source"], json_text(candidate["data"])))
                for field, ids in candidate["fields"].items():
                    conn.executemany("INSERT INTO evidence VALUES (?,?,?,?,?)", [
                        (candidate["id"], field, n, rid, candidate["transforms"][field]) for n, rid in enumerate(ids)])
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or conn.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("ledger_integrity_failure")
            if conn.execute("SELECT count(*) FROM lines").fetchone()[0] != sum(len(r) for d in documents for r in d.pages):
                raise ValueError("ledger_row_count_failure")
        os.replace(temp, path)
    finally:
        if Path(temp).exists():
            Path(temp).unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("all", "pack-shop"), default="all")
    parser.add_argument("--write-ledger", action="store_true", help="write raw evidence SQLite; this does not approve unresolved data")
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--write-db", action="store_true", help="register only if every in-scope validation succeeds")
    parser.add_argument("--check-db", action="store_true", help="require all in-scope records to be present and identical")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    documents = [Document.read(key) for key in (SOURCES if args.scope == "all" else ["pack1"])]
    pack = next(d for d in documents if d.key == "pack1")
    candidates = shop_candidates(pack)
    issues = validate_candidates(pack, candidates)
    inventory = source_inventory(documents, candidates)
    if args.scope == "all":
        # Until all page dispositions/adapters are reviewed, a full-source
        # invocation must fail even when the supported table scope is healthy.
        for page in inventory:
            if page["status"] != "mapped":
                issues.append({"code": "unresolved_page", **page})
    db_path = ROOT / "data" / "db.json"
    db = json.loads(db_path.read_text(encoding="utf-8"))
    result, changes, conflicts = plan_registration(db, candidates)
    issues.extend(conflicts)
    if args.check_db and changes:
        issues.extend({"code": "db_missing", **change} for change in changes)
    report = {
        "schema_version": SCHEMA_VERSION, "scope": args.scope,
        "goal_complete": args.scope == "all" and not issues,
        "scope_passed": not issues, "pymupdf": pymupdf.__version__,
        "sources": [{"key": d.key, "filename": d.filename, "sha256": d.sha256,
                     "pages": len(d.pages), "rows": sum(map(len, d.pages))} for d in documents],
        "candidate_counts": {k: sum(c["kind"] == k for c in candidates) for k in shop_ranges(pack)},
        "candidate_sha256": digest(json_text(candidates).encode()),
        "ledger_content_sha256": ledger_content_digest(documents, candidates),
        "registration_changes": changes, "issues": issues,
    }
    if args.write_ledger:
        write_ledger(ROOT / "data" / "provenance" / f"{args.scope}-ledger.sqlite", documents, candidates, inventory)
    if args.write_db and not issues:
        atomic_json(db_path, result)
    if args.write_report:
        atomic_json(ROOT / "data" / "provenance" / f"{args.scope}-audit.json", report)
        if args.scope == "pack-shop":
            cited = {rid for c in candidates for rid in c["row_ids"]}
            atomic_json(ROOT / "data" / "provenance" / "pack1-shop.json", {
                "source": report["sources"][0], "candidates": candidates,
                "lines": [r for page in pack.pages for r in page if r["id"] in cited]})
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    else:
        print(f"scope={args.scope}; scope_passed={not issues}; goal_complete={report['goal_complete']}")
        print(f"sources={len(documents)} pages={sum(len(d.pages) for d in documents)} rows={sum(len(r) for d in documents for r in d.pages)}")
        print(f"candidates={report['candidate_counts']} pending_registration={len(changes)} issues={len(issues)}")
        for issue in issues[:8]:
            print(json_text(issue))
    return 1 if issues else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, sqlite3.Error) as error:
        print(json.dumps({"scope_passed": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
