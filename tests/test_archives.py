"""Offline integrity tests for COT Atlas archive and first-observed vintages."""
import gzip
import json
from pathlib import Path
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"

class ArchiveIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest=json.loads((DATA/"manifest.json").read_text("utf-8"))
        cls.db=sqlite3.connect(f"file:{DATA/'cot.sqlite3'}?mode=ro",uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_all_seven_reports(self):
        self.assertEqual(len(self.manifest["datasets"]),7)
        self.assertEqual(set(d["report"] for d in self.manifest["datasets"]),{
            "disagg_fut","disagg_comb","tff_fut","tff_comb",
            "legacy_fut","legacy_comb","supplemental"
        })

    def test_sqlite_integrity_and_row_count(self):
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
        n=self.db.execute("SELECT count(*) FROM positions").fetchone()[0]
        self.assertEqual(n,self.manifest["position_rows"])
        self.assertGreater(n,500)

    def test_first_seen_not_mislabeled_as_original(self):
        for item in self.manifest["datasets"]:
            report=item["report"];day=item["latest_report"]
            folder=DATA/"vintages"/day
            archive=folder/f"{report}.json.gz"
            info=json.loads((folder/f"{report}.meta.json").read_text("utf-8"))
            with gzip.open(archive,"rt",encoding="utf-8") as f:
                payload=json.load(f)
            self.assertEqual(payload["report_date"],day)
            self.assertEqual(payload["report"],report)
            self.assertFalse(payload["original_publication_verified"])
            self.assertFalse(info["original_publication_verified"])
            self.assertEqual(len(payload["rows"]),info["position_rows"])
            self.assertGreater(len(payload["rows"]),10)
            self.assertIn("first_observed_at_utc",payload)

if __name__=="__main__":
    unittest.main()
