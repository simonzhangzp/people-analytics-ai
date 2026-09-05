from __future__ import annotations

"""Apply 026 Case 3 t12m breakdown RPC. DDL via postgres; fail-closed on blocked refs."""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_for_ddl  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

SQL_PATH = Path(__file__).resolve().parent / "schemas" / "026_people_v2_breakdown_t12m.sql"
IDENTITIES = (
    "demo-external-viewer",
    "demo-leader-engineering",
    "demo-hrbp",
    "demo-people-analyst",
)


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = connect_for_ddl()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            t0 = time.perf_counter()
            cur.execute(
                "select people_v2.people_get_metric_breakdown(%s, 'voluntary_attrition_rate', 'location_tenure_grade', date '2026-08-31', 'Engineering')",
                ["demo-external-viewer"],
            )
            payload = cur.fetchone()[0]
            first_ms = (time.perf_counter() - t0) * 1000
            t0 = time.perf_counter()
            cur.execute(
                "select people_v2.people_get_metric_breakdown(%s, 'voluntary_attrition_rate', 'location_tenure_grade', date '2026-08-31', 'Engineering')",
                ["demo-external-viewer"],
            )
            payload = cur.fetchone()[0]
            second_ms = (time.perf_counter() - t0) * 1000
        cells = payload.get("cells") if isinstance(payload, dict) else []
        visible = [
            c
            for c in cells
            if isinstance(c, dict) and c.get("suppressed") is not True and c.get("value") is not None
        ]
        visible.sort(key=lambda c: float(c.get("value") or 0), reverse=True)
        suppressed = sum(1 for c in cells if isinstance(c, dict) and c.get("suppressed"))
        top = visible[0] if visible else {}
        print("cells", len(cells) if isinstance(cells, list) else cells)
        print("window", payload.get("window"), "grain", payload.get("grain"))
        print("warmup_ms", round(first_ms, 1), "cached_ms", round(second_ms, 1))
        print("visitor_suppressed", suppressed, "top", top.get("location_id"), top.get("value"))
        roles = []
        with conn.cursor() as cur:
            for ident in IDENTITIES:
                cur.execute(
                    "select people_v2.people_get_metric_breakdown(%s, 'voluntary_attrition_rate', 'location_tenure_grade', date '2026-08-31', 'Engineering')",
                    [ident],
                )
                row = cur.fetchone()[0]
                n_cells = row.get("cells") if isinstance(row, dict) else []
                hid = sum(1 for c in n_cells if isinstance(c, dict) and c.get("suppressed"))
                vis = [c for c in n_cells if isinstance(c, dict) and c.get("suppressed") is not True]
                max_rate = max((float(c.get("value") or 0) for c in vis), default=0)
                roles.append((ident, hid, round(max_rate, 4)))
                print("role", ident, "hidden", hid, "max_visible_rate", round(max_rate, 4))
        ok = (
            isinstance(cells, list)
            and payload.get("grain") == "trailing_12m"
            and payload.get("window") == "trailing-12m (annualized)"
            and second_ms < 2000
            and [r[1] for r in roles] == [44, 42, 34, 30]
            and all(r[2] < 0.6 for r in roles)
        )
        return 0 if ok else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
