from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import WorldEngine


def _worker() -> dict:
    return {
        "worker_id": "HR-EMP-000001",
        "person_id": "P-1",
        "hire_date": date(2021, 9, 1),
        "termination_date": None,
        "reason": None,
        "region": "AMER",
        "job_family": "Engineering",
        "employment_type": "Full-time",
        "status": "Active",
        "is_rehire": False,
        "via_t1": False,
        "hired_via_application_id": None,
        "grade": "P3",
        "reports_to": "HR-EMP-DEAD",
    }


class EmitMonotonicTests(unittest.TestCase):
    def test_backdated_emit_clamps_and_overwrites(self) -> None:
        eng = WorldEngine(0.01, 20260301, apply_case3=False)
        w = _worker()
        eng._emit_employee(w, date(2024, 8, 29))
        w["reports_to"] = "HR-EMP-GOOD"
        w["_change_reason"] = "manager_departure"
        eng._emit_employee(w, date(2024, 8, 6))
        rows = [r for r in eng.employee_versions if r["name"] == "HR-EMP-000001"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["modified_date"], "2024-08-29")
        self.assertEqual(rows[0]["reports_to"], "HR-EMP-GOOD")

    def test_backdated_termination_overwrites_later_active_row(self) -> None:
        eng = WorldEngine(0.01, 20260301, apply_case3=False)
        w = _worker()
        eng._emit_employee(w, date(2023, 2, 28))
        w["status"] = "Left"
        w["termination_date"] = date(2023, 2, 10)
        eng._emit_employee(w, date(2023, 2, 10))
        rows = [r for r in eng.employee_versions if r["name"] == "HR-EMP-000001"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "Left")
        self.assertEqual(rows[0]["modified_date"], "2023-02-28")
        self.assertEqual(rows[0]["relieving_date"], "2023-02-10")

    def test_repair_flattens_chain_and_caps_span(self) -> None:
        eng = WorldEngine(0.01, 1, apply_case3=False)
        workers = []
        for i in range(20):
            w = {
                "worker_id": f"HR-EMP-{i:06d}",
                "person_id": f"P{i}",
                "hire_date": date(2020, 1, 1),
                "termination_date": None,
                "reason": None,
                "region": "AMER",
                "job_family": "Engineering",
                "employment_type": "Full-time",
                "status": "Active",
                "is_rehire": False,
                "via_t1": False,
                "hired_via_application_id": None,
                "grade": "G5",
                "reports_to": None if i == 0 else f"HR-EMP-{i - 1:06d}",
                "org_role": "leader" if i == 0 else ("manager" if i < 12 else "ic"),
                "org_level": min(i, 7),
            }
            workers.append(w)
            eng._emit_employee(w, date(2020, 1, 1))
        eng.workers = workers
        eng.ceo_id = "HR-EMP-000000"
        eng._rebuild_org_index()
        eng._repair_org(date(2026, 8, 31))
        depths = eng._certified_depths(date(2026, 8, 31))
        self.assertLessEqual(max(depths.values()), 8)
        reports = eng._certified_reports(date(2026, 8, 31))
        self.assertTrue(all(len(reps) <= 15 for reps in reports.values()))
        self.assertEqual(sum(1 for w in workers if w.get("reports_to") is None), 1)


if __name__ == "__main__":
    unittest.main()
