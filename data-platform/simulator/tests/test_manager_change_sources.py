from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from masters import bronze_masters


class ManagerChangeSourceTests(unittest.TestCase):
    def test_t7_does_not_write_property_history(self) -> None:
        masters = bronze_masters(
            {
                "workers": [{"worker_id": "HR-EMP-000001"}],
                "openings": [],
                "applications": [],
                "promotions": [],
                "transfers": [],
                "manager_changes": [
                    {
                        "employee": "HR-EMP-000001",
                        "change_date": "2026-04-08",
                        "current": "HR-EMP-000099",
                        "new": "HR-EMP-000200",
                    }
                ],
                "property_history": [],
                "training_events": [],
            }
        )
        rows = masters["Employee_Property_History"]
        self.assertEqual(rows, [])
        self.assertFalse(any((r.get("parenttype") == "Employee") for r in rows))

    def test_engine_property_history_is_used_verbatim(self) -> None:
        ph = [
            {
                "parent": "HR-EMP-PRO-000001",
                "parenttype": "Employee Promotion",
                "idx": 1,
                "property": "grade",
                "fieldname": "grade",
                "current": "G4",
                "new": "G5",
                "employee": "HR-EMP-000001",
                "event_date": "2026-04-08",
            },
            {
                "parent": "HR-EMP-PRO-000001",
                "parenttype": "Employee Promotion",
                "idx": 2,
                "property": "reports_to",
                "fieldname": "reports_to",
                "current": "HR-EMP-000099",
                "new": "HR-EMP-000200",
                "employee": "HR-EMP-000001",
                "event_date": "2026-04-08",
            },
        ]
        masters = bronze_masters(
            {
                "workers": [{"worker_id": "HR-EMP-000001"}],
                "openings": [],
                "applications": [],
                "promotions": [{"name": "HR-EMP-PRO-000001", "employee": "HR-EMP-000001", "promotion_date": "2026-04-08", "grade": "G5"}],
                "transfers": [{"name": "HR-EMP-TRN-000001", "employee": "HR-EMP-000001", "transfer_date": "2026-04-08"}],
                "manager_changes": [],
                "property_history": ph,
                "training_events": [],
            }
        )
        rows = masters["Employee_Property_History"]
        self.assertEqual(rows, ph)
        self.assertFalse(any(r.get("fieldname") == "department" and r.get("current") is None and r.get("new") is None for r in rows))

    def test_t7_transaction_has_no_transfer_or_property_history(self) -> None:
        from transactions import TRANSACTIONS
        from world import tiny_world

        t7 = TRANSACTIONS["T7"](date(2026, 4, 8), tiny_world(20260301))
        self.assertEqual(t7["source_object"], "Employee (extract diff)")
        self.assertNotIn("employee_transfer", t7)
        self.assertNotIn("employee_promotion", t7)
        self.assertNotIn("employee_property_history", t7)


class SameDayEmployeeVersionOrderTests(unittest.TestCase):
    def test_hist_switch_orders_same_day_rows_by_valid_to(self) -> None:
        import duckdb

        con = duckdb.connect()
        con.execute(
            """
            CREATE TABLE people_hist_worker_attr AS
            SELECT * FROM (VALUES
              ('HR-EMP-1', DATE '2021-12-24', DATE '2021-12-24', 'G4', 'M1'),
              ('HR-EMP-1', DATE '2021-12-24', DATE '2023-04-15', 'G5', 'M1'),
              ('HR-EMP-1', DATE '2023-04-15', NULL::DATE, 'G5', 'M2')
            ) t(worker_id, valid_from, valid_to, grade_id, manager_worker_id);
            CREATE TABLE people_evt_worker_change AS
            SELECT * FROM (VALUES
              ('HR-EMP-1', DATE '2021-12-24', 'grade'),
              ('HR-EMP-1', DATE '2023-04-15', 'reports_to')
            ) t(worker_id, event_date, property);
            """
        )
        attr_map = [("grade_id", "grade"), ("manager_worker_id", "reports_to")]
        hist_union = " UNION ALL ".join(
            f"""
            SELECT worker_id, switch_date, property FROM (
              SELECT worker_id, valid_from AS switch_date, '{prop}' AS property,
                     {col} AS cur_val,
                     lag({col}) OVER (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31')) AS prev_val,
                     row_number() OVER (PARTITION BY worker_id ORDER BY valid_from, coalesce(valid_to, DATE '9999-12-31')) AS rn
              FROM people_hist_worker_attr
            ) WHERE rn > 1 AND prev_val IS DISTINCT FROM cur_val
            """
            for col, prop in attr_map
        )
        missing = con.execute(
            f"""
            SELECT count(*) FROM (
              SELECT worker_id, switch_date, property FROM ({hist_union})
              EXCEPT
              SELECT worker_id, event_date, property FROM people_evt_worker_change
            )
            """
        ).fetchone()[0]
        extra = con.execute(
            f"""
            SELECT count(*) FROM (
              SELECT worker_id, event_date, property FROM people_evt_worker_change
              EXCEPT
              SELECT worker_id, switch_date, property FROM ({hist_union})
            )
            """
        ).fetchone()[0]
        self.assertEqual(missing, 0)
        self.assertEqual(extra, 0)


if __name__ == "__main__":
    unittest.main()
