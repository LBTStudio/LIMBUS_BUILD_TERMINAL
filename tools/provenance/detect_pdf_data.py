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


def table_entries(doc, indexes):
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
            if names or prices:
                if not names or not prices:
                    raise ValueError(f"incomplete_table_record: {doc.key}:{p + 1}:{band}")
                entry = {"name_rows": names, "price_rows": prices, "cells": [], "rows": []}
                entries.append(entry)
            elif entries:
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
                if not names and entry["cells"]:
                    entry["cells"][-1].extend(cell_rows)
                else:
                    entry["cells"].append(cell_rows)
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
        for entry in table_entries(doc, indexes):
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
    expected = {kind: table_entries(doc, indexes) for kind, indexes in shop_ranges(doc).items()}
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
