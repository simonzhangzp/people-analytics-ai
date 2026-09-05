from __future__ import annotations

"""Apply 025 trend RPC to People serving. DDL via postgres; fail-closed on blocked refs."""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_for_ddl  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

SQL_PATH = Path(__file__).resolve().parent / "schemas" / "025_people_v2_metric_trend_t12m.sql"


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = connect_for_ddl()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
            t0 = time.perf_counter()
            cur.execute(
                "select people_v2.people_get_metric_trend(%s, 'voluntary_attrition_rate', 24, 'Engineering')",
                ["demo-external-viewer"],
            )
            payload = cur.fetchone()[0]
            first_ms = (time.perf_counter() - t0) * 1000
            t0 = time.perf_counter()
            cur.execute(
                "select people_v2.people_get_metric_trend(%s, 'voluntary_attrition_rate', 24, 'Engineering')",
                ["demo-external-viewer"],
            )
            payload = cur.fetchone()[0]
            second_ms = (time.perf_counter() - t0) * 1000
        points = payload.get("points") if isinstance(payload, dict) else []
        print("trend_points", len(points) if isinstance(points, list) else points)
        print("warmup_ms", round(first_ms, 1), "cached_ms", round(second_ms, 1), "cached", payload.get("cached"))
        if isinstance(points, list) and points:
            print("first", points[0].get("as_of"), points[0].get("value"), points[0].get("grain"))
            print("last", points[-1].get("as_of"), points[-1].get("value"), points[-1].get("grain"))
        ok = isinstance(points, list) and len(points) >= 20 and second_ms < 2000
        return 0 if ok else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
