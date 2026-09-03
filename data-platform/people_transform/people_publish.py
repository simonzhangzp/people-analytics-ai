from __future__ import annotations

import pandas as pd

from people_metadata.people_serving import execute, execute_values


def _chunks(rows: list[tuple], size: int = 1500):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def publish_people_gold(gold: dict) -> dict[str, int]:
    import os
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from people_refs import PEOPLE_REF, refuse_blocked

    refuse_blocked(PEOPLE_REF)
    if os.environ.get("PEOPLE_V2_PUBLISH_APPROVED") != "1":
        raise SystemExit("refused: people_v2 publish is not approved")
    counts: dict[str, int] = {}
    orgs = gold["people_dim_org"]
    org_rows = [
        (
            row.org_id,
            row.org_name,
            row.parent_org_id,
            int(row.org_level),
            row.function_name,
            getattr(row, "region", None),
            "synthetic_internal",
        )
        for row in orgs.itertuples(index=False)
    ]
    execute_values(
        """
        insert into public.people_dim_org (
          org_id, org_name, parent_org_id, org_level, function_name, region, provenance
        ) values (%s, %s, %s, %s, %s, %s, %s)
        on conflict (org_id) do update
        set org_name = excluded.org_name,
            parent_org_id = excluded.parent_org_id,
            function_name = excluded.function_name
        """,
        org_rows,
    )
    counts["people_dim_org"] = len(org_rows)

    loc_rows = [
        (row.location_id, row.location_name, row.country, row.region, row.city, "synthetic_internal")
        for row in gold["people_dim_location"].itertuples(index=False)
    ]
    execute_values(
        """
        insert into public.people_dim_location (
          location_id, location_name, country, region, city, provenance
        ) values (%s, %s, %s, %s, %s, %s)
        on conflict (location_id) do update
        set location_name = excluded.location_name, region = excluded.region
        """,
        loc_rows,
    )
    counts["people_dim_location"] = len(loc_rows)

    job_rows = [
        (row.job_id, row.job_title, row.job_family, row.job_level, row.occupation_id, "synthetic_internal")
        for row in gold["people_dim_job"].itertuples(index=False)
    ]
    execute_values(
        """
        insert into public.people_dim_job (
          job_id, job_title, job_family, job_level, occupation_id, provenance
        ) values (%s, %s, %s, %s, %s, %s)
        on conflict (job_id) do update
        set job_title = excluded.job_title, job_family = excluded.job_family
        """,
        job_rows,
    )
    counts["people_dim_job"] = len(job_rows)

    worker_rows = [
        (
            row.worker_id,
            row.org_id,
            row.job_id,
            row.location_id,
            row.manager_worker_id,
            row.hire_date,
            row.termination_date if pd_na(row.termination_date) is False else None,
            row.employment_status,
            float(row.fte) if row.fte is not None else None,
            row.effective_start,
            row.effective_end if pd_na(row.effective_end) is False else None,
            "synthetic_internal",
        )
        for row in gold["people_dim_worker"].itertuples(index=False)
    ]
    written = 0
    sql = """
        insert into public.people_dim_worker (
          worker_id, org_id, job_id, location_id, manager_worker_id,
          hire_date, termination_date, employment_status, fte,
          effective_start, effective_end, provenance
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (worker_id) do update
        set org_id = excluded.org_id,
            job_id = excluded.job_id,
            location_id = excluded.location_id,
            manager_worker_id = excluded.manager_worker_id,
            employment_status = excluded.employment_status,
            termination_date = excluded.termination_date,
            fte = excluded.fte
    """
    for chunk in _chunks(worker_rows):
        execute_values(sql, chunk)
        written += len(chunk)
    counts["people_dim_worker"] = written

    counts.update(_upsert_marts(gold))
    execute("notify pgrst, 'reload schema'")
    return counts


def pd_na(value) -> bool:
    return value is None or pd.isna(value)


def _upsert_marts(gold: dict) -> dict[str, int]:
    counts = {}
    overview = gold["people_mart_workforce_overview"]
    rows = [
        (
            row.as_of_month,
            row.org_id,
            row.job_family,
            row.location_id,
            float(row.headcount),
            float(row.fte) if row.fte == row.fte else None,
            float(row.hires),
            float(row.exits),
            row.provenance,
            row.metric_id,
            getattr(row, "quality_status", "healthy"),
        )
        for row in overview.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_workforce_overview (
          as_of_month, org_id, job_family, location_id, headcount, fte, hires, exits,
          provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_month, org_id, job_family, location_id) do update
        set headcount = excluded.headcount,
            fte = excluded.fte,
            hires = excluded.hires,
            exits = excluded.exits,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(rows):
        execute_values(sql, chunk)
    counts["people_mart_workforce_overview"] = len(rows)

    ret = gold["people_mart_retention"]
    ret_rows = [
        (
            row.as_of_month, row.org_id, row.job_family, row.location_id,
            float(row.voluntary_exits), float(row.beginning_headcount),
            float(row.voluntary_attrition_rate),
            float(getattr(row, "regrettable_exits", 0) or 0),
            float(getattr(row, "regrettable_attrition_rate", 0) or 0),
            row.provenance, row.metric_id,
            getattr(row, "quality_status", "healthy"),
        )
        for row in ret.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_retention (
          as_of_month, org_id, job_family, location_id, voluntary_exits,
          beginning_headcount, voluntary_attrition_rate, regrettable_exits,
          regrettable_attrition_rate, provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_month, org_id, job_family, location_id) do update
        set voluntary_exits = excluded.voluntary_exits,
            beginning_headcount = excluded.beginning_headcount,
            voluntary_attrition_rate = excluded.voluntary_attrition_rate,
            regrettable_exits = excluded.regrettable_exits,
            regrettable_attrition_rate = excluded.regrettable_attrition_rate,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(ret_rows):
        execute_values(sql, chunk)
    counts["people_mart_retention"] = len(ret_rows)

    mob = gold["people_mart_internal_mobility"]
    mob_rows = [
        (
            row.as_of_month, row.org_id, row.job_family, float(row.promotions),
            float(row.lateral_moves), float(row.internal_mobility_rate),
            float(getattr(row, "headcount", 0) or 0),
            row.provenance, row.metric_id, getattr(row, "quality_status", "healthy"),
        )
        for row in mob.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_internal_mobility (
          as_of_month, org_id, job_family, promotions, lateral_moves,
          internal_mobility_rate, headcount, provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_month, org_id, job_family) do update
        set promotions = excluded.promotions,
            lateral_moves = excluded.lateral_moves,
            internal_mobility_rate = excluded.internal_mobility_rate,
            headcount = excluded.headcount,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(mob_rows):
        execute_values(sql, chunk)
    counts["people_mart_internal_mobility"] = len(mob_rows)

    learn = gold["people_mart_learning_adoption"]
    learn_rows = [
        (
            row.as_of_month, row.org_id, row.job_family,
            float(row.learning_hours_per_employee), float(row.completion_rate),
            float(getattr(row, "participation_rate", 0) or 0),
            row.provenance, row.metric_id, getattr(row, "quality_status", "healthy"),
        )
        for row in learn.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_learning_adoption (
          as_of_month, org_id, job_family, learning_hours_per_employee,
          completion_rate, participation_rate, provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_month, org_id, job_family) do update
        set learning_hours_per_employee = excluded.learning_hours_per_employee,
            completion_rate = excluded.completion_rate,
            participation_rate = excluded.participation_rate,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(learn_rows):
        execute_values(sql, chunk)
    counts["people_mart_learning_adoption"] = len(learn_rows)

    pay = gold["people_mart_compensation_equity"]
    pay_rows = [
        (
            row.as_of_month, row.job_family, row.location_id,
            None if pd_na(row.median_base_usd) else float(row.median_base_usd),
            None if pd_na(row.mean_compa_ratio) else float(row.mean_compa_ratio),
            None, None, row.provenance, row.metric_id,
            getattr(row, "quality_status", "healthy"),
        )
        for row in pay.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_compensation_equity (
          as_of_month, job_family, location_id, median_base_usd, mean_compa_ratio,
          bls_median_wage, market_position_index, provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_month, job_family, location_id) do update
        set median_base_usd = excluded.median_base_usd,
            mean_compa_ratio = excluded.mean_compa_ratio,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(pay_rows):
        execute_values(sql, chunk)
    counts["people_mart_compensation_equity"] = len(pay_rows)

    rec = gold["people_mart_recruiting"]
    rec_rows = [
        (
            row.as_of_week, row.job_family, row.location_id, int(row.open_requisitions),
            float(row.time_to_fill_days), float(row.offer_acceptance_rate),
            None if pd_na(getattr(row, "time_in_stage_days", None)) else float(row.time_in_stage_days),
            None if pd_na(getattr(row, "quality_of_hire_index", None)) else float(row.quality_of_hire_index),
            row.provenance, row.metric_id, getattr(row, "quality_status", "healthy"),
        )
        for row in rec.itertuples(index=False)
    ]
    sql = """
        insert into public.people_mart_recruiting (
          as_of_week, job_family, location_id, open_requisitions, time_to_fill_days,
          offer_acceptance_rate, time_in_stage_days, quality_of_hire_index,
          provenance, metric_id, quality_status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (as_of_week, job_family, location_id) do update
        set open_requisitions = excluded.open_requisitions,
            time_to_fill_days = excluded.time_to_fill_days,
            offer_acceptance_rate = excluded.offer_acceptance_rate,
            time_in_stage_days = excluded.time_in_stage_days,
            quality_of_hire_index = excluded.quality_of_hire_index,
            quality_status = excluded.quality_status
    """
    for chunk in _chunks(rec_rows):
        execute_values(sql, chunk)
    counts["people_mart_recruiting"] = len(rec_rows)
    counts.update(_upsert_new_marts(gold))
    return counts


def _upsert_new_marts(gold: dict) -> dict[str, int]:
    counts: dict[str, int] = {}
    skills = gold.get("people_mart_skills")
    if skills is not None and len(skills):
        rows = [
            (
                row.as_of_month, row.job_family, row.skill_id, row.skill_name,
                float(row.workers_with_skill), float(row.workers_in_family),
                float(row.internal_coverage_rate), float(row.gap_rate), bool(row.is_critical),
                row.provenance, getattr(row, "quality_status", "healthy"),
            )
            for row in skills.itertuples(index=False)
        ]
        sql = """
            insert into public.people_mart_skills (
              as_of_month, job_family, skill_id, skill_name, workers_with_skill,
              workers_in_family, internal_coverage_rate, gap_rate, is_critical,
              provenance, quality_status
            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (as_of_month, job_family, skill_id) do update
            set skill_name = excluded.skill_name,
                workers_with_skill = excluded.workers_with_skill,
                workers_in_family = excluded.workers_in_family,
                internal_coverage_rate = excluded.internal_coverage_rate,
                gap_rate = excluded.gap_rate,
                is_critical = excluded.is_critical,
                quality_status = excluded.quality_status
        """
        for chunk in _chunks(rows):
            execute_values(sql, chunk)
        counts["people_mart_skills"] = len(rows)

    managers = gold.get("people_mart_manager_effectiveness")
    if managers is not None and len(managers):
        rows = [
            (
                row.as_of_month, row.org_id, row.job_family,
                float(row.manager_count),
                None if pd_na(row.span_of_control) else float(row.span_of_control),
                None if pd_na(row.manager_turnover_rate) else float(row.manager_turnover_rate),
                None if pd_na(row.engagement_score) else float(row.engagement_score),
                row.provenance, getattr(row, "quality_status", "healthy"),
            )
            for row in managers.itertuples(index=False)
        ]
        sql = """
            insert into public.people_mart_manager_effectiveness (
              as_of_month, org_id, job_family, manager_count, span_of_control,
              manager_turnover_rate, engagement_score, provenance, quality_status
            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (as_of_month, org_id, job_family) do update
            set manager_count = excluded.manager_count,
                span_of_control = excluded.span_of_control,
                manager_turnover_rate = excluded.manager_turnover_rate,
                engagement_score = excluded.engagement_score,
                quality_status = excluded.quality_status
        """
        for chunk in _chunks(rows):
            execute_values(sql, chunk)
        counts["people_mart_manager_effectiveness"] = len(rows)

    segments = gold.get("people_mart_attrition_segment")
    if segments is not None and len(segments):
        rows = [
            (
                row.as_of_month, row.job_family, row.location_id, row.job_level, row.tenure_band,
                float(row.voluntary_exits), float(row.beginning_headcount),
                float(row.voluntary_attrition_rate),
                None if pd_na(row.median_base_usd) else float(row.median_base_usd),
                getattr(row, "quality_status", "healthy"),
                row.provenance,
            )
            for row in segments.itertuples(index=False)
        ]
        sql = """
            insert into public.people_mart_attrition_segment (
              as_of_month, job_family, location_id, job_level, tenure_band,
              voluntary_exits, beginning_headcount, voluntary_attrition_rate,
              median_base_usd, quality_status, provenance
            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (as_of_month, job_family, location_id, job_level, tenure_band) do update
            set voluntary_exits = excluded.voluntary_exits,
                beginning_headcount = excluded.beginning_headcount,
                voluntary_attrition_rate = excluded.voluntary_attrition_rate,
                median_base_usd = excluded.median_base_usd,
                quality_status = excluded.quality_status
        """
        for chunk in _chunks(rows):
            execute_values(sql, chunk)
        counts["people_mart_attrition_segment"] = len(rows)
    return counts
