from __future__ import annotations

"""Gold coverage, funnel, and Case 3/4 signal queries for rehearsal reports."""


def org_tree_stats(con) -> dict:
    as_of = "DATE '2026-08-31'"
    span = con.execute(
        f"""
        SELECT
          avg(direct_report_count) AS span_mean,
          min(direct_report_count) AS span_min,
          max(direct_report_count) AS span_max,
          count(*) AS n_managers
        FROM people_snap_worker_month
        WHERE month_end = {as_of} AND is_manager AND is_certified
        """
    ).fetchone()
    hc = con.execute(
        f"SELECT count(*) FROM people_snap_worker_month WHERE month_end = {as_of} AND is_certified"
    ).fetchone()[0]
    depths = con.execute(
        f"""
        WITH RECURSIVE chain AS (
          SELECT worker_id, manager_worker_id, 0 AS depth
          FROM people_snap_worker_month
          WHERE month_end = {as_of} AND is_certified
            AND (manager_worker_id IS NULL OR manager_worker_id NOT IN (
              SELECT worker_id FROM people_snap_worker_month
              WHERE month_end = {as_of} AND is_certified
            ))
          UNION ALL
          SELECT s.worker_id, s.manager_worker_id, c.depth + 1
          FROM people_snap_worker_month s
          JOIN chain c ON s.manager_worker_id = c.worker_id
          WHERE s.month_end = {as_of} AND s.is_certified AND c.depth < 16
        )
        SELECT depth, count(*) AS n
        FROM chain
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    skill = con.execute(
        f"SELECT avg(coverage_ratio) FROM people_mart_skill_coverage_monthly WHERE month_end = {as_of}"
    ).fetchone()[0]
    open_req = con.execute(
        f"""
        SELECT coalesce(avg(open_requisitions), 0)
        FROM people_snap_recruiter_month WHERE month_end = {as_of}
        """
    ).fetchone()[0]
    n_mgr = int(span[3] or 0)
    ceo = con.execute(
        f"""
        SELECT count(*) FROM people_snap_worker_month
        WHERE month_end = {as_of} AND is_certified AND manager_worker_id IS NULL
        """
    ).fetchone()[0]
    orphan = con.execute(
        f"""
        SELECT count(*) FROM people_snap_worker_month s
        WHERE s.month_end = {as_of} AND s.is_certified AND s.manager_worker_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM people_snap_worker_month m
            WHERE m.month_end = {as_of} AND m.worker_id = s.manager_worker_id AND m.is_certified
          )
        """
    ).fetchone()[0]
    return {
        "span_mean": round(float(span[0] or 0), 4),
        "span_min": int(span[1] or 0),
        "span_max": int(span[2] or 0),
        "n_managers": n_mgr,
        "is_manager_share": round(n_mgr / hc, 4) if hc else 0,
        "level_counts": {str(int(r.depth)): int(r.n) for r in depths.itertuples()},
        "max_depth": int(depths["depth"].max()) if len(depths) else 0,
        "ceo_count": int(ceo or 0),
        "orphan_manager_at_month_end": int(orphan or 0),
        "skill_coverage": round(float(skill or 0), 4),
        "recruiter_load": round(float(open_req or 0), 4),
    }


def coverage_matrix(con) -> dict:
    ending_hc = con.execute(
        "SELECT count(*) FROM people_snap_worker_month WHERE month_end = DATE '2026-08-31' AND is_certified"
    ).fetchone()[0]
    person_months = con.execute(
        "SELECT count(*) FROM people_snap_worker_month WHERE is_certified"
    ).fetchone()[0]
    person_years = (person_months / 12.0) if person_months else 1.0
    ssa_n = con.execute("SELECT count(*) FROM people_fact_comp_assignment").fetchone()[0]
    compa = con.execute(
        """
        WITH latest AS (
          SELECT c.worker_id, c.base, c.grade, c.from_date,
                 row_number() OVER (PARTITION BY c.worker_id ORDER BY c.from_date DESC) AS rn
          FROM people_fact_comp_assignment c
          WHERE c.from_date <= DATE '2026-08-31'
        )
        SELECT b.grade_id,
               quantile_cont(l.base * 1.0 / b.band_mid, 0.25) AS p25,
               quantile_cont(l.base * 1.0 / b.band_mid, 0.50) AS p50,
               quantile_cont(l.base * 1.0 / b.band_mid, 0.75) AS p75,
               count(*) AS n
        FROM latest l
        JOIN people_ref_comp_band b ON b.grade_id = l.grade
        WHERE l.rn = 1
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    appraisal_n = con.execute("SELECT count(*) FROM people_fact_appraisal").fetchone()[0]
    scores = con.execute(
        """
        SELECT
          round(final_score, 0) AS score_bin,
          count(*) AS n
        FROM people_fact_appraisal
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    promo = con.execute("SELECT count(*) FROM people_evt_promotion").fetchone()[0]
    xfer = con.execute("SELECT count(*) FROM people_evt_transfer").fetchone()[0]
    mgr = con.execute("SELECT count(*) FROM people_evt_manager_change").fetchone()[0]
    mgr_synthetic = con.execute(
        """
        SELECT count(*) FROM people_evt_worker_change
        WHERE property = 'reports_to'
          AND change_reason = 'rebalance_synthetic'
          AND old_value IS DISTINCT FROM new_value
        """
    ).fetchone()[0]
    train_n = con.execute("SELECT count(*) FROM people_fact_training_participation").fetchone()[0]
    hours = con.execute("SELECT coalesce(sum(hours),0), coalesce(avg(hours),0) FROM people_fact_training_participation").fetchone()
    skills_avg = con.execute(
        """
        SELECT avg(n) FROM (
          SELECT worker_id, count(*) AS n FROM people_fact_worker_skill GROUP BY 1
        )
        """
    ).fetchone()[0]
    skill_gap = con.execute(
        """
        WITH fam AS (
          SELECT job_family, count(DISTINCT worker_id) AS workers
          FROM people_snap_worker_month
          WHERE month_end = DATE '2026-08-31' AND is_certified
          GROUP BY 1
        ),
        cov AS (
          SELECT s.job_family, k.skill_id, count(DISTINCT k.worker_id) AS have
          FROM people_fact_worker_skill k
          JOIN people_snap_worker_month s
            ON s.worker_id = k.worker_id
           AND s.month_end = DATE '2026-08-31'
           AND s.is_certified
          GROUP BY 1,2
        )
        SELECT c.job_family, c.skill_id,
               1 - (c.have * 1.0 / nullif(f.workers,0)) AS gap
        FROM cov c JOIN fam f ON f.job_family = c.job_family
        ORDER BY gap DESC
        LIMIT 8
        """
    ).fetchdf()
    waves = con.execute(
        """
        SELECT wave_id, response_rate, n_invited FROM people_fact_survey_wave ORDER BY wave_id
        """
    ).fetchdf()
    dims = con.execute(
        """
        SELECT wave_id, dimension, avg(score) AS mean_score, count(*) AS n
        FROM people_fact_survey_score
        GROUP BY 1,2
        ORDER BY 1,2
        """
    ).fetchdf()
    ttf = con.execute(
        """
        SELECT
          quantile_cont(date_diff('day', CAST(opened_at AS TIMESTAMP), CAST(closed_at AS TIMESTAMP)), 0.5) AS ttf_p50,
          quantile_cont(date_diff('day', CAST(opened_at AS TIMESTAMP), CAST(closed_at AS TIMESTAMP)), 0.9) AS ttf_p90
        FROM people_dim_requisition
        WHERE close_reason_id = 1 AND closed_at IS NOT NULL
        """
    ).fetchone()
    aging = con.execute(
        """
        SELECT canonical_stage,
               quantile_cont(date_diff('day', CAST(entered_at AS TIMESTAMP), CAST(coalesce(exited_at, entered_at) AS TIMESTAMP)), 0.5) AS aging_p50,
               quantile_cont(date_diff('day', CAST(entered_at AS TIMESTAMP), CAST(coalesce(exited_at, entered_at) AS TIMESTAMP)), 0.9) AS aging_p90
        FROM people_evt_application_stage
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    openings = con.execute(
        """
        SELECT
          count(*) AS openings,
          count(*) FILTER (WHERE close_reason_id = 99) AS cancelled,
          count(*) FILTER (WHERE close_reason_id = 1) AS filled
        FROM people_dim_requisition
        """
    ).fetchone()
    cancel_rate = (openings[1] / openings[0]) if openings[0] else 0
    org = org_tree_stats(con)
    return {
        "comp": {
            "ssa_rows": int(ssa_n),
            "compa_ratio_by_grade": [
                {"grade": r.grade_id, "p25": round(float(r.p25), 4), "p50": round(float(r.p50), 4), "p75": round(float(r.p75), 4), "n": int(r.n)}
                for r in compa.itertuples()
            ],
        },
        "performance": {
            "appraisal_rows": int(appraisal_n),
            "final_score_bins": [{"score_bin": float(r.score_bin), "n": int(r.n)} for r in scores.itertuples()],
        },
        "mobility": {
            "promotion_count": int(promo),
            "transfer_count": int(xfer),
            "manager_change_count": int(mgr),
            "manager_change_synthetic_count": int(mgr_synthetic),
            "promotion_annualized": round(promo / person_years, 4),
            "transfer_annualized": round(xfer / person_years, 4),
            "manager_change_annualized": round(mgr / person_years, 4),
            "baseline": {"promotion": 0.08, "transfer": 0.06, "manager_change": 0.05},
        },
        "learning": {
            "training_rows": int(train_n),
            "hours_sum": round(float(hours[0] or 0), 2),
            "hours_per_participation": round(float(hours[1] or 0), 2),
            "hours_per_certified": round(float(hours[0] or 0) / ending_hc, 2) if ending_hc else 0,
        },
        "skills": {
            "avg_skills_per_worker": round(float(skills_avg or 0), 2),
            "gap_top": [
                {"job_family": r.job_family, "skill_id": r.skill_id, "gap": round(float(r.gap), 4)}
                for r in skill_gap.itertuples()
            ],
        },
        "engagement": {
            "waves": [
                {"wave_id": r.wave_id, "response_rate": round(float(r.response_rate), 4), "n_invited": int(r.n_invited)}
                for r in waves.itertuples()
            ],
            "dimension_means": [
                {"wave_id": r.wave_id, "dimension": r.dimension, "mean": round(float(r.mean_score), 3), "n": int(r.n)}
                for r in dims.itertuples()
            ],
        },
        "recruiting": {
            "time_to_fill_p50": round(float(ttf[0] or 0), 2),
            "time_to_fill_p90": round(float(ttf[1] or 0), 2),
            "time_to_fill_p90_over_p50": round(float(ttf[1] or 0) / float(ttf[0]), 4) if ttf[0] else 0,
            "stage_aging": [
                {
                    "canonical_stage": r.canonical_stage,
                    "aging_p50_days": round(float(r.aging_p50), 2),
                    "aging_p90_days": round(float(r.aging_p90), 2),
                }
                for r in aging.itertuples()
            ],
            "stage_aging_p50": [
                {"canonical_stage": r.canonical_stage, "aging_p50_days": round(float(r.aging_p50), 2)}
                for r in aging.itertuples()
            ],
            "openings": int(openings[0]),
            "cancelled": int(openings[1]),
            "filled": int(openings[2]),
            "cancel_rate": round(float(cancel_rate), 4),
            "baseline_cancel_rate": 0.10,
        },
        "org_tree": org,
    }


def funnel_distribution(con) -> dict:
    sources = con.execute(
        """
        SELECT coalesce(source_name, 'unknown') AS source_name, count(*) AS n,
               count(*) * 1.0 / sum(count(*)) OVER () AS share
        FROM people_fact_application
        GROUP BY 1
        ORDER BY 2 DESC
        """
    ).fetchdf()
    review_to_screen = con.execute(
        """
        WITH review AS (
          SELECT application_id FROM people_evt_application_stage WHERE canonical_stage = 'Review'
        ),
        screen AS (
          SELECT DISTINCT application_id FROM people_evt_application_stage WHERE canonical_stage = 'Screen'
        )
        SELECT a.source_name,
               count(*) AS review_apps,
               count(*) FILTER (WHERE s.application_id IS NOT NULL) AS to_screen,
               count(*) FILTER (WHERE s.application_id IS NOT NULL) * 1.0 / count(*) AS conv
        FROM people_fact_application a
        JOIN review r ON r.application_id = a.application_id
        LEFT JOIN screen s ON s.application_id = a.application_id
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    inbound_quick = con.execute(
        """
        SELECT
          count(*) AS inbound_review,
          count(*) FILTER (
            WHERE s.exited_at IS NOT NULL
              AND date_diff('day', CAST(s.entered_at AS TIMESTAMP), CAST(s.exited_at AS TIMESTAMP)) <= 5
              AND a.status = 'rejected'
              AND NOT EXISTS (
                SELECT 1 FROM people_evt_application_stage x
                WHERE x.application_id = a.application_id AND x.canonical_stage = 'Screen'
              )
          ) * 1.0 / nullif(count(*),0) AS share_rejected_in_review_within_5d
        FROM people_fact_application a
        JOIN people_evt_application_stage s
          ON s.application_id = a.application_id AND s.canonical_stage = 'Review'
        WHERE a.source_name = 'inbound'
        """
    ).fetchone()
    by_family = con.execute(
        """
        SELECT r.job_family,
               sum(a.n) AS applications,
               count(*) AS openings,
               round(avg(a.n),1) AS apps_per_opening
        FROM (
          SELECT requisition_id, count(*) AS n
          FROM people_fact_application
          GROUP BY 1
        ) a
        JOIN people_dim_requisition r ON r.requisition_id = a.requisition_id
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    by_source_family = con.execute(
        """
        SELECT r.job_family,
               coalesce(a.source_name, 'unknown') AS source_name,
               count(*) AS applications,
               count(distinct a.requisition_id) AS openings,
               round(count(*) * 1.0 / nullif(count(distinct a.requisition_id), 0), 1) AS apps_per_opening
        FROM people_fact_application a
        JOIN people_dim_requisition r ON r.requisition_id = a.requisition_id
        GROUP BY 1, 2
        ORDER BY 1, 2
        """
    ).fetchdf()
    return {
        "source_mix": [
            {"source": r.source_name, "n": int(r.n), "share": round(float(r.share), 4)}
            for r in sources.itertuples()
        ],
        "review_to_screen": [
            {"source": r.source_name, "review_apps": int(r.review_apps), "to_screen": int(r.to_screen), "conv": round(float(r.conv), 4)}
            for r in review_to_screen.itertuples()
        ],
        "inbound_review_quick_reject": {
            "inbound_review": int(inbound_quick[0] or 0),
            "share_rejected_in_review_within_5d": round(float(inbound_quick[1] or 0), 4),
        },
        "apps_per_opening_by_family": [
            {"job_family": r.job_family, "applications": int(r.applications), "openings": int(r.openings), "apps_per_opening": float(r.apps_per_opening)}
            for r in by_family.itertuples()
        ],
        "apps_per_opening_by_source_family": [
            {
                "job_family": r.job_family,
                "source": r.source_name,
                "applications": int(r.applications),
                "openings": int(r.openings),
                "apps_per_opening": float(r.apps_per_opening),
            }
            for r in by_source_family.itertuples()
        ],
    }


def case_signals(con) -> dict:
    compa = con.execute(
        """
        WITH latest AS (
          SELECT c.worker_id, c.base, c.grade, c.from_date,
                 row_number() OVER (PARTITION BY c.worker_id ORDER BY c.from_date DESC) AS rn
          FROM people_fact_comp_assignment c
          WHERE c.from_date <= DATE '2026-08-31'
        ),
        snap AS (
          SELECT worker_id, region, job_family, tenure_band
          FROM people_snap_worker_month
          WHERE month_end = DATE '2026-08-31' AND is_certified
        )
        SELECT
          CASE WHEN s.region = 'APAC' AND s.job_family = 'Engineering' AND s.tenure_band IN ('<1y','1–3y')
               THEN 'slice' ELSE 'control' END AS grp,
          quantile_cont(l.base * 1.0 / b.band_mid, 0.5) AS median_compa,
          count(*) AS n
        FROM latest l
        JOIN snap s ON s.worker_id = l.worker_id
        JOIN people_ref_comp_band b ON b.grade_id = l.grade
        WHERE l.rn = 1
        GROUP BY 1
        """
    ).fetchdf()
    mgr = con.execute(
        """
        WITH snap AS (
          SELECT worker_id, region, job_family, tenure_band
          FROM people_snap_worker_month
          WHERE month_end = DATE '2026-08-31' AND is_certified
        ),
        chg AS (
          SELECT worker_id, count(*) AS n
          FROM people_evt_manager_change
          WHERE event_date >= DATE '2025-10-01'
          GROUP BY 1
        )
        SELECT
          CASE WHEN s.region = 'APAC' AND s.job_family = 'Engineering' AND s.tenure_band IN ('<1y','1–3y')
               THEN 'slice' ELSE 'control' END AS grp,
          count(*) AS n_workers,
          coalesce(sum(c.n), 0) AS manager_changes_since_2025q4
        FROM snap s
        LEFT JOIN chg c ON c.worker_id = s.worker_id
        GROUP BY 1
        """
    ).fetchdf()
    delay = con.execute(
        """
        SELECT
          CASE WHEN i.hiring_manager_id IN (101,102,103) THEN 'slow_hm' ELSE 'other_hm' END AS grp,
          quantile_cont(date_diff('hour', CAST(i.start_at AS TIMESTAMP), CAST(s.submitted_at AS TIMESTAMP)) / 24.0, 0.5) AS scorecard_lag_p50_days,
          quantile_cont(date_diff('hour', CAST(st.entered_at AS TIMESTAMP), CAST(i.start_at AS TIMESTAMP)) / 24.0, 0.5) AS interview_lag_p50_days,
          count(*) AS n
        FROM people_fact_interview i
        JOIN people_fact_scorecard s
          ON s.application_id = i.application_id AND s.interview_kit_id = i.stage_id
        JOIN people_evt_application_stage st
          ON st.application_id = i.application_id AND st.canonical_stage = 'Onsite'
        WHERE i.job_family = 'Sales'
          AND i.stage_id = 3
          AND CAST(i.start_at AS DATE) >= DATE '2026-05-01'
        GROUP BY 1
        """
    ).fetchdf()
    ttf_hm = con.execute(
        """
        SELECT
          CASE WHEN hiring_manager_id IN (101,102,103) THEN 'slow_hm' ELSE 'other_hm' END AS grp,
          quantile_cont(date_diff('day', CAST(opened_at AS TIMESTAMP), CAST(closed_at AS TIMESTAMP)), 0.5) AS ttf_p50,
          quantile_cont(date_diff('day', CAST(opened_at AS TIMESTAMP), CAST(closed_at AS TIMESTAMP)), 0.9) AS ttf_p90,
          count(*) AS n
        FROM people_dim_requisition
        WHERE close_reason_id = 1
          AND job_family = 'Sales'
          AND CAST(closed_at AS DATE) >= DATE '2026-05-01'
        GROUP BY 1
        """
    ).fetchdf()
    onsite_hm = con.execute(
        """
        SELECT
          CASE WHEN i.hiring_manager_id IN (101,102,103) THEN 'slow_hm' ELSE 'other_hm' END AS grp,
          quantile_cont(date_diff('day', CAST(st.entered_at AS TIMESTAMP), CAST(coalesce(st.exited_at, st.entered_at) AS TIMESTAMP)), 0.5) AS aging_p50,
          quantile_cont(date_diff('day', CAST(st.entered_at AS TIMESTAMP), CAST(coalesce(st.exited_at, st.entered_at) AS TIMESTAMP)), 0.9) AS aging_p90,
          count(*) AS n
        FROM people_fact_interview i
        JOIN people_evt_application_stage st
          ON st.application_id = i.application_id AND st.canonical_stage = 'Onsite'
        WHERE i.job_family = 'Sales'
          AND i.stage_id = 3
          AND CAST(i.start_at AS DATE) >= DATE '2026-05-01'
        GROUP BY 1
        """
    ).fetchdf()
    mgr_reorg = con.execute(
        """
        WITH snap AS (
          SELECT worker_id, region, job_family, tenure_band
          FROM people_snap_worker_month
          WHERE month_end = DATE '2026-08-31' AND is_certified
        ),
        chg AS (
          SELECT worker_id, count(*) AS n
          FROM people_evt_manager_change
          WHERE event_date >= DATE '2025-10-01'
            AND coalesce(change_reason, 'reorg') = 'reorg'
            AND event_date <> last_day(event_date)
          GROUP BY 1
        )
        SELECT
          CASE WHEN s.region = 'APAC' AND s.job_family = 'Engineering' AND s.tenure_band IN ('<1y','1–3y')
               THEN 'slice' ELSE 'control' END AS grp,
          count(*) AS n_workers,
          coalesce(sum(c.n), 0) AS manager_changes_since_2025q4
        FROM snap s
        LEFT JOIN chg c ON c.worker_id = s.worker_id
        GROUP BY 1
        """
    ).fetchdf()
    mgr_reason = con.execute(
        """
        WITH snap AS (
          SELECT worker_id, region, job_family, tenure_band
          FROM people_snap_worker_month
          WHERE month_end = DATE '2026-08-31' AND is_certified
        )
        SELECT
          CASE WHEN s.region = 'APAC' AND s.job_family = 'Engineering' AND s.tenure_band IN ('<1y','1–3y')
               THEN 'slice' ELSE 'control' END AS grp,
          coalesce(c.change_reason, 'unknown') AS change_reason,
          count(*) AS n
        FROM people_evt_manager_change c
        JOIN snap s ON s.worker_id = c.worker_id
        WHERE c.event_date >= DATE '2025-10-01'
        GROUP BY 1, 2
        ORDER BY 1, 2
        """
    ).fetchdf()
    counts = con.execute(
        """
        SELECT coalesce(change_reason, 'unknown') AS change_reason, count(*) AS n
        FROM people_evt_manager_change
        GROUP BY 1
        ORDER BY 1
        """
    ).fetchdf()
    return {
        "case3_compa_ratio": [
            {"group": r.grp, "median_compa": round(float(r.median_compa), 4), "n": int(r.n)}
            for r in compa.itertuples()
        ],
        "case3_manager_change": [
            {
                "group": r.grp,
                "n_workers": int(r.n_workers),
                "manager_changes_since_2025q4": int(r.manager_changes_since_2025q4),
                "changes_per_worker": round(float(r.manager_changes_since_2025q4) / r.n_workers, 4) if r.n_workers else 0,
            }
            for r in mgr.itertuples()
        ],
        "case3_manager_change_reorg": [
            {
                "group": r.grp,
                "n_workers": int(r.n_workers),
                "manager_changes_since_2025q4": int(r.manager_changes_since_2025q4),
                "changes_per_worker": round(float(r.manager_changes_since_2025q4) / r.n_workers, 4) if r.n_workers else 0,
            }
            for r in mgr_reorg.itertuples()
        ],
        "case3_manager_change_by_reason": [
            {"group": r.grp, "change_reason": str(r.change_reason), "n": int(r.n)}
            for r in mgr_reason.itertuples()
        ],
        "manager_change_counts": [
            {"change_reason": str(r.change_reason), "n": int(r.n)} for r in counts.itertuples()
        ],
        "case4_scorecard_delay": [
            {
                "group": r.grp,
                "scorecard_lag_p50_days": round(float(r.scorecard_lag_p50_days), 3),
                "interview_lag_p50_days": round(float(r.interview_lag_p50_days), 3),
                "n": int(r.n),
            }
            for r in delay.itertuples()
        ],
        "case4_time_to_fill": [
            {
                "group": r.grp,
                "ttf_p50_days": round(float(r.ttf_p50), 2),
                "ttf_p90_days": round(float(r.ttf_p90), 2),
                "n": int(r.n),
            }
            for r in ttf_hm.itertuples()
        ],
        "case4_onsite_aging": [
            {
                "group": r.grp,
                "aging_p50_days": round(float(r.aging_p50), 2),
                "aging_p90_days": round(float(r.aging_p90), 2),
                "n": int(r.n),
            }
            for r in onsite_hm.itertuples()
        ],
    }


def engineering_trailing_3m(con) -> dict:
    row = con.execute(
        """
        SELECT
          count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') AS voluntary_terms,
          count(*) FILTER (WHERE is_certified) AS person_months
        FROM people_snap_worker_month
        WHERE job_family = 'Engineering'
          AND month_end BETWEEN DATE '2026-06-30' AND DATE '2026-08-31'
        """
    ).fetchone()
    terms, person_months = row
    annualized = (terms / (person_months / 12.0)) if person_months else 0.0
    return {
        "window": "2026-06..2026-08",
        "voluntary_terms": int(terms or 0),
        "person_months": int(person_months or 0),
        "annualized": round(float(annualized), 4),
    }


def case3_term_decomposition(con) -> dict:
    """Partition Engineering trailing-3m voluntary terms: slice hazard / manager leaver / other."""
    rows = con.execute(
        """
        WITH terms AS (
          SELECT
            s.worker_id,
            s.month_end,
            s.region,
            s.job_family,
            s.tenure_band,
            s.is_manager,
            s.manager_worker_id,
            CASE
              WHEN s.region = 'APAC' AND s.job_family = 'Engineering'
                   AND s.tenure_band IN ('<1y', '1–3y') THEN 1 ELSE 0
            END AS in_slice
          FROM people_snap_worker_month s
          WHERE s.job_family = 'Engineering'
            AND s.month_end BETWEEN DATE '2026-06-30' AND DATE '2026-08-31'
            AND s.terminated_in_month
            AND s.termination_category = 'voluntary'
        )
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE in_slice = 1) AS slice_hazard,
          count(*) FILTER (WHERE in_slice = 0 AND is_manager) AS manager_departure,
          count(*) FILTER (WHERE in_slice = 0 AND NOT is_manager) AS other
        FROM terms
        """
    ).fetchone()
    total, slice_h, mgr, other = [int(x or 0) for x in rows]
    return {
        "window": "2026-06..2026-08",
        "job_family": "Engineering",
        "voluntary_terms": total,
        "slice_hazard": slice_h,
        "manager_departure": mgr,
        "other": other,
        "parts_sum": slice_h + mgr + other,
    }


def littles_law_reconcile(con) -> dict:
    as_of = "DATE '2026-08-31'"
    open_n = con.execute(
        f"""
        SELECT count(*) FROM people_dim_requisition
        WHERE (closed_at IS NULL OR CAST(closed_at AS DATE) > {as_of})
          AND CAST(opened_at AS DATE) <= {as_of}
        """
    ).fetchone()[0]
    hires_12m = con.execute(
        """
        SELECT count(*) FROM people_snap_worker_month
        WHERE hired_in_month AND is_certified AND via_t1
          AND month_end <= DATE '2026-08-31' AND month_end > DATE '2026-08-31' - INTERVAL 12 MONTH
        """
    ).fetchone()[0]
    ttf_days = con.execute(
        """
        SELECT quantile_cont(date_diff('day', CAST(opened_at AS TIMESTAMP), CAST(closed_at AS TIMESTAMP)), 0.5)
        FROM people_dim_requisition
        WHERE close_reason_id = 1
          AND CAST(closed_at AS DATE) <= DATE '2026-08-31'
          AND CAST(closed_at AS DATE) > DATE '2026-08-31' - INTERVAL 12 MONTH
        """
    ).fetchone()[0]
    monthly = (hires_12m / 12.0) if hires_12m else 0.0
    ttf_m = (float(ttf_days) / 30.44) if ttf_days else 0.0
    expected = monthly * ttf_m
    rec_n = con.execute(
        f"SELECT count(DISTINCT recruiter_user_id) FROM people_snap_recruiter_month WHERE month_end = {as_of}"
    ).fetchone()[0]
    load = con.execute(
        f"SELECT coalesce(avg(open_requisitions),0) FROM people_snap_recruiter_month WHERE month_end = {as_of}"
    ).fetchone()[0]
    return {
        "open_requisitions": int(open_n or 0),
        "trailing_12m_hires": int(hires_12m or 0),
        "monthly_hires": round(monthly, 2),
        "ttf_p50_days": round(float(ttf_days or 0), 2),
        "ttf_months": round(ttf_m, 4),
        "expected_open": round(expected, 1),
        "abs_gap": round(abs((open_n or 0) - expected), 1),
        "rel_gap": round(abs((open_n or 0) - expected) / expected, 4) if expected else None,
        "n_recruiters": int(rec_n or 0),
        "recruiter_load": round(float(load or 0), 4),
    }
