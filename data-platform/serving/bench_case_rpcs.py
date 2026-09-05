from __future__ import annotations

"""Measure people_get_metric_for / breakdown / case3 p50/p95 on the Micro serving project."""

import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_app  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "gate3_rpc_timing.json"
IDENTITIES = (
    "demo-external-viewer",
    "demo-leader-engineering",
    "demo-hrbp",
    "demo-people-analyst",
)
CALLS = (
    ("case1_headcount_eng", "select people_v2.people_get_metric_for(%s, 'headcount', date '2026-08-31', 'trailing_12m', 'Engineering')"),
    ("case1_headcount_co", "select people_v2.people_get_metric_for(%s, 'headcount', date '2026-08-31')"),
    ("case3_vol_eng", "select people_v2.people_get_metric_for(%s, 'voluntary_attrition_rate', date '2026-08-31', 'month', 'Engineering')"),
    ("case3_breakdown", "select people_v2.people_get_metric_breakdown(%s, 'voluntary_attrition_rate', 'location_tenure_grade', date '2026-08-31', 'Engineering')"),
    ("case3_trend", "select people_v2.people_get_metric_trend(%s, 'voluntary_attrition_rate', 12, 'Engineering')"),
    ("case3_signals", "select people_v2.people_get_case3_signals(%s, date '2026-08-31')"),
)


def _time(cur, sql: str, ident: str, repeats: int = 7) -> dict:
    samples = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        cur.execute(sql, [ident])
        cur.fetchone()
        samples.append((time.perf_counter() - t0) * 1000)
    samples.sort()
    return {
        "p50_ms": round(statistics.median(samples), 1),
        "p95_ms": round(samples[max(0, int(len(samples) * 0.95) - 1)], 1),
        "max_ms": round(samples[-1], 1),
        "n": repeats,
    }


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    conn = connect_app()
    report = {"ref": PEOPLE_REF, "calls": [], "over_2s": []}
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '60s'")
        for name, sql in CALLS:
            timing = _time(cur, sql, "demo-external-viewer")
            row = {"name": name, **timing}
            report["calls"].append(row)
            print("rpc", row, flush=True)
            if timing["p95_ms"] > 2000:
                report["over_2s"].append(row)
        for ident in IDENTITIES:
            t0 = time.perf_counter()
            cur.execute(
                "select people_v2.people_get_metric_breakdown(%s, 'voluntary_attrition_rate', 'location_tenure_grade', date '2026-08-31', 'Engineering')",
                [ident],
            )
            payload = cur.fetchone()[0]
            cells = payload.get("cells") if isinstance(payload, dict) else []
            suppressed = sum(1 for c in cells if isinstance(c, dict) and c.get("suppressed"))
            report.setdefault("role_switch", []).append(
                {
                    "identity": ident,
                    "min_cell": payload.get("min_cell") if isinstance(payload, dict) else None,
                    "cells": len(cells) if isinstance(cells, list) else 0,
                    "suppressed": suppressed,
                    "ms": round((time.perf_counter() - t0) * 1000, 1),
                }
            )
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
