from __future__ import annotations

"""Re-apply people_v2 RLS including FORCE ROW LEVEL SECURITY after owner change."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_for_ddl, connect_publisher  # noqa: E402
from apply_policy import apply_all, classify_table, list_people_v2_tables, verify, _load, ROLES  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "gate3_force_rls.json"


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    pub = connect_publisher()
    ddl = connect_for_ddl()
    try:
        applied = apply_all(pub, fallback=ddl)
        errors = verify(pub)
        spec = _load(ROLES)
        with pub.cursor() as cur:
            cur.execute(
                """
                select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                       pg_get_userbyid(c.relowner) as owner
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'people_v2' and c.relkind = 'r' and c.relname like 'people_%'
                order by 1
                """
            )
            tables = [
                {
                    "table": r[0],
                    "rls": bool(r[1]),
                    "force_rls": bool(r[2]),
                    "owner": r[3],
                    "class": classify_table(r[0], spec),
                }
                for r in cur.fetchall()
            ]
        unforced = [row["table"] for row in tables if not row["force_rls"]]
        deny_unforced = [row["table"] for row in tables if row["class"] == "deny" and not row["force_rls"]]
        report = {
            "applied": applied.get("tables") if isinstance(applied, dict) else applied,
            "verify_errors": errors,
            "unforced": unforced,
            "deny_unforced": deny_unforced,
            "deny_forced": [row["table"] for row in tables if row["class"] == "deny" and row["force_rls"]],
            "tables": tables,
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print("force_rls_tables", len(tables), "unforced", unforced, "verify", errors[:8])
        return 1 if errors or unforced else 0
    finally:
        pub.close()
        ddl.close()


if __name__ == "__main__":
    raise SystemExit(main())
