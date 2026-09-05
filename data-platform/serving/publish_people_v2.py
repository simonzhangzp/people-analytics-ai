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

from apply import assert_disk_budget, assert_people_project, connect_for_ddl, connect_publisher, disk_occupied, enable_people_app_login  # noqa: E402
from generate_people_v2_ddl import OUT as DDL_PATH, event_views, render  # noqa: E402
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
REPORT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "publish_data_v1.json"
GOV = ROOT / "serving" / "schemas" / "021_people_v2_governance.sql"
RPC = ROOT / "serving" / "schemas" / "022_people_v2_rpcs.sql"
STEP7 = ROOT / "serving" / "schemas" / "024_people_v2_step7.sql"

SEGMENTS = {
    "dims_xw": ("people_dim_", "people_xw_", "people_ref_"),
    "facts_events": ("people_fact_", "people_evt_", "people_hist_"),
    "snapshots": ("people_snap_",),
    "marts": ("people_mart_",),
}


def _checkpoint_until_budget(ddl) -> None:
    """Publisher cannot read pg_ls_waldir; postgres can. COPY leaves WAL until checkpoint."""
    from apply import TWO_GIB, assert_disk_budget, disk_occupied, _disk_quota  # noqa: E402

    quota, min_headroom, _planned = _disk_quota()
    allowed = int(quota) - min_headroom
    for attempt in range(12):
        try:
            with ddl.cursor() as cur:
                cur.execute("CHECKPOINT")
            ddl.commit()
            print("checkpoint_ok", attempt, flush=True)
        except Exception as exc:
            ddl.rollback()
            print("checkpoint_skipped", type(exc).__name__, exc, flush=True)
        occ = disk_occupied(ddl)
        print("disk_occupied_ddl", occ, flush=True)
        durable = occ["database_bytes"] + occ["system_bytes"]
        if occ["occupied_bytes"] <= allowed:
            return
        if durable <= allowed:
            print(
                "wal_transient_ok",
                "durable",
                durable,
                "wal",
                occ["wal_bytes"],
                "allowed",
                allowed,
                flush=True,
            )
            return
        print("disk_retry", attempt, occ["occupied_bytes"], ">", allowed, flush=True)
        if attempt == 11:
            assert_disk_budget(ddl, include_expected_backfill=False)
        import time

        time.sleep(15)


def _finish_governance(conn, ddl) -> tuple[bool, list[str], bool]:
    from apply_policy import apply_all, seed_demo_identities, verify  # noqa: E402
    from pipeline.lineage import data_v1_commit_sha, run_lineage  # noqa: E402

    pointer_moved = False
    policy_errors: list[str] = []
    login_ok = False
    _checkpoint_until_budget(ddl)
    with ddl.cursor() as cur:
        cur.execute("select current_user")
        print("ddl_user", cur.fetchone()[0], flush=True)
    _exec_script(ddl, STEP7.read_text(encoding="utf-8"))
    print("step7_sql_ok", flush=True)
    apply_all(conn, fallback=ddl)
    seed_demo_identities(ddl)
    login_ok = enable_people_app_login(ddl)
    policy_errors = verify(conn)
    if policy_errors:
        print("post_publish_policy_failed", policy_errors, flush=True)
        return pointer_moved, policy_errors, login_ok
    lineage = run_lineage(20260301, GOLD)
    bronze_sha = data_v1_commit_sha()
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into people_v2.people_serving_run
              (run_id, started_at, finished_at, certified, notes,
               simulator_code_sha, seed, scenario_versions, baseline_sha)
            values (%s, now(), now(), true, %s, %s, %s, %s::jsonb, %s)
            on conflict (run_id) do update set
              certified = excluded.certified,
              finished_at = excluded.finished_at,
              simulator_code_sha = excluded.simulator_code_sha,
              seed = excluded.seed,
              notes = excluded.notes,
              scenario_versions = excluded.scenario_versions,
              baseline_sha = excluded.baseline_sha
            """,
            [
                "data-v1",
                "data-v1.1 gold rebuild; bronze frozen at data-v1; simulator_code_sha is the data-v1 tag commit",
                bronze_sha,
                lineage.get("seed"),
                json.dumps(lineage.get("scenario_versions") or {}),
                lineage.get("baseline_sha"),
            ],
        )
        cur.execute(
            """
            insert into people_v2.people_serving_pointer
              (pointer_id, as_of, extract_id, moved, notes)
            values
              ('current_certified', date '2026-08-31', 'data-v1', true, 'policy verified'),
              ('incident_replay', date '2026-08-14', 'run-2026-08-14', false, 'Case 2 isolated extract; pointer does not move')
            on conflict (pointer_id) do update set
              extract_id = excluded.extract_id, moved = excluded.moved,
              notes = excluded.notes, as_of = excluded.as_of
            """
        )
    conn.commit()
    return True, policy_errors, login_ok


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    if not SILVER.exists() or not GOLD.exists():
        raise SystemExit("missing 1.0 lake parquet; run backfill.py --i-have-owner-approval first")
    finish_only = "--finish-step7" in sys.argv
    DDL_PATH.write_text(render(), encoding="utf-8")
    conn = connect_publisher()
    records = []
    loaded: dict[str, int] = {}
    try:
        if not finish_only:
            assert_people_project(conn)
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = 0")
                cur.execute("SET idle_in_transaction_session_timeout = 0")
            conn.commit()
            # people_publisher owns people_v2 relations (grant_publisher_ownership.py)
            # and performs DROP / truncate-swap without the postgres superuser.
            _drop_people_v2_user_objects(conn)
            print("dropped_people_v2_as", "people_publisher", flush=True)
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
            _exec_script(conn, event_views())
            _exec_script(conn, GOV.read_text(encoding="utf-8"))
            from load_people_v2_meta import load_meta  # noqa: E402

            load_meta(conn)
            _exec_script(conn, RPC.read_text(encoding="utf-8"))
        else:
            print("finish_step7_only", flush=True)
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = 0")
            conn.commit()
        pointer_moved = False
        policy_errors: list[str] = []
        login_ok = False
        ddl = None
        try:
            ddl = connect_for_ddl()
            pointer_moved, policy_errors, login_ok = _finish_governance(conn, ddl)
        finally:
            if ddl is not None:
                ddl.close()
        final = disk_occupied(conn)
        report = {
            "ref": PEOPLE_REF,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "segments": records,
            "tables_loaded": loaded,
            "final_occupied": final,
            "skipped_lake_only": sorted(LAKE_ONLY_NEVER),
            "policy_errors": policy_errors,
            "pointer_moved": pointer_moved,
            "people_app_login": login_ok,
            "finish_step7_only": finish_only,
        }
        if finish_only and REPORT.exists():
            prev = json.loads(REPORT.read_text(encoding="utf-8"))
            if prev.get("segments") and not records:
                report["segments"] = prev["segments"]
            if prev.get("tables_loaded") and not loaded:
                report["tables_loaded"] = prev["tables_loaded"]
            report["segments_source"] = prev.get("segments_source") or "prior publish load"
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print("publish_people_v2_ok", REPORT)
        print("final_database_bytes", final["database_bytes"], "pointer_moved", pointer_moved)
        if policy_errors or not pointer_moved:
            return 1
        return 0
    finally:
        conn.close()


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


if __name__ == "__main__":
    raise SystemExit(main())
