from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from org_tree import MANAGER_SHARE, MAX_LEVEL, build_company_tree, place_hire, tree_stats


def _workers(n: int, mix: dict[str, float]) -> list[dict]:
    families = []
    for fam, share in mix.items():
        families.extend([fam] * max(1, int(round(n * share))))
    families = (families + ["Other"] * n)[:n]
    return [
        {
            "worker_id": f"HR-EMP-{i:06d}",
            "job_family": families[i],
            "termination_date": None,
            "reports_to": None,
        }
        for i in range(n)
    ]


class OrgTreeTests(unittest.TestCase):
    def test_department_tree_span_and_manager_share(self) -> None:
        dept = {
            "Engineering": "Engineering - Platform",
            "Sales": "Sales - Enterprise",
            "Exec": "Office of the CEO",
            "Other": "Operations - Core",
        }
        workers = _workers(2000, {"Engineering": 0.35, "Sales": 0.20, "Exec": 0.03, "Other": 0.42})
        ceo = build_company_tree(workers, dept)
        self.assertTrue(ceo)
        stats = tree_stats(workers)
        self.assertGreaterEqual(stats["span_mean"], 5.0)
        self.assertLessEqual(stats["span_mean"], 9.0)
        self.assertGreaterEqual(stats["is_manager_share"], 0.10)
        self.assertLessEqual(stats["is_manager_share"], 0.15)
        self.assertLessEqual(stats["max_level"], MAX_LEVEL)
        ceo_row = next(w for w in workers if w["worker_id"] == ceo)
        self.assertIsNone(ceo_row["reports_to"])
        self.assertAlmostEqual(MANAGER_SHARE, 0.12)

    def test_no_cycles(self) -> None:
        dept = {
            "Engineering": "Engineering - Platform",
            "Sales": "Sales - Enterprise",
            "Exec": "Office of the CEO",
            "Other": "Operations - Core",
        }
        workers = _workers(400, {"Engineering": 0.4, "Sales": 0.2, "Exec": 0.05, "Other": 0.35})
        build_company_tree(workers, dept)
        by_id = {w["worker_id"]: w for w in workers}
        for w in workers:
            seen = set()
            cur = w["worker_id"]
            steps = 0
            while cur and steps <= MAX_LEVEL + 2:
                if cur in seen:
                    self.fail(f"cycle at {cur}")
                seen.add(cur)
                cur = by_id[cur].get("reports_to")
                steps += 1
            self.assertLessEqual(steps, MAX_LEVEL + 2)

    def test_place_hire_scales_linearly(self) -> None:
        import time

        dept = {
            "Engineering": "Engineering - Platform",
            "Sales": "Sales - Enterprise",
            "Exec": "Office of the CEO",
            "Other": "Operations - Core",
        }
        workers = _workers(3000, {"Engineering": 0.4, "Sales": 0.2, "Exec": 0.05, "Other": 0.35})
        ceo = build_company_tree(workers, dept)
        t0 = time.perf_counter()
        for i in range(250):
            w = {
                "worker_id": f"HR-EMP-H{i:06d}",
                "job_family": "Engineering",
                "termination_date": None,
                "reports_to": None,
            }
            workers.append(w)
            place_hire(workers, w, dept, ceo)
        elapsed = time.perf_counter() - t0
        self.assertLess(elapsed, 2.0, f"place_hire 250 hires took {elapsed:.2f}s")


if __name__ == "__main__":
    unittest.main()
