from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from people_refs import PEOPLE_REF, PROD_REF, QUANTREVIEW_STAGING_REF, assert_people_ref, refuse_blocked


class PeopleRefTests(unittest.TestCase):
    def test_assert_people_ref(self):
        self.assertEqual(assert_people_ref(None), "zapmigfrtnwnkmezjefx")
        with self.assertRaises(SystemExit):
            assert_people_ref(QUANTREVIEW_STAGING_REF)
        with self.assertRaises(SystemExit) as ctx:
            refuse_blocked(f"https://{PROD_REF}.supabase.co")
        self.assertIn(PROD_REF, str(ctx.exception))
        self.assertEqual(PEOPLE_REF, "zapmigfrtnwnkmezjefx")


if __name__ == "__main__":
    unittest.main()
