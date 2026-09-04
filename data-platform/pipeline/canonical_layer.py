from __future__ import annotations

"""SCD2 dims, crosswalks, unified worker events, and remaining gold snaps/marts."""

from datetime import date
from pathlib import Path

import duckdb

from people_rulebook import e6_map
from pipeline.events_and_gold import build_events_and_gold

START = date(2021, 9, 1)


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


BAND_MID = {
    "G1": 40000,
    "G2": 65000,
    "G3": 90000,
    "G4": 115000,
    "G5": 140000,
    "G6": 165000,
    "G7": 190000,
    "G8": 220000,
    "G9": 260000,
    "G10": 320000,
}


def build_canonical_layer(con, bronze: Path) -> None:
    _load_parquet(
        con,
        "bronze_appraisal_cycle",
        bronze / "frappe_hr" / "Appraisal_Cycle",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS cycle_name, NULL::VARCHAR AS start_date, NULL::VARCHAR AS end_date, NULL::VARCHAR AS status WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_department",
        bronze / "frappe_hr" / "Department",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS parent_department, NULL::VARCHAR AS org_path, NULL::INTEGER AS depth, NULL::VARCHAR AS bg, NULL::INTEGER AS is_group WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_designation",
        bronze / "frappe_hr" / "Designation",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS job_family WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_grade",
        bronze / "frappe_hr" / "Employee_Grade",
        "SELECT NULL::VARCHAR AS name, NULL::INTEGER AS level_rank, NULL::VARCHAR AS default_salary_structure WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_branch",
        bronze / "frappe_hr" / "Branch",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS city, NULL::VARCHAR AS country, NULL::VARCHAR AS region WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_employment_type",
        bronze / "frappe_hr" / "Employment_Type",
        "SELECT NULL::VARCHAR AS name, NULL::BOOLEAN AS in_certified_headcount WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_skill_master",
        bronze / "frappe_hr" / "Skill",
        "SELECT NULL::VARCHAR AS name WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_training_program",
        bronze / "frappe_hr" / "Training_Program",
        "SELECT NULL::VARCHAR AS name, NULL::VARCHAR AS status WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_property_history",
        bronze / "frappe_hr" / "Employee_Property_History",
        "SELECT NULL::VARCHAR AS parent, NULL::VARCHAR AS parenttype, NULL::INTEGER AS idx, NULL::VARCHAR AS property, NULL::VARCHAR AS fieldname, NULL::VARCHAR AS current, NULL::VARCHAR AS new, NULL::VARCHAR AS employee, NULL::VARCHAR AS event_date, NULL::VARCHAR AS change_reason WHERE 1=0",
    )
    ph_cols = {r[0] for r in con.execute("DESCRIBE bronze_property_history").fetchall()}
    if "change_reason" not in ph_cols:
        con.execute("ALTER TABLE bronze_property_history ADD COLUMN change_reason VARCHAR")
    _load_parquet(
        con,
        "bronze_user",
        bronze / "greenhouse_v3" / "user",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS employee_id, NULL::BOOLEAN AS deactivated, NULL::VARCHAR AS created_at WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_gh_department",
        bronze / "greenhouse_v3" / "department",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS name WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_office",
        bronze / "greenhouse_v3" / "office",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS name WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_source",
        bronze / "greenhouse_v3" / "source",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS name, NULL::VARCHAR AS type WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_rejection_reason",
        bronze / "greenhouse_v3" / "rejection_reason",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS name, NULL::VARCHAR AS type WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_job_stage",
        bronze / "greenhouse_v3" / "job_interview_stage",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS job_id, NULL::VARCHAR AS name, NULL::INTEGER AS priority WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_candidate",
        bronze / "greenhouse_v3" / "candidate",
        "SELECT NULL::BIGINT AS id, NULL::VARCHAR AS created_at, NULL::INTEGER AS source_id WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_eeoc",
        bronze / "greenhouse_v3" / "eeoc",
        "SELECT NULL::BIGINT AS application_id, NULL::VARCHAR AS race, NULL::VARCHAR AS gender, NULL::VARCHAR AS veteran_status, NULL::VARCHAR AS disability_status, NULL::VARCHAR AS submitted_at WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_demographic",
        bronze / "greenhouse_v3" / "demographic_answer",
        "SELECT NULL::BIGINT AS id, NULL::BIGINT AS application_id, NULL::VARCHAR AS question_id, NULL::VARCHAR AS answer_option_id, NULL::VARCHAR AS free_form_text, NULL::VARCHAR AS submitted_at WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_survey_instrument",
        bronze / "engagement_ext" / "survey_instrument",
        "SELECT NULL::VARCHAR AS instrument_version, NULL::VARCHAR AS item_id, NULL::VARCHAR AS dimension, NULL::VARCHAR AS prompt, NULL::BOOLEAN AS reverse WHERE 1=0",
    )
    _load_parquet(
        con,
        "bronze_extract_prior",
        bronze / "frappe_hr" / "Employee" / "extract_date=2026-08-07",
        "SELECT NULL::VARCHAR AS name WHERE 1=0",
    )

    band_values = ", ".join(
        f"('{g}', 'US', 'USD', {int(m * 0.8)}, {m}, {int(m * 1.2)}, DATE '2021-09-01', NULL)"
        for g, m in BAND_MID.items()
    )
    e6_values = ", ".join(
        f"('{k.replace(chr(39), chr(39)+chr(39))}', '{v.replace(chr(39), chr(39)+chr(39))}')"
        for k, v in e6_map().items()
    )
    con.execute(
        f"""
        CREATE OR REPLACE TABLE people_ref_comp_band AS
        SELECT * FROM (VALUES {band_values})
          t(grade_id, country, currency, band_min, band_mid, band_max, valid_from, valid_to);
        CREATE OR REPLACE TABLE people_ref_separation_reason_map AS
        SELECT * FROM (VALUES {e6_values}) t(raw_reason, termination_category);
        """
    )

    con.execute(
        """
        CREATE TABLE people_dim_org AS
        SELECT
          name AS org_id,
          name AS org_name,
          parent_department AS parent_org_id,
          'GlobalTech' AS company,
          coalesce(is_group, 0) = 1 AS is_group,
          lower(regexp_replace(coalesce(org_path, name), '[^A-Za-z0-9.]+', '_', 'g')) AS org_path,
          coalesce(depth, 1) AS depth,
          bg,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to,
          TRUE AS is_current
        FROM bronze_department;

        CREATE TABLE people_dim_job AS
        SELECT
          name AS job_id,
          name AS job_name,
          NULL::VARCHAR AS onet_soc_code,
          job_family,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to,
          TRUE AS is_current
        FROM bronze_designation;

        CREATE TABLE people_dim_grade AS
        SELECT
          name AS grade_id,
          name AS grade_name,
          level_rank,
          default_salary_structure,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to,
          TRUE AS is_current
        FROM bronze_grade;

        CREATE TABLE people_dim_location AS
        SELECT
          name AS location_id,
          name AS branch_name,
          city,
          country,
          region,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to,
          TRUE AS is_current
        FROM bronze_branch;

        CREATE TABLE people_ref_city AS
        SELECT DISTINCT city, country, region FROM bronze_branch WHERE city IS NOT NULL;

        CREATE TABLE people_dim_date AS
        SELECT month_end AS date, month_end, TRUE AS is_month_end FROM month_spine;

        CREATE TABLE people_dim_appraisal_cycle AS
        SELECT
          name AS cycle_id,
          cycle_name,
          CAST(start_date AS DATE) AS start_date,
          CAST(end_date AS DATE) AS end_date,
          status
        FROM bronze_appraisal_cycle;

        CREATE TABLE people_dim_stage AS
        SELECT
          id AS stage_id,
          job_id AS gh_job_id,
          name AS stage_name,
          priority,
          CASE name
            WHEN 'Application Review' THEN 'Review'
            WHEN 'Phone Screen' THEN 'Screen'
            WHEN 'Onsite' THEN 'Onsite'
            WHEN 'Offer' THEN 'Offer'
            ELSE name
          END AS canonical_stage
        FROM bronze_job_stage;

        CREATE TABLE people_dim_source AS SELECT id, name, type FROM bronze_source;
        CREATE TABLE people_dim_rejection_reason AS SELECT id, name, type FROM bronze_rejection_reason;
        CREATE TABLE people_dim_skill AS
        SELECT name AS skill_id, name AS skill_name, NULL::VARCHAR AS onet_element_id, 'knowledge' AS element_type
        FROM bronze_skill_master;
        CREATE TABLE people_dim_learning_resource AS
        SELECT name AS resource_id, 'internal' AS source, name AS title, NULL::VARCHAR AS url,
               'Intermediate' AS level, 240 AS duration_minutes, NULL::VARCHAR AS roles, NULL::VARCHAR AS products
        FROM bronze_training_program;
        CREATE TABLE people_dim_survey_item AS
        SELECT item_id, dimension, reverse, prompt, instrument_version FROM bronze_survey_instrument;
        CREATE TABLE people_dim_survey_wave AS
        SELECT wave_id, 'v1' AS instrument_version, NULL::DATE AS start_date, NULL::DATE AS end_date,
               NULL::VARCHAR AS target_population, response_rate
        FROM bronze_wave;
        """
    )

    con.execute(
        """
        CREATE TABLE people_xw_org AS
        SELECT
          d.name AS org_id,
          d.name AS frappe_department,
          g.id AS gh_department_id,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to
        FROM bronze_department d
        LEFT JOIN bronze_gh_department g
          ON replace(g.name, 'GH ', '') = d.name
        WHERE d.parent_department IS NOT NULL OR d.name = 'GlobalTech';

        CREATE TABLE people_xw_location AS
        SELECT
          b.name AS location_id,
          b.name AS frappe_branch,
          o.id AS gh_office_id,
          b.city,
          b.country,
          b.region
        FROM bronze_branch b
        LEFT JOIN bronze_office o ON o.name = b.city;

        CREATE TABLE people_xw_job AS
        SELECT
          name AS job_id,
          name AS frappe_designation,
          NULL::VARCHAR AS onet_soc_code,
          job_family
        FROM bronze_designation;

        CREATE TABLE people_xw_skill AS
        SELECT name AS skill_id, name AS frappe_skill, NULL::VARCHAR AS onet_element_id
        FROM bronze_skill_master;
        """
    )

    con.execute(
        """
        CREATE TABLE people_hist_x AS
        SELECT
          h.worker_id,
          h.valid_from,
          h.valid_to,
          h.department AS org_id,
          h.designation AS job_id,
          h.grade AS grade_id,
          h.branch AS location_id,
          h.reports_to AS manager_worker_id,
          h.employment_type,
          h.status,
          NULL::VARCHAR AS source_event_id,
          h.person_id,
          h.hire_date,
          h.termination_date,
          h.region,
          h.job_family,
          h.department,
          h.designation,
          h.grade,
          h.branch,
          h.reports_to,
          h.hired_via_application_id,
          h.is_rehire,
          h.via_t1,
          h.reason_for_leaving
        FROM people_hist_worker_attr h;
        DROP TABLE people_hist_worker_attr;
        ALTER TABLE people_hist_x RENAME TO people_hist_worker_attr;
        """
    )

    con.execute(
        """
        CREATE TABLE people_xw_identity AS
        SELECT * FROM (
          SELECT
            e.person_id,
            e.name AS worker_id,
            'greenhouse_v3' AS source_system,
            'offer' AS source_object,
            CAST(o.offer_id AS VARCHAR) AS source_id,
            CAST(e.date_of_joining AS DATE) AS valid_from,
            NULL::DATE AS valid_to,
            'transaction' AS match_method
          FROM bronze_employee e
          JOIN people_fact_offer o
            ON CAST(o.application_id AS VARCHAR) = CAST(e.hired_via_application_id AS VARCHAR)
           AND o.status = 'accepted'
          WHERE e.hired_via_application_id IS NOT NULL
          QUALIFY row_number() OVER (PARTITION BY e.name, o.offer_id ORDER BY e.modified_date) = 1
          UNION ALL
          SELECT
            w.person_id,
            u.employee_id,
            'greenhouse_v3',
            'user',
            CAST(u.id AS VARCHAR),
            DATE '2021-09-01',
            NULL::DATE,
            'employee_id'
          FROM bronze_user u
          JOIN people_dim_worker w ON w.worker_id = u.employee_id
          WHERE u.employee_id IS NOT NULL
        );

        CREATE TABLE people_dim_person AS
        SELECT person_id, min(hire_date) AS first_seen_at,
               CASE WHEN bool_or(via_t1) THEN 'greenhouse_v3' ELSE 'frappe_hr' END AS first_seen_source
        FROM people_dim_worker
        GROUP BY 1;

        CREATE TABLE people_dim_person_restricted AS
        SELECT person_id, person_id AS full_name, NULL::VARCHAR AS gender, NULL::DATE AS date_of_birth
        FROM people_dim_person;

        CREATE TABLE people_dim_candidate AS
        SELECT
          id AS candidate_id,
          id AS gh_candidate_id,
          NULL::VARCHAR AS person_id,
          created_at,
          NULL::BIGINT AS first_source_id
        FROM bronze_candidate;

        CREATE TABLE people_dim_recruiter AS
        SELECT
          w.person_id,
          'generalist' AS specialization,
          w.region AS supported_region,
          w.job_family AS supported_job_family,
          DATE '2021-09-01' AS valid_from,
          NULL::DATE AS valid_to
        FROM bronze_user u
        JOIN people_dim_worker w ON w.worker_id = u.employee_id
        WHERE u.id BETWEEN 201 AND 224
        QUALIFY row_number() OVER (PARTITION BY w.person_id ORDER BY w.hire_date) = 1;
        """
    )
    con.execute("ALTER TABLE people_dim_worker ADD COLUMN frappe_employee VARCHAR")
    con.execute("UPDATE people_dim_worker SET frappe_employee = worker_id")
    build_events_and_gold(con)
