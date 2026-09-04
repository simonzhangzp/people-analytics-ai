from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "serving"))

from metric_yaml import load_metrics, validate_metrics  # noqa: E402


class MetricYamlTests(unittest.TestCase):
    def test_range_and_window_aligned(self) -> None:
        rows = load_metrics()
        self.assertGreaterEqual(len(rows), 20)
        errors = validate_metrics(rows)
        self.assertEqual(errors, [])
        ids = {r["metric_id"] for r in rows}
        self.assertIn("hires", ids)
        self.assertIn("rehires", ids)
        apps = next(r for r in rows if r["metric_id"] == "applications_per_opening")
        self.assertTrue(apps.get("window_aligned"))
        qoh = next(r for r in rows if r["metric_id"] == "quality_of_hire")
        self.assertIn("3.5", qoh["numerator"]["expression"])
        self.assertIn("12", (qoh.get("notes") or "") + qoh["numerator"]["expression"])


class PublishGuardTests(unittest.TestCase):
    def test_no_alter_role_in_serving(self) -> None:
        serving = ROOT / "serving"
        hits = []
        for path in serving.rglob("*"):
            if path.suffix.lower() not in {".py", ".sql"}:
                continue
            if path.name.startswith("test_"):
                continue
            for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith("#") or stripped.startswith("--"):
                    continue
                if "alter role" in stripped.lower() and "statement_timeout" in stripped.lower():
                    hits.append(f"{path}:{i}")
        self.assertEqual(hits, [])

    def test_load_table_uses_staging_swap(self) -> None:
        src = (ROOT / "serving" / "measure_5pct_landing.py").read_text(encoding="utf-8")
        self.assertIn("_staging", src)
        self.assertIn("rename to", src.lower())
        self.assertNotIn("def infer(", (ROOT / "serving" / "generate_people_v2_ddl.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
