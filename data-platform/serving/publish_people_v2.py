from __future__ import annotations

"""Four-segment people_v2 publish from rehearsal_1p00 parquet. Dedicated project only."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import assert_disk_budget, assert_people_project, connect_publisher, disk_occupied  # noqa: E402
from generate_people_v2_ddl import OUT as DDL_PATH, render  # noqa: E402
from measure_5pct_landing import (  # noqa: E402
    LAKE_ONLY_NEVER,
    _drop_people_v2_user_objects,
    _exec_script,
    _load_table,
    _pg_tables,
)
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

SILVER = ROOT / "lake" / "people_silver" / "rehearsal_1p00"
GOLD = ROOT / "lake" / "people_gold" / "rehearsal_1p00"
REPORT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "publish_6b.json"
GOV = ROOT / "serving" / "schemas" / "021_people_v2_governance.sql"
RPC = ROOT / "serving" / "schemas" / "022_people_v2_rpcs.sql"

SEGMENTS = {
    "dims_xw": ("people_dim_", "people_xw_", "people_ref_"),
    "facts_events": ("people_fact_", "people_evt_", "people_hist_"),
    "snapshots": ("people_snap_",),
    "marts": ("people_mart_",),
}


def _parquet_plan() -> list[tuple[str, Path]]:
    gold_files = {p.stem: p for p in GOLD.glob("people_*.parquet")} if GOLD.exists() else {}
    silver_files = {p.stem: p for p in SILVER.glob("people_*.parquet")} if SILVER.exists() else {}
    names = sorted(set(gold_files) | set(silver_files))
    return [(name, gold_files.get(name) or silver_files[name]) for name in names]


def _segment_for(name: str) -> str | None:
    if name in LAKE_ONLY_NEVER:
        return None
    for segment, prefixes in SEGMENTS.items():
        if name.startswith(prefixes):
            return segment
    return None


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    if not SILVER.exists() or not GOLD.exists():
        raise SystemExit("missing 1.0 lake parquet; run backfill.py --i-have-owner-approval first")
    DDL_PATH.write_text(render(), encoding="utf-8")
    conn = connect_publisher()
    records = []
    loaded: dict[str, int] = {}
    try:
        assert_people_project(conn)
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute("SET idle_in_transaction_session_timeout = 0")
        conn.commit()
        _drop_people_v2_user_objects(conn)
        _exec_script(conn, DDL_PATH.read_text(encoding="utf-8"))
        kinds = _pg_tables(conn)
        plan = _parquet_plan()
        for segment in SEGMENTS:
            before = disk_occupied(conn)
            for table, path in plan:
                if _segment_for(table) != segment:
                    continue
                n = _load_table(conn, table, path, kinds.get(table, ""))
                loaded[table] = n
                print("loaded", segment, table, n, flush=True)
            assert_disk_budget(conn, include_expected_backfill=False)
            after = disk_occupied(conn)
            rec = {
                "segment": segment,
                "pg_database_size_before": before["database_bytes"],
                "pg_database_size_after": after["database_bytes"],
                "delta_bytes": after["database_bytes"] - before["database_bytes"],
                "occupied_after": after["occupied_bytes"],
            }
            records.append(rec)
            print("publish_segment_ok", rec, flush=True)
        _exec_script(conn, GOV.read_text(encoding="utf-8"))
        from load_people_v2_meta import load_meta  # noqa: E402

        load_meta(conn)
        _exec_script(conn, RPC.read_text(encoding="utf-8"))
        final = disk_occupied(conn)
        report = {
            "ref": PEOPLE_REF,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "segments": records,
            "tables_loaded": loaded,
            "final_occupied": final,
            "skipped_lake_only": sorted(LAKE_ONLY_NEVER),
        }
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print("publish_people_v2_ok", REPORT)
        print("final_database_bytes", final["database_bytes"])
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
