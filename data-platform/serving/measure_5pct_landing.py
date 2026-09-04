from __future__ import annotations

"""Load 5% silver/gold into people_v2, measure pg_total_relation_size, ×20, then drop.

Uses people_publisher on zapmigfrtnwnkmezjefx only. Not a step-6b publish.
Gold parquet wins when the same stem exists in silver. Hot-window tables
load the last 12 months to match architecture §7.
"""

import json
import sys
from datetime import date, datetime
from io import StringIO
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import (  # noqa: E402
    TWO_GIB,
    assert_people_project,
    connect_publisher,
    disk_occupied,
)
from generate_people_v2_ddl import OUT as DDL_PATH, render  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

SILVER = ROOT / "lake" / "people_silver" / "rehearsal_0p05"
GOLD = ROOT / "lake" / "people_gold" / "rehearsal_0p05"
BASELINE = ROOT / "simulator" / "scenario" / "baseline.yaml"
REPORT = ROOT / "simulator" / "fixtures" / "rehearsal_0p05" / "landing_5pct.json"
A7_LIMIT = TWO_GIB
LAKE_ONLY_NEVER = {
    "people_fact_candidate_eeoc_restricted",
    "people_fact_candidate_demographic_restricted",
}
RESTRICTED = {
    "people_fact_survey_score_restricted",
}
HOT_WINDOW_START = date(2025, 9, 1)
HOT_WINDOW = {
    "people_fact_application": "applied_at",
    "people_evt_application_stage": "entered_at",
    "people_fact_interview": "start_at",
    "people_fact_scorecard": "submitted_at",
    "people_dim_candidate": "created_at",
}


def _patch_ops(**updates) -> None:
    text = BASELINE.read_text(encoding="utf-8")
    for key, value in updates.items():
        needle = None
        for line in text.splitlines():
            if line.startswith(f"  {key}:"):
                needle = line
                break
        if needle is None:
            raise SystemExit(f"missing ops key {key}")
        rendered = value if isinstance(value, str) else json.dumps(value)
        text = text.replace(needle, f"  {key}: {rendered}", 1)
    BASELINE.write_text(text, encoding="utf-8")


def _split_sql(sql: str) -> list[str]:
    """Split on ';' outside untagged $$ dollar quotes (plpgsql / DO bodies)."""
    parts: list[str] = []
    buf: list[str] = []
    i = 0
    in_dollar = False
    while i < len(sql):
        if sql.startswith("$$", i):
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = sql[i]
        if ch == ";" and not in_dollar:
            stmt = "".join(buf).strip()
            if stmt:
                parts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    rest = "".join(buf).strip()
    if rest:
        parts.append(rest)
    return parts


def _exec_script(conn, sql: str) -> None:
    for stmt in _split_sql(sql):
        conn.execute(stmt)
    conn.commit()


def _pg_tables(conn) -> dict[str, str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select c.relname, c.relkind
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'people_v2'
            """
        )
        return {r[0]: r[1] for r in cur.fetchall()}


def _coerce(df: pd.DataFrame, table: str, cols: list[str]) -> pd.DataFrame:
    subset = df[[c for c in cols if c in df.columns]].copy()
    for col in list(subset.columns):
        series = subset[col]
        if col in HOT_WINDOW and table in HOT_WINDOW:
            pass
        if pd.api.types.is_datetime64_any_dtype(series):
            subset[col] = series.dt.strftime("%Y-%m-%d %H:%M:%S").where(series.notna(), None)
        elif series.dtype == object:
            subset[col] = series.map(
                lambda v: None
                if v is None or (isinstance(v, float) and pd.isna(v))
                else (
                    v.isoformat()
                    if isinstance(v, (date, datetime))
                    else ("{" + ",".join(str(x) for x in v) + "}" if isinstance(v, (list, tuple)) else v)
                )
            )
    if table in HOT_WINDOW:
        col = HOT_WINDOW[table]
        if col in subset.columns:
            parsed = pd.to_datetime(subset[col], errors="coerce")
            subset = subset[parsed.isna() | (parsed.dt.date >= HOT_WINDOW_START)]
    return subset


def _as_bool(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in {"true", "t", "1", "yes"}:
        return True
    if s in {"false", "f", "0", "no", ""}:
        return False if s != "" else None
    return None


def _cast_pg_types(subset: pd.DataFrame, keep: list[str], types: dict[str, tuple[str, str]]) -> pd.DataFrame:
    int_udt = {"int2", "int4", "int8"}
    int_types = {"smallint", "integer", "bigint"}
    float_types = {"double precision", "real", "numeric"}
    float_udt = {"float4", "float8", "numeric"}
    for col in keep:
        if col not in subset.columns:
            continue
        dtype, udt = types[col]
        if dtype == "boolean" or udt == "bool":
            subset[col] = subset[col].map(_as_bool)
        elif dtype in int_types or udt in int_udt:
            subset[col] = pd.to_numeric(subset[col], errors="coerce").astype("Int64")
        elif dtype in float_types or udt in float_udt:
            subset[col] = pd.to_numeric(subset[col], errors="coerce")
    return subset


def _load_table(conn, table: str, path: Path, relkind: str) -> int:
    if table in LAKE_ONLY_NEVER:
        print("skip_lake_only", table)
        return 0
    if relkind != "r":
        print("skip_non_table", table, relkind)
        return 0
    if not path.exists() or path.stat().st_size <= 0:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            """
            select column_name, data_type, udt_name
            from information_schema.columns
            where table_schema = 'people_v2' and table_name = %s
            order by ordinal_position
            """,
            [table],
        )
        meta = [(r[0], r[1], r[2]) for r in cur.fetchall()]
    cols = [m[0] for m in meta]
    types = {m[0]: (m[1], m[2]) for m in meta}
    parquet = pq.ParquetFile(path)
    parquet_cols = set(parquet.schema_arrow.names)
    keep = [c for c in cols if c in parquet_cols]
    if not keep:
        print("skip_no_matching_columns", table)
        return 0
    staging = f"{table}_staging"
    col_list = ", ".join(keep)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET idle_in_transaction_session_timeout = 0")
        cur.execute(f"drop table if exists people_v2.{staging} cascade")
        cur.execute(f"create table people_v2.{staging} (like people_v2.{table} including all)")
    conn.commit()
    total = 0
    try:
        for batch in parquet.iter_batches(columns=keep, batch_size=50_000):
            subset = _coerce(batch.to_pandas(), table, keep)
            subset = _cast_pg_types(subset, keep, types)
            if subset.empty:
                continue
            buf = StringIO()
            subset.to_csv(buf, index=False, header=False, na_rep="\\N")
            with conn.cursor() as cur:
                with cur.copy(
                    f"COPY people_v2.{staging} ({col_list}) FROM STDIN WITH (FORMAT csv, NULL '\\N')"
                ) as copy:
                    copy.write(buf.getvalue())
            conn.commit()
            total += len(subset)
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(f"drop table people_v2.{table} cascade")
            cur.execute(f"alter table people_v2.{staging} rename to {table}")
        conn.commit()
        return total
    except Exception:
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(f"drop table if exists people_v2.{staging} cascade")
        conn.commit()
        raise


def _relation_sizes(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select n.nspname || '.' || c.relname as name,
                   c.relkind,
                   pg_total_relation_size(c.oid) as bytes
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'people_v2' and c.relkind in ('r','m','i','t')
            order by 3 desc, 1
            """
        )
        return [{"name": r[0], "relkind": r[1], "bytes": int(r[2])} for r in cur.fetchall()]


def _drop_people_v2_user_objects(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            do $$
            declare r record;
            begin
              for r in
                select c.relname, c.relkind
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'people_v2' and c.relkind in ('v','m')
              loop
                if r.relkind = 'm' then
                  execute format('drop materialized view if exists people_v2.%I cascade', r.relname);
                else
                  execute format('drop view if exists people_v2.%I cascade', r.relname);
                end if;
              end loop;
              for r in
                select c.relname
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'people_v2' and c.relkind = 'r'
              loop
                execute format('drop table if exists people_v2.%I cascade', r.relname);
              end loop;
            end
            $$;
            """
        )
    conn.commit()


def _parquet_plan() -> list[tuple[str, Path]]:
    gold_files = {p.stem: p for p in GOLD.glob("people_*.parquet")} if GOLD.exists() else {}
    silver_files = {p.stem: p for p in SILVER.glob("people_*.parquet")} if SILVER.exists() else {}
    names = sorted(set(gold_files) | set(silver_files))
    plan = []
    for name in names:
        path = gold_files.get(name) or silver_files[name]
        plan.append((name, path))
    return plan


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    if not SILVER.exists() or not GOLD.exists():
        raise SystemExit("missing 5% lake parquet; run rehearse.py first")
    DDL_PATH.write_text(render(), encoding="utf-8")
    conn = connect_publisher()
    try:
        assert_people_project(conn)
        print("connected_as people_publisher", PEOPLE_REF)
        _drop_people_v2_user_objects(conn)
        _exec_script(conn, DDL_PATH.read_text(encoding="utf-8"))
        kinds = _pg_tables(conn)
        loaded: dict[str, int] = {}
        for table, path in _parquet_plan():
            n = _load_table(conn, table, path, kinds.get(table, ""))
            loaded[table] = n
            print("loaded", table, n, path.parent.name)
        sizes = _relation_sizes(conn)
        table_bytes = [r for r in sizes if r["relkind"] == "r"]
        total = sum(r["bytes"] for r in table_bytes)
        restricted_bytes = sum(
            r["bytes"] for r in table_bytes if r["name"].split(".")[-1] in RESTRICTED
        )
        as_designed_x20 = total * 20
        occ = disk_occupied(conn)
        quota = int(yaml.safe_load(BASELINE.read_text(encoding="utf-8"))["ops"]["supabase_disk_quota_bytes"])
        occupied_empty = max(0, occ["occupied_bytes"] - total)
        headroom = quota - occupied_empty - int(as_designed_x20 * 1.3)
        a7 = "as_designed" if headroom >= TWO_GIB else "lake_only"
        measured = as_designed_x20 if a7 == "as_designed" else max(0, (total - restricted_bytes) * 20)
        report = {
            "ref": PEOPLE_REF,
            "scale_loaded": 0.05,
            "hot_window_start": HOT_WINDOW_START.isoformat(),
            "tables_loaded": loaded,
            "pg_total_relation_size": table_bytes,
            "indexes": [r for r in sizes if r["relkind"] == "i"],
            "bytes_5pct_tables": total,
            "bytes_5pct_restricted": restricted_bytes,
            "full_estimate_x20_as_designed": as_designed_x20,
            "supabase_measured_people_v2_bytes": measured,
            "a7_limit_bytes": TWO_GIB,
            "a7": a7,
            "admission_headroom_bytes": headroom,
            "occupied_during_load": occ,
            "admission_measured_times_1_3": int(measured * 1.3),
        }
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        _patch_ops(
            supabase_measured_people_v2_bytes=measured,
            postgres_publish_restricted_person_level=a7,
            postgres_restricted_fallback_reason="null"
            if a7 == "as_designed"
            else "admission_headroom_below_2_gib",
        )
        print("full_estimate_x20_as_designed", as_designed_x20, "measured", measured, "a7", a7)
        _drop_people_v2_user_objects(conn)
        leftover = [n for n, k in _pg_tables(conn).items() if k in {"r", "v", "m"}]
        print("people_v2_cleared", leftover)
        if leftover:
            raise SystemExit("people_v2 still has user objects after clear: " + ", ".join(leftover))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
