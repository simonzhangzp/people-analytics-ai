from __future__ import annotations

"""scale=0.05 five-year lake rehearsal: bronze → mappings → silver/gold parquet. No Postgres publish."""

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DP = ROOT.parent
if str(DP) not in sys.path:
    sys.path.insert(0, str(DP))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from case3_closed_form import expected_rates
from emit_bronze import emit_bronze, emit_case2_extracts
from engine import END, START, WorldEngine
from extract import employee_as_of
from pipeline.coverage import case_signals, coverage_matrix, engineering_trailing_3m, funnel_distribution
from pipeline.dq import run_gold_dq
from pipeline.transform import transform

LAKE = DP / "lake"
SCALE = 0.05
SEED = 20260301
PREFIX = "rehearsal_0p05"
FAULT_DAY = date(2026, 8, 14)
PRIOR_FULL = date(2026, 8, 7)
OUT = ROOT / "fixtures" / PREFIX


def _query_report(con) -> dict:
    ending = con.execute(
        """
        SELECT region, count(*) AS n
        FROM people_snap_worker_month
        WHERE month_end = DATE '2026-08-31' AND is_certified
        GROUP BY 1 ORDER BY 1
        """
    ).fetchdf()
    hc = {str(r.region): int(r.n) for r in ending.itertuples()}
    vol = con.execute(
        """
        SELECT region, tenure_band,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') AS voluntary_terms,
               count(*) FILTER (WHERE is_certified) AS person_months
        FROM people_snap_worker_month
        WHERE date_part('year', month_end) = 2026
        GROUP BY 1,2
        """
    ).fetchdf()
    attrition = {}
    for r in vol.itertuples():
        rate = (r.voluntary_terms / (r.person_months / 12.0)) if r.person_months else 0.0
        attrition[f"{r.region}|{r.tenure_band}"] = {
            "region": r.region,
            "tenure_band": r.tenure_band,
            "voluntary_terms": int(r.voluntary_terms),
            "person_months": int(r.person_months),
            "annualized": round(float(rate), 4),
        }
    recruiting = con.execute(
        """
        SELECT
          (SELECT count(*) FROM people_dim_worker WHERE via_t1) AS hires,
          (SELECT count(*) FROM people_dim_requisition) AS openings,
          (SELECT count(*) FROM people_fact_application) AS applications,
          (SELECT count(*) FROM people_fact_offer) AS offers_sent,
          (SELECT count(*) FROM people_fact_offer WHERE status = 'accepted') AS offers_accepted
        """
    ).fetchone()
    hires, openings, applications, offers_sent, offers_accepted = recruiting
    asof = con.execute(
        """
        SELECT count(*) FROM people_snap_worker_month
        WHERE month_end = DATE '2026-07-31' AND is_certified
        """
    ).fetchone()[0]
    certified_0807 = con.execute(
        """
        SELECT count(*) FROM people_hist_worker_attr h
        WHERE h.valid_from <= DATE '2026-08-07'
          AND (h.valid_to IS NULL OR h.valid_to > DATE '2026-08-07')
          AND h.hire_date <= DATE '2026-08-07'
          AND (h.termination_date IS NULL OR h.termination_date > DATE '2026-08-07')
          AND h.status IN ('Active','Suspended')
          AND h.employment_type IN ('Full-time','Part-time','Probation')
        """
    ).fetchone()[0]
    return {
        "ending_headcount_by_region": hc,
        "ending_certified_headcount": sum(hc.values()),
        "voluntary_attrition_2026": attrition,
        "recruiting": {
            "hires": int(hires),
            "openings": int(openings),
            "applications": int(applications),
            "offers_sent": int(offers_sent),
            "offers_accepted": int(offers_accepted),
            "offer_acceptance": round(offers_accepted / offers_sent, 4) if offers_sent else 0,
        },
        "last_month_certified_2026_07_31": int(asof),
        "certified_as_of_2026_08_07": int(certified_0807),
        "cumulative_workers": int(con.execute("SELECT count(*) FROM people_dim_worker").fetchone()[0]),
    }


def main() -> int:
    engine = WorldEngine(SCALE, SEED, apply_case3=True)
    state = engine.simulate()
    bronze = emit_bronze(state, LAKE, PREFIX)
    silver = LAKE / "people_silver" / PREFIX
    gold = LAKE / "people_gold" / PREFIX
    con = transform(bronze, silver, gold)
    gold_stats = _query_report(con)
    coverage = coverage_matrix(con)
    funnel = funnel_distribution(con)
    signals = case_signals(con)
    dq = run_gold_dq(con, backfill=True)
    extracts = emit_case2_extracts(
        state, LAKE, PREFIX, FAULT_DAY, PRIOR_FULL, gold_stats["certified_as_of_2026_08_07"]
    )
    fault = extracts["fault"]
    prior = extracts["prior"]
    isolation_ok = (
        fault["mode"] == "full"
        and fault["isolated"]
        and not fault["pointer_moved"]
        and not fault["absence_closes_worker"]
        and prior["volume_test_ok"]
    )
    closed = []
    missing = set(fault["missing_names"])
    asof_fault = {row["name"] for row in employee_as_of(state["employee_versions"], FAULT_DAY)}
    for name in missing:
        if name not in asof_fault:
            closed.append(name)
    isolation_ok = isolation_ok and not closed
    dq_failed = [t for t in dq if t["status"] != "passed"]
    case3 = expected_rates()
    case3_measured = {"with_scenario": engineering_trailing_3m(con)}
    rec = coverage["recruiting"]
    ttf_ratio = float(rec.get("time_to_fill_p90_over_p50") or 0)
    case4_ttf = {r["group"]: r for r in signals.get("case4_time_to_fill") or []}
    case4_age = {r["group"]: r for r in signals.get("case4_onsite_aging") or []}
    slow_visible = False
    if "slow_hm" in case4_ttf and "other_hm" in case4_ttf:
        slow_visible = case4_ttf["slow_hm"]["ttf_p90_days"] > case4_ttf["other_hm"]["ttf_p90_days"]
    if "slow_hm" in case4_age and "other_hm" in case4_age:
        slow_visible = slow_visible and case4_age["slow_hm"]["aging_p90_days"] > case4_age["other_hm"]["aging_p90_days"]
    report = {
        "scale": SCALE,
        "seed": SEED,
        "window": {"start": START.isoformat(), "end": END.isoformat()},
        "publish": False,
        "path": "bronze → people_mappings → silver parquet → gold parquet (DuckDB)",
        "source": "gold",
        "cumulative_workers": gold_stats["cumulative_workers"],
        "ending_certified_headcount": gold_stats["ending_certified_headcount"],
        "ending_headcount_by_region": gold_stats["ending_headcount_by_region"],
        "voluntary_attrition_2026_from_gold": gold_stats["voluntary_attrition_2026"],
        "recruiting": gold_stats["recruiting"],
        "coverage_matrix": coverage,
        "funnel_distribution": funnel,
        "case_signals": signals,
        "engine_hires_accepted": {
            "window_hires": state["window_hires"],
            "accepted_offers": state["accepted_offers"],
        },
        "case3_closed_form_full_scale": case3,
        "case3_measured_trailing_3m": case3_measured,
        "ttf_p90_over_p50": ttf_ratio,
        "case4_tail_visible": slow_visible,
        "dq": dq,
        "dq_failed": dq_failed,
        "case2_isolation": {
            "fault": {k: fault[k] for k in ("extract_date", "mode", "control_total", "rows_received", "isolated", "pointer_moved", "absence_closes_worker", "volume_test_ok", "status", "replay")},
            "prior_full": {k: prior[k] for k in ("extract_date", "mode", "control_total", "rows_received", "volume_test_ok", "isolated")},
            "certified_pointer": PRIOR_FULL.isoformat(),
            "missing_apac": len(missing),
            "apac_closed_because_of_extract": closed,
            "ok": isolation_ok,
        },
        "answers": {
            "q6_control_total_vs_spells": "Employee full extract includes Left. control_total is all Employee documents. Employed count is derived (BR-WF-001). BR-DQ-003 absence is a missing document, not status=Left.",
            "q8_ending_target": "Keep public target 50k certified; hiring controller replaces attrition plus linear growth from opening stock.",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    logs = LAKE / "people_logs" / PREFIX
    logs.mkdir(parents=True, exist_ok=True)
    (logs / "report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print("scale", SCALE, "workers", gold_stats["cumulative_workers"], "ending", gold_stats["ending_certified_headcount"])
    print("hires", gold_stats["recruiting"]["hires"], "accepted", gold_stats["recruiting"]["offers_accepted"])
    print("apps", gold_stats["recruiting"]["applications"], "cancel_rate", coverage["recruiting"]["cancel_rate"])
    print("isolation_ok", isolation_ok, "dq_failed", len(dq_failed))
    print("ttf_p90/p50", ttf_ratio, "case4_tail_visible", slow_visible)
    print("wrote", OUT / "report.json")
    if dq_failed or not isolation_ok:
        return 1
    if gold_stats["recruiting"]["hires"] != gold_stats["recruiting"]["offers_accepted"]:
        return 1
    if ttf_ratio < 2.0:
        print("refused: time_to_fill p90/p50 < 2.0")
        return 1
    if not slow_visible:
        print("refused: Case 4 slow-HM tail not visible vs control")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
