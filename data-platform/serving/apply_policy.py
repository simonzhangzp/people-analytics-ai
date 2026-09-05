from __future__ import annotations

"""Generate and apply people_v2 GRANT/RLS from serving/policy/*.yaml. Idempotent after swap."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
POLICY_DIR = ROOT / "serving" / "policy"
ROLES = POLICY_DIR / "roles.yaml"
RLS = POLICY_DIR / "rls.yaml"
DEMO = POLICY_DIR / "demo_identities.yaml"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def classify_table(name: str, spec: dict) -> str:
    classes = spec.get("table_classes") or {}
    no_sel = classes.get("no_select_people_app") or {}
    if name in (no_sel.get("exact") or []):
        return "deny"
    if name.endswith(str(no_sel.get("suffix") or "_restricted")):
        return "deny"
    for prefix in no_sel.get("prefixes") or []:
        if name.startswith(prefix):
            return "deny"
    allow = classes.get("people_app_select") or {}
    if name in (allow.get("exact") or []):
        return "select"
    if name.endswith(str(allow.get("exclude_suffix") or "_restricted")):
        return "deny"
    for prefix in allow.get("prefixes") or []:
        if name.startswith(prefix):
            return "select"
    return "deny"


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def render_table_sql(table: str, has_org_path: bool, spec: dict, rls: dict) -> str:
    cls = classify_table(table, spec)
    q = _quote_ident(table)
    lines = [
        f"alter table people_v2.{q} enable row level security;",
        f"alter table people_v2.{q} force row level security;",
        f"drop policy if exists people_app_read on people_v2.{q};",
        f"revoke all on people_v2.{q} from people_app;",
    ]
    if cls == "select":
        lines.append(f"grant select on people_v2.{q} to people_app;")
        using = (rls.get("mart_org_path") or {}).get("using") if has_org_path else (rls.get("identity_present") or {}).get("using")
        using = " ".join((using or "current_setting('people.role', true) is not null").split())
        lines.append(
            f"create policy people_app_read on people_v2.{q} for select to people_app using ({using});"
        )
    else:
        lines.append(
            f"create policy people_app_read on people_v2.{q} for select to people_app using (false);"
        )
    lines.append(f"drop policy if exists people_publisher_all on people_v2.{q};")
    lines.append(
        f"create policy people_publisher_all on people_v2.{q} for all to people_publisher using (true) with check (true);"
    )
    lines.append(f"drop policy if exists people_definer_all on people_v2.{q};")
    lines.append(
        f"create policy people_definer_all on people_v2.{q} for all to people_definer using (true) with check (true);"
    )
    lines.append(f"grant all on people_v2.{q} to people_publisher, people_definer;")
    return "\n".join(lines)


def list_people_v2_tables(conn) -> list[tuple[str, bool]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select c.relname,
                   exists (
                     select 1 from pg_attribute a
                     where a.attrelid = c.oid and a.attname = 'org_path' and not a.attisdropped
                   ) as has_org_path
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'people_v2' and c.relkind = 'r'
              and c.relname like 'people_%'
              and c.relname not like '%_staging'
            order by 1
            """
        )
        return [(r[0], bool(r[1])) for r in cur.fetchall()]


def apply_table(conn, table: str, has_org_path: bool | None = None) -> None:
    spec = _load(ROLES)
    rls = _load(RLS)
    if has_org_path is None:
        with conn.cursor() as cur:
            cur.execute(
                """
                select exists (
                  select 1 from information_schema.columns
                  where table_schema = 'people_v2' and table_name = %s and column_name = 'org_path'
                )
                """,
                [table],
            )
            has_org_path = bool(cur.fetchone()[0])
    sql = render_table_sql(table, has_org_path, spec, rls)
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def apply_all(conn, fallback=None) -> dict:
    spec = _load(ROLES)
    rls = _load(RLS)
    applied = []
    for table, has_org in list_people_v2_tables(conn):
        sql = render_table_sql(table, has_org, spec, rls)
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
        except Exception:
            conn.rollback()
            if fallback is None:
                raise
            with fallback.cursor() as cur:
                cur.execute(sql)
            fallback.commit()
        applied.append(table)
    return {"tables": applied}


def verify(conn) -> list[str]:
    """Return mismatch strings. Empty means policy/grant match YAML."""
    spec = _load(ROLES)
    errors: list[str] = []
    tables = list_people_v2_tables(conn)
    names = {t[0] for t in tables}
    with conn.cursor() as cur:
        for table, _has_org in tables:
            want_select = classify_table(table, spec) == "select"
            cur.execute(
                """
                select has_table_privilege('people_app', format('people_v2.%%I', %s), 'SELECT')
                """,
                [table],
            )
            has_select = bool(cur.fetchone()[0])
            if has_select != want_select:
                errors.append(f"{table}: people_app SELECT expected {want_select} got {has_select}")
            for role in ("people_publisher", "people_definer"):
                cur.execute(
                    "select has_table_privilege(%s, format('people_v2.%%I', %s), 'INSERT')",
                    [role, table],
                )
                if not bool(cur.fetchone()[0]):
                    errors.append(f"{table}: {role} INSERT missing (yaml grant all)")
            cur.execute(
                """
                select count(*) from pg_policies
                where schemaname = 'people_v2' and tablename = %s and policyname = 'people_app_read'
                """,
                [table],
            )
            npol = int(cur.fetchone()[0])
            if npol != 1:
                errors.append(f"{table}: expected people_app_read policy, got {npol}")
            cur.execute(
                "select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'people_v2' and c.relname = %s",
                [table],
            )
            row = cur.fetchone()
            if not row or not row[0]:
                errors.append(f"{table}: RLS not enabled")
            cur.execute(
                "select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'people_v2' and c.relname = %s",
                [table],
            )
            forced = cur.fetchone()
            if not forced or not forced[0]:
                errors.append(f"{table}: FORCE ROW LEVEL SECURITY required (table owner bypasses RLS unless forced)")
    if not names:
        errors.append("no people_v2 tables")
    return errors


def seed_demo_identities(conn) -> None:
    demo = _load(DEMO)
    with conn.cursor() as cur:
        cur.execute(
            """
            create table if not exists people_v2.people_policy_demo_identity (
              identity_id text primary key,
              role text not null,
              org_scope ltree[] not null default '{}',
              sensitivity_max text not null,
              grain_max text not null,
              label text
            );
            grant select on people_v2.people_policy_demo_identity to people_app;
            grant all on people_v2.people_policy_demo_identity to people_publisher, people_definer;
            """
        )
        for row in demo.get("identities") or []:
            cur.execute(
                """
                insert into people_v2.people_policy_demo_identity
                  (identity_id, role, org_scope, sensitivity_max, grain_max, label)
                values (%s, %s, %s::ltree[], %s, %s, %s)
                on conflict (identity_id) do update set
                  role = excluded.role,
                  org_scope = excluded.org_scope,
                  sensitivity_max = excluded.sensitivity_max,
                  grain_max = excluded.grain_max,
                  label = excluded.label
                """,
                [
                    row["identity_id"],
                    row["role"],
                    "{" + ",".join(row.get("org_scope") or []) + "}",
                    row["sensitivity_max"],
                    row["grain_max"],
                    row.get("label"),
                ],
            )
    conn.commit()
