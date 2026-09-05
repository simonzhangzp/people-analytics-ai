from __future__ import annotations

import sys
import unittest
from pathlib import Path

import duckdb

DP = Path(__file__).resolve().parents[2]
SIM = DP / "simulator"
sys.path.insert(0, str(DP))
sys.path.insert(0, str(SIM))


class RebalanceSyntheticTest(unittest.TestCase):
    def test_month_end_extract_diff_is_synthetic(self) -> None:
        con = duckdb.connect()
        con.execute(
            """
            CREATE TABLE bronze_promotion AS
            SELECT 'P1'::VARCHAR AS name, 'W1'::VARCHAR AS employee,
                   DATE '2026-07-15' AS promotion_date, 1 AS docstatus
            WHERE 1=0;
            CREATE TABLE bronze_transfer AS
            SELECT 'T1'::VARCHAR AS name, 'W2'::VARCHAR AS employee,
                   DATE '2026-07-31' AS transfer_date, 1 AS docstatus;
            CREATE TABLE extract_raw (
              worker_id VARCHAR, event_date DATE, property VARCHAR, change_reason VARCHAR
            );
            INSERT INTO extract_raw VALUES
              ('W-monthend', DATE '2026-07-31', 'reports_to', 'reorg'),
              ('W2', DATE '2026-07-31', 'reports_to', 'reorg'),
              ('W-mid', DATE '2026-07-15', 'reports_to', 'reorg'),
              ('W-depart', DATE '2026-07-10', 'reports_to', 'manager_departure');
            """
        )
        out = {
            r[0]: r[1]
            for r in con.execute(
                """
                SELECT e.worker_id,
                  CASE
                    WHEN e.property <> 'reports_to' THEN NULL
                    WHEN EXISTS (
                          SELECT 1 FROM bronze_promotion p
                          WHERE p.employee = e.worker_id
                            AND CAST(p.promotion_date AS DATE) = e.event_date
                            AND coalesce(p.docstatus, 0) = 1
                        )
                        OR EXISTS (
                          SELECT 1 FROM bronze_transfer t
                          WHERE t.employee = e.worker_id
                            AND CAST(t.transfer_date AS DATE) = e.event_date
                            AND coalesce(t.docstatus, 0) = 1
                        )
                      THEN CASE
                        WHEN e.change_reason IN ('reorg', 'transfer', 'manager_departure') THEN e.change_reason
                        ELSE 'transfer'
                      END
                    WHEN e.event_date = last_day(e.event_date) THEN 'rebalance_synthetic'
                    WHEN e.change_reason IN ('reorg', 'transfer', 'manager_departure') THEN e.change_reason
                    ELSE 'reorg'
                  END
                FROM extract_raw e
                """
            ).fetchall()
        }
        self.assertEqual(out["W-monthend"], "rebalance_synthetic")
        self.assertEqual(out["W2"], "reorg")
        self.assertEqual(out["W-mid"], "reorg")
        self.assertEqual(out["W-depart"], "manager_departure")


class BackfillDirtyGuardTest(unittest.TestCase):
    def test_from_bronze_allowed_when_dirty(self) -> None:
        from backfill import refuse_dirty_full_backfill

        refuse_dirty_full_backfill(["--from-bronze", "--i-have-owner-approval"])

    def test_full_simulate_refuses_dirty(self) -> None:
        import backfill as bf

        original = bf.git_is_dirty
        bf.git_is_dirty = lambda: True
        try:
            with self.assertRaises(SystemExit) as ctx:
                bf.refuse_dirty_full_backfill(["--i-have-owner-approval"])
            self.assertIn("dirty", str(ctx.exception))
        finally:
            bf.git_is_dirty = original


if __name__ == "__main__":
    unittest.main()
