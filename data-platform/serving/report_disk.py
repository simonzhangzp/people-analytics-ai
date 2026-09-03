from __future__ import annotations

"""Read dedicated People project disk usage. Never prints passwords."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply import PEOPLE_REF, assert_people_project, connect

SQL = """
select
  current_database() as db,
  pg_database_size(current_database()) as bytes,
  pg_size_pretty(pg_database_size(current_database())) as pretty
"""


def main() -> int:
    with connect() as conn:
        assert_people_project(conn)
        with conn.cursor() as cur:
            cur.execute(SQL)
            db, nbytes, pretty = cur.fetchone()
            cur.execute(
                """
                select n.nspname, count(*)
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where c.relkind = 'r' and n.nspname in ('people_v2', 'public')
                group by 1 order by 1
                """
            )
            tables = cur.fetchall()
        print("project", PEOPLE_REF)
        print("database", db)
        print("bytes", nbytes)
        print("pretty", pretty)
        print("tables", tables)
        print("plan", "not_in_sql_confirm_dashboard")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
