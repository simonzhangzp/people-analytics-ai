from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_app  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "phase4_tier1_latency.json"


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    samples: list[float] = []
    conn = connect_app()
    try:
        with conn.cursor() as cur:
            cur.execute("select people_v2.people_assert_identity(%s)", ["demo-external-viewer"])
            for _ in range(12):
                t0 = time.perf_counter()
                cur.execute(
                    "select people_v2.people_get_metric_for(%s,%s,null,%s,%s)",
                    ["demo-external-viewer", "headcount", "month", "Engineering"],
                )
                cur.fetchone()
                samples.append((time.perf_counter() - t0) * 1000)
    finally:
        conn.close()
    warmed = samples[2:]
    warmed.sort()
    p95 = warmed[max(0, int(len(warmed) * 0.95) - 1)]
    report = {
        "n": len(warmed),
        "ms": [round(x, 2) for x in warmed],
        "p50_ms": round(statistics.median(warmed), 2),
        "p95_ms": round(p95, 2),
        "max_ms": round(max(warmed), 2),
        "target_p95_ms": 500,
        "ok": p95 < 500,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("tier1_latency", report)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
