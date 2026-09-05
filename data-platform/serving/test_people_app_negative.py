from __future__ import annotations

"""people_app must not SELECT person-grain, restricted, or governance tables. Run as people_app."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_app, connect_publisher  # noqa: E402
from apply_policy import ROLES, _load, classify_table, list_people_v2_tables  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "gate3_people_app_negative.json"
GOVERNANCE_EXACT = {
    "people_access_log",
    "people_contract",
    "people_policy_binding",
    "people_policy_rule",
}


def bucket(table: str) -> str:
    if table.endswith("_restricted") or table.startswith("people_fact_"):
        return "restricted"
    if table in GOVERNANCE_EXACT or table.startswith("people_policy_"):
        return "governance"
    if (
        table in {"people_dim_person", "people_dim_worker", "people_dim_candidate", "people_xw_identity"}
        or table.startswith("people_snap_")
        or table.startswith("people_evt_")
        or table.startswith("people_hist_")
    ):
        return "person_grain"
    return "deny_other"


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    spec = _load(ROLES)
    conn = connect_app()
    failed: list[str] = []
    denied: list[dict] = []
    try:
        tables = list_people_v2_tables(conn)
        with conn.cursor() as cur:
            for table, _ in tables:
                if classify_table(table, spec) != "deny":
                    continue
                kind = bucket(table)
                try:
                    cur.execute(f'select 1 from people_v2."{table}" limit 1')
                    cur.fetchall()
                    failed.append(f"{table}: SELECT succeeded")
                except Exception as exc:
                    msg = str(exc).lower()
                    if "permission denied" in msg or "42501" in msg or "does not exist" in msg:
                        denied.append({"table": table, "bucket": kind, "error": "permission_denied"})
                        continue
                    failed.append(f"{table}: unexpected {exc}")
    finally:
        conn.close()

    pub = connect_publisher()
    force_rows: list[dict] = []
    force_missing: list[str] = []
    try:
        with pub.cursor() as cur:
            cur.execute(
                """
                select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                       pg_get_userbyid(c.relowner)
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'people_v2' and c.relkind = 'r' and c.relname like 'people_%'
                order by 1
                """
            )
            for name, rls, forced, owner in cur.fetchall():
                cls = classify_table(name, spec)
                row = {
                    "table": name,
                    "class": cls,
                    "rls": bool(rls),
                    "force_rls": bool(forced),
                    "owner": owner,
                }
                if cls == "deny":
                    force_rows.append(row)
                    if not forced:
                        force_missing.append(name)
    finally:
        pub.close()

    report = {
        "denied_select": denied,
        "failed": failed,
        "force_rls_deny_tables": force_rows,
        "force_missing": force_missing,
        "counts": {
            "denied_select": len(denied),
            "person_grain": sum(1 for row in denied if row["bucket"] == "person_grain"),
            "restricted": sum(1 for row in denied if row["bucket"] == "restricted"),
            "governance": sum(1 for row in denied if row["bucket"] == "governance"),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    if failed or force_missing:
        print("negative_select_failed", failed, "force_missing", force_missing)
        return 1
    print(
        "people_app_no_person_grain_select_ok",
        report["counts"],
        "deny_force_rls",
        all(row["force_rls"] for row in force_rows),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
