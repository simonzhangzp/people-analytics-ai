from __future__ import annotations

import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from business_rules import (
    E6_REASON_MAP,
    appraisal_final_score,
    e6_category,
    ssa_to_date,
)
from transactions import REQUIRED_OBJECTS, TRANSACTIONS, run_all_transactions
from world import tiny_world


class TransactionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.day = date(2026, 4, 8)
        self.world = tiny_world(20260301)

    def test_each_transaction_emits_required_objects(self) -> None:
        for code, fn in TRANSACTIONS.items():
            with self.subTest(code=code):
                result = fn(self.day, self.world)
                self.assertEqual(result["transaction"], code)
                for key in REQUIRED_OBJECTS[code]:
                    self.assertIn(key, result, msg=f"{code} missing {key}")
                    self.assertTrue(result[key], msg=f"{code}.{key} empty")

    def test_t1_offer_accepted_sets_employee_joining_from_starts_on(self) -> None:
        t1 = TRANSACTIONS["T1"](self.day, self.world)
        self.assertEqual(t1["offer"]["status"], "Accepted")
        self.assertEqual(t1["application"]["status"], "hired")
        self.assertFalse(t1["opening"]["open"])
        self.assertEqual(t1["opening"]["application_id"], t1["application"]["id"])
        self.assertEqual(t1["employee"]["date_of_joining"], t1["offer"]["starts_on"])
        self.assertEqual(t1["employee"]["grade"], "G5")
        self.assertEqual(t1["employee"]["employment_type"], "Regular")
        self.assertEqual(t1["salary_structure_assignment"]["docstatus"], 1)
        self.assertEqual(t1["identity"]["match_method"], "transaction")

    def test_t2_property_history_child_rows(self) -> None:
        t2 = TRANSACTIONS["T2"](self.day, self.world)
        self.assertEqual(t2["employee_transfer"]["docstatus"], 1)
        fields = {row["fieldname"] for row in t2["employee_transfer"]["transfer_details"]}
        self.assertIn("department", fields)
        self.assertIn("branch", fields)
        news = {row["fieldname"]: row["new"] for row in t2["employee_transfer"]["transfer_details"]}
        self.assertEqual(t2["employee"]["department"], news["department"])
        self.assertEqual(t2["employee"]["branch"], news["branch"])

    def test_t3_employee_matches_property_history_new(self) -> None:
        t3 = TRANSACTIONS["T3"](self.day, self.world)
        news = {row["fieldname"]: row["new"] for row in t3["employee_promotion"]["promotion_details"]}
        self.assertEqual(t3["employee"]["designation"], news["designation"])
        self.assertEqual(t3["employee"]["grade"], news["grade"])

    def test_t5_reason_in_e6_map(self) -> None:
        t5 = TRANSACTIONS["T5"](self.day, self.world)
        reason = t5["employee"]["reason_for_leaving"]
        self.assertIn(reason, E6_REASON_MAP)
        self.assertEqual(t5["termination_category"], "voluntary")
        self.assertEqual(t5["termination_category"], e6_category(reason))

    def test_t6_rehire_new_employee_same_person(self) -> None:
        t6 = TRANSACTIONS["T6"](self.day, self.world)
        self.assertNotEqual(t6["employee"]["name"], t6["prior_employee"])
        self.assertEqual(t6["hire_event"]["event_type"], "rehire")
        self.assertEqual(t6["hire_event"]["person_id"], t6["identity"]["person_id"])
        self.assertEqual(t6["hire_event"]["worker_id"], t6["employee"]["name"])
        self.assertEqual(t6["identity"]["match_method"], "transaction")

    def test_t9_final_score_from_cycle_average(self) -> None:
        t9 = TRANSACTIONS["T9"](self.day, self.world)
        app = t9["appraisal"]
        expected = appraisal_final_score(app["total_score"], app["self_score"], app["avg_feedback_score"], 0)
        self.assertEqual(app["final_score"], expected)
        self.assertEqual(t9["appraisal_cycle"]["calculate_final_score_based_on_formula"], 0)
        self.assertNotEqual(app["final_score"], app["total_score"])
        self.assertNotEqual(app["final_score"], app["self_score"])

    def test_ssa_to_date_capped_by_termination(self) -> None:
        from_date = date(2024, 4, 1)
        next_from = date(2025, 4, 1)
        termination = date(2025, 3, 15)
        self.assertEqual(ssa_to_date(from_date, next_from, None), date(2025, 3, 31))
        self.assertEqual(ssa_to_date(from_date, next_from, termination), termination)
        self.assertLessEqual(ssa_to_date(from_date, next_from, termination), termination)

    def test_t8_user_employee_id_not_email(self) -> None:
        t8 = TRANSACTIONS["T8"](self.day, self.world)
        self.assertEqual(t8["user"]["employee_id"], t8["employee"]["name"])
        self.assertEqual(t8["identity"]["match_method"], "employee_id")
        self.assertNotIn("primary_email", t8["identity"])

    def test_t12_training_event_and_result(self) -> None:
        t12 = TRANSACTIONS["T12"](self.day, self.world)
        self.assertEqual(t12["training_event"]["docstatus"], 1)
        self.assertEqual(t12["training_result"]["docstatus"], 1)
        self.assertEqual(t12["training_event_employee"][0]["employee"], self.world.existing_employee)
        self.assertGreater(t12["training_result_employee"][0]["hours"], 0)

    def test_t13_skill_map(self) -> None:
        t13 = TRANSACTIONS["T13"](self.day, self.world)
        self.assertEqual(t13["employee_skill_map"]["employee"], self.world.existing_employee)
        self.assertGreaterEqual(len(t13["employee_skills"]), 2)
        self.assertIn("proficiency", t13["employee_skills"][0])

    def test_t11_stages_have_no_days_in_stage(self) -> None:
        t11 = TRANSACTIONS["T11"](self.day, self.world)
        self.assertEqual(len(t11["application_stages"]), 4)
        for row in t11["application_stages"]:
            self.assertNotIn("days_in_stage", row)

    def test_rejected_offer_keeps_opening_open_then_version_bump(self) -> None:
        from transactions import t1_hire_instance

        rejected = t1_hire_instance(self.day, self.world, offer_status="Rejected", offer_version=1)
        self.assertEqual(rejected["offer"]["status"], "Rejected")
        self.assertTrue(rejected["opening"]["open"])
        self.assertIsNone(rejected["opening"]["closed_at"])
        self.assertEqual(rejected["application"]["status"], "rejected")
        accepted = t1_hire_instance(
            self.day,
            self.world,
            offer_status="Accepted",
            offer_version=2,
            opening_id=rejected["opening"]["id"],
            app_id=44002,
            cand_id=33002,
            offer_id=77002,
        )
        self.assertEqual(accepted["offer"]["version"], 2)
        self.assertFalse(accepted["opening"]["open"])
        self.assertEqual(accepted["application"]["status"], "hired")

    def test_seed_replay_is_identical(self) -> None:
        first = json.dumps(run_all_transactions(self.day, tiny_world(20260301)), sort_keys=True)
        second = json.dumps(run_all_transactions(self.day, tiny_world(20260301)), sort_keys=True)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
