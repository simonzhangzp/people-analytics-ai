from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "serving"))

from apply_policy import classify_table, render_table_sql  # noqa: E402
import yaml

SPEC = yaml.safe_load((ROOT / "serving" / "policy" / "roles.yaml").read_text(encoding="utf-8"))
RLS = yaml.safe_load((ROOT / "serving" / "policy" / "rls.yaml").read_text(encoding="utf-8"))


class PolicyYamlTests(unittest.TestCase):
    def test_mart_is_select(self) -> None:
        self.assertEqual(classify_table("people_mart_workforce_monthly", SPEC), "select")

    def test_snap_is_deny(self) -> None:
        self.assertEqual(classify_table("people_snap_worker_month", SPEC), "deny")

    def test_restricted_is_deny(self) -> None:
        self.assertEqual(classify_table("people_fact_comp_assignment_restricted", SPEC), "deny")

    def test_person_grain_dims_are_deny(self) -> None:
        for name in (
            "people_dim_person",
            "people_dim_worker",
            "people_dim_candidate",
            "people_xw_identity",
        ):
            self.assertEqual(classify_table(name, SPEC), "deny", name)

    def test_render_swap_reapplies_policy(self) -> None:
        sql = render_table_sql("people_mart_workforce_monthly", True, SPEC, RLS)
        self.assertIn("enable row level security", sql)
        self.assertIn("drop policy if exists people_app_read", sql)
        self.assertIn("grant select", sql)
        self.assertIn("create policy people_app_read", sql)
        self.assertIn("people_publisher_all", sql)

    def test_llm_and_agent_tables_are_deny(self) -> None:
        for name in (
            "people_llm_budget",
            "people_llm_call",
            "people_agent_trace",
            "people_agent_tool_call",
        ):
            self.assertEqual(classify_table(name, SPEC), "deny", name)


if __name__ == "__main__":
    unittest.main()
