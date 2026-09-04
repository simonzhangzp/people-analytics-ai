from __future__ import annotations

"""Role × metric matrix after data-v1 publish. Uses people_app + demo identities."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import PEOPLE_REF, connect_app, connect_publisher, refuse_blocked  # noqa: E402
from metric_yaml import load_metrics  # noqa: E402

OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "role_metric_matrix.json"
IDENTITIES = (
    "demo-external-viewer",
    "demo-leader-engineering",
    "demo-hrbp",
    "demo-people-analyst",
)
SENSITIVITY_RANK = {"public": 1, "internal": 2, "confidential": 3, "restricted": 4}


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    metrics = load_metrics()
    conn = connect_app()
    rows = []
    failed = []
    try:
        with conn.cursor() as cur:
            cur.execute("select people_v2.people_get_metric_for('demo-external-viewer', 'headcount')")
            head = cur.fetchone()[0]
            if not isinstance(head, dict) or head.get("denied"):
                failed.append("external_viewer_headcount")
            cur.execute(
                """
                select people_v2.people_get_metric_breakdown(
                  'demo-external-viewer', 'headcount', 'region', date '2026-08-31')
                """
            )
            br = cur.fetchone()[0]
            if isinstance(br, dict) and br.get("denied"):
                failed.append("external_viewer_breakdown_denied")
            for ident in IDENTITIES:
                for row in metrics:
                    mid = row["metric_id"]
                    cur.execute(
                        "select people_v2.people_get_metric_for(%s, %s, date '2026-08-31')",
                        [ident, mid],
                    )
                    payload = cur.fetchone()[0]
                    max_s = {
                        "demo-external-viewer": "internal",
                        "demo-leader-engineering": "confidential",
                        "demo-hrbp": "confidential",
                        "demo-people-analyst": "restricted",
                    }[ident]
                    expect_deny = SENSITIVITY_RANK.get(row.get("sensitivity") or "internal", 2) > SENSITIVITY_RANK[max_s]
                    denied = bool(payload.get("denied")) if isinstance(payload, dict) else True
                    ok = denied == expect_deny or (not expect_deny and payload.get("value") is not None)
                    rec = {
                        "identity_id": ident,
                        "metric_id": mid,
                        "denied": denied,
                        "expect_deny": expect_deny,
                        "ok": ok,
                        "value": None if not isinstance(payload, dict) else payload.get("value"),
                    }
                    rows.append(rec)
                    if not ok:
                        failed.append(f"{ident}:{mid}")
            if not conn.autocommit:
                conn.commit()
            cur.execute(
                """
                select has_table_privilege('people_app', 'people_v2.people_snap_worker_month', 'SELECT')
                """
            )
            if cur.fetchone()[0]:
                failed.append("people_app_snap_select")
    finally:
        conn.close()
    pub = connect_publisher()
    try:
        with pub.cursor() as cur:
            cur.execute(
                "select count(*) from people_v2.people_access_log where rpc like 'people_get_metric%'"
            )
            logged = cur.fetchone()[0]
            if int(logged or 0) < 1:
                failed.append("access_log_empty")
    finally:
        pub.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"rows": rows, "failed": failed}, indent=2, default=str), encoding="utf-8")
    print("role_metric_matrix", OUT, "failed", failed)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
