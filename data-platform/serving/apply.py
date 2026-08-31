from __future__ import annotations

"""Apply people_ prefixed schemas to the People Supabase project only."""

from pathlib import Path

import psycopg
from psycopg import ClientCursor

PEOPLE_REF = "kgxbomcmgkwlmzyevqjw"
PROD_REF = "fyvivwgyisrtmehzjqlv"
ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "serving" / "schemas"
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


def load_password() -> str:
    password = env(Path(r"D:\EdgeAI_Strategy\.env"), "SUPABASE_DATABASE_PASSWORD_staging")
    if not password:
        raise SystemExit("Set SUPABASE_DATABASE_PASSWORD_staging.")
    return password


def connect():
    return psycopg.connect(
        host="aws-1-us-east-1.pooler.supabase.com",
        port=5432,
        dbname="postgres",
        user=f"postgres.{PEOPLE_REF}",
        password=load_password(),
        sslmode="require",
        connect_timeout=20,
        cursor_factory=ClientCursor,
    )


def run_sql(conn: psycopg.Connection, sql: str, label: str) -> None:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("applied", label)


def assert_people_project(conn: psycopg.Connection) -> str:
    with conn.cursor() as cur:
        cur.execute("select current_user")
        user = cur.fetchone()[0]
        cur.execute("select pg_database_size(current_database())")
        db_bytes = cur.fetchone()[0]
    print("connected_as", user)
    print("database_bytes", db_bytes)
    if PROD_REF in user:
        raise SystemExit("refused: production project")
    # Session pooler reports current_user as postgres; the DSN user is still
    # postgres.<PEOPLE_REF> and PEOPLE_REF is hardcoded in connect().
    if PEOPLE_REF not in user and user != "postgres":
        raise SystemExit(f"refused: unexpected role {user}")
    # QuantReview production was 1.27 GB; staging leftover copy is ~0.7 GB.
    if db_bytes > 1_100_000_000:
        raise SystemExit("refused: database larger than staging snapshot")
    return user


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
    files = [
        SCHEMA_DIR / "000_drop_legacy_unprefixed.sql",
        SCHEMA_DIR / "010_people_warehouse.sql",
        SCHEMA_DIR / "011_people_workbench.sql",
        SCHEMA_DIR / "012_people_grants.sql",
        SCHEMA_DIR / "013_people_seed_metrics.sql",
        SCHEMA_DIR / "014_people_pipeline.sql",
        SCHEMA_DIR / "015_people_serving.sql",
        SCHEMA_DIR / "016_people_rpcs.sql",
        SCHEMA_DIR / "017_people_serving_snapshot.sql",
    ]
    with connect() as conn:
        assert_people_project(conn)
        assert_drop_is_safe(conn)
        for path in files:
            run_sql(conn, path.read_text(encoding="utf-8"), path.name)
        with conn.cursor() as cur:
            cur.execute(
                """
                select tablename
                from pg_tables
                where schemaname = 'public' and tablename like 'people_%'
                order by 1
                """
            )
            print("people_tables", [row[0] for row in cur.fetchall()])
            cur.execute("select to_regclass('public.workspaces')")
            print("legacy_workspaces", cur.fetchone()[0])
            cur.execute("select to_regclass('public.panorama_daily')")
            print("quantreview_panorama_daily", cur.fetchone()[0])
            cur.execute("select count(*) from public.people_mart_workforce_overview")
            print("people_mart_workforce_overview_rows", cur.fetchone()[0])


if __name__ == "__main__":
    main()
