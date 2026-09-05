from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "serving"))

from apply import connect_app, connect_publisher  # noqa: E402

PARITY = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "parity_data_v1.json"
OUT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "gate3_page_map.json"


def _metric(cur, metric_id: str, grain: str, job_family: str | None):
    cur.execute(
        "select people_v2.people_get_metric_for(%s,%s,date '2026-08-31',%s,%s)",
        ["demo-external-viewer", metric_id, grain, job_family],
    )
    payload = cur.fetchone()[0]
    return payload if isinstance(payload, dict) else json.loads(payload)


def main() -> int:
    parity = json.loads(PARITY.read_text(encoding="utf-8"))
    by_id = {row["metric_id"]: row for row in parity["rows"]}
    app = connect_app()
    pub = connect_publisher()
    try:
        with app.cursor() as cur:
            hc_co = _metric(cur, "headcount", "month", None)
            hc_eng = _metric(cur, "headcount", "month", "Engineering")
            vol_co = _metric(cur, "voluntary_attrition_rate", "trailing_12m", None)
            vol_eng = _metric(cur, "voluntary_attrition_rate", "trailing_12m", "Engineering")
            vol_eng_m = _metric(cur, "voluntary_attrition_rate", "month", "Engineering")
        with pub.cursor() as cur:
            cur.execute(
                "select test_name, test_group from people_v2.people_quality_test "
                "where test_name like '%recruiter%'"
            )
            recruiter_tests = [{"test_name": n, "test_group": g} for n, g in cur.fetchall()]
            cur.execute(
                "select run_id, certified, notes from people_v2.people_serving_run "
                "where run_id = %s",
                ["healthcheck-2026-09-04"],
            )
            hc_run = cur.fetchone()
    finally:
        app.close()
        pub.close()

    def row(page, label, metric_id, params, payload, slice_only=False):
        value = payload.get("value") if isinstance(payload, dict) else payload
        parity_rpc = None if slice_only else (by_id.get(metric_id) or {}).get("rpc")
        match = None if slice_only else value == parity_rpc
        return {
            "page": page,
            "ui_label": label,
            "metric_id": metric_id,
            "params": params,
            "page_value": value,
            "parity_rpc": parity_rpc,
            "digit_match": match,
            "slice_only": slice_only,
        }

    out = {
        "as_of": "2026-08-31",
        "rows": [
            row(
                "Case 1",
                "Company Headcount",
                "headcount",
                {"grain": "month", "job_family": None, "scope": "Company", "window": "month (as-of)"},
                hc_co,
            ),
            row(
                "Case 1",
                "Engineering Headcount (hero)",
                "headcount",
                {"grain": "month", "job_family": "Engineering", "scope": "Engineering", "window": "month (as-of)"},
                hc_eng,
                slice_only=True,
            ),
            row(
                "Case 3",
                "Company voluntary attrition (parity)",
                "voluntary_attrition_rate",
                {
                    "grain": "trailing_12m",
                    "job_family": None,
                    "scope": "Company",
                    "window": "trailing-12m (annualized)",
                },
                vol_co,
            ),
            row(
                "Case 3",
                "Engineering voluntary attrition (hero)",
                "voluntary_attrition_rate",
                {
                    "grain": "trailing_12m",
                    "job_family": "Engineering",
                    "scope": "Engineering",
                    "window": "trailing-12m (annualized)",
                },
                vol_eng,
                slice_only=True,
            ),
            row(
                "Case 3",
                "Engineering voluntary attrition (month secondary)",
                "voluntary_attrition_rate",
                {
                    "grain": "month",
                    "job_family": "Engineering",
                    "scope": "Engineering",
                    "window": "month (annualized)",
                },
                vol_eng_m,
                slice_only=True,
            ),
        ],
        "recruiter_dq": recruiter_tests,
        "healthcheck_run": {
            "run_id": hc_run[0] if hc_run else None,
            "certified": hc_run[1] if hc_run else None,
            "notes": hc_run[2] if hc_run else None,
        },
    }
    company_rows = [r for r in out["rows"] if r["digit_match"] is not None]
    out["company_digit_match"] = all(bool(r["digit_match"]) for r in company_rows)
    OUT.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("wrote", OUT, "company_digit_match", out["company_digit_match"])
    for item in out["rows"]:
        print(item["ui_label"], item["page_value"], "match", item["digit_match"])
    print("recruiter_dq", recruiter_tests)
    return 0 if out["company_digit_match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
