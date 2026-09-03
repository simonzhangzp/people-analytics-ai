from __future__ import annotations

from calendar import monthrange
from datetime import date

import pandas as pd

from people_ingestion.people_storage import PeopleLakeStore
from people_synthetic.people_reference import PEOPLE_SKILLS

CRITICAL_SKILLS = {"skill_python", "skill_sql", "skill_cloud", "skill_data"}
REGRETTABLE_LEVELS = {"IC4", "IC5", "IC6", "M2", "M3", "DIR", "VP", "C"}
SKILL_NAMES = {skill_id: name for skill_id, name, _category in PEOPLE_SKILLS}


def people_month_ends(start: date, end: date) -> list[date]:
    months: list[date] = []
    year, month = start.year, start.month
    while True:
        last = date(year, month, monthrange(year, month)[1])
        months.append(min(last, end))
        if year == end.year and month == end.month:
            break
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
    return months


def function_org_id(org_id: str) -> str:
    parts = org_id.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return org_id


def _tenure_band(hire: date, month_end: date) -> str:
    years = (month_end - hire).days / 365.25
    if years < 1:
        return "0-1 years"
    if years < 3:
        return "1-3 years"
    if years < 5:
        return "3-5 years"
    return "5+ years"


def _optional(silver: dict[str, pd.DataFrame], name: str) -> pd.DataFrame:
    frame = silver.get(name)
    if frame is None:
        return pd.DataFrame()
    return frame


def build_people_gold(store: PeopleLakeStore, as_of: date, silver: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    workers = silver["people_worker"].copy()
    jobs = silver["people_job"].copy()
    movements = silver["people_movement"].copy()
    compensation = silver["people_compensation"].copy()
    learning = silver["people_learning_completion"].copy()
    requisitions = silver["people_requisition"].copy()
    enroll = _optional(silver, "people_learning_enrollment")
    skills = _optional(silver, "people_worker_skill")
    engagement = _optional(silver, "people_engagement_response")
    stages = _optional(silver, "people_candidate_stage")
    candidates = _optional(silver, "people_candidate")
    hire_links = _optional(silver, "people_candidate_hire")

    workers["function_org_id"] = workers["org_id"].map(function_org_id)
    workers["hire_date"] = pd.to_datetime(workers["hire_date"]).dt.date
    workers["termination_date"] = pd.to_datetime(workers["termination_date"], errors="coerce").dt.date
    job_cols = [col for col in ["job_id", "job_family", "job_level", "base_salary", "is_manager"] if col in jobs.columns]
    workers = workers.merge(jobs[job_cols], on="job_id", how="left")
    history_start = date(as_of.year - 5, as_of.month, 1)
    month_ends = people_month_ends(history_start, as_of)
    segment_start = date(as_of.year - 1, as_of.month, 1) if as_of.month != 1 else date(as_of.year - 1, 1, 1)
    manager_start = date(as_of.year - 2, as_of.month, 1)

    overview_rows = []
    retention_rows = []
    mobility_rows = []
    learning_rows = []
    pay_rows = []
    recruiting_rows = []
    manager_rows = []
    segment_rows = []
    latest_comp = (
        compensation.sort_values("effective_date")
        .groupby("worker_id", as_index=False)
        .tail(1)
        .rename(columns={"base_salary": "latest_salary"})
    )
    workers = workers.merge(latest_comp[["worker_id", "latest_salary"]], on="worker_id", how="left")
    if "base_salary" in workers.columns:
        workers["compa_ratio"] = workers["latest_salary"] / workers["base_salary"].replace(0, pd.NA)
    else:
        workers["compa_ratio"] = 1.0
    movements["event_date"] = pd.to_datetime(movements["event_date"]).dt.date
    learning["completed_on"] = pd.to_datetime(learning["completed_on"]).dt.date
    if not enroll.empty and "enrolled_on" in enroll.columns:
        enroll = enroll.copy()
        enroll["enrolled_on"] = pd.to_datetime(enroll["enrolled_on"]).dt.date
    if not engagement.empty and "survey_date" in engagement.columns:
        engagement = engagement.copy()
        engagement["survey_date"] = pd.to_datetime(engagement["survey_date"]).dt.date

    time_in_stage_days = 11.0
    if not stages.empty and "stage_entered_on" in stages.columns:
        staged = stages.copy()
        staged["stage_entered_on"] = pd.to_datetime(staged["stage_entered_on"])
        staged = staged.sort_values(["candidate_id", "stage_entered_on"])
        staged["next_entered"] = staged.groupby("candidate_id")["stage_entered_on"].shift(-1)
        staged["days_in_stage"] = (staged["next_entered"] - staged["stage_entered_on"]).dt.days
        time_in_stage_days = float(staged["days_in_stage"].dropna().mean() or 11.0)

    time_to_fill_days = 32.0
    if not hire_links.empty and {"applied_on", "hired_on"} <= set(hire_links.columns):
        links = hire_links.copy()
        links["applied_on"] = pd.to_datetime(links["applied_on"])
        links["hired_on"] = pd.to_datetime(links["hired_on"])
        fill_days = (links["hired_on"] - links["applied_on"]).dt.days
        time_to_fill_days = float(fill_days.clip(lower=1, upper=180).mean() or 32.0)

    offer_acceptance_rate = 0.82
    if not candidates.empty and "current_stage" in candidates.columns:
        offered = candidates["current_stage"].isin(["offer", "hired"]).sum()
        hired = (candidates["current_stage"] == "hired").sum()
        if offered:
            offer_acceptance_rate = float(hired / offered)

    cohort_end = date(as_of.year - 1, as_of.month, as_of.day)
    cohort_start = date(as_of.year - 2, as_of.month, as_of.day)
    qoh_cohort = workers[(workers["hire_date"] <= cohort_end) & (workers["hire_date"] >= cohort_start)]
    if len(qoh_cohort):
        still = qoh_cohort[
            qoh_cohort["termination_date"].isna() | (qoh_cohort["termination_date"] > as_of)
        ]
        quality_of_hire_index = float(len(still) / len(qoh_cohort))
    else:
        quality_of_hire_index = 0.78

    latest_snapshot = None
    for month_end in month_ends:
        month_start = date(month_end.year, month_end.month, 1)
        hired = workers["hire_date"] <= month_end
        still = workers["termination_date"].isna() | (workers["termination_date"] > month_end)
        snapshot = workers[hired & still]
        if month_end == month_ends[-1]:
            latest_snapshot = snapshot
        grouped = (
            snapshot.groupby(["function_org_id", "job_family", "location_id"], dropna=False)
            .agg(headcount=("worker_id", "size"), fte=("fte", "sum"))
            .reset_index()
        )
        hires = workers[(workers["hire_date"] >= month_start) & (workers["hire_date"] <= month_end)]
        exits = workers[
            workers["termination_date"].notna()
            & (workers["termination_date"] >= month_start)
            & (workers["termination_date"] <= month_end)
        ]
        hire_g = hires.groupby(["function_org_id", "job_family", "location_id"]).size().rename("hires")
        exit_g = exits.groupby(["function_org_id", "job_family", "location_id"]).size().rename("exits")
        grouped = grouped.merge(hire_g, left_on=["function_org_id", "job_family", "location_id"], right_index=True, how="left")
        grouped = grouped.merge(exit_g, left_on=["function_org_id", "job_family", "location_id"], right_index=True, how="left")
        grouped["hires"] = grouped["hires"].fillna(0)
        grouped["exits"] = grouped["exits"].fillna(0)
        grouped["as_of_month"] = month_start
        grouped["org_id"] = grouped["function_org_id"]
        grouped["provenance"] = "synthetic_internal"
        grouped["metric_id"] = "headcount"
        grouped["quality_status"] = "healthy"
        overview_rows.append(grouped[["as_of_month", "org_id", "job_family", "location_id", "headcount", "fte", "hires", "exits", "provenance", "metric_id", "quality_status"]])

        beginning = snapshot.groupby(["function_org_id", "job_family", "location_id"]).size().rename("beginning_headcount")
        voluntary = exits[exits["termination_reason"] == "voluntary"] if "termination_reason" in exits.columns else exits.iloc[0:0]
        vol_g = voluntary.groupby(["function_org_id", "job_family", "location_id"]).size().rename("voluntary_exits")
        if "job_level" in voluntary.columns:
            regrettable = voluntary[voluntary["job_level"].isin(REGRETTABLE_LEVELS)]
        else:
            regrettable = voluntary.iloc[0:0]
        reg_g = regrettable.groupby(["function_org_id", "job_family", "location_id"]).size().rename("regrettable_exits")
        ret = pd.concat([beginning, vol_g, reg_g], axis=1).fillna(0).reset_index()
        ret["voluntary_attrition_rate"] = (
            ret["voluntary_exits"] / ret["beginning_headcount"].clip(lower=1)
        ).clip(0, 1)
        ret["regrettable_attrition_rate"] = (
            ret["regrettable_exits"] / ret["beginning_headcount"].clip(lower=1)
        ).clip(0, 1)
        ret["as_of_month"] = month_start
        ret["org_id"] = ret["function_org_id"]
        ret["provenance"] = "synthetic_internal"
        ret["metric_id"] = "voluntary_attrition"
        ret["quality_status"] = "healthy"
        retention_rows.append(ret[[
            "as_of_month", "org_id", "job_family", "location_id", "voluntary_exits",
            "beginning_headcount", "voluntary_attrition_rate", "regrettable_exits",
            "regrettable_attrition_rate", "provenance", "metric_id", "quality_status",
        ]])

        month_moves = movements[(movements["event_date"] >= month_start) & (movements["event_date"] <= month_end)].copy()
        month_moves["function_org_id"] = month_moves["org_id"].map(function_org_id)
        promo = month_moves[month_moves["event_type"] == "promotion"].groupby("function_org_id").size()
        lateral = month_moves[month_moves["event_type"] == "lateral"].groupby("function_org_id").size()
        mob = snapshot.groupby(["function_org_id", "job_family"]).size().rename("headcount")
        mob = mob.reset_index()
        mob["promotions"] = mob["function_org_id"].map(promo).fillna(0)
        mob["lateral_moves"] = mob["function_org_id"].map(lateral).fillna(0)
        mob["internal_mobility_rate"] = ((mob["promotions"] + mob["lateral_moves"]) / mob["headcount"].clip(lower=1)).clip(0, 1)
        mob["as_of_month"] = month_start
        mob["org_id"] = mob["function_org_id"]
        mob["provenance"] = "synthetic_internal"
        mob["metric_id"] = "internal_mobility_rate"
        mob["quality_status"] = "healthy"
        mobility_rows.append(mob[[
            "as_of_month", "org_id", "job_family", "promotions", "lateral_moves",
            "internal_mobility_rate", "headcount", "provenance", "metric_id", "quality_status",
        ]])

        month_learn = learning[(learning["completed_on"] >= month_start) & (learning["completed_on"] <= month_end)]
        learn_join = month_learn.merge(workers[["worker_id", "function_org_id", "job_family"]], on="worker_id", how="left")
        learn_g = learn_join.groupby(["function_org_id", "job_family"]).agg(hours=("hours", "sum"), completions=("completion_id", "size")).reset_index()
        pop = snapshot.groupby(["function_org_id", "job_family"]).size().rename("headcount").reset_index()
        learn_g = pop.merge(learn_g, on=["function_org_id", "job_family"], how="left").fillna(0)
        learn_g["learning_hours_per_employee"] = learn_g["hours"] / learn_g["headcount"].clip(lower=1)
        learn_g["completion_rate"] = (learn_g["completions"] / learn_g["headcount"].clip(lower=1)).clip(0, 1)
        if not enroll.empty:
            month_enroll = enroll[(enroll["enrolled_on"] >= month_start) & (enroll["enrolled_on"] <= month_end)]
            enroll_join = month_enroll.merge(workers[["worker_id", "function_org_id", "job_family"]], on="worker_id", how="left")
            participants = enroll_join.groupby(["function_org_id", "job_family"])["worker_id"].nunique().rename("participants")
            learn_g = learn_g.merge(participants, on=["function_org_id", "job_family"], how="left")
            learn_g["participants"] = learn_g["participants"].fillna(0)
            learn_g["participation_rate"] = (learn_g["participants"] / learn_g["headcount"].clip(lower=1)).clip(0, 1)
        else:
            learn_g["participation_rate"] = learn_g["completion_rate"]
        learn_g["as_of_month"] = month_start
        learn_g["org_id"] = learn_g["function_org_id"]
        learn_g["provenance"] = "synthetic_internal"
        learn_g["metric_id"] = "learning_hours_per_employee"
        learn_g["quality_status"] = "healthy"
        learning_rows.append(learn_g[[
            "as_of_month", "org_id", "job_family", "learning_hours_per_employee",
            "completion_rate", "participation_rate", "provenance", "metric_id", "quality_status",
        ]])

        pay = snapshot.groupby(["job_family", "location_id"]).agg(
            median_base_usd=("latest_salary", "median"),
            mean_compa_ratio=("compa_ratio", "mean"),
        ).reset_index()
        pay["bls_median_wage"] = None
        pay["market_position_index"] = None
        pay["as_of_month"] = month_start
        pay["provenance"] = "synthetic_internal"
        pay["metric_id"] = "compa_ratio"
        pay["quality_status"] = "healthy"
        pay_rows.append(pay)

        if month_start >= manager_start:
            reports = snapshot[snapshot["manager_worker_id"].notna()]
            span_map = reports.groupby("manager_worker_id").size()
            managers = snapshot[snapshot["worker_id"].isin(span_map.index)].copy()
            if managers.empty and "is_manager" in snapshot.columns:
                managers = snapshot[snapshot["is_manager"] == True].copy()
            managers["span"] = managers["worker_id"].map(span_map)
            mgr = managers.groupby(["function_org_id", "job_family"]).agg(
                manager_count=("worker_id", "size"),
                span_of_control=("span", "mean"),
            ).reset_index()
            beginning_mgr = managers.groupby(["function_org_id", "job_family"]).size().rename("begin_mgr")
            mgr_exits = exits[exits["worker_id"].isin(span_map.index)]
            exit_mgr = mgr_exits.groupby(["function_org_id", "job_family"]).size().rename("mgr_exits")
            mgr = mgr.merge(beginning_mgr, on=["function_org_id", "job_family"], how="left")
            mgr = mgr.merge(exit_mgr, on=["function_org_id", "job_family"], how="left")
            mgr["manager_turnover_rate"] = (mgr["mgr_exits"].fillna(0) / mgr["begin_mgr"].clip(lower=1)).clip(0, 1)
            if not engagement.empty:
                month_eng = engagement[(engagement["survey_date"] >= month_start) & (engagement["survey_date"] <= month_end)]
                eng_join = month_eng.merge(workers[["worker_id", "function_org_id", "job_family"]], on="worker_id", how="left")
                eng_g = eng_join.groupby(["function_org_id", "job_family"])["engagement_score"].mean().rename("engagement_score")
                mgr = mgr.merge(eng_g, on=["function_org_id", "job_family"], how="left")
            else:
                mgr["engagement_score"] = None
            mgr["as_of_month"] = month_start
            mgr["org_id"] = mgr["function_org_id"]
            mgr["provenance"] = "synthetic_internal"
            mgr["quality_status"] = "healthy"
            manager_rows.append(mgr[[
                "as_of_month", "org_id", "job_family", "manager_count", "span_of_control",
                "manager_turnover_rate", "engagement_score", "provenance", "quality_status",
            ]])

        if month_start >= segment_start and "job_level" in snapshot.columns:
            snap_seg = snapshot.copy()
            snap_seg["job_level"] = snap_seg["job_level"].fillna("unknown")
            snap_seg["tenure_band"] = [
                _tenure_band(hire, month_end) for hire in snap_seg["hire_date"]
            ]
            vol_seg = voluntary.copy()
            if not vol_seg.empty:
                vol_seg["job_level"] = vol_seg["job_level"].fillna("unknown")
                vol_seg["tenure_band"] = [
                    _tenure_band(hire, month_end) for hire in vol_seg["hire_date"]
                ]
            keys = ["job_family", "location_id", "job_level", "tenure_band"]
            begin_seg = snap_seg.groupby(keys).agg(
                beginning_headcount=("worker_id", "size"),
                median_base_usd=("latest_salary", "median"),
            )
            vol_counts = (
                vol_seg.groupby(keys).size().rename("voluntary_exits")
                if not vol_seg.empty else pd.Series(dtype="float64")
            )
            seg = begin_seg.join(vol_counts, how="left").fillna({"voluntary_exits": 0}).reset_index()
            seg["voluntary_attrition_rate"] = (
                seg["voluntary_exits"] / seg["beginning_headcount"].clip(lower=1)
            ).clip(0, 1)
            seg["as_of_month"] = month_start
            seg["quality_status"] = "healthy"
            seg["provenance"] = "synthetic_internal"
            segment_rows.append(seg[[
                "as_of_month", "job_family", "location_id", "job_level", "tenure_band",
                "voluntary_exits", "beginning_headcount", "voluntary_attrition_rate",
                "median_base_usd", "quality_status", "provenance",
            ]])

    week_start = date(as_of.year, as_of.month, max(as_of.day - as_of.weekday(), 1))
    open_req = requisitions[requisitions["status"] == "open"].merge(
        jobs[["job_id", "job_family"]] if "job_family" in jobs.columns else jobs[["job_id"]],
        on="job_id",
        how="left",
    )
    rec = open_req.groupby(["job_family", "location_id"]).size().rename("open_requisitions").reset_index()
    rec["as_of_week"] = week_start
    rec["time_to_fill_days"] = time_to_fill_days
    rec["time_in_stage_days"] = time_in_stage_days
    rec["offer_acceptance_rate"] = offer_acceptance_rate
    rec["quality_of_hire_index"] = quality_of_hire_index
    rec["provenance"] = "synthetic_internal"
    rec["metric_id"] = "time_to_fill"
    rec["quality_status"] = "healthy"
    recruiting_rows.append(rec)

    skill_rows = []
    if latest_snapshot is not None and not skills.empty:
        skill_join = skills.merge(latest_snapshot[["worker_id", "job_family"]], on="worker_id", how="inner")
        family_pop = latest_snapshot.groupby("job_family").size().rename("workers_in_family")
        covered = skill_join.groupby(["job_family", "skill_id"])["worker_id"].nunique().rename("workers_with_skill")
        skill_mart = covered.reset_index().merge(family_pop, on="job_family", how="left")
        skill_mart["internal_coverage_rate"] = (
            skill_mart["workers_with_skill"] / skill_mart["workers_in_family"].clip(lower=1)
        ).clip(0, 1)
        skill_mart["gap_rate"] = (1 - skill_mart["internal_coverage_rate"]).clip(0, 1)
        skill_mart["is_critical"] = skill_mart["skill_id"].isin(CRITICAL_SKILLS)
        skill_mart["skill_name"] = skill_mart["skill_id"].map(SKILL_NAMES).fillna(skill_mart["skill_id"])
        skill_mart["as_of_month"] = date(as_of.year, as_of.month, 1)
        skill_mart["provenance"] = "derived"
        skill_mart["quality_status"] = "healthy"
        skill_rows.append(skill_mart[[
            "as_of_month", "job_family", "skill_id", "skill_name", "workers_with_skill",
            "workers_in_family", "internal_coverage_rate", "gap_rate", "is_critical",
            "provenance", "quality_status",
        ]])

    gold = {
        "people_mart_workforce_overview": pd.concat(overview_rows, ignore_index=True),
        "people_mart_retention": pd.concat(retention_rows, ignore_index=True),
        "people_mart_internal_mobility": pd.concat(mobility_rows, ignore_index=True),
        "people_mart_learning_adoption": pd.concat(learning_rows, ignore_index=True),
        "people_mart_compensation_equity": pd.concat(pay_rows, ignore_index=True),
        "people_mart_recruiting": pd.concat(recruiting_rows, ignore_index=True),
        "people_mart_manager_effectiveness": (
            pd.concat(manager_rows, ignore_index=True) if manager_rows else pd.DataFrame()
        ),
        "people_mart_attrition_segment": (
            pd.concat(segment_rows, ignore_index=True) if segment_rows else pd.DataFrame()
        ),
        "people_mart_skills": pd.concat(skill_rows, ignore_index=True) if skill_rows else pd.DataFrame(),
        "people_dim_org": silver["people_org"],
        "people_dim_location": silver["people_location"],
        "people_dim_job": silver["people_job"],
        "people_dim_worker": workers[[
            "worker_id", "org_id", "job_id", "location_id", "manager_worker_id",
            "hire_date", "termination_date", "employment_status", "fte",
        ]].assign(
            effective_start=workers["hire_date"],
            effective_end=workers["termination_date"],
            provenance="synthetic_internal",
        ),
        "people_fact_worker_movement": movements,
        "people_fact_compensation": compensation,
        "people_fact_learning": learning,
        "people_fact_performance": silver["people_performance_review"],
        "people_fact_engagement": silver["people_engagement_response"],
        "people_fact_recruiting": silver["people_candidate"],
    }
    for name, frame in gold.items():
        path = store.partition("people_gold", "people_globaltech", as_of, f"{name}.parquet")
        store.write_parquet(path, frame)
    return gold
