from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from extract import dry_run_apac_employee_fault


def _employees() -> list[dict]:
    rows = []
    for idx in range(10):
        rows.append({"name": f"HR-EMP-APAC-{idx:03d}", "branch_region": "APAC"})
    for idx in range(10):
        rows.append({"name": f"HR-EMP-AMER-{idx:03d}", "branch_region": "AMER"})
    return rows


class ExtractFaultTests(unittest.TestCase):
    def test_apac_fault_drops_rows_received_not_control_total(self) -> None:
        manifest = dry_run_apac_employee_fault(_employees(), date(2026, 8, 14), last_certified_headcount=20)
        self.assertEqual(manifest["control_total"], 20)
        self.assertEqual(manifest["rows_received"], 14)  # 10 AMER + 35% of 10 APAC = 4
        self.assertEqual(manifest["mode"], "full")
        self.assertFalse(manifest["volume_test_ok"])
        self.assertTrue(manifest["isolated"])
        self.assertFalse(manifest["pointer_moved"])
        self.assertFalse(manifest["absence_closes_worker"])
        self.assertEqual(manifest["replay"]["value_bad"], 14)
        self.assertEqual(manifest["replay"]["value_expected"], 20)
        self.assertEqual(manifest["status"], "isolated")
        self.assertLess(manifest["rows_received"], manifest["control_total"])
        self.assertEqual(manifest["scenario_ids"], ["apac_hris_feed_incomplete"])
        self.assertTrue(all(name.startswith("HR-EMP-AMER") or name.startswith("HR-EMP-APAC") for name in manifest["received_names"]))
        apac_kept = [name for name in manifest["received_names"] if name.startswith("HR-EMP-APAC")]
        self.assertEqual(len(apac_kept), 4)

    def test_left_rows_count_in_control_total(self) -> None:
        rows = _employees()
        rows.append({"name": "HR-EMP-LEFT-001", "branch_region": "AMER", "status": "Left"})
        from extract import employee_as_of

        versions = [
            {
                "name": row["name"],
                "status": row.get("status", "Active"),
                "branch_region": row["branch_region"],
                "employment_type": "Full-time",
                "date_of_joining": "2020-01-01",
                "modified_date": "2026-08-01",
                "modified": "2026-08-01T12:00:00Z",
            }
            for row in rows
        ]
        asof = employee_as_of(versions, date(2026, 8, 14))
        self.assertEqual(len(asof), 21)
        self.assertTrue(any(r["status"] == "Left" for r in asof))
        manifest = dry_run_apac_employee_fault(asof, date(2026, 8, 15))
        self.assertEqual(manifest["control_total"], 21)

    def test_outside_window_is_complete(self) -> None:
        manifest = dry_run_apac_employee_fault(_employees(), date(2026, 8, 15))
        self.assertEqual(manifest["control_total"], 20)
        self.assertEqual(manifest["rows_received"], 20)
        self.assertEqual(manifest["scenario_ids"], [])
        self.assertEqual(manifest["mode"], "incremental")
        self.assertTrue(manifest["volume_test_ok"])
        self.assertFalse(manifest["isolated"])

    def test_employee_full_extract_only_on_friday(self) -> None:
        from extract import employee_extract_mode

        self.assertEqual(date(2026, 8, 7).strftime("%A"), "Friday")
        self.assertEqual(employee_extract_mode(date(2026, 8, 7)), "full")
        self.assertEqual(employee_extract_mode(date(2026, 8, 10)), "incremental")
        self.assertEqual(employee_extract_mode(date(2026, 8, 14)), "full")
        monday = dry_run_apac_employee_fault(_employees(), date(2026, 8, 10))
        self.assertEqual(monday["mode"], "incremental")
        friday = dry_run_apac_employee_fault(_employees(), date(2026, 8, 7), last_certified_headcount=20)
        self.assertEqual(friday["mode"], "full")
        self.assertEqual(friday["control_total"], 20)


if __name__ == "__main__":
    unittest.main()
