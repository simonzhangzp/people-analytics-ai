from __future__ import annotations

"""Write v1 metric YAML files matching architecture §8."""

from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "people_metrics"

METRICS = [
    ("headcount.yml", "headcount", "people_snap_worker_month", "count(is_certified)", None, 5, "internal"),
    ("average_headcount.yml", "average_headcount", "people_snap_worker_month", "avg monthly certified", None, 5, "internal"),
    ("hires.yml", "hires", "people_evt_worker", "count hire/rehire in month", None, 5, "internal"),
    ("voluntary_attrition.yml", "voluntary_attrition_rate", "people_snap_worker_month", "terminated_in_month ∧ voluntary", "average_headcount", 5, "internal"),
    ("involuntary_attrition.yml", "involuntary_attrition_rate", "people_snap_worker_month", "terminated_in_month ∧ involuntary", "average_headcount", 5, "internal"),
    ("regrettable_attrition.yml", "regrettable_attrition_rate", "people_snap_worker_month", "is_regrettable", "average_headcount", 5, "confidential"),
    ("promotion_rate.yml", "promotion_rate", "people_snap_worker_month", "promoted_in_month", "average_headcount", 5, "internal"),
    ("internal_mobility.yml", "internal_mobility_rate", "people_snap_worker_month", "transferred_in_month", "average_headcount", 5, "internal"),
    ("manager_turnover.yml", "manager_turnover_rate", "people_snap_worker_month", "terminated ∧ is_manager", "avg managers", 5, "internal"),
    ("span_of_control.yml", "span_of_control", "people_snap_worker_month", "direct_report_count", "managers", 5, "internal"),
    ("time_to_fill.yml", "time_to_fill_days", "people_dim_requisition", "median(closed-opened) filled", None, 5, "internal"),
    ("time_in_stage.yml", "time_in_stage_hours", "people_evt_application_stage", "median(exited-entered)", None, 5, "internal"),
    ("offer_acceptance.yml", "offer_acceptance_rate", "people_fact_offer", "accepted / resolved", None, 5, "internal"),
    ("applications_per_opening.yml", "applications_per_opening", "people_fact_application", "applications / openings", None, 5, "internal"),
    ("quality_of_hire.yml", "quality_of_hire", "people_snap_worker_month", "12m retention ∧ first score ≥ 3.5", "hires 12m ago", 10, "confidential"),
    ("recruiter_load.yml", "recruiter_load", "people_snap_recruiter_month", "open_requisitions", "recruiters", 3, "internal"),
    ("compa_ratio.yml", "compa_ratio_median", "people_fact_comp_assignment_restricted", "median(base/band_mid)", None, 10, "restricted"),
    ("engagement_score.yml", "engagement_score", "people_fact_survey_score_restricted", "mean(score_mean)", None, 5, "confidential"),
    ("training_hours.yml", "training_hours_per_worker", "people_fact_training_participation", "sum(hours)", "average_headcount", 5, "internal"),
    ("skill_coverage.yml", "skill_coverage", "people_fact_worker_skill", "workers with skills / workers", None, 5, "internal"),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, metric_id, grain, num, den, min_cell, sensitivity in METRICS:
        body = [
            f"metric_id: {metric_id}",
            "status: certified",
            f"grain: {grain}",
            "architecture: docs/PEOPLE_DATA_ARCHITECTURE.md#8",
            "numerator:",
            f"  expression: {num}",
        ]
        if den:
            body += ["denominator:", f"  expression: {den}"]
        body += [
            f"min_cell: {min_cell}",
            f"sensitivity: {sensitivity}",
            "sandbox:",
            "  rule_kind: parametric",
            "  rpc: people_v2.people_get_metric",
            "",
        ]
        (OUT / filename).write_text("\n".join(body), encoding="utf-8")
        print("wrote", filename)


if __name__ == "__main__":
    main()
