from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DP = ROOT.parent
sys.path.insert(0, str(DP))
sys.path.insert(0, str(ROOT))

import engine as eng
from emit_bronze import emit_bronze
from engine import WorldEngine
from pipeline.lineage import gold_manifest, manifests_equal
from pipeline.transform import transform


class GoldByteReproTests(unittest.TestCase):
    def test_tiny_gold_repeat_is_byte_identical(self) -> None:
        orig_end = eng.END
        eng.END = date(2021, 10, 31)
        lake = Path(tempfile.mkdtemp(prefix="people_repro_"))
        try:
            manifests = []
            for i in range(2):
                prefix = f"tiny_{i}"
                world = WorldEngine(0.02, 20260301, apply_case3=True, lake=lake, prefix=prefix)
                state = world.simulate()
                bronze = emit_bronze(state, lake, prefix)
                silver = lake / "people_silver" / prefix
                gold = lake / "people_gold" / prefix
                con = transform(bronze, silver, gold)
                if i == 0:
                    from pipeline.dq import run_gold_dq

                    gates = {t["test_name"]: t for t in run_gold_dq(con, backfill=True)}
                    orphan = gates["orphan_manager_at_month_end"]
                    span = gates["span_max_le_15"]
                    self.assertEqual(orphan["status"], "passed", orphan)
                    self.assertEqual(span["status"], "passed", span)
                    self.assertEqual(gates["certified_ceo_count"]["status"], "passed", gates["certified_ceo_count"])
                manifests.append(gold_manifest(gold))
            self.assertTrue(manifests[0], "empty gold")
            if not manifests_equal(manifests[0], manifests[1]):
                diff = sorted(set(manifests[0]) | set(manifests[1]))
                changed = [k for k in diff if manifests[0].get(k) != manifests[1].get(k)]
                self.fail(f"gold content hash mismatch: {changed[:20]}")
        finally:
            eng.END = orig_end
            shutil.rmtree(lake, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
