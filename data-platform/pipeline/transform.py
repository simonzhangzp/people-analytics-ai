from __future__ import annotations

"""Bronze → mappings → silver parquet → gold parquet (DuckDB, lake only)."""

from datetime import date
from pathlib import Path

import duckdb
import pandas as pd
import yaml

from people_rulebook import certified_employment_types, certified_status, e6_map, params
from pipeline.canonical_layer import build_canonical_layer

DP = Path(__file__).resolve().parents[1]
MAP = DP / "people_mappings"
START = date(2021, 9, 1)
END = date(2026, 8, 31)


def _load(name: str) -> dict:
    return yaml.safe_load((MAP / name).read_text(encoding="utf-8"))


def mapping_identity_pairs(mapping_file: str, table: str) -> list[tuple[str, str]]:
    mapping = _load(mapping_file)
    pairs = []
    for field in mapping["fields"]:
        if field["canonical_table"] != table:
            continue
        transform = str(field.get("transformation") or "")
        src = field.get("source_field")
        if transform.startswith("identity") and isinstance(src, str):
            pairs.append((src, field["canonical_field"]))
    return pairs


def _q(path: Path) -> str:
    return path.resolve().as_posix().replace("'", "''")


def _load_parquet(con: duckdb.DuckDBPyConnection, table: str, directory: Path, empty_sql: str) -> None:
    files = list(directory.rglob("*.parquet")) if directory.exists() else []
    files = [p for p in files if p.stat().st_size > 0]
    if not files:
        con.execute(f"CREATE TABLE {table} AS {empty_sql}")
        return
    if len(files) == 1:
        con.execute(f"CREATE TABLE {table} AS SELECT * FROM read_parquet('{_q(files[0])}')")
        return
    con.execute(
        f"CREATE TABLE {table} AS SELECT * FROM read_parquet('{_q(directory)}/**/*.parquet', union_by_name=true)"
    )


def transform(bronze: Path, silver: Path, gold: Path) -> duckdb.DuckDBPyConnection:
    silver.mkdir(parents=True, exist_ok=True)
    gold.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(database=":memory:")
    emp = _q(bronze / "frappe_hr" / "Employee" / "part.parquet")
    sep = _q(bronze / "frappe_hr" / "Employee_Separation" / "part.parquet")

    offer_id_pairs = mapping_identity_pairs("greenhouse_offer.yml", "people_fact_offer")
    assert any(dst == "offer_id" for _, dst in offer_id_pairs)
    app_id_pairs = mapping_identity_pairs("greenhouse_application.yml", "people_fact_application")
    assert any(dst == "application_id" for _, dst in app_id_pairs)
    assert any(dst == "source_id" for _, dst in app_id_pairs)
    req_id_pairs = mapping_identity_pairs("greenhouse_job_opening.yml", "people_dim_requisition")
    assert any(dst == "requisition_id" for _, dst in req_id_pairs)
    stage_pairs = mapping_identity_pairs("greenhouse_application_stage.yml", "people_evt_application_stage")
    assert any(dst == "application_id" for _, dst in stage_pairs)
    ssa_pairs = mapping_identity_pairs("frappe_salary_assignment.yml", "people_fact_comp_assignment_restricted")
    assert any(dst == "worker_id" for _, dst in ssa_pairs)

    status_inc = ", ".join("'" + s.replace("'", "''") + "'" for s in sorted(certified_status()))
    type_cert = ", ".join("'" + s.replace("'", "''") + "'" for s in sorted(certified_employment_types()))
    e6_cases = " ".join(
        f"WHEN reason_for_leaving = '{k.replace(chr(39), chr(39)+chr(39))}' THEN '{v}'"
        for k, v in e6_map().items()
    )
    unmapped = params("BR-RET-001")["unmapped"]
    ta4 = params("BR-TA-004")["map"]
    ta7 = params("BR-TA-007")["map"]
    app_status_sql = " ".join(f"WHEN '{src}' THEN '{dst}'" for src, dst in ta4.items())
    offer_status_sql = " ".join(f"WHEN '{src}' THEN '{dst}'" for src, dst in ta7.items())

    con.execute(
        f"""
        CREATE TABLE bronze_employee AS
        SELECT * FROM read_parquet('{emp}', file_row_number=true);
        CREATE TABLE bronze_separation AS SELECT * FROM read_parquet('{sep}');
        """
    )
    emp_cols = {r[0] for r in con.execute("DESCRIBE bronze_employee").fetchall()}
    if "emit_seq" not in emp_cols:
        con.execute("ALTER TABLE bronze_employee RENAME COLUMN file_row_number TO emit_seq")
    elif "file_row_number" in emp_cols:
        con.execute("ALTER TABLE bronze_employee DROP COLUMN file_row_number")
    _load_parquet(
        con,
        "bronze_offer",
        bronze / "greenhouse_v3" / "offer",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS application_id, NULL::BIGINT AS opening_id, NULL::BIGINT AS job_id, NULL::VARCHAR AS status, NULL::VARCHAR AS starts_on, NULL::VARCHAR AS sent_on, NULL::VARCHAR AS resolved_at, NULL::VARCHAR AS created_at, NULL::INTEGER AS version WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_application",
        bronze / "greenhouse_v3" / "application",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS candidate_id, NULL::BIGINT AS job_id, NULL::VARCHAR AS status, NULL::VARCHAR AS created_at, NULL::INTEGER AS job_interview_stage_id, NULL::INTEGER AS recruiter_id, NULL::INTEGER AS source_id, NULL::VARCHAR AS source_name, NULL::BIGINT AS opening_id, NULL::VARCHAR AS rejected_at, NULL::VARCHAR AS hired_at, NULL::INTEGER AS rejection_reason_id WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_opening",
        bronze / "greenhouse_v3" / "opening",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS job_id, NULL::BOOLEAN AS open, NULL::VARCHAR AS opened_at, NULL::VARCHAR AS closed_at, NULL::BIGINT AS application_id, NULL::INTEGER AS close_reason_id, NULL::INTEGER AS hiring_manager_id, NULL::VARCHAR AS job_family, NULL::INTEGER AS recruiter_id, NULL::VARCHAR AS region WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_stage",
        bronze / "greenhouse_v3" / "application_stage",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS application_id, NULL::INTEGER AS job_interview_stage_id, NULL::VARCHAR AS stage_name, NULL::VARCHAR AS entered_at, NULL::VARCHAR AS exited_at, NULL::BOOLEAN AS current WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_interview",
        bronze / "greenhouse_v3" / "interview",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS application_id, NULL::INTEGER AS job_interview_id, NULL::VARCHAR AS starts_at, NULL::VARCHAR AS ends_at, NULL::VARCHAR AS status, NULL::INTEGER AS hiring_manager_id, NULL::VARCHAR AS job_family WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_scorecard",
        bronze / "greenhouse_v3" / "scorecard",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS application_id, NULL::INTEGER AS interview_kit_id, NULL::BIGINT AS interview_id, NULL::INTEGER AS submitter_id, NULL::INTEGER AS interviewer_id, NULL::VARCHAR AS candidate_rating, NULL::VARCHAR AS overall_recommendation, NULL::VARCHAR AS submitted_at, NULL::VARCHAR AS status, NULL::INTEGER AS hiring_manager_id, NULL::VARCHAR AS job_family WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_ssa",
        bronze / "frappe_hr" / "Salary_Structure_Assignment",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS employee, NULL::VARCHAR AS from_date, NULL::BIGINT AS base, NULL::VARCHAR AS grade, NULL::INTEGER AS docstatus WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_appraisal",
        bronze / "frappe_hr" / "Appraisal",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS employee, NULL::VARCHAR AS appraisal_cycle, NULL::DOUBLE AS final_score, NULL::DOUBLE AS total_score, NULL::DOUBLE AS self_score, NULL::INTEGER AS docstatus, NULL::VARCHAR AS modified, NULL::VARCHAR AS submitted_at WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_promotion",
        bronze / "frappe_hr" / "Employee_Promotion",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS employee, NULL::VARCHAR AS promotion_date, NULL::INTEGER AS docstatus WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_transfer",
        bronze / "frappe_hr" / "Employee_Transfer",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS employee, NULL::VARCHAR AS transfer_date, NULL::INTEGER AS docstatus WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_training_event",
        bronze / "frappe_hr" / "Training_Event",
        "SELECT NULL::VARCHAR AS name, NULL::INTEGER AS docstatus WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_training_event_employee",
        bronze / "frappe_hr" / "Training_Event_Employee",
        "SELECT NULL::VARCHAR AS parent, NULL::VARCHAR AS employee WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_training_result_employee",
        bronze / "frappe_hr" / "Training_Result_Employee",
        "SELECT NULL::VARCHAR AS parent, NULL::VARCHAR AS employee, NULL::DOUBLE AS hours, NULL::VARCHAR AS training_event WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_skill",
        bronze / "frappe_hr" / "Employee_Skill",
        "SELECT NULL::VARCHAR AS parent, NULL::VARCHAR AS skill, NULL::DOUBLE AS proficiency, NULL::VARCHAR AS employee, NULL::VARCHAR AS job_family, NULL::VARCHAR AS evaluation_date WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_wave",
        bronze / "engagement_ext" / "survey_wave",
        "SELECT NULL::VARCHAR AS wave_id, NULL::DOUBLE AS response_rate, NULL::INTEGER AS n_invited WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_survey",
        bronze / "engagement_ext" / "survey_response",
        "SELECT NULL::VARCHAR AS response_id, NULL::VARCHAR AS wave_id, NULL::VARCHAR AS worker_id, NULL::VARCHAR AS item_id, NULL::VARCHAR AS dimension, NULL::INTEGER AS score WHERE 1=0",
    )

    con.execute(
        f"""
        CREATE TABLE people_fact_offer AS
        SELECT
          id AS offer_id,
          version,
          application_id,
          opening_id AS requisition_id,
          CASE status {offer_status_sql} ELSE lower(status) END AS status,
          starts_on AS starts_at,
          sent_on AS sent_at,
          resolved_at,
          created_at
        FROM bronze_offer;

        CREATE TABLE people_fact_application AS
        SELECT
          id AS application_id,
          candidate_id,
          job_id,
          CASE status {app_status_sql} ELSE status END AS status,
          created_at AS applied_at,
          created_at,
          source_id,
          source_name,
          opening_id AS requisition_id,
          job_interview_stage_id AS current_stage_id,
          rejected_at,
          hired_at,
          CASE WHEN source_name = 'referral' THEN CAST(recruiter_id AS VARCHAR) ELSE NULL END AS referrer_person_id,
          rejection_reason_id,
          CASE WHEN status IN ('rejected','Rejected') THEN 'rejected' WHEN status IN ('hired','Hired') THEN 'hired' ELSE NULL END AS rejection_type,
          recruiter_id
        FROM bronze_application;

        CREATE TABLE people_dim_requisition AS
        SELECT
          id AS requisition_id,
          job_id AS gh_job_id,
          id AS gh_opening_id,
          CAST(NULL AS VARCHAR) AS job_id,
          CAST(NULL AS VARCHAR) AS org_id,
          CAST(NULL AS VARCHAR) AS location_id,
          CAST(NULL AS VARCHAR) AS hiring_manager_person_id,
          CAST(NULL AS VARCHAR) AS recruiter_person_id,
          opened_at,
          closed_at,
          CASE WHEN "open" THEN 'open' ELSE 'closed' END AS status,
          CASE close_reason_id WHEN 1 THEN 'hired' WHEN 99 THEN 'cancelled' ELSE CAST(close_reason_id AS VARCHAR) END AS close_reason,
          application_id AS hired_application_id,
          close_reason_id,
          hiring_manager_id,
          recruiter_id,
          job_family,
          region
        FROM bronze_opening;

        CREATE TABLE people_evt_application_stage AS
        SELECT
          id AS stage_event_id,
          application_id,
          job_interview_stage_id AS stage_id,
          stage_name,
          CASE stage_name
            WHEN 'Application Review' THEN 'Review'
            WHEN 'Phone Screen' THEN 'Screen'
            WHEN 'Onsite' THEN 'Onsite'
            WHEN 'Offer' THEN 'Offer'
            ELSE stage_name
          END AS canonical_stage,
          entered_at,
          exited_at,
          "current" AS is_current
        FROM bronze_stage;

        CREATE TABLE people_fact_interview AS
        SELECT
          id AS interview_id,
          application_id,
          job_interview_id AS stage_id,
          starts_at AS start_at,
          ends_at AS end_at,
          status,
          CAST(NULL AS VARCHAR) AS interviewer_person_ids,
          hiring_manager_id,
          job_family
        FROM bronze_interview;

        CREATE TABLE people_fact_scorecard AS
        SELECT
          id AS scorecard_id,
          application_id,
          interview_id,
          CAST(NULL AS VARCHAR) AS submitted_by_person_id,
          submitted_at,
          coalesce(overall_recommendation, candidate_rating) AS overall_recommendation,
          interview_kit_id,
          submitter_id,
          interviewer_id,
          candidate_rating,
          status,
          hiring_manager_id,
          job_family
        FROM bronze_scorecard;

        CREATE TABLE people_fact_separation AS
        SELECT * FROM bronze_separation WHERE docstatus = 1;

        CREATE TABLE people_fact_comp_assignment AS
        SELECT
          name AS comp_assignment_id,
          employee AS worker_id,
          CAST(from_date AS DATE) AS from_date,
          base,
          grade,
          docstatus
        FROM bronze_ssa
        WHERE docstatus = 1;

        CREATE TABLE people_fact_appraisal AS
        SELECT
          name AS appraisal_id,
          employee AS worker_id,
          appraisal_cycle AS cycle_id,
          final_score,
          total_score,
          self_score,
          CASE WHEN docstatus = 1 THEN 'submitted' ELSE 'draft' END AS status,
          CAST(coalesce(submitted_at, modified) AS TIMESTAMP) AS submitted_at,
          docstatus
        FROM bronze_appraisal
        WHERE docstatus = 1;

        CREATE TABLE people_evt_promotion AS
        SELECT name AS promotion_id, employee AS worker_id, CAST(promotion_date AS DATE) AS event_date
        FROM bronze_promotion WHERE docstatus = 1;

        CREATE TABLE people_evt_transfer AS
        SELECT name AS transfer_id, employee AS worker_id, CAST(transfer_date AS DATE) AS event_date
        FROM bronze_transfer WHERE docstatus = 1;

        CREATE TABLE people_evt_manager_change AS
        SELECT NULL::VARCHAR AS worker_id, NULL::DATE AS event_date, NULL::VARCHAR AS region,
               NULL::VARCHAR AS job_family, NULL::VARCHAR AS tenure_band WHERE 1=0;

        CREATE TABLE people_fact_training_participation AS
        SELECT
          e.employee AS worker_id,
          e.parent AS training_event_id,
          r.hours
        FROM bronze_training_event_employee e
        LEFT JOIN bronze_training_result_employee r
          ON r.employee = e.employee AND r.training_event = e.parent;

        CREATE TABLE people_fact_worker_skill AS
        SELECT employee AS worker_id, skill AS skill_id, proficiency,
               CAST(evaluation_date AS DATE) AS evaluation_date, parent AS source_skill_map, job_family
        FROM bronze_skill;

        CREATE TABLE people_fact_survey_wave AS SELECT * FROM bronze_wave;
        CREATE TABLE people_fact_survey_score AS SELECT * FROM bronze_survey;
        """
    )

    con.execute(
        f"""
        CREATE TABLE people_hist_worker_attr AS
        WITH ordered AS (
          SELECT
            name AS worker_id,
            person_id,
            CAST(date_of_joining AS DATE) AS hire_date,
            CAST(relieving_date AS DATE) AS termination_date,
            status,
            employment_type,
            branch_region AS region,
            job_family,
            department,
            designation,
            grade,
            branch,
            reports_to,
            hired_via_application_id,
            is_rehire,
            via_t1,
            reason_for_leaving,
            CAST(modified_date AS DATE) AS valid_from,
            lead(CAST(modified_date AS DATE)) OVER (PARTITION BY name ORDER BY emit_seq, modified_date, modified) AS next_from
          FROM bronze_employee
        )
        SELECT
          worker_id, person_id, hire_date, termination_date, status, employment_type,
          region, job_family, department, designation, grade, branch, reports_to,
          hired_via_application_id, is_rehire, via_t1, reason_for_leaving,
          CASE WHEN valid_from < hire_date THEN hire_date ELSE valid_from END AS valid_from,
          next_from AS valid_to
        FROM ordered;

        CREATE TABLE people_dim_worker AS
        SELECT
          worker_id, person_id, hire_date, termination_date, status, employment_type,
          region, job_family, is_rehire, via_t1, reason_for_leaving, hired_via_application_id,
          CASE WHEN termination_date IS NULL THEN NULL
               {e6_cases} ELSE '{unmapped}' END AS termination_category
        FROM people_hist_worker_attr
        QUALIFY row_number() OVER (PARTITION BY worker_id ORDER BY valid_from DESC) = 1;
        """
    )

    months = []
    cur = date(START.year, START.month, 1)
    while cur <= END:
        last = date(cur.year, cur.month, __import__("calendar").monthrange(cur.year, cur.month)[1])
        if START <= last <= END:
            months.append({"month_end": last, "month_start": cur})
        cur = date(cur.year + (1 if cur.month == 12 else 0), 1 if cur.month == 12 else cur.month + 1, 1)
    con.register("month_spine", pd.DataFrame(months))

    con.execute(
        f"""
        CREATE TABLE people_snap_worker_month AS
        SELECT
          m.month_end,
          m.month_start,
          h.worker_id,
          h.person_id,
          h.hire_date,
          h.termination_date,
          h.region,
          h.job_family,
          h.employment_type,
          h.is_rehire,
          h.via_t1,
          CASE
            WHEN h.termination_date IS NOT NULL AND h.termination_date <= m.month_end THEN 'Left'
            ELSE h.status
          END AS status,
          CASE
            WHEN date_diff('month', h.hire_date, m.month_end) - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 12 THEN '<1y'
            WHEN date_diff('month', h.hire_date, m.month_end) - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 36 THEN '1–3y'
            WHEN date_diff('month', h.hire_date, m.month_end) - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 60 THEN '3–5y'
            WHEN date_diff('month', h.hire_date, m.month_end) - CASE WHEN date_part('day', m.month_end) < date_part('day', h.hire_date) THEN 1 ELSE 0 END < 120 THEN '5–10y'
            ELSE '10y+'
          END AS tenure_band,
          (h.hire_date >= m.month_start AND h.hire_date <= m.month_end) AS hired_in_month,
          (h.termination_date IS NOT NULL AND h.termination_date >= m.month_start AND h.termination_date <= m.month_end) AS terminated_in_month,
          w.termination_category,
          (
            CASE WHEN h.termination_date IS NOT NULL AND h.termination_date <= m.month_end THEN 'Left' ELSE h.status END IN ({status_inc})
            AND h.employment_type IN ({type_cert})
            AND h.hire_date <= m.month_end
            AND (h.termination_date IS NULL OR h.termination_date > m.month_end)
          ) AS is_certified
        FROM month_spine m
        JOIN people_hist_worker_attr h
          ON h.valid_from <= m.month_end
         AND (h.valid_to IS NULL OR h.valid_to > m.month_end)
        JOIN people_dim_worker w ON w.worker_id = h.worker_id
        WHERE h.hire_date <= m.month_end
          AND (h.termination_date IS NULL OR h.termination_date >= m.month_start);
        """
    )

    con.execute(
        """
        CREATE TABLE people_mart_workforce_monthly AS
        SELECT month_end, region, tenure_band, job_family,
               count(*) FILTER (WHERE is_certified) AS headcount,
               count(*) FILTER (WHERE hired_in_month AND is_certified) AS hires,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'voluntary') AS terms_vol,
               count(*) FILTER (WHERE terminated_in_month AND termination_category = 'involuntary') AS terms_invol
        FROM people_snap_worker_month
        GROUP BY 1,2,3,4;

        CREATE TABLE people_mart_recruiting_monthly AS
        SELECT
          date_trunc('month', CAST(starts_at AS DATE))::DATE AS month_start,
          count(*) FILTER (WHERE status = 'accepted') AS offers_accepted,
          count(*) FILTER (WHERE status IN ('accepted','rejected')) AS offers_resolved,
          count(*) FILTER (WHERE status = 'accepted') AS hires
        FROM people_fact_offer
        GROUP BY 1;

        CREATE TABLE people_mart_funnel_monthly AS
        SELECT
          date_trunc('month', CAST(applied_at AS TIMESTAMP))::DATE AS month_start,
          coalesce(source_name, 'unknown') AS source_name,
          count(*) AS applications,
          count(*) FILTER (WHERE status = 'hired') AS hired
        FROM people_fact_application
        GROUP BY 1,2;

        CREATE TABLE people_mart_stage_aging_monthly AS
        SELECT
          date_trunc('month', CAST(entered_at AS TIMESTAMP))::DATE AS month_start,
          canonical_stage,
          quantile_cont(date_diff('day', CAST(entered_at AS TIMESTAMP), CAST(coalesce(exited_at, entered_at) AS TIMESTAMP)), 0.5) AS aging_p50_days
        FROM people_evt_application_stage
        GROUP BY 1,2;
        """
    )

    build_canonical_layer(con, bronze)

    export = [
        ("people_xw_identity", silver / "people_xw_identity.parquet"),
        ("people_xw_org", silver / "people_xw_org.parquet"),
        ("people_xw_location", silver / "people_xw_location.parquet"),
        ("people_xw_job", silver / "people_xw_job.parquet"),
        ("people_xw_skill", silver / "people_xw_skill.parquet"),
        ("people_dim_org", silver / "people_dim_org.parquet"),
        ("people_dim_job", silver / "people_dim_job.parquet"),
        ("people_dim_grade", silver / "people_dim_grade.parquet"),
        ("people_dim_location", silver / "people_dim_location.parquet"),
        ("people_dim_date", silver / "people_dim_date.parquet"),
        ("people_dim_appraisal_cycle", silver / "people_dim_appraisal_cycle.parquet"),
        ("people_dim_learning_resource", silver / "people_dim_learning_resource.parquet"),
        ("people_dim_survey_item", silver / "people_dim_survey_item.parquet"),
        ("people_dim_survey_wave", silver / "people_dim_survey_wave.parquet"),
        ("people_dim_person", silver / "people_dim_person.parquet"),
        ("people_dim_person_restricted", silver / "people_dim_person_restricted.parquet"),
        ("people_dim_worker", silver / "people_dim_worker.parquet"),
        ("people_dim_requisition", silver / "people_dim_requisition.parquet"),
        ("people_dim_candidate", silver / "people_dim_candidate.parquet"),
        ("people_dim_source", silver / "people_dim_source.parquet"),
        ("people_dim_rejection_reason", silver / "people_dim_rejection_reason.parquet"),
        ("people_dim_stage", silver / "people_dim_stage.parquet"),
        ("people_dim_skill", silver / "people_dim_skill.parquet"),
        ("people_dim_recruiter", silver / "people_dim_recruiter.parquet"),
        ("people_hist_worker_attr", silver / "people_hist_worker_attr.parquet"),
        ("people_evt_worker", silver / "people_evt_worker.parquet"),
        ("people_evt_worker_change", silver / "people_evt_worker_change.parquet"),
        ("people_evt_promotion", silver / "people_evt_promotion.parquet"),
        ("people_evt_transfer", silver / "people_evt_transfer.parquet"),
        ("people_evt_manager_change", silver / "people_evt_manager_change.parquet"),
        ("people_fact_offer", silver / "people_fact_offer.parquet"),
        ("people_fact_application", silver / "people_fact_application.parquet"),
        ("people_evt_application_stage", silver / "people_evt_application_stage.parquet"),
        ("people_fact_interview", silver / "people_fact_interview.parquet"),
        ("people_fact_scorecard", silver / "people_fact_scorecard.parquet"),
        ("people_fact_separation", silver / "people_fact_separation.parquet"),
        ("people_fact_comp_assignment", silver / "people_fact_comp_assignment.parquet"),
        ("people_fact_comp_assignment_restricted", silver / "people_fact_comp_assignment_restricted.parquet"),
        ("people_fact_appraisal", silver / "people_fact_appraisal.parquet"),
        ("people_fact_training_participation", silver / "people_fact_training_participation.parquet"),
        ("people_fact_worker_skill", silver / "people_fact_worker_skill.parquet"),
        ("people_fact_candidate_eeoc_restricted", silver / "people_fact_candidate_eeoc_restricted.parquet"),
        ("people_fact_candidate_demographic_restricted", silver / "people_fact_candidate_demographic_restricted.parquet"),
        ("people_ref_comp_band", silver / "people_ref_comp_band.parquet"),
        ("people_ref_city", silver / "people_ref_city.parquet"),
        ("people_ref_job_skill_target", silver / "people_ref_job_skill_target.parquet"),
        ("people_ref_separation_reason_map", silver / "people_ref_separation_reason_map.parquet"),
        ("people_snap_worker_month", gold / "people_snap_worker_month.parquet"),
        ("people_snap_requisition_month", gold / "people_snap_requisition_month.parquet"),
        ("people_snap_recruiter_month", gold / "people_snap_recruiter_month.parquet"),
        ("people_mart_workforce_monthly", gold / "people_mart_workforce_monthly.parquet"),
        ("people_mart_workforce_monthly_2d", gold / "people_mart_workforce_monthly_2d.parquet"),
        ("people_mart_mobility_monthly", gold / "people_mart_mobility_monthly.parquet"),
        ("people_mart_recruiting_monthly", gold / "people_mart_recruiting_monthly.parquet"),
        ("people_mart_stage_aging_monthly", gold / "people_mart_stage_aging_monthly.parquet"),
        ("people_mart_recruiter_load_monthly", gold / "people_mart_recruiter_load_monthly.parquet"),
        ("people_mart_comp_monthly", gold / "people_mart_comp_monthly.parquet"),
        ("people_mart_learning_monthly", gold / "people_mart_learning_monthly.parquet"),
        ("people_mart_skill_coverage_monthly", gold / "people_mart_skill_coverage_monthly.parquet"),
        ("people_mart_engagement_wave", gold / "people_mart_engagement_wave.parquet"),
        ("people_mart_source_health_daily", gold / "people_mart_source_health_daily.parquet"),
        ("people_mart_applicant_flow", gold / "people_mart_applicant_flow.parquet"),
        ("people_mart_funnel_monthly", gold / "people_mart_funnel_monthly.parquet"),
        ("people_fact_survey_wave", gold / "people_fact_survey_wave.parquet"),
        ("people_fact_survey_score", gold / "people_fact_survey_score.parquet"),
        ("people_fact_survey_score_restricted", gold / "people_fact_survey_score_restricted.parquet"),
        ("people_dim_worker", gold / "people_dim_worker.parquet"),
        ("people_evt_application_stage", gold / "people_evt_application_stage.parquet"),
        ("people_fact_application", gold / "people_fact_application.parquet"),
        ("people_dim_requisition", gold / "people_dim_requisition.parquet"),
        ("people_ref_comp_band", gold / "people_ref_comp_band.parquet"),
        ("people_fact_comp_assignment", gold / "people_fact_comp_assignment.parquet"),
        ("people_fact_appraisal", gold / "people_fact_appraisal.parquet"),
        ("people_evt_promotion", gold / "people_evt_promotion.parquet"),
        ("people_evt_transfer", gold / "people_evt_transfer.parquet"),
        ("people_evt_manager_change", gold / "people_evt_manager_change.parquet"),
        ("people_fact_training_participation", gold / "people_fact_training_participation.parquet"),
        ("people_fact_worker_skill", gold / "people_fact_worker_skill.parquet"),
        ("people_fact_interview", gold / "people_fact_interview.parquet"),
        ("people_fact_scorecard", gold / "people_fact_scorecard.parquet"),
    ]
    for table, dest in export:
        dest.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY {table} TO '{_q(dest)}' (FORMAT PARQUET)")
    return con
