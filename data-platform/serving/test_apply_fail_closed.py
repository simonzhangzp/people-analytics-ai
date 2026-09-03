from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apply import TWO_GIB, _disk_quota, _ops, admission_expected_bytes, refuse_blocked
from people_refs import PEOPLE_REF, PROD_REF, QUANTREVIEW_STAGING_REF, refuse_blocked as refuse_ref


class ApplyFailClosedTests(unittest.TestCase):
    def test_people_ref_is_dedicated_project(self):
        self.assertEqual(PEOPLE_REF, "zapmigfrtnwnkmezjefx")
        self.assertNotIn(PEOPLE_REF, {PROD_REF, QUANTREVIEW_STAGING_REF})

    def test_blocked_refs_fail_closed(self):
        for blocked in (PROD_REF, QUANTREVIEW_STAGING_REF):
            with self.assertRaises(SystemExit) as ctx:
                refuse_blocked("postgres." + blocked)
            self.assertIn("blocked supabase ref", str(ctx.exception))

    def test_apply_import_refuse_matches_people_refs(self):
        for blocked in (PROD_REF, QUANTREVIEW_STAGING_REF):
            with self.assertRaises(SystemExit):
                refuse_ref(blocked)

    def test_apply_main_refuses_warehouse_ddl(self):
        from apply import main

        with self.assertRaises(SystemExit) as ctx:
            main()
        self.assertIn("019_people_v2_bootstrap.sql", str(ctx.exception))

    def test_disk_quota_is_8gib_fail_closed(self):
        quota, headroom, daily = _disk_quota()
        admission = admission_expected_bytes()
        self.assertEqual(quota, 8_589_934_592)
        self.assertEqual(headroom, TWO_GIB)
        measured = int((_ops() or {}).get("supabase_measured_people_v2_bytes"))
        self.assertEqual(daily, int(measured * 1.3))
        self.assertEqual(admission, daily)
        self.assertLessEqual(daily + TWO_GIB, quota)


if __name__ == "__main__":
    unittest.main()
