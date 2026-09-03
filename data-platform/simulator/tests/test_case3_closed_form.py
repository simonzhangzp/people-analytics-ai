from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DP = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(DP))

from case3_closed_form import expected_rates


class Case3ClosedFormTests(unittest.TestCase):
    def test_engineering_lift_and_slice_double(self) -> None:
        payload = expected_rates()
        self.assertGreaterEqual(payload["engineering_overall"]["delta_pp"], 2.0)
        self.assertTrue(payload["engineering_overall"]["meets_target"])
        self.assertAlmostEqual(payload["apac_engineering_1_3y"]["ratio"], 2.0, places=2)
        self.assertTrue(payload["apac_engineering_1_3y"]["meets_target"])


if __name__ == "__main__":
    unittest.main()
