from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
sys.path.insert(0, str(ROOT))

from pipeline.bronze_contracts import contract_objects, non_contract_bronze_objects


class BronzeContractTests(unittest.TestCase):
    def test_index_has_51_contracts(self) -> None:
        self.assertEqual(len(contract_objects()), 51)
        self.assertIn(("frappe_hr", "Employee"), contract_objects())
        self.assertIn(("greenhouse_v3", "user"), contract_objects())

    def test_canonical_identity_is_not_a_contract(self) -> None:
        root = Path(tempfile.mkdtemp())
        (root / "canonical" / "identity").mkdir(parents=True)
        (root / "frappe_hr" / "Employee").mkdir(parents=True)
        bad = non_contract_bronze_objects(root)
        self.assertIn("canonical/identity", bad)
        self.assertNotIn("frappe_hr/Employee", bad)

    def test_people_ref_comp_band_is_not_a_contract(self) -> None:
        root = Path(tempfile.mkdtemp())
        (root / "engagement_ext" / "people_ref_comp_band").mkdir(parents=True)
        bad = non_contract_bronze_objects(root)
        self.assertIn("engagement_ext/people_ref_comp_band", bad)


if __name__ == "__main__":
    unittest.main()
