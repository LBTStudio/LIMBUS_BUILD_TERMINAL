"""Actual PDFs plus adversarial edits; run with unittest (no extra test runner)."""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "provenance"))
from detect_pdf_data import (Document, SOURCES, shop_candidates, validate_candidates,
                             source_inventory, plan_registration, write_ledger,
                             ledger_content_digest, safe_path)


class DetectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = Document.read("pack1")
        cls.candidates = shop_candidates(cls.doc)

    def assert_rejected(self, change):
        candidates = copy.deepcopy(self.candidates)
        change(candidates)
        self.assertTrue(validate_candidates(self.doc, candidates))

    def test_source_hashes_and_total_pages_are_pinned(self):
        self.assertEqual(sum(s[1] for s in SOURCES.values()), 1429)
        self.assertEqual(len(self.doc.pages), 244)
        self.assertEqual(len(self.doc.sha256), 64)
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            path = Path(tmp) / "bad.pdf"
            path.write_bytes(b"not the source PDF")
            with self.assertRaisesRegex(ValueError, "source_hash_mismatch"):
                Document.read("pack1", path)

    def test_independent_price_anchor_inventory(self):
        # Count price anchors directly, without table_entries/candidate lists.
        import re
        anchors = [r for page in self.doc.pages[218:225] for r in page
                   if r["x0"] > 227 and re.match(r"^\d+(?:LP|欠)", r["text"])]
        self.assertEqual(len(anchors), 34)
        self.assertEqual(len(self.candidates), 34)
        self.assertEqual(sum(c["kind"] == "support_passives" for c in self.candidates), 29)
        self.assertEqual(validate_candidates(self.doc, self.candidates), [])

    def test_source_checked_regressions(self):
        by_name = {c["data"]["name"]: c for c in self.candidates}
        self.assertIn("発電モーターL-22", by_name)  # Numeric-only line is NOT a footer.
        self.assertEqual(by_name["人生の終止符"]["pages"], [219])
        self.assertEqual(by_name["マージン"]["pages"], [219, 220])
        self.assertEqual(by_name["マージン"]["data"]["effect"],
                         "スキルを複数捨てる時、全てのスキルが戦術選択ダイスロールから除外されない")
        self.assertEqual(by_name["魔王の行進"]["data"]["cond"],
                         "ワザリングハイツ・エドガー家所属の味方5名以上")
        self.assertNotIn("ワザリングハイツ", by_name["苦痛なき慈悲"]["data"]["effect"])
        self.assertEqual(by_name["赤く縺れた蜘蛛の巣"]["pages"], [220, 221])
        self.assertEqual(by_name["窮地より"]["data"]["effect"],
                         "自分がいる速度値に効果が付与されているならスキル威力+1")
        self.assertEqual(by_name["破砕痕"]["data"]["confuse_effect"],
                         "マッチ威力-1。全ての耐性が脆弱になる。沈潜と破裂で受けるダメージ量+50％")

    def test_deleting_whole_record_is_not_zero_findings(self):
        self.assert_rejected(lambda c: c.pop())
        self.assertTrue(validate_candidates(self.doc, []))

    def test_deleting_short_name_fragment_or_changing_price_fails(self):
        self.assert_rejected(lambda c: c[0]["data"].update(name="発電モーターL-"))
        self.assert_rejected(lambda c: c[0]["data"].update(lp=200))
        self.assert_rejected(lambda c: c[0]["data"].update(cond="保有"))

    def test_truncation_newline_duplicate_and_uncited_text_fail(self):
        self.assert_rejected(lambda c: c[0]["data"].update(effect=c[0]["data"]["effect"][:-1]))
        self.assert_rejected(lambda c: c[0]["data"].update(effect="戦闘\n" + c[0]["data"]["effect"][2:]))
        self.assert_rejected(lambda c: c.append(copy.deepcopy(c[0])))
        self.assert_rejected(lambda c: c[0]["data"].update(extra="0"))

    def test_wrong_record_citations_fail_even_with_matching_text(self):
        def swap(c):
            a, b = c[0], c[1]
            a["data"]["effect"], b["data"]["effect"] = b["data"]["effect"], a["data"]["effect"]
            a["fields"]["effect"], b["fields"]["effect"] = b["fields"]["effect"], a["fields"]["effect"]
        self.assert_rejected(swap)

    def test_reproducibility_and_idempotent_import(self):
        self.assertEqual(self.candidates, shop_candidates(self.doc))
        empty = {"support_passives": [], "spirits": []}
        result, changes, issues = plan_registration(empty, self.candidates)
        self.assertEqual(len(changes), 34)
        self.assertEqual(issues, [])
        again, changes, issues = plan_registration(result, self.candidates)
        self.assertEqual(again, result)
        self.assertEqual(changes, [])
        self.assertEqual(issues, [])
        self.assertEqual(empty, {"support_passives": [], "spirits": []})
        result["support_passives"][0]["lp"] = 0
        _, _, issues = plan_registration(result, self.candidates)
        self.assertTrue(issues)
        self.assertEqual(result["support_passives"][0]["lp"], 0)

    def test_raw_ledger_is_complete_but_not_full_approval(self):
        inventory = source_inventory([self.doc], self.candidates)
        self.assertEqual(len(inventory), 244)
        self.assertTrue(any(p["status"] != "mapped" for p in inventory))
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            path = Path(tmp) / "ledger.sqlite"
            write_ledger(path, [self.doc], self.candidates, inventory)
            with sqlite3.connect(path) as conn:
                self.assertEqual(conn.execute("SELECT count(*) FROM pages").fetchone()[0], 244)
                self.assertEqual(conn.execute("SELECT count(*) FROM lines").fetchone()[0], sum(map(len, self.doc.pages)))
                self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(conn.execute("SELECT value FROM metadata WHERE key='content_sha256'").fetchone()[0],
                                 ledger_content_digest([self.doc], self.candidates))
                for rid, text, geometry in conn.execute("SELECT id,text,geometry FROM lines"):
                    self.assertEqual(json.loads(geometry)["id"], rid)
                    self.assertEqual(json.loads(geometry)["text"], text)

    def test_workspace_boundary(self):
        with self.assertRaisesRegex(ValueError, "outside_workspace"):
            safe_path(ROOT.parent / "not-allowed.json")


class NamedComparisonTests(unittest.TestCase):
    """Synthetic adversarial fixtures: never substitutes for source snapshots."""

    def setUp(self):
        self.source = {'kind': 'normal_personas', 'source': 'synthetic', 'pages': [1],
                       'data': {'name': 'Owner', 'unique_buffs': [
                           {'name': 'A', 'max': 3, 'desc': '第一段階3\n第二段階5'},
                           {'name': 'B・C', 'max': 10, 'desc': '効果全文'}]},
                       'fields': {'unique_buffs[0].desc': ['synthetic:1:1'],
                                  'unique_buffs[0].max': ['synthetic:1:0']}}
        self.db = {'normal_personas': [copy.deepcopy(self.source['data'])]}

    def compare(self):
        from audit_three_books import compare
        layout = []
        findings, _, _ = compare([self.source], self.db, layout)
        return findings, layout

    def test_reordering_definitions_preserves_contents_and_source_citations(self):
        self.db['normal_personas'][0]['unique_buffs'].reverse()
        findings, layout = self.compare()
        self.assertEqual(findings, [])
        self.assertEqual([f['code'] for f in layout], ['unique_display_order'])
        buff = self.db['normal_personas'][0]['unique_buffs'][1]
        buff['desc'] = '第一段階3'
        buff['max'] = 4
        findings, _ = self.compare()
        self.assertEqual({f['path'] for f in findings},
                         {'normal_personas[0].unique_buffs[1].desc', 'normal_personas[0].unique_buffs[1].max'})
        self.assertEqual(next(f['row_ids'] for f in findings if f['path'].endswith('.desc')), ['synthetic:1:1'])
        self.assertEqual(self.source['data']['unique_buffs'][0]['max'], 3)

    def test_missing_extra_and_renamed_definitions_remain_findings(self):
        buffs = self.db['normal_personas'][0]['unique_buffs']
        buffs.pop()
        self.assertIn('missing_or_ambiguous_unique', [f['code'] for f in self.compare()[0]])
        buffs.append({'name': 'Glossary', 'desc': 'Not automatically trusted'})
        self.assertIn('db_unique_unmapped_in_persona', [f['code'] for f in self.compare()[0]])
        buffs[-1] = {'name': 'BC', 'max': 10, 'desc': '効果全文'}
        self.assertEqual(len(self.compare()[0]), 2)  # Middle dot is not discarded.
        self.source['data']['unique_buffs'] = []
        self.assertEqual(len(self.compare()[0]), 2)  # Empty source cannot approve DB extras.

    def test_duplicate_names_in_either_side_are_rejected(self):
        self.db['normal_personas'][0]['unique_buffs'].append(copy.deepcopy(self.source['data']['unique_buffs'][0]))
        self.assertIn('missing_or_ambiguous_unique', [f['code'] for f in self.compare()[0]])
        self.db['normal_personas'][0]['unique_buffs'].pop()
        self.source['data']['unique_buffs'].append(copy.deepcopy(self.source['data']['unique_buffs'][0]))
        self.assertIn('duplicate_source_unique', [f['code'] for f in self.compare()[0]])

    def test_punctuation_classification_does_not_approve_any_difference(self):
        self.db['normal_personas'][0]['unique_buffs'][0]['desc'] = '第一段階3。第二段階5'
        findings, _ = self.compare()
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['classification'], 'source_boundary_punctuation')
        self.assertEqual(findings[0]['expected'], '第一段階3\n第二段階5')
        from audit_three_books import boundary_punctuation_only
        for changed in ('第一段階4。第二段階5', '第二段階5。第一段階3', '第一段階3',
                        '第一段階3、第二段階5', '第一段階。3第二段階5', '第一段階3。第二段階5。'):
            with self.subTest(changed=changed):
                self.assertFalse(boundary_punctuation_only('第一段階3\n第二段階5', changed))
        self.assertFalse(boundary_punctuation_only(3, '3'))

    def test_inline_dice_requires_structural_separator_not_prose(self):
        from extract_pack_data import split_inline_skill_dice
        text = '使用時：対象の火傷と破裂の合計が15以上ならスキル威力+2 3d5：的中時、[破裂爆発]。破裂を2消費'
        self.assertEqual(split_inline_skill_dice(text), text.split(' 3d5：')[0:1] + ['3d5：' + text.split(' 3d5：')[1]])
        for text in ('使用時：3d5を振る', '使用時：「 3d5：的中時、効果」を追加',
                     '使用時：効果3d5：的中時、効果', '3d5：的中時、効果'):
            self.assertEqual(split_inline_skill_dice(text), [text])


class ThreeBookAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from audit_three_books import BOOKS, audit
        cls.documents = [Document.read(key) for key in BOOKS]
        cls.db = json.loads((ROOT / "data/db.json").read_text())
        cls.db["items"] = json.loads((ROOT / "data/items.json").read_text())
        cls.report = audit(cls.documents, cls.db)

    def test_three_book_snapshot_and_scope_are_reproducible(self):
        saved = json.loads((ROOT / "data/provenance/three-book-audit.json").read_text())
        self.assertEqual(self.report, saved)
        self.assertEqual(sum(len(d.pages) for d in self.documents), 799)
        self.assertFalse(self.report["complete"])
        self.assertEqual(self.report["counts"]["egos"]["source_candidates"], 115)
        self.assertEqual(self.report["counts"]["support_passives"]["source_candidates"], 346)
        self.assertEqual(self.report["counts"]["spirits"]["source_candidates"], 48)
        self.assertEqual(len(self.report["excluded"]), 2)

    def test_source_shop_fields_match_all_registered_items_and_spirits(self):
        from audit_three_books import compare
        candidates = [c for c in self.report["candidates"] if c["kind"] in ("support_passives", "spirits", "items")]
        findings, _, _ = compare(candidates, self.db)
        self.assertEqual({f["name"] for f in findings}, {"自我の欠片", "硝子の破片"})
        self.assertTrue(all(f["code"] == "missing_or_ambiguous_record" for f in findings))

    def test_full_field_checks_detect_deletion_truncation_and_price_change(self):
        from audit_three_books import compare
        candidates = [c for c in self.report["candidates"] if c["kind"] == "support_passives"]
        for field, value in [("effect", ""), ("cond", ""), ("lp", 99999)]:
            db = copy.deepcopy(self.db)
            db["support_passives"][0][field] = value
            findings, _, _ = compare(candidates, db)
            self.assertTrue(any(f.get("path") == f"support_passives[0].{field}" for f in findings))
        db = copy.deepcopy(self.db)
        missing = db["support_passives"].pop()["name"]
        findings, _, _ = compare(candidates, db)
        self.assertTrue(any(f["name"] == missing and f["code"] == "missing_or_ambiguous_record" for f in findings))

    def test_core_ego_forms_and_all_source_content_rows_are_mapped(self):
        from audit_three_books import compare
        from detect_pdf_data import section_range
        candidates = [c for c in self.report['candidates'] if c['kind'] == 'egos']
        self.assertEqual(compare(candidates, self.db)[0], [])
        core = [c for c in candidates if c['source'] == 'core']
        self.assertEqual(len(core), 100)
        self.assertTrue(all(not c['unverified_fields'] for c in core))
        cited = {rid for c in core for ids in c['fields'].values() for rid in ids}
        labels = {'ス', 'キ', 'ル', '覚', '醒', '侵', '蝕', '固', '有',
                  'E.G.O', 'パッシブ', '名称', '発動条件', '効果'}
        doc = self.documents[0]
        content = [r for p in section_range(doc, 'E.G.Oデータ')[1:] for r in doc.pages[p]
                   if r['y0'] < 390 and r['text'] not in labels]
        self.assertGreater(len(content), 1500)
        self.assertEqual([r['id'] for r in content if r['id'] not in cited], [])
        egos = {c['data']['no']: c['data'] for c in core}
        self.assertEqual(egos[5]['kakusei']['dice'][0]['roll'], '2d10')
        self.assertNotIn('[影響]', egos[5]['kakusei']['effect'])
        self.assertIn('1R：自分のHPを20%減少し5LP獲得', egos[5]['shinshoku']['effect'])
        self.assertEqual(egos[20]['kakusei']['effect'], '[同化]')
        self.assertEqual([len(s['dice']) for s in egos[20]['sub_skills']], [1, 3, 3, 1])
        self.assertEqual(len(egos[20]['shinshoku']['dice']), 1)
        self.assertEqual([len(s['dice']) for s in egos[62]['sub_skills']], [1, 4, 3, 1])
        self.assertIn('破裂状態のキャラクターを優先して指定', egos[62]['sub_skills'][3]['effect'])
        self.assertEqual(len(egos[77]['kakusei']['dice']), 4)
        self.assertEqual(len(egos[47]['shinshoku']['dice']), 1)
        self.assertEqual(len(egos[76]['shinshoku']['dice']), 1)
        self.assertIn('死亡した時', egos[8]['unique_buff'])

    def test_core_ego_mutations_cannot_pass_full_field_comparison(self):
        from audit_three_books import compare
        candidates = [c for c in self.report['candidates'] if c['kind'] == 'egos']
        for kind in ('cost', 'die', 'impact', 'assimilation', 'unique'):
            db = copy.deepcopy(self.db)
            egos = {e['no']: e for e in db['egos']}
            if kind == 'cost':
                egos[1]['san_cost'] += 1
            elif kind == 'die':
                egos[77]['kakusei']['dice'].pop()
            elif kind == 'impact':
                egos[5]['shinshoku']['effect'] = egos[5]['shinshoku']['effect'].replace('1R：自分のHPを20%減少し5LP獲得', '')
            elif kind == 'assimilation':
                egos[20]['sub_skills'].pop()
            else:
                egos[8]['unique_buff'] = egos[8]['unique_buff'].split('\n')[0]
            self.assertTrue(compare(candidates, db)[0], kind)

    def test_persona_layout_variants_and_restored_dice(self):
        from audit_three_books import name_key
        candidates = {name_key(c['data']['name']): c['data'] for c in self.report['candidates']
                      if c['kind'] in ('normal_personas', 'tokui_personas')}
        for name, hp, san in [('南部ウーフィ協会4課フィクサー', 130, 50),
                              ('W社3級整理要員', 120, 50), ('ロボトミーE.G.O:紅籍', 120, 55),
                              ('群れたハイエナ', 90, 50)]:
            src = candidates[name_key(name)]
            self.assertEqual((src['hp'], src['san']), (hp, san))
        self.assertEqual(candidates[name_key('黒獣-巳')]['skills'][4]['aoe'], '対象3体')
        receiver = candidates[name_key('命脈相談窓口 受話器')]
        self.assertEqual([d['roll'] for d in receiver['skills'][1]['dice']], ['2d8', '2d8'])
        self.assertEqual(receiver['skills'][1]['dice'][0]['effect'], '')
        for kind, name, i in [('normal_personas', '命脈相談窓口 受話器', 1),
                              ('normal_personas', '南部リウ協会4課フィクサー', 3),
                              ('tokui_personas', 'エドガー家チーフバトラー', 4),
                              ('tokui_personas', '東部親指カポIIII', 7)]:
            entry = next(p for p in self.db[kind] if name_key(p['name']) == name_key(name))
            self.assertEqual(entry['skills'][i]['dice'], candidates[name_key(name)]['skills'][i]['dice'])
        # Long wrapped headers must not migrate into the previous die effect.
        self.assertTrue(candidates[name_key('蜘蛛の巣 薬指の親方')]['skills'][6]['name'].startswith('ティビアのメロディー'))

    def test_owner_specific_maximum_uses_both_header_and_dedicated_effect(self):
        from audit_three_books import cite_persona_uniques, compare
        candidate = next(c for c in self.report['candidates'] if c['data']['name'] == 'ラ・マンチャランド 姫')
        self.assertEqual(candidate['data']['unique_buffs'][0]['max'], 30)
        override, = candidate['source_overrides']
        self.assertEqual((override['base_value'], override['effective_value']), (10, 30))
        self.assertEqual(override['row_ids'], ['core:226:15', 'core:226:19', 'core:226:20', 'core:226:21'])
        # A different owner does not inherit the dedicated maximum. No DB input.
        other = copy.deepcopy(candidate['data'])
        other['name'] = '別人格'
        other['unique_buffs'][0]['max'] = 10
        _, overrides = cite_persona_uniques(self.documents[0], [224, 225], other)
        self.assertEqual(overrides, [])
        self.assertEqual(other['unique_buffs'][0]['max'], 10)
        broken = copy.deepcopy(self.db)
        owner = next(p for p in broken['tokui_personas'] if p['name'] == 'ラ・マンチャランド姫')
        owner['unique_buffs'][0]['max'] = 10
        findings = compare([candidate], broken)[0]
        self.assertTrue(any(f.get('path', '').endswith('.max') and f['row_ids'] == override['row_ids'] for f in findings))

    def test_rooster_inline_die_and_distinct_followup_are_source_owned(self):
        candidate = next(c['data'] for c in self.report['candidates'] if c['data']['name'] == '黒獣-酉')
        self.assertEqual([d['roll'] for d in candidate['skills'][2]['dice']], ['3d5', '3d5', '2d9'])
        self.assertNotIn('3d5', candidate['skills'][2]['effect'])
        first, second = candidate['skills'][3]['dice']
        self.assertIn('再使用的中時、火傷2と破裂1を付与', first['effect'])
        self.assertNotIn('再使用的中時', second['effect'])
        owner = next(p for p in self.db['normal_personas'] if p['name'] == '黒獣-酉')
        self.assertEqual(owner['skills'][3]['dice'], candidate['skills'][3]['dice'])

    def test_complete_buff_definitions_and_item_status_name(self):
        from audit_three_books import norm, name_key, compare
        targets = {"集中攻撃-○○", "内部破裂", "咲き出す棘"}
        checked = set()
        for c in self.report["candidates"]:
            if c["kind"] not in ("normal_personas", "tokui_personas"):
                continue
            record = next(r for r in self.db[c["kind"]] if name_key(r["name"]) == name_key(c["data"]["name"]))
            for source_buff in c["data"]["unique_buffs"]:
                if source_buff["name"] not in targets:
                    continue
                buff = next(b for b in record["unique_buffs"] if b["name"] == source_buff["name"])
                self.assertEqual(norm(buff["desc"]), norm(source_buff["desc"]))
                broken = copy.deepcopy(self.db)
                owner = next(r for r in broken[c["kind"]] if r["name"] == record["name"])
                next(b for b in owner["unique_buffs"] if b["name"] == buff["name"])["desc"] = buff["desc"].split("\n")[0]
                findings, _, _ = compare([c], broken)
                self.assertTrue(any(f.get("path", "").endswith(".desc") for f in findings))
                checked.add(buff["name"])
        self.assertEqual(checked, targets)
        princess = next(r for r in self.db["tokui_personas"] if r["name"] == "ラ・マンチャランド姫")
        self.assertEqual(princess["unique_buffs"][0]["max"], 30)
        item = next(r for r in self.db["items"] if r["id"] == "enh-zweihander")
        self.assertIn("あなたの盾2", item["palette"])
        self.assertIn("あなたの盾", item["tags"])


if __name__ == "__main__":
    unittest.main()
