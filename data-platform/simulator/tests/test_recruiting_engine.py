from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DP = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(DP))

from engine import WorldEngine


class RecruitingEngineTests(unittest.TestCase):
    def test_hires_equal_accepted_offers_and_no_t1_bypass(self) -> None:
        state = WorldEngine(scale=0.004, seed=20260301, apply_case3=True).simulate()
        self.assertEqual(state["window_hires"], state["accepted_offers"])
        self.assertGreater(state["window_hires"], 0)
        rejected = [o for o in state["offers"] if o["status"] == "Rejected"]
        accepted_by_opening = {o["opening_id"] for o in state["offers"] if o["status"] == "Accepted"}
        for row in rejected:
            opening = next(o for o in state["openings"] if o["id"] == row["opening_id"])
            if row["opening_id"] in accepted_by_opening:
                self.assertFalse(opening["open"])
            elif opening.get("close_reason_id") == 99:
                self.assertFalse(opening["open"])
            else:
                self.assertTrue(opening["open"])
        from datetime import date as date_cls

        window_bypass = [w for w in state["workers"] if (not w["via_t1"]) and w["hire_date"] >= date_cls(2021, 9, 1)]
        self.assertEqual(window_bypass, [])
        from funnel import cancelled_openings_for_hires

        cancelled = [o for o in state["openings"] if o.get("close_reason_id") == 99]
        filled = [o for o in state["openings"] if o.get("close_reason_id") != 99]
        self.assertEqual(len(cancelled), cancelled_openings_for_hires(state["window_hires"], 0.10))
        self.assertGreater(len(filled), 0)
        for row in cancelled:
            self.assertFalse(row["open"])
            self.assertIsNone(row.get("application_id"))


if __name__ == "__main__":
    unittest.main()
