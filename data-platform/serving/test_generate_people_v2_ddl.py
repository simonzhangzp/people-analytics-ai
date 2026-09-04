from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "serving"))

from generate_people_v2_ddl import column_spec, render, tables  # noqa: E402


class DdlTypeTests(unittest.TestCase):
    def test_every_column_has_yaml_type(self) -> None:
        for table in tables():
            if table.get("postgres") is False:
                continue
            for col in table.get("columns") or []:
                name, typ = column_spec(col)
                self.assertTrue(name)
                self.assertTrue(typ)

    def test_generated_ddl_matches_model_types(self) -> None:
        sql = render()
        for table in tables():
            if table.get("postgres") is False:
                continue
            name = table["name"]
            if not (table.get("columns") or []):
                continue
            self.assertIn(f"create table if not exists people_v2.{name} (", sql)
            for col in table["columns"]:
                cname, ctype = column_spec(col)
                self.assertIn(f"  {cname} {ctype}", sql)

    def test_no_infer_helper(self) -> None:
        src = (ROOT / "serving" / "generate_people_v2_ddl.py").read_text(encoding="utf-8")
        self.assertNotIn("def infer(", src)


if __name__ == "__main__":
    unittest.main()
