from __future__ import annotations

"""Compare people_v2.people_get_metric to parquet aggregates. Tolerance 0. Range tests are blocking."""

import json
import math
import sys
from datetime import date
from pathlib import Path

import duckdb
import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_publisher  # noqa: E402
from metric_yaml import load_metrics, validate_metrics  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

GOLD = ROOT / "lake" / "people_gold" / "rehearsal_1p00"
SILVER = ROOT / "lake" / "people_silver" / "rehearsal_1p00"
REPORT = ROOT / "simulator" / "fixtures" / "rehearsal_1p00" / "parity_6c.json"
AS_OF = date(2026, 8, 31)
WIN = "DATE '2026-08-31' - INTERVAL 12 MONTH"


def _parquet(name: str) -> str:
    gold = GOLD / f"{name}.parquet"
    silver = SILVER / f"{name}.parquet"
    path = gold if gold.exists() else silver
    return path.resolve().as_posix().replace("'", "''")


def _load(con) -> None:
    for table in (
        "people_snap_worker_month",
        "people_snap_recruiter_month",
        "people_dim_requisition",
        "people_evt_application_stage",
        "people_fact_offer",
        "people_fact_application",
        "people_fact_appraisal",
        "people_fact_comp_assignment_restricted",
        "people_ref_comp_band",
        "people_hist_worker_attr",
        "people_fact_survey_score_restricted",
        "people_fact_training_participation",
        "people_mart_skill_coverage_monthly",
        "people_mart_learning_monthly",
        "people_dim_worker",
    ):
        path = GOLD / f"{table}.parquet"
        if not path.exists():
            path = SILVER / f"{table}.parquet"
        if path.exists():
            con.execute(f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{_parquet(table)}')")


def parquet_value(con, metric_id: str):
    as_of = AS_OF.isoformat()
    avg_hc = f"""(SELECT avg(hc) FROM (
      SELECT count(*) AS hc FROM people_snap_worker_month
      WHERE is_certified AND month_end <= DATE '{as_of}' AND month_end > {WIN}
      GROUP BY month_end
    ))"""
    q = {
        "headcount": f"SELECT count(*) FROM people_snap_worker_month WHERE month_end = DATE '{as_of}' AND is_certified",
        "average_headcount": f"SELECT {avg_hc}",
        "hires": f"SELECT count(*) FROM people_snap_worker_month WHERE hired_in_month AND is_certified AND via_t1 AND coalesce(is_rehire, FALSE) = FALSE AND month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "rehires": f"SELECT count(*) FROM people_snap_worker_month WHERE hired_in_month AND is_certified AND is_rehire AND month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "voluntary_attrition_rate": f"SELECT count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') * 1.0 / nullif({avg_hc}, 0) FROM people_snap_worker_month WHERE month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "involuntary_attrition_rate": f"SELECT count(*) FILTER (WHERE terminated_in_month AND termination_category = 'involuntary') * 1.0 / nullif({avg_hc}, 0) FROM people_snap_worker_month WHERE month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "regrettable_attrition_rate": f"SELECT count(*) FILTER (WHERE is_regrettable) * 1.0 / nullif({avg_hc}, 0) FROM people_snap_worker_month WHERE month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "promotion_rate": f"SELECT count(*) FILTER (WHERE promoted_in_month AND is_certified) * 1.0 / nullif({avg_hc}, 0) FROM people_snap_worker_month WHERE month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "internal_mobility_rate": f"SELECT count(*) FILTER (WHERE transferred_in_month AND is_certified) * 1.0 / nullif({avg_hc}, 0) FROM people_snap_worker_month WHERE month_end <= DATE '{as_of}' AND month_end > {WIN}",
        "manager_turnover_rate": f"""
            SELECT (
              SELECT count(*) FROM (
                SELECT *, lag(is_manager) OVER (PARTITION BY worker_id ORDER BY month_end) AS was_manager
                FROM people_snap_worker_month
                WHERE month_end <= DATE '{as_of}' AND month_end > {WIN} - INTERVAL 1 MONTH
              ) t
              WHERE terminated_in_month AND (is_manager OR coalesce(was_manager, FALSE))
                AND month_end <= DATE '{as_of}' AND month_end > {WIN}
            ) * 1.0 / nullif((
              SELECT avg(n) FROM (
                SELECT count(*) AS n FROM people_snap_worker_month
                WHERE is_manager AND is_certified AND month_end <= DATE '{as_of}' AND month_end > {WIN}
                GROUP BY month_end
              )
            ), 0)
        """,
        "span_of_control": f"SELECT avg(direct_report_count) FROM people_snap_worker_month WHERE month_end = DATE '{as_of}' AND is_manager AND is_certified",
        "time_to_fill_days": f"SELECT quantile_cont((CAST(closed_at AS DATE) - CAST(opened_at AS DATE)), 0.5) FROM people_dim_requisition WHERE close_reason = 'hired' AND closed_at IS NOT NULL AND CAST(closed_at AS DATE) <= DATE '{as_of}' AND CAST(closed_at AS DATE) > {WIN}",
        "time_in_stage_hours": f"SELECT quantile_cont((epoch(CAST(coalesce(exited_at, entered_at) AS TIMESTAMP)) - epoch(CAST(entered_at AS TIMESTAMP))) / 3600.0, 0.5) FROM people_evt_application_stage WHERE entered_at IS NOT NULL AND CAST(entered_at AS DATE) <= DATE '{as_of}' AND CAST(entered_at AS DATE) > {WIN}",
        "offer_acceptance_rate": f"SELECT count(*) FILTER (WHERE status = 'accepted') * 1.0 / nullif(count(*) FILTER (WHERE status IN ('accepted','rejected')), 0) FROM people_fact_offer WHERE coalesce(CAST(resolved_at AS DATE), CAST(created_at AS DATE)) <= DATE '{as_of}' AND coalesce(CAST(resolved_at AS DATE), CAST(created_at AS DATE)) > {WIN}",
        "applications_per_opening": f"SELECT (SELECT count(*) FROM people_fact_application WHERE CAST(applied_at AS DATE) <= DATE '{as_of}' AND CAST(applied_at AS DATE) > {WIN}) * 1.0 / nullif((SELECT count(*) FROM people_dim_requisition WHERE CAST(opened_at AS DATE) <= DATE '{as_of}' AND CAST(opened_at AS DATE) > {WIN}), 0)",
        "quality_of_hire": f"""
            SELECT count(*) FILTER (WHERE s.is_certified AND a.final_score >= 3.5) * 1.0
                 / nullif(count(*), 0)
            FROM people_snap_worker_month s
            LEFT JOIN (
              SELECT worker_id, final_score, row_number() OVER (PARTITION BY worker_id ORDER BY submitted_at) AS rn
              FROM people_fact_appraisal
            ) a ON a.worker_id = s.worker_id AND a.rn = 1
            WHERE s.month_end = DATE '{as_of}'
              AND s.via_t1
              AND s.hire_date <= DATE '{as_of}' - INTERVAL 12 MONTH
              AND s.hire_date > DATE '{as_of}' - INTERVAL 24 MONTH
        """,
        "recruiter_load": f"SELECT avg(open_requisitions) FROM people_snap_recruiter_month WHERE month_end = DATE '{as_of}'",
        "compa_ratio_median": f"""
            SELECT quantile_cont(compa, 0.5) FROM (
              SELECT c.base * 1.0 / nullif(b.band_mid, 0) AS compa,
                     row_number() OVER (PARTITION BY s.worker_id ORDER BY c.from_date DESC) AS rn
              FROM people_snap_worker_month s
              JOIN people_hist_worker_attr h
                ON h.worker_id = s.worker_id AND h.valid_from <= s.month_end
               AND (h.valid_to IS NULL OR h.valid_to > s.month_end)
              JOIN people_fact_comp_assignment_restricted c
                ON c.worker_id = s.worker_id AND c.from_date <= s.month_end
               AND (c.to_date IS NULL OR c.to_date >= s.month_end)
              JOIN people_ref_comp_band b ON b.grade_id = h.grade_id
              WHERE s.month_end = DATE '{as_of}' AND s.is_certified
            ) t WHERE rn = 1
        """,
        "engagement_score": "SELECT round(avg(score_mean), 12) FROM people_fact_survey_score_restricted",
        "training_hours_per_worker": f"SELECT round((SELECT coalesce(sum(training_hours),0) FROM people_mart_learning_monthly WHERE month_start <= DATE '{as_of}' AND month_start > {WIN}) * 1.0 / nullif({avg_hc}, 0), 12)",
        "skill_coverage": f"SELECT avg(coverage_ratio) FROM people_mart_skill_coverage_monthly WHERE month_end = DATE '{as_of}'",
    }
    return con.execute(q[metric_id]).fetchone()[0]


def _eq(a, b) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=0.0, abs_tol=1e-9)


def _in_range(value, lo, hi) -> bool:
    if value is None:
        return False
    return float(lo) <= float(value) <= float(hi)


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    yamls = load_metrics()
    yaml_errors = validate_metrics(yamls)
    if yaml_errors:
        print("metric_yaml_failed", yaml_errors)
        return 1
    metric_ids = [row["metric_id"] for row in yamls]
    ranges = {row["metric_id"]: row["expected_range"] for row in yamls}
    duck = duckdb.connect()
    _load(duck)
    conn = connect_publisher()
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
    rows = []
    failed = []
    range_failed = []
    try:
        with conn.cursor() as cur:
            for metric_id in metric_ids:
                parquet = parquet_value(duck, metric_id)
                cur.execute("select people_v2.people_get_metric(%s, %s)", [metric_id, AS_OF])
                payload = cur.fetchone()[0]
                rpc = payload.get("value") if isinstance(payload, dict) else payload
                ok = _eq(parquet, rpc)
                lo, hi = ranges[metric_id]
                in_range = _in_range(rpc, lo, hi)
                row = {
                    "metric_id": metric_id,
                    "parquet": parquet,
                    "rpc": rpc,
                    "match": ok,
                    "expected_range": [lo, hi],
                    "in_range": in_range,
                }
                rows.append(row)
                print("parity", row)
                if not ok:
                    failed.append(row)
                if not in_range:
                    range_failed.append(row)
        report = {
            "ref": PEOPLE_REF,
            "as_of": AS_OF.isoformat(),
            "rows": rows,
            "failed": failed,
            "range_failed": range_failed,
        }
        REPORT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        if failed or range_failed:
            print("parity_failed", len(failed), "range_failed", len(range_failed))
            return 1
        print("parity_ok", len(rows), "range_ok", len(rows))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
