from __future__ import annotations

"""people_v2 role checks on the dedicated People project.

Does not assume public.people_mart_* exists. QuantReview leftovers stay on staging.
"""

from apply import (
    PEOPLE_REF,
    assert_people_project,
    connect_for_ddl,
    refuse_blocked,
)


def _one(conn, sql: str, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        return cur.fetchone()


def _scalar(conn, sql: str, params=None):
    row = _one(conn, sql, params)
    return None if row is None else row[0]


def main() -> None:
    refuse_blocked(PEOPLE_REF)
    conn = connect_for_ddl()
    try:
        assert_people_project(conn)
        for role, nologin, can_create in (
            ("people_app", True, False),
            ("people_definer", True, True),
            ("people_publisher", False, True),
        ):
            row = _one(
                conn,
                """
                select r.rolcanlogin, has_schema_privilege(r.rolname, 'people_v2', 'USAGE'),
                       has_schema_privilege(r.rolname, 'people_v2', 'CREATE')
                from pg_roles r where r.rolname = %s
                """,
                [role],
            )
            if row is None:
                raise SystemExit(f"missing role {role}")
            login, usage, create = row
            if bool(login) == nologin:
                raise SystemExit(f"{role} login expected {not nologin}, got {login}")
            if not usage:
                raise SystemExit(f"{role} missing USAGE on people_v2")
            if bool(create) != can_create:
                raise SystemExit(f"{role} CREATE expected {can_create}, got {create}")
            print(role, "login", login, "usage", usage, "create", create)

        public_create = _scalar(
            conn,
            "select has_schema_privilege('people_app', 'public', 'CREATE')",
        )
        if public_create:
            raise SystemExit("people_app still has CREATE on public")
        print("people_app_public_create", public_create)

        publisher_public = _scalar(
            conn,
            "select has_schema_privilege('people_publisher', 'public', 'CREATE')",
        )
        if publisher_public:
            raise SystemExit("people_publisher still has CREATE on public")
        print("people_publisher_public_create", publisher_public)

        tables = _scalar(
            conn,
            "select count(*) from information_schema.tables where table_schema = 'people_v2'",
        )
        print("people_v2_tables", tables)

        for role in ("anon", "authenticated", "service_role"):
            exists = _scalar(conn, "select 1 from pg_roles where rolname = %s", [role])
            if not exists:
                print(role, "absent")
                continue
            usage = _scalar(
                conn,
                "select has_schema_privilege(%s, 'people_v2', 'USAGE')",
                [role],
            )
            if usage:
                raise SystemExit(f"{role} still has USAGE on people_v2")
            print(role, "people_v2_usage", usage)

        mart = _scalar(
            conn,
            """
            select 1 from information_schema.tables
            where table_schema = 'public' and table_name = 'people_mart_workforce_overview'
            """,
        )
        if mart:
            app_select = _scalar(
                conn,
                "select has_table_privilege('people_app', 'public.people_mart_workforce_overview', 'SELECT')",
            )
            if app_select:
                raise SystemExit("people_app can SELECT public.people_mart_workforce_overview")
            print("legacy_public_mart_select_denied")
        else:
            print("legacy_public_mart_absent")
        print("ok")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
