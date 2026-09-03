from __future__ import annotations

"""Apply people_ prefixed schemas to the dedicated People Supabase project only."""

import os
import sys
from pathlib import Path

import psycopg
from psycopg import ClientCursor

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from people_refs import (  # noqa: E402
    BLOCKED_REFS,
    PEOPLE_REF,
    assert_people_ref,
    refuse_blocked,
)
SCHEMA_DIR = ROOT / "serving" / "schemas"
EDGE_ENV = Path(r"D:\EdgeAI_Strategy\.env")
PASSWORD_KEYS = (
    "PEOPLE_SUPABASE_DATABASE_PASSWORD",
    "SUPABASE_DATABASE_PASSWORD_people",
)
PUBLISHER_PASSWORD_KEYS = ("PEOPLE_PUBLISHER_PASSWORD",)
DROP_CANDIDATES = (
    "workspaces",
    "datasets",
    "field_mappings",
    "dataset_relationships",
    "metric_definitions",
    "analysis_questions",
    "insights",
    "executive_stories",
    "ai_usage",
)
PROTECTED_TABLES = ("panorama_daily",)
TWO_GIB = 2_147_483_648


def env(path: Path, name: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith(name + "=") or raw.startswith(name + " ="):
            return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _env_value(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
        value = env(EDGE_ENV, name)
        if value:
            return value
    return None


def load_password() -> str:
    password = _env_value(*PASSWORD_KEYS)
    if not password:
        raise SystemExit(
            "Set PEOPLE_SUPABASE_DATABASE_PASSWORD in env (Hetzner .env / Vercel env)."
        )
    return password


def load_publisher_password() -> str | None:
    return _env_value(*PUBLISHER_PASSWORD_KEYS)


def _pooler_hosts() -> list[str]:
    explicit = _env_value("PEOPLE_SUPABASE_POOLER_HOST")
    hosts = []
    if explicit:
        hosts.append(explicit)
    hosts.extend(
        (
            "aws-1-us-east-1.pooler.supabase.com",
            "aws-0-us-east-1.pooler.supabase.com",
        )
    )
    out = []
    for host in hosts:
        refuse_blocked(host)
        if host not in out:
            out.append(host)
    return out


def _connect_kwargs(host: str, port: int, user: str) -> dict:
    refuse_blocked(host, user, PEOPLE_REF)
    assert_people_ref(PEOPLE_REF, host, user)
    return {
        "host": host,
        "port": port,
        "dbname": "postgres",
        "user": user,
        "password": load_password(),
        "sslmode": "require",
        "connect_timeout": 20,
        "cursor_factory": ClientCursor,
    }


def connect(port: int = 5432):
    """Session pooler (5432) by default. Transaction pooler is 6543."""
    last = None
    user = f"postgres.{PEOPLE_REF}"
    for host in _pooler_hosts():
        try:
            return psycopg.connect(**_connect_kwargs(host, port, user))
        except Exception as exc:
            last = exc
            continue
    raise SystemExit(f"refused: session/transaction pooler connect failed ({last})")


def connect_transaction():
    return connect(port=6543)


def connect_direct():
    """Direct db host for CREATE EXTENSION / ROLE."""
    host = f"db.{PEOPLE_REF}.supabase.co"
    return psycopg.connect(**_connect_kwargs(host, 5432, "postgres"))


def connect_for_ddl():
    """Direct first (CREATE EXTENSION / ROLE); session pooler 5432 fallback."""
    try:
        return connect_direct()
    except Exception as exc:
        print("direct_connect_failed", type(exc).__name__)
        return connect(port=5432)


def connect_publisher(port: int = 5432):
    password = load_publisher_password()
    if not password:
        raise SystemExit("Set PEOPLE_PUBLISHER_PASSWORD in env.")
    last = None
    user = f"people_publisher.{PEOPLE_REF}"
    for host in _pooler_hosts():
        try:
            kwargs = _connect_kwargs(host, port, user)
            kwargs["password"] = password
            return psycopg.connect(**kwargs)
        except Exception as exc:
            last = exc
            continue
    raise SystemExit(f"refused: people_publisher pooler connect failed ({last})")


def run_sql(conn: psycopg.Connection, sql: str, label: str) -> None:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("applied", label)


def _ops() -> dict:
    baseline = ROOT / "simulator" / "scenario" / "baseline.yaml"
    return yaml.safe_load(baseline.read_text(encoding="utf-8")).get("ops") or {}


def publish_delta_bytes(ops: dict | None = None) -> int:
    """occupied + measured × 1.3 is the post-6a admission delta."""
    ops = ops if ops is not None else _ops()
    measured = ops.get("supabase_measured_people_v2_bytes")
    if not measured:
        raise SystemExit("refused: ops.supabase_measured_people_v2_bytes is null (fail-closed)")
    return int(int(measured) * 1.3)


def admission_expected_bytes(ops: dict | None = None) -> int:
    return publish_delta_bytes(ops)


def _disk_quota() -> tuple[int | None, int, int]:
    ops = _ops()
    quota = ops.get("supabase_disk_quota_bytes")
    min_headroom = int(ops.get("supabase_min_headroom_bytes") or TWO_GIB)
    expected = publish_delta_bytes(ops)
    return (int(quota) if quota else None, min_headroom, int(expected))


def _schema_bytes(conn: psycopg.Connection, schema: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            select coalesce(sum(pg_total_relation_size(c.oid)), 0)
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = %s and c.relkind in ('r', 'i', 'm', 't')
            """,
            [schema],
        )
        return int(cur.fetchone()[0])


def disk_occupied(conn: psycopg.Connection) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute("select pg_database_size(current_database())")
        database = int(cur.fetchone()[0])
        cur.execute("select coalesce(sum(pg_database_size(datname::text)), 0) from pg_database")
        all_db = int(cur.fetchone()[0])
        system = max(0, all_db - database)
        wal = 0
        try:
            cur.execute("select coalesce(sum(size), 0) from pg_ls_waldir()")
            wal = int(cur.fetchone()[0])
        except Exception:
            conn.rollback()
            print("wal_bytes_unreadable_assumed_0")
    occupied = database + wal + system
    return {"database_bytes": database, "wal_bytes": wal, "system_bytes": system, "occupied_bytes": occupied}


def assert_disk_budget(
    conn: psycopg.Connection,
    *,
    extra_delta: int = 0,
    include_expected_backfill: bool = True,
) -> dict[str, int]:
    quota, min_headroom, planned = _disk_quota()
    if quota is None:
        raise SystemExit("refused: ops.supabase_disk_quota_bytes is null (fail-closed)")
    occ = disk_occupied(conn)
    expected = planned if include_expected_backfill else 0
    projected = occ["occupied_bytes"] + expected + extra_delta
    allowed = quota - min_headroom
    print("disk_quota_bytes", quota)
    print("disk_occupied", occ)
    print("expected_backfill_delta_bytes", expected)
    print("projected_bytes", projected, "allowed_bytes", allowed)
    if projected > allowed:
        raise SystemExit(
            "refused: database + WAL + system + measured × 1.3 exceeds quota − 2 GiB"
        )
    return {**occ, "quota_bytes": quota, "expected_delta_bytes": expected, "projected_bytes": projected, "allowed_bytes": allowed}


def assert_people_project(conn: psycopg.Connection) -> str:
    assert_people_ref(PEOPLE_REF)
    with conn.cursor() as cur:
        cur.execute("select current_user")
        user = cur.fetchone()[0]
        cur.execute("select inet_server_addr()::text")
        addr = cur.fetchone()[0]
    print("connected_as", user)
    refuse_blocked(user, str(addr or ""), PEOPLE_REF)
    for blocked in BLOCKED_REFS:
        if blocked in user:
            raise SystemExit(f"refused: blocked supabase ref {blocked}")
    if PEOPLE_REF not in user and user not in {"postgres", "people_publisher"}:
        raise SystemExit(f"refused: unexpected role {user}")
    public_bytes = _schema_bytes(conn, "public")
    people_v2_bytes = _schema_bytes(conn, "people_v2")
    print("public_schema_bytes", public_bytes)
    print("people_v2_schema_bytes", people_v2_bytes)
    assert_disk_budget(conn, include_expected_backfill=False)
    return user


def set_publisher_password(conn: psycopg.Connection) -> None:
    password = load_publisher_password()
    if not password:
        print("people_publisher_password_unset")
        return
    with conn.cursor() as cur:
        cur.execute("alter role people_publisher with login password %s", [password])
    conn.commit()
    print("people_publisher_password_set")


def assert_drop_is_safe(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select relname, n_live_tup
            from pg_stat_user_tables
            where schemaname = 'public'
              and relname = any(%s)
            order by 1
            """,
            [list(PROTECTED_TABLES) + list(DROP_CANDIDATES)],
        )
        rows = cur.fetchall()
    print("public_table_stats", rows)
    for name, live_rows in rows:
        if name in PROTECTED_TABLES:
            print("keeping_quantreview_table", name, live_rows)
            continue
        if name in DROP_CANDIDATES and live_rows > 10_000:
            raise SystemExit(
                f"refused: public.{name} has {live_rows} rows; not a People leftover"
            )


def main() -> None:
    raise SystemExit(
        "refused: apply.py warehouse DDL is not used on the dedicated People project. "
        "Use apply_one.py 019_people_v2_bootstrap.sql. Do not apply 000–018 here."
    )


if __name__ == "__main__":
    main()
