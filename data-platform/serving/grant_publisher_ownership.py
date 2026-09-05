from __future__ import annotations

"""Grant people_publisher ownership of people_v2 tables/functions so DROP does not
need postgres. Fail-closed on blocked refs. Does not drop live warehouse tables."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_for_ddl, connect_publisher  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

KIND_SQL = {"r": "table", "v": "view", "m": "materialized view"}


def qident(name: str) -> str:
    return '"' + name.replace('"', "") + '"'


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    ddl = connect_for_ddl()
    try:
        ddl.autocommit = True
        with ddl.cursor() as cur:
            cur.execute("select current_user")
            me = cur.fetchone()[0]
            try:
                cur.execute(f"grant people_publisher to {qident(me)}")
                print("granted_people_publisher_to", me)
            except Exception as exc:
                print("grant_publisher_to_self", type(exc).__name__, str(exc)[:160])
            cur.execute(
                """
                select c.relkind, c.relname, pg_get_userbyid(c.relowner) as owner
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'people_v2'
                  and c.relkind in ('r', 'v', 'm')
                  and pg_get_userbyid(c.relowner) <> 'people_publisher'
                order by 1, 2
                """
            )
            rows = cur.fetchall()
            for kind, name, owner in rows:
                print("reassign", KIND_SQL[kind], name, "from", owner)
                cur.execute(
                    f"alter {KIND_SQL[kind]} people_v2.{qident(name)} owner to people_publisher"
                )
            cur.execute(
                """
                select p.proname, pg_get_function_identity_arguments(p.oid) as args,
                       pg_get_userbyid(p.proowner) as owner
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'people_v2'
                  and pg_get_userbyid(p.proowner) <> 'people_publisher'
                order by 1, 2
                """
            )
            fns = cur.fetchall()
            for name, args, owner in fns:
                print("reassign function", name, "from", owner)
                cur.execute(
                    f"alter function people_v2.{qident(name)}({args}) owner to people_publisher"
                )
            print("reassigned_tables", len(rows), "functions", len(fns))
    finally:
        ddl.close()

    pub = connect_publisher()
    try:
        pub.autocommit = True
        with pub.cursor() as cur:
            cur.execute("create table if not exists people_v2._publisher_drop_probe (id int)")
            cur.execute("drop table people_v2._publisher_drop_probe")
        print("publisher_drop_probe_ok")
        return 0
    finally:
        pub.close()


if __name__ == "__main__":
    raise SystemExit(main())
