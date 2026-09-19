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


if __name__ == "__main__":
    unittest.main()
