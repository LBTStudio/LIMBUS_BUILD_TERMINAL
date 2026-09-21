#!/usr/bin/env python3
"""Three-book audit. Never equate a partial/text-only check with full approval.

Source tables are detected independently of db.json. This report is read-only;
repairs require review. References retain original row IDs, pages and values.
"""
import argparse
import json
import re
import unicodedata
from collections import Counter

from detect_pdf_data import (ROOT, Document, atomic_json, boundaries_at, center,
                             joined, section_range, evidence, SPIRIT_FIELDS, shop_candidates)
from extract_pack_data import collect_persona_pages, parse_persona, collect_egos, join_wrapped, DICE_RE

BOOKS = ("core", "supplement", "pack1")
TABLE_HEADINGS = {"アイテム", "サポートパッシブ", "精神の種類", "身体強化", "死亡後パッシブ"}
TABLE_LABELS = {"名称", "効果", "価格", "発動条件＆効果", "特殊アイテム", "回復アイテム", "強化アイテム"}


def norm(value):
    # Formatting only: signs, digits, brackets and lexical content remain.
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value if value is not None else ""))).replace("×", "x")


def name_key(value):
    return norm(value).replace("・", "").replace("：", ":")


def ranges(doc):
    pages = section_range(doc, "ショップ")
    headings = sorted((p, r["text"]) for p in pages for r in doc.pages[p] if r["text"] in TABLE_HEADINGS)
    result = {}
    for at, (p, title) in enumerate(headings):
        kind = {"アイテム": "items", "サポートパッシブ": "support_passives", "精神の種類": "spirits"}.get(title)
        if kind:
            end = headings[at + 1][0] if at + 1 < len(headings) else pages[-1] + 1
            result[kind] = list(range(p, end))
    return result


def tables(doc, indexes):
    """Name-column borders own records. Internal body columns own clauses."""
    entries = []
    for p in indexes:
        xs = sorted({x for x, _, _ in doc.verticals[p]})
        if len(xs) < 2:
            raise ValueError(f"missing_columns:{doc.key}:{p + 1}")
        left, right = xs[0], xs[-1]
        nb = boundaries_at(doc.segments[p], left - 10)
        bb = boundaries_at(doc.segments[p], left + 2)
        if not nb or not bb:
            raise ValueError(f"missing_borders:{doc.key}:{p + 1}")
        groups = {}
        for r in sorted(doc.pages[p], key=lambda r: (center(r), r["x0"])):
            if r["text"] in TABLE_LABELS or r["text"] in TABLE_HEADINGS:
                continue
            if nb[0] <= center(r) < nb[-1]:
                groups.setdefault(sum(y <= center(r) for y in nb), []).append(r)
        for band, rows in sorted(groups.items()):
            names = [r for r in rows if r["x0"] < left]
            prices = [r for r in rows if r["x0"] >= right]
            body = [r for r in rows if left <= r["x0"] < right]
            if prices:
                entry = {"name": names, "price": prices, "cells": [], "rows": []}
                entries.append(entry)
            elif entries and band == min(groups):
                entry = entries[-1]
                if names:
                    if entry["name"]:
                        raise ValueError(f"ambiguous_continuation:{doc.key}:{p+1}")
                    entry["name"] = names
            else:
                raise ValueError(f"unowned_rows:{doc.key}:{p+1}:{band}")
            entry["rows"].extend(rows)
            cells = {}
            for r in body:
                # A short interior vertical is a real subcell (condition/always).
                internal = [x for x, y0, y1 in doc.verticals[p]
                            if left < x < right and y0 - 1 <= center(r) <= y1 + 1]
                col = sum(x < r["x0"] for x in internal)
                cells.setdefault((sum(y <= center(r) for y in bb), col), []).append(r)
            for _, cell in sorted(cells.items()):
                if not prices and entry["cells"]:
                    entry["cells"][-1].extend(cell)
                else:
                    entry["cells"].append(cell)
    return entries


def table_candidates(doc):
    if doc.key == "pack1":
        return shop_candidates(doc)
    result = []
    for kind, indexes in ranges(doc).items():
        for entry in tables(doc, indexes):
            data = {"name": joined(entry["name"])}
            fields = {"name": evidence(entry["name"])}
            price = norm(joined(entry["price"]))
            unit = "欠片" if kind == "spirits" else "LP"
            match = re.fullmatch(r"(\d+)" + unit, price)
            if not match or not data["name"]:
                raise ValueError(f"invalid_record:{doc.key}:{data['name']}:{price}")
            price_field = "lp" if kind == "support_passives" else "price"
            data[price_field] = price if kind == "items" else int(match[1])
            fields[price_field] = evidence(entry["price"])
            cells = entry["cells"]
            if kind == "support_passives":
                if len(cells) < 2:
                    raise ValueError(f"incomplete_support:{data['name']}")
                # A printed 常時 label starts an effect even when the author
                # placed it inside the condition cell; keep its cited rows.
                split = next((i for i, r in enumerate(cells[0]) if r['text'].startswith('常時：')), len(cells[0]))
                condition = cells[0][:split]
                effects = ([cells[0][split:]] if split < len(cells[0]) else []) + cells[1:]
                data.update(cond=joined(condition), effect="\n".join(joined(c) for c in effects))
                fields.update(cond=evidence(condition), effect=evidence([r for c in effects for r in c]))
            elif kind == "spirits":
                data.update({f: "" for f in SPIRIT_FIELDS.values()})
                current = None
                for r in [r for c in cells for r in c]:
                    label = re.match(r"^(常時発動|士気低下効果|混乱効果|混乱時)[：:](.*)", r["text"])
                    if label:
                        current = "confuse_effect" if label[1] == "混乱時" else SPIRIT_FIELDS[label[1]]
                        if current in fields:
                            raise ValueError(f"duplicate_spirit_field:{data['name']}:{current}")
                        data[current] = label[2]
                        fields[current] = [r["id"]]
                    elif current:
                        data[current] += r["text"]
                        fields[current].append(r["id"])
                    else:
                        raise ValueError(f"orphan_spirit:{r['id']}")
                if not data["morale_effect"] or not data["confuse_effect"]:
                    raise ValueError(f"incomplete_spirit:{data['name']}")
            else:
                data["effect"] = "".join(joined(c) for c in cells)
                fields["effect"] = evidence([r for c in cells for r in c])
            cited = [rid for refs in fields.values() for rid in refs]
            if sorted(cited) != sorted(evidence(entry["rows"])):
                raise ValueError(f"unmapped_rows:{doc.key}:{data['name']}")
            result.append({"kind": kind, "source": doc.key,
                           "pages": sorted({r["page"] + 1 for r in entry["rows"]}),
                           "data": data, "fields": fields})
    return result


def glossary_candidates(doc):
    """Independently read the core glossary table, not DB-selected snippets.

    Trailing maxima remain prose: a cap on an effect is not automatically the
    status inventory maximum. Printed categories are evidence, not DB types.
    """
    if doc.key != 'core':
        return []
    result, category = [], None
    labels = {'バフ', 'デバフ', '中立バフ', '弾丸', '蓄積要素', '名称', '効果'}
    for p in section_range(doc, 'バフ・デバフ一覧'):
        if not doc.verticals[p]:
            continue  # Introductory prose, not a table.
        xs = sorted({x for x, _, _ in doc.verticals[p]})
        if len(xs) != 1:
            raise ValueError(f'glossary_columns:{doc.key}:{p+1}')
        divider = xs[0]
        bounds = boundaries_at(doc.segments[p], divider - 2)
        if not bounds:
            raise ValueError(f'glossary_borders:{doc.key}:{p+1}')
        groups = {}
        for row in sorted(doc.pages[p], key=lambda r: (center(r), r['x0'])):
            if row['text'] in labels:
                if row['text'] not in {'名称', '効果'}:
                    category = row['text']
                continue
            if row['y0'] < 390 and center(row) > bounds[0]:
                group = groups.setdefault(sum(y <= center(row) for y in bounds), {'rows': [], 'category': category})
                group['rows'].append(row)
        for group in groups.values():
            rows = group['rows']
            names = [r for r in rows if r['x0'] < divider]
            body = [r for r in rows if r['x0'] >= divider]
            # Three cells print name and [1R] effect as one text span across
            # the divider. Both fields cite that original, unsplit source row.
            combined = re.fullmatch(r'(.+?)\s+(\[1R\].+)', rows[0]['text']) if len(rows) == 1 else None
            if not body and combined and rows[0]['x0'] < divider < rows[0]['x1']:
                name, desc = combined.groups()
                names = body = rows
            elif names and body:
                name, desc = joined(names), joined(body)
            else:
                raise ValueError('glossary_cell_ownership:' + ','.join(evidence(rows)))
            result.append({'source': doc.key, 'pages': [p+1], 'printed_category': group['category'],
                           'data': {'name': name, 'desc': desc},
                           'fields': {'name': evidence(names), 'desc': evidence(body)}})
    return result


def review_glossary_supplements(findings, documents, definitions):
    """Enrich unresolved extras; a glossary text match never approves metadata.

    Local definitions can intentionally differ from the glossary. A mismatch
    here is a review item, never an automatic replacement instruction.
    """
    documents = {d.key: d for d in documents}
    for finding in findings:
        if finding['code'] != 'db_unique_unmapped_in_persona':
            continue
        matches = [c for c in definitions if norm(c['data']['name']) == norm(finding['unique_name'])]
        if len(matches) != 1:
            continue
        definition, = matches
        name = norm(definition['data']['name'])
        # Do not mistake 武装解除 for a reference to 武装, for example.
        reference = re.compile(re.escape(name) + r'(?:\d|を|が|の|に|[\]】]|$)')
        doc = documents[finding['source']]
        refs = [r['id'] for p in finding['pages'] for r in doc.pages[p-1] if reference.search(norm(r['text']))]
        equal = norm(finding['actual'].get('desc')) == norm(definition['data']['desc'])
        finding['glossary_review'] = {
            'source': definition['source'], 'pages': definition['pages'], 'expected_desc': definition['data']['desc'],
            'row_ids': definition['fields']['desc'], 'persona_reference_rows': refs,
            'text_matches': equal, 'unverified_fields': ['type', 'max'],
            'note': 'No metadata approval; compare local definitions before choosing between source variants'}
        finding['classification'] = ('glossary_text_verified_metadata_review' if equal and refs else
                                     'glossary_owner_reference_review' if not refs else 'glossary_content_or_local_variant_review')


def local_untyped_definitions(doc, indexes):
    """Cite the core's leading untyped unique block without inventing metadata.

    This deliberately stops at the first typed definition. Bracket-only lines
    inside a typed definition (e.g. the two meanings of 生きた蝶) are its prose,
    not new top-level statuses. Other layouts remain outside this adapter.
    """
    if doc.key != 'core':
        return []
    from extract_pack_data import BUFF_HEAD_RE, reading_order
    rows = sorted([r for p in indexes for r in doc.pages[p] if 56 <= r['x0'] < 62], key=reading_order)
    leading = []
    for row in rows:
        if BUFF_HEAD_RE.fullmatch(row['text']):
            break
        leading.append(row)
    heads = [(i, re.fullmatch(r'\[(.+)\]', row['text'])) for i, row in enumerate(leading)
             if re.fullmatch(r'\[(.+)\]', row['text'])]
    result = []
    for at, (i, head) in enumerate(heads):
        end = heads[at + 1][0] if at + 1 < len(heads) else len(leading)
        body = leading[i + 1:end]
        if not body:
            raise ValueError('empty_untyped_definition:' + leading[i]['id'])
        result.append({'data': {'name': head[1], 'desc': joined(body)},
                       'pages': sorted({r['page'] + 1 for r in [leading[i]] + body}),
                       'fields': {'name': [leading[i]['id']], 'desc': evidence(body)},
                       'unverified_fields': ['type', 'max']})
    return result


def review_local_definitions(findings, candidates, db):
    """Prefer cited owner-local text over a glossary variant, never approve caps.

    Also checks source-to-DB presence. Text found in another field is reported
    as relocation evidence, not silently counted as the requested definition.
    """
    for candidate in candidates:
        definitions = candidate.get('local_untyped_definitions', [])
        if not definitions:
            continue
        kind, name = candidate['kind'], candidate['data']['name']
        owners = [(i, p) for i, p in enumerate(db.get(kind, [])) if name_key(p['name']) == name_key(name)]
        if len(owners) != 1:
            continue  # Existing record-level ambiguity remains a finding.
        owner_index, owner = owners[0]
        for definition in definitions:
            buff_name, desc = definition['data']['name'], definition['data']['desc']
            matches = [(i, b) for i, b in enumerate(owner.get('unique_buffs', [])) if norm(b['name']) == norm(buff_name)]
            review = {'source': candidate['source'], 'pages': definition['pages'],
                      'expected_desc': desc, 'name_row_ids': definition['fields']['name'],
                      'row_ids': definition['fields']['desc'], 'unverified_fields': ['type', 'max'],
                      'note': 'Owner-local definition; glossary differences do not authorize replacement or metadata inference'}
            if len(matches) != 1:
                relocated = [path for path, value in leaves(owner)
                             if isinstance(value, str) and norm(value) == norm(f'[{buff_name}]' + desc)]
                findings.append({'kind': kind, 'name': name, 'source': candidate['source'], 'pages': candidate['pages'],
                                 'code': 'local_definition_missing_or_ambiguous', 'unique_name': buff_name,
                                 'classification': 'local_definition_mapping_review',
                                 'path': f'{kind}[{owner_index}].unique_buffs', 'matches': len(matches),
                                 'present_in_other_fields': relocated, 'local_review': review})
                continue
            buff_index, buff = matches[0]
            path = f'{kind}[{owner_index}].unique_buffs[{buff_index}]'
            existing = [f for f in findings if f.get('path') == path and f['code'] == 'db_unique_unmapped_in_persona']
            if len(existing) != 1:
                # No prior finding is not proof of approval for this untyped layout.
                findings.append({'kind': kind, 'name': name, 'source': candidate['source'], 'pages': candidate['pages'],
                                 'code': 'local_definition_review', 'unique_name': buff_name,
                                 'path': path, 'actual': buff})
                existing = [findings[-1]]
            review['text_matches'] = norm(buff.get('desc')) == norm(desc)
            existing[0]['local_review'] = review
            existing[0]['classification'] = ('local_text_verified_metadata_review' if review['text_matches']
                                             else 'local_content_review')


def cite_persona_uniques(doc, indexes, data):
    """Cite local typed definitions and explicit owner-only maximum overrides.

    A base header and a dedicated effect are separate source facts. Never use
    an arbitrary number in prose (effect caps, stages, or another owner) as max.
    Definitions that cannot be reconstructed exactly remain uncited.
    """
    from extract_pack_data import BUFF_HEAD_RE, reading_order
    rows = sorted([r for p in indexes for r in doc.pages[p] if 56 <= r['x0'] < 62], key=reading_order)
    starts = [(i, BUFF_HEAD_RE.fullmatch(r['text'])) for i, r in enumerate(rows)
              if BUFF_HEAD_RE.fullmatch(r['text'])]
    fields, overrides = {}, []
    for buff_index, buff in enumerate(data['unique_buffs']):
        matches = [(at, i, head) for at, (i, head) in enumerate(starts) if norm(head[1]) == norm(buff['name'])]
        if len(matches) != 1:
            continue
        at, i, head = matches[0]
        end = starts[at + 1][0] if at + 1 < len(starts) else len(rows)
        body = rows[i + 1:end]
        paragraphs = join_wrapped(body, keep_rows=True, rules_by_page={p: doc.rules[p] for p in indexes})
        if norm('\n'.join(text for text, _ in paragraphs)) != norm(buff['desc']):
            continue
        prefix = f'unique_buffs[{buff_index}]'
        for field in ('name', 'type', 'max'):
            fields[f'{prefix}.{field}'] = [rows[i]['id']]
        fields[f'{prefix}.desc'] = evidence(body)
        dedicated = []
        for n, (text, refs) in enumerate(paragraphs[:-1]):
            owner = re.fullmatch(r'\[(.+)の人格専用効果\]', text)
            value = re.match(r'^最大値が(\d+)になり、', paragraphs[n + 1][0])
            if owner and norm(owner[1]) == norm(data['name']) and value:
                dedicated.append((int(value[1]), evidence(refs + paragraphs[n + 1][1])))
        if len(dedicated) == 1:
            value, refs = dedicated[0]
            overrides.append({'path': f'{prefix}.max', 'base_value': buff['max'], 'effective_value': value,
                              'owner': data['name'], 'row_ids': [rows[i]['id']] + refs})
            buff['max'] = value
            fields[f'{prefix}.max'] = [rows[i]['id']] + refs
    return fields, overrides


def persona_candidates(doc):
    result = []
    for head in collect_persona_pages(doc.pages, doc.sections):
        p = head["page"]
        # Narrative references cannot become catalogue records.
        if p not in set(section_range(doc, "人格データ") + section_range(doc, "特異人格データ")):
            continue
        indexes = head["pages"]
        data = parse_persona(head["name"], [doc.pages[i] for i in indexes], {i: doc.rules[i] for i in indexes},
                             {i: doc.verticals[i] for i in indexes} if doc.key == 'core' else None)
        kind = "normal_personas" if p in section_range(doc, "人格データ") else "tokui_personas"
        fields, overrides = cite_persona_uniques(doc, indexes, data)
        local, local_issues = [], []
        try:
            local = local_untyped_definitions(doc, indexes)
        except ValueError as error:
            local_issues.append(str(error))
        result.append({"kind": kind, "source": doc.key, "pages": [i+1 for i in indexes], "data": data,
                       "fields": fields, "source_overrides": overrides,
                       "local_untyped_definitions": local, "local_definition_issues": local_issues})
    return result


def core_ego_form(rows):
    """Read a bounded form, including indented continuations and assimilation.

    Every content row is cited; none is removed as an implicit game rule.
    In particular, 敵味方識別不可 is source content, not decorative layout.
    """
    form = {"attr": "", "sin": "", "aoe": "", "effect": "", "dice": []}
    subs, refs = [], {}
    target, prefix = form, "form"
    header_re = re.compile(r"^(斬撃|貫通|打撃|防御|回避)(?:広域(\d+))?[：:](\S+?)(?:\s+広域[：:]対象(\d+)体)?$")

    def cite(field, group):
        refs.setdefault(field, []).extend(evidence(group))

    def append(field, text, group):
        target[field] = (target.get(field, "") + "\n" + text).strip()
        cite(prefix + "." + field, group)

    # Physical wrapping must never swallow the next die or a form/subskill
    # header. Detect those boundaries before joining wrapped source lines.
    blocks = []
    for row in rows:
        structural = (DICE_RE.fullmatch(row['text']) or header_re.fullmatch(row['text'])
                      or re.match(r"^\d+[：:]", row['text'])
                      or row['text'].startswith(('[同化]', '[影響]', '[敵味方識別不可]')))
        if not blocks or structural:
            blocks.append([])
        blocks[-1].append(row)
    paragraphs = [pair for block in blocks for pair in join_wrapped(block, keep_rows=True)]
    for text, group in paragraphs:
        # A numbered subskill may put the attribute on the following line.
        sub = re.match(r"^(\d+)[：:]?([^\d\s].*?)(?:\s+(斬撃|貫通|打撃|防御|回避).*)?$", text)
        if sub and "[同化]" in form["effect"] and (re.match(r"^\d+[：:]", text) or re.match(r"^\d+[\u3040-\u9fff]", text)):
            rest = re.sub(r"^\d+[：:]?", "", text).strip()
            named = re.match(r"^(.+?)\s+((?:斬撃|貫通|打撃|防御|回避).*)$", rest)
            target = {"no": int(sub[1]), "name": named[1] if named else rest,
                      "attr": "", "sin": "", "aoe": "", "effect": "", "dice": []}
            subs.append(target)
            prefix = f"sub_skills[{len(subs)-1}]"
            cite(prefix + ".no", group)
            cite(prefix + ".name", group)
            if not named:
                continue
            text = named[2]
        # One printed header reverses the labeled domains (憤怒：斬撃).
        # Recognize the two disjoint vocabularies, without rewriting prose.
        reversed_header = re.fullmatch(r"(憤怒|色欲|怠惰|暴食|憂鬱|傲慢|嫉妬)[：:](斬撃|貫通|打撃|防御|回避)(.*)", text)
        header_text = f"{reversed_header[2]}：{reversed_header[1]}{reversed_header[3]}" if reversed_header else text
        header = header_re.fullmatch(header_text)
        if header and not target["attr"]:
            target.update(attr=header[1], sin=header[3], aoe=f"広域対象{header[2] or header[4]}体" if header[2] or header[4] else "")
            for field in ("attr", "sin", "aoe"):
                cite(prefix + "." + field, group)
            continue
        dice = DICE_RE.fullmatch(text)
        if dice:
            target["dice"].append({"roll": dice[1], "effect": dice[2] or ""})
            for field in ("roll", "effect"):
                cite(f"{prefix}.dice[{len(target['dice'])-1}].{field}", group)
        elif target["dice"]:
            target["dice"][-1]["effect"] += "\n" + text
            cite(f"{prefix}.dice[{len(target['dice'])-1}].effect", group)
        else:
            append("effect", text, group)
    if not form["attr"] and not re.search(r"\[(同化|影響)\]", form["effect"]):
        raise ValueError("ego_form_header_unresolved:" + ",".join(evidence(rows)))
    if any(not sub["attr"] or not sub["dice"] for sub in subs):
        raise ValueError("ego_subskill_unresolved:" + ",".join(evidence(rows)))
    cited = {rid for ids in refs.values() for rid in ids}
    if cited != set(evidence(rows)):
        raise ValueError("ego_form_unmapped_rows")
    return form, subs, refs


def core_ego_candidates(doc):
    """Inventory all core EGO cells independently, including two-record pages."""
    rows = sorted([r for p in section_range(doc, "E.G.Oデータ") for r in doc.pages[p]
                   if r["y0"] < 390], key=lambda r: (r["page"], round(r["y0"], 1), r["x0"]))
    headings = [i for i, r in enumerate(rows) if re.match(r"^(ZAYIN|TETH|HE|WAW|ALEPH)(?:\s|$)", r["text"])]
    result = []
    for at, start in enumerate(headings):
        group = rows[start:headings[at + 1] if at + 1 < len(headings) else len(rows)]
        numbers = [r for r in group if re.match(r"^No\.\d+", r["text"])]
        if len(numbers) != 1:
            raise ValueError(f"ego_number_ownership:{doc.key}:{group[0]['page']+1}")
        no_row = numbers[0]
        match = re.fullmatch(r"No\.(\d+)\s+(\d+)欠片", no_row["text"])
        if not match:
            raise ValueError(f"ego_price:{no_row['id']}")
        title = [r for r in group[:group.index(no_row)] if not r["text"].startswith("必要資源")]
        rank = group[0]["text"].split()[0]
        name = re.sub(r"^(ZAYIN|TETH|HE|WAW|ALEPH)\s*", "", joined(title)).strip()
        data = {"name": name, "rank": rank, "no": int(match[1]), "shards": int(match[2])}
        refs = {"name": evidence(title), "rank": [group[0]["id"]], "no": [no_row["id"]], "shards": [no_row["id"]]}
        resources = [r for r in group if r["text"].startswith("必要資源：")]
        if len(resources) != 1:
            raise ValueError(f"ego_resources:{name}")
        data["resources"] = resources[0]["text"].split("：", 1)[1]
        refs["resources"] = evidence(resources)
        for label, field in [("名称", "passive_name"), ("発動条件", "passive_cond"), ("効果", "passive_effect")]:
            labels = [r for r in group if 80 <= r["x0"] < 112 and r["text"] == label]
            if len(labels) != 1:
                raise ValueError(f"ego_passive_label:{name}:{label}")
            anchor = labels[0]
            bounds = boundaries_at(doc.segments[anchor["page"]], 120)
            band = sum(y <= center(anchor) for y in bounds)
            cell = [r for r in group if r["page"] == anchor["page"] and 112 <= r["x0"] < 130
                    and r["y0"] > no_row["y0"] and sum(y <= center(r) for y in bounds) == band]
            if not cell:
                raise ValueError(f"ego_empty_cell:{name}:{label}")
            data[field] = joined(cell)
            refs[field] = evidence(cell)
        unresolved = []
        costs = [r for page in doc.pages for r in page
                 if re.fullmatch(re.escape(rank) + r"\s*[：:]\s*\d+", r["text"])]
        if len(costs) == 1:
            data["san_cost"] = int(re.search(r"\d+$", costs[0]["text"])[0])
            refs["san_cost"] = evidence(costs)
        else:
            unresolved.append("san_cost")
        subs, form_rows = [], []
        for label, field in (("覚", "kakusei"), ("侵", "shinshoku")):
            anchors = [r for r in group if 54 <= r["x0"] < 60 and r["text"] == label]
            try:
                if len(anchors) != 1:
                    raise ValueError("ego_form_label")
                anchor = anchors[0]
                borders = [(y0, y1) for x, y0, y1 in doc.verticals[anchor['page']]
                           if 64 <= x <= 66 and y0 - 2 <= center(anchor) <= y1 + 2]
                if len(borders) != 1:
                    raise ValueError("ego_form_border")
                top, bottom = borders[0]
                body = [r for r in group if r['page'] == anchor['page'] and r['x0'] >= 65
                        and top - 1 <= center(r) <= bottom + 1]
                form_rows.extend(body)
                form, children, field_refs = core_ego_form(body)
                data[field] = form
                for path, ids in field_refs.items():
                    if path.startswith("form."):
                        refs[field + path[4:]] = ids
                    else:
                        path = re.sub(r"\[(\d+)\]", lambda m: f"[{int(m[1])+len(subs)}]", path, count=1)
                        refs[path] = ids
                subs.extend(children)
            except ValueError as error:
                unresolved.append(field + ":" + str(error))
        if not any(x.startswith(("kakusei", "shinshoku")) for x in unresolved):
            data['sub_skills'] = subs
        else:
            unresolved.append('sub_skills')
        buff_rows = [r for r in group if 50 <= r['x0'] < 64 and r['text'] not in {'覚', '醒', '侵', '蝕', 'E.G.O', 'パッシブ', rank}]
        data['unique_buff'] = '\n'.join(join_wrapped(buff_rows))
        refs['unique_buff'] = evidence(buff_rows)
        cited = {rid for ids in refs.values() for rid in ids}
        labels = {'ス', 'キ', 'ル', '覚', '醒', '侵', '蝕', '固', '有',
                  'E.G.O', 'パッシブ', '名称', '発動条件', '効果'}
        unowned = [r['id'] for r in group if r['id'] not in cited and r['text'] not in labels]
        if unowned:
            unresolved.append('unmapped_rows:' + ','.join(unowned))
        result.append({"kind": "egos", "source": doc.key, "pages": sorted({r['page']+1 for r in group}),
                       "data": data, "fields": refs, "unverified_fields": unresolved})
    if len(result) != len([r for r in rows if re.match(r"^No\.\d+", r["text"])]):
        raise ValueError("ego_inventory_mismatch")
    return result


def leaves(value, path=""):
    if isinstance(value, dict):
        for key, val in value.items():
            if key not in {"keywords", "self_status", "place", "source"}:
                yield from leaves(val, f"{path}.{key}" if path else key)
    elif isinstance(value, list):
        yield path + ".length", len(value)
        for i, val in enumerate(value):
            yield from leaves(val, f"{path}[{i}]")
    else:
        yield path, value


def boundary_punctuation_only(expected, actual):
    """Classify, never approve, periods added at source paragraph boundaries.

    Other punctuation, digits, wording, missing text and changed order cannot
    pass this predicate. Raw differences stay in the report pending review.
    """
    if not isinstance(expected, str) or not isinstance(actual, str):
        return False
    parts = [norm(part) for part in expected.split("\n") if norm(part)]
    return len(parts) > 1 and bool(re.fullmatch("(?:。)?".join(re.escape(p) for p in parts), norm(actual)))


def compare(candidates, db, layout_differences=None):
    findings, checked, seen = [], Counter(), set()
    for c in candidates:
        kind, src = c["kind"], c["data"]
        matches = [(i, r) for i, r in enumerate(db.get(kind, [])) if name_key(r.get("name")) == name_key(src["name"])]
        identity = {"kind": kind, "name": src["name"], "source": c["source"], "pages": c["pages"]}
        if len(matches) != 1:
            findings.append({**identity, "code": "missing_or_ambiguous_record", "matches": len(matches)})
            continue
        index, record = matches[0]
        seen.add((kind, index))
        actual = dict(leaves(record))

        def check(field, expected, source_field=None):
            checked[kind] += 1
            value = actual.get(field)
            if field == "sub_skills.length" and "sub_skills" not in record:
                value = 0
            source_value = expected
            if field.endswith(".aoe"):
                value = re.sub(r"^広域(?=対象)", "", norm(value))
                source_value = re.sub(r"^広域(?=対象)", "", norm(expected))
            if norm(value) != norm(source_value):
                findings.append({**identity, "code": "field_difference", "path": f"{kind}[{index}].{field}",
                                 "expected": expected, "actual": actual.get(field),
                                 "classification": "source_boundary_punctuation" if boundary_punctuation_only(expected, value) else "content_or_mapping_review",
                                 "row_ids": c.get("fields", {}).get(source_field or field, [])})

        for field, expected in leaves(src):
            if not field.startswith(("unique_buffs[", "unique_buffs.")):
                check(field, expected)
        if "unique_buffs" not in src:
            continue
        source_buffs, db_buffs = src['unique_buffs'], record.get('unique_buffs', [])
        owned = set()
        for source_index, buff in enumerate(source_buffs):
            matches = [(j, b) for j, b in enumerate(db_buffs) if norm(b.get('name')) == norm(buff.get('name'))]
            checked[kind] += 1
            if len(matches) != 1:
                findings.append({**identity, 'code': 'missing_or_ambiguous_unique', 'unique_name': buff.get('name'),
                                 'matches': len(matches), 'expected': buff, 'source_index': source_index})
                continue
            db_index, _ = matches[0]
            if db_index in owned:
                findings.append({**identity, 'code': 'duplicate_source_unique', 'unique_name': buff.get('name')})
                continue
            owned.add(db_index)
            for field, expected in leaves(buff):
                check(f'unique_buffs[{db_index}].{field}', expected, f'unique_buffs[{source_index}].{field}')
        for j, buff in enumerate(db_buffs):
            if j not in owned:
                findings.append({**identity, 'code': 'db_unique_unmapped_in_persona', 'unique_name': buff.get('name'),
                                 'path': f'{kind}[{index}].unique_buffs[{j}]', 'actual': buff,
                                 'classification': 'glossary_or_persona_adapter_review'})
        source_order = [norm(b.get('name')) for b in source_buffs]
        actual_order = [norm(b.get('name')) for j, b in enumerate(db_buffs) if j in owned]
        if layout_differences is not None and Counter(source_order) == Counter(actual_order) and source_order != actual_order:
            layout_differences.append({**identity, 'code': 'unique_display_order',
                                       'expected': [b['name'] for b in source_buffs],
                                       'actual': [b['name'] for j, b in enumerate(db_buffs) if j in owned],
                                       'reason': 'Named definitions compared individually; text order within each definition remains strict'})
    return findings, dict(checked), seen


def audit(documents, db):
    candidates, issues, scope, glossary = [], [], [], []
    for doc in documents:
        candidates.extend(persona_candidates(doc))
        try:
            glossary.extend(glossary_candidates(doc))
        except ValueError as error:
            issues.append({'source': doc.key, 'code': 'glossary_adapter_unresolved', 'detail': str(error)})
        try:
            candidates.extend(table_candidates(doc))
        except ValueError as error:
            issues.append({"source": doc.key, "code": "table_adapter_unresolved", "detail": str(error)})
        if doc.key == "pack1":
            for ego in collect_egos(doc.pages, doc.rules, doc.sections):
                p = ego.pop("page")
                candidates.append({"kind": "egos", "source": doc.key, "pages": [p+1], "data": ego})
        elif doc.key == "core":
            try:
                core_egos = core_ego_candidates(doc)
                candidates.extend(core_egos)
                scope.extend({"source": doc.key, "kind": "egos", "name": c["data"]["name"],
                              "code": "partial_field_mapping", "pages": c["pages"], "fields": c["unverified_fields"]}
                             for c in core_egos if c["unverified_fields"])
            except ValueError as error:
                scope.append({"source": doc.key, "kind": "egos", "code": "field_mapping_unresolved", "detail": str(error)})
    layout_differences = []
    findings, fields, seen = compare(candidates, db, layout_differences)
    review_glossary_supplements(findings, documents, glossary)
    review_local_definitions(findings, candidates, db)
    issues.extend({'source': c['source'], 'name': c['data']['name'], 'pages': c['pages'],
                   'code': 'local_definition_adapter_unresolved', 'detail': issue}
                  for c in candidates for issue in c.get('local_definition_issues', []))
    # Existing product scope excludes these resources (tests/items.test.mjs).
    # Exclusion is explicit; it is not an audited application record.
    excluded = [f for f in findings if f["kind"] == "items" and f["code"] == "missing_or_ambiguous_record"
                and f["name"] in ("自我の欠片", "硝子の破片")]
    for f in excluded:
        f["reason"] = "Existing inventory contract: consumable equipment only; special resources excluded"
    findings = [f for f in findings if f not in excluded]
    kinds = ("normal_personas", "tokui_personas", "egos", "support_passives", "spirits", "items")
    for kind in kinds:
        for i, record in enumerate(db.get(kind, [])):
            if (kind, i) not in seen:
                scope.append({"kind": kind, "name": record["name"], "code": "db_record_unmapped", "index": i})
    return {"scope": "core+supplement+pack1; annex excluded", "complete": not (findings or issues or scope),
            "normalization": "NFKC, whitespace, multiplication sign; optional absent sub_skills = []; aoe 広域対象 = 対象; full-field equality, never substring",
            "sources": [{"key": d.key, "filename": d.filename, "sha256": d.sha256, "pages": len(d.pages)} for d in documents],
            "counts": {k: {"db": len(db.get(k, [])), "source_candidates": sum(c['kind'] == k for c in candidates),
                            "fields_checked": fields.get(k, 0)} for k in kinds},
            "assessment": "Differences are review candidates, not confirmed errors; core persona adapter still needs validation; EGO cells include row references and explicit unmapped fields",
            "glossary_definitions": glossary,
            "layout_differences": layout_differences,
            "difference_classification": dict(Counter(f.get("classification", f["code"]) for f in findings)),
            "excluded": excluded, "differences": findings, "unresolved": issues + scope, "candidates": candidates}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true")
    args = parser.parse_args()
    documents = [Document.read(k) for k in BOOKS]
    db = json.loads((ROOT / "data/db.json").read_text())
    db["items"] = json.loads((ROOT / "data/items.json").read_text())
    report = audit(documents, db)
    if args.write_report:
        atomic_json(ROOT / "data/provenance/three-book-audit.json", report)
    print(json.dumps({k: v for k, v in report.items() if k not in ("candidates", "differences", "unresolved", "glossary_definitions")}, ensure_ascii=False, indent=2))
    print(f"differences={len(report['differences'])}; unresolved={len(report['unresolved'])}")
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
