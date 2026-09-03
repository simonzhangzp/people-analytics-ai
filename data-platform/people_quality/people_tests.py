from __future__ import annotations

import pandas as pd


def _result(name, group, passed, observed, expected, source, datasets, details=""):
    return {
        "test_name": name,
        "test_group": group,
        "status": "passed" if passed else "failed",
        "observed_value": observed,
        "expected_value": expected,
        "details": details,
        "source_name": source,
        "affected_datasets": datasets,
    }


def run_people_quality_tests(silver: dict[str, pd.DataFrame], gold: dict[str, pd.DataFrame]) -> list[dict]:
    workers = silver["people_worker"]
    assignments = silver["people_assignment"]
    req = silver["people_requisition"]
    cand = silver["people_candidate"]
    hires = silver["people_candidate_hire"]
    learning = silver["people_learning_completion"]
    performance = silver["people_performance_review"]
    jobs = silver["people_job"]
    orgs = silver["people_org"]
    locations = silver["people_location"]
    compensation = silver["people_compensation"]
    movements = silver["people_movement"]
    overview = gold["people_mart_workforce_overview"]
    retention = gold["people_mart_retention"]
    results = []

    results.append(_result(
        "unique_worker_id", "unique", not workers["worker_id"].duplicated().any(),
        int(workers["worker_id"].duplicated().sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "unique_assignment_id", "unique", not assignments["assignment_id"].duplicated().any(),
        int(assignments["assignment_id"].duplicated().sum()), 0, "people_hris", ["people_silver_worker_assignment"],
    ))
    results.append(_result(
        "unique_requisition_id", "unique", not req["requisition_id"].duplicated().any(),
        int(req["requisition_id"].duplicated().sum()), 0, "people_ats", ["people_silver_recruiting"],
    ))
    results.append(_result(
        "worker_id_not_null", "not_null", workers["worker_id"].notna().all(),
        int(workers["worker_id"].isna().sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "org_id_not_null", "not_null", workers["org_id"].notna().all(),
        int(workers["org_id"].isna().sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "location_id_not_null", "not_null", workers["location_id"].notna().all(),
        int(workers["location_id"].isna().sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "candidate_requisition_not_null", "not_null", cand["requisition_id"].notna().all(),
        int(cand["requisition_id"].isna().sum()), 0, "people_ats", ["people_silver_recruiting"],
    ))

    org_ids = set(orgs["org_id"])
    job_ids = set(jobs["job_id"])
    loc_ids = set(locations["location_id"])
    worker_ids = set(workers["worker_id"])
    req_ids = set(req["requisition_id"])
    managers = workers["manager_worker_id"].dropna()
    missing_mgr = (~managers.isin(worker_ids)).sum()
    results.append(_result(
        "worker_manager_fk", "referential", int(missing_mgr) == 0,
        int(missing_mgr), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "worker_job_fk", "referential", workers["job_id"].isin(job_ids).all(),
        int((~workers["job_id"].isin(job_ids)).sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "worker_org_fk", "referential", workers["org_id"].isin(org_ids).all(),
        int((~workers["org_id"].isin(org_ids)).sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "candidate_requisition_fk", "referential", cand["requisition_id"].isin(req_ids).all(),
        int((~cand["requisition_id"].isin(req_ids)).sum()), 0, "people_ats", ["people_silver_recruiting"],
    ))
    results.append(_result(
        "learning_worker_fk", "referential", learning["worker_id"].isin(worker_ids).all(),
        int((~learning["worker_id"].isin(worker_ids)).sum()), 0, "people_lms", ["people_silver_learning"],
    ))
    results.append(_result(
        "performance_worker_fk", "referential", performance["worker_id"].isin(worker_ids).all(),
        int((~performance["worker_id"].isin(worker_ids)).sum()), 0, "people_performance", ["people_silver_performance"],
    ))
    results.append(_result(
        "compensation_worker_fk", "referential", compensation["worker_id"].isin(worker_ids).all(),
        int((~compensation["worker_id"].isin(worker_ids)).sum()), 0, "people_compensation", ["people_silver_compensation"],
    ))

    term = pd.to_datetime(workers["termination_date"], errors="coerce")
    hire = pd.to_datetime(workers["hire_date"])
    bad_term = (term.notna() & (hire > term)).sum()
    results.append(_result(
        "hire_before_termination", "temporal", int(bad_term) == 0,
        int(bad_term), 0, "people_hris", ["people_silver_worker"],
    ))
    promo = movements[movements["event_type"] == "promotion"].merge(
        workers[["worker_id", "hire_date"]], on="worker_id", how="left"
    )
    promo["event_date"] = pd.to_datetime(promo["event_date"])
    promo["hire_date"] = pd.to_datetime(promo["hire_date"])
    bad_promo = (promo["event_date"] < promo["hire_date"]).sum()
    results.append(_result(
        "promotion_after_hire", "temporal", int(bad_promo) == 0,
        int(bad_promo), 0, "people_hris", ["people_silver_worker_movement"],
    ))
    applied = pd.to_datetime(hires["applied_on"], errors="coerce")
    hired_on = pd.to_datetime(hires["hired_on"])
    bad_app = int((applied.notna() & (applied > hired_on)).sum())
    results.append(_result(
        "application_before_hire", "temporal", bad_app == 0,
        bad_app, 0, "people_ats", ["people_silver_recruiting"],
    ))
    assign_start = pd.to_datetime(assignments["effective_start"])
    assign_end = pd.to_datetime(assignments["effective_end"], errors="coerce")
    bad_eff = (assign_end.notna() & (assign_start > assign_end)).sum()
    results.append(_result(
        "assignment_effective_window", "temporal", int(bad_eff) == 0,
        int(bad_eff), 0, "people_hris", ["people_silver_worker_assignment"],
    ))

    results.append(_result(
        "headcount_non_negative", "business", (overview["headcount"] >= 0).all(),
        int((overview["headcount"] < 0).sum()), 0, "people_hris", ["people_mart_workforce_overview"],
    ))
    results.append(_result(
        "salary_positive", "business", (compensation["base_salary"] > 0).all(),
        int((compensation["base_salary"] <= 0).sum()), 0, "people_compensation", ["people_silver_compensation"],
    ))
    results.append(_result(
        "attrition_rate_bounds", "business",
        ((retention["voluntary_attrition_rate"] >= 0) & (retention["voluntary_attrition_rate"] <= 1)).all(),
        int(((retention["voluntary_attrition_rate"] < 0) | (retention["voluntary_attrition_rate"] > 1)).sum()),
        0, "people_hris", ["people_mart_retention"],
    ))
    results.append(_result(
        "fte_valid", "business", ((workers["fte"] > 0) & (workers["fte"] <= 1.5)).all(),
        int((~((workers["fte"] > 0) & (workers["fte"] <= 1.5))).sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    active = workers[workers["employment_status"] == "active"]
    active_term = pd.to_datetime(active["termination_date"], errors="coerce")
    impossible = active_term.notna().sum()
    results.append(_result(
        "active_workers_unterminated", "business", int(impossible) == 0,
        int(impossible), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "active_has_org", "business", active["org_id"].notna().all(),
        int(active["org_id"].isna().sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "location_fk", "referential", workers["location_id"].isin(loc_ids).all(),
        int((~workers["location_id"].isin(loc_ids)).sum()), 0, "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "active_headcount_scale", "business", int((workers["employment_status"] == "active").sum()) >= 1000,
        int((workers["employment_status"] == "active").sum()), ">=1000", "people_hris", ["people_silver_worker"],
    ))
    results.append(_result(
        "hire_events_present", "business", (movements["event_type"] == "hire").any(),
        int((movements["event_type"] == "hire").sum()), ">0", "people_hris", ["people_silver_worker_movement"],
    ))
    current_assign = assignments.groupby("worker_id").size()
    results.append(_result(
        "one_assignment_per_worker_min", "business", (current_assign >= 1).all(),
        int((current_assign < 1).sum()), 0, "people_hris", ["people_silver_worker_assignment"],
    ))
    results.append(_result(
        "overview_rows_present", "freshness", len(overview) > 0,
        len(overview), ">0", "people_hris", ["people_mart_workforce_overview"],
    ))
    mobility = gold.get("people_mart_internal_mobility")
    if mobility is not None and len(mobility):
        rate = mobility["internal_mobility_rate"]
        results.append(_result(
            "mobility_rate_bounds", "business",
            ((rate >= 0) & (rate <= 1)).all(),
            int(((rate < 0) | (rate > 1)).sum()),
            0, "people_hris", ["people_mart_internal_mobility"],
        ))
    recruiting = gold.get("people_mart_recruiting")
    if recruiting is not None and len(recruiting) and "offer_acceptance_rate" in recruiting.columns:
        offer = recruiting["offer_acceptance_rate"]
        results.append(_result(
            "offer_acceptance_bounds", "business",
            ((offer >= 0) & (offer <= 1)).all(),
            int(((offer < 0) | (offer > 1)).sum()),
            0, "people_ats", ["people_mart_recruiting"],
        ))
    pay = gold.get("people_mart_compensation_equity")
    if pay is not None and len(pay) and "mean_compa_ratio" in pay.columns:
        ratio = pay["mean_compa_ratio"].dropna()
        results.append(_result(
            "compa_ratio_range", "business",
            ratio.empty or ((ratio >= 0.25) & (ratio <= 2.5)).all(),
            int(((ratio < 0.25) | (ratio > 2.5)).sum()) if len(ratio) else 0,
            0, "people_compensation", ["people_mart_compensation"],
        ))
    skills = gold.get("people_mart_skills")
    if skills is not None and len(skills):
        coverage = skills["internal_coverage_rate"]
        results.append(_result(
            "skill_coverage_bounds", "business",
            ((coverage >= 0) & (coverage <= 1)).all(),
            int(((coverage < 0) | (coverage > 1)).sum()),
            0, "people_hris", ["people_mart_skills"],
        ))
    return results
