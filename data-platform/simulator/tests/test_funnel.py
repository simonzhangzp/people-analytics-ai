from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from funnel import cancelled_openings_for_hires, lognormal_count, lognormal_days
import random


class FunnelTests(unittest.TestCase):
    def test_cancelled_openings_for_hires_is_rate_over_remaining(self) -> None:
        self.assertEqual(cancelled_openings_for_hires(90, 0.10), 10)
        self.assertEqual(cancelled_openings_for_hires(2575, 0.10), 286)
        self.assertEqual(cancelled_openings_for_hires(0, 0.10), 0)

    def test_lognormal_median_near_target(self) -> None:
        rng = random.Random(20260301)
        draws = [lognormal_count(rng, 100) for _ in range(2000)]
        draws.sort()
        median = draws[len(draws) // 2]
        self.assertGreater(median, 70)
        self.assertLess(median, 140)

    def test_lognormal_days_p90_over_p50_at_least_two(self) -> None:
        rng = random.Random(20260301)
        draws = [lognormal_days(rng, 32, 0.72, lo=10, hi=240) for _ in range(4000)]
        draws.sort()
        p50 = draws[len(draws) // 2]
        p90 = draws[int(len(draws) * 0.9)]
        self.assertGreaterEqual(p90 / p50, 2.0)


if __name__ == "__main__":
    unittest.main()
