# People field provenance audit

Status: **read-only**. No warehouse tables were altered.

Audit date: 2026-08-31.

Current Bronze/Silver HR and ATS tables are produced by `people_synthetic/people_generate.py` (`globaltech_hris`, `globaltech_ats`, `globaltech_lms`). They are **not** Frappe HR or Greenhouse Harvest v3 payloads. Serving dims/marts are rebuilt from that silver. There are **no** `people_fact_*` tables in Postgres; gold parquet still copies `people_fact_*` frames.

## Classification counts

| classification | fields |
| --- | ---: |
| SOURCE_NATIVE | 49 |
| SOURCE_NESTED | 2 |
| CANONICAL_KEY | 80 |
| DERIVED | 49 |
| SYNTHETIC_EXTENSION | 79 |
| UNJUSTIFIED | 79 |

| **total** | **338** |

## Keep / change / remove

| decision | fields |
| --- | ---: |
| keep | 81 |
| change | 184 |
| remove | 73 |

## Classification rules used

| class | meaning |
| --- | --- |
| SOURCE_NATIVE | Field exists on a pinned source object with the same meaning. |
| SOURCE_NESTED | Nested source property or child table. |
| CANONICAL_KEY | Surrogate, crosswalk, or allowed ingestion metadata (`ingested_at`, provenance). |
| DERIVED | Deterministic function of source fields, documented in a mapping. |
| SYNTHETIC_EXTENSION | Generator invented the field or the identifier shape. Concept may map after rename. |
| UNJUSTIFIED | No source field and no approved derivation. Must not remain in canonical Silver/Gold. |

## UNJUSTIFIED fields (must be reviewed)

Every row below is unexplained relative to Frappe HR, Greenhouse v3, Microsoft Learn, O*NET, or BLS.

| dataset | column | keep_change_remove | notes |
| --- | --- | --- | --- |
| `people_bronze.people_worker / people_silver.people_worker` | `region` | remove | Not on Employee or Branch. If needed, add a documented branch→region reference map — do not treat as HRIS native. |
| `people_bronze.people_worker / people_silver.people_worker` | `fte` | remove | ERPNext v16.0.0 Employee.json has no fte/occupancy field. Do not keep as canonical until a source field exists. |
| `people_bronze.people_worker / people_silver.people_worker` | `generation` | remove | DOB exists on Employee but is not persisted today. After mapping date_of_birth, generation may become DERIVED. Until then unjustified. |
| `people_bronze.people_worker / people_silver.people_worker` | `ethnicity_band` | remove | Greenhouse EEOC and demographic_answers are application-scoped. Frappe Employee has no ethnicity field. Do not store on worker. |
| `people_bronze.people_org / people_silver.people_org` | `region` | remove | Department has company, not region. |
| `people_bronze.people_location / people_silver.people_location` | `country` | remove | Not on Branch. Optional people_ref_branch_geo is a separate documented map, not Bronze. |
| `people_bronze.people_location / people_silver.people_location` | `region` | remove | Same as country. |
| `people_bronze.people_location / people_silver.people_location` | `city` | remove | Same as country. |
| `people_bronze.people_location / people_silver.people_location` | `pay_multiplier` | remove | Not an HRIS field. Compensation comes from Salary Structure Assignment.base / currency. |
| `people_bronze.people_job / people_silver.people_job` | `job_family` | remove | Designation.json has designation_name and description only. Family requires a documented map, not a source field. |
| `people_bronze.people_job / people_silver.people_job` | `base_salary` | remove | Pay lives on Salary Structure Assignment.base (and Grade.default_base_pay). Not a Designation field. |
| `people_bronze.people_job / people_silver.people_job` | `is_manager` | remove | Not on Designation. Span/manager metrics must use reports_to. |
| `people_bronze.people_assignment / people_silver.people_assignment` | `effective_start` | remove | Not Frappe transfer_date. Hire is Employee.date_of_joining / hire event. |
| `people_bronze.people_assignment / people_silver.people_assignment` | `effective_end` | remove |  |
| `people_bronze.people_movement / people_silver.people_movement` | `event_date` | change | Transfers MUST use transfer_date. Promotions use promotion_date. Today location_transfer dates are sampled and unrelated to Frappe. |
| `people_bronze.people_movement / people_silver.people_movement` | `org_id` | remove | Replace with people_silver_worker_event_change.attribute_name/old_value/new_value. |
| `people_bronze.people_movement / people_silver.people_movement` | `job_id` | remove | Same. One transfer becomes N change rows. |
| `people_bronze.people_movement / people_silver.people_movement` | `location_id` | remove | Same. |
| `people_bronze.people_compensation / people_silver.people_compensation` | `pay_rate_type` | remove | Not on Salary Structure Assignment. Payroll frequency lives on Salary Structure / Salary Slip. |
| `people_bronze.people_performance_review / people_silver.people_performance_review` | `rating_label` | remove | Not a Frappe Appraisal field. |
| `people_bronze.people_engagement_response / people_silver.people_engagement_response` | `response_id` | remove | Pinned Frappe HR set has no Engagement Survey DocType. No source contract. |
| `people_bronze.people_engagement_response / people_silver.people_engagement_response` | `worker_id` | remove | No source. |
| `people_bronze.people_engagement_response / people_silver.people_engagement_response` | `survey_date` | remove | No source. |
| `people_bronze.people_engagement_response / people_silver.people_engagement_response` | `engagement_score` | remove | Dashboard engagement_score currently depends on this unjustified field. |
| `people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment` | `course_id` | remove | Must be Training Program/Event name. Keep Microsoft Learn catalog separate. |
| `people_bronze.people_learning_completion / people_silver.people_learning_completion` | `course_id` | remove | Same as enrollment. |
| `people_bronze.people_learning_completion / people_silver.people_learning_completion` | `hours` | remove | Not on Training Event/Result in the pinned schema. Derive only if a source duration field is added. |
| `people_bronze.people_candidate / people_silver.people_candidate` | `requisition_id` | remove | Candidate 1→many Applications. job_id belongs on application, not candidate. |
| `people_bronze.people_candidate / people_silver.people_candidate` | `applied_on` | remove | Application grain. |
| `people_bronze.people_candidate / people_silver.people_candidate` | `current_stage` | remove | Current stage is the application_stages row with current=true. Do not store on candidate. |
| `people_bronze.people_candidate_stage / people_silver.people_candidate_stage` | `requisition_id` | remove | Use application.job_id. |
| `people_bronze.people_candidate_stage / people_silver.people_candidate_stage` | `exited_at` | change | Column is ABSENT today. Must be added from source. Do not persist Greenhouse days_in_stage as canonical. |
| `people_bronze.people_candidate_hire / people_silver.people_candidate_hire` | `candidate_id` | remove | Joins hired workers to sequential candidate ids. Not a Greenhouse hire. Use application hired + identity crosswalk. |
| `people_bronze.people_candidate_hire / people_silver.people_candidate_hire` | `requisition_id` | remove | Random requisition, not the application.job_id. |
| `people_bronze.people_candidate_hire / people_silver.people_candidate_hire` | `applied_on` | remove | Invented constant lag. |
| `people_gold.people_fact_worker_movement` | `(same as people_movement)` | remove | Gold must rebuild from Bronze + mappings. Current gold copies unjustified silver. |
| `people_gold.people_fact_learning` | `(same as people_learning_completion)` | change |  |
| `people_gold.people_fact_engagement` | `(same as people_engagement_response)` | remove | No source contract. |
| `people_gold.people_fact_recruiting` | `(same as people_candidate)` | remove | Violates Candidate vs Application grain. |
| `people_dim_worker` | `fte` | remove | No Frappe source field. |
| `people_dim_worker` | `effective_start` | change | SCD must be built from worker events, not hire copy. |
| `people_dim_worker` | `effective_end` | change |  |
| `people_dim_org` | `region` | remove |  |
| `people_dim_location` | `country` | remove | Not on Branch. |
| `people_dim_location` | `region` | remove |  |
| `people_dim_location` | `city` | remove |  |
| `people_dim_job` | `job_family` | remove | Not on Designation. |
| `people_dim_company` | `company_id` | remove | Not Frappe Company. Seeded synthetic competitors. Out of HR source contracts. Do not use for People metrics. |
| `people_dim_company` | `company_name` | remove |  |
| `people_dim_company` | `ticker` | remove |  |
| `people_dim_company` | `cik` | remove |  |
| `people_dim_company` | `industry` | remove |  |
| `people_dim_company` | `hq_country` | remove |  |
| `people_dim_company` | `public_private` | remove |  |
| `people_dim_company` | `employee_count_latest` | remove |  |
| `people_dim_company` | `employee_count_source` | remove |  |
| `people_dim_company` | `company_size_band` | remove |  |
| `people_mart_workforce_overview` | `job_family` | change | Cannot remain canonical until a documented family map exists. Interim: designation. |
| `people_mart_workforce_overview` | `fte` | remove | Worker FTE has no source. |
| `people_mart_retention` | `job_family` | change |  |
| `people_mart_retention` | `regrettable_exits` | remove | Regrettable definition is a hardcoded level set, not a source field. Reintroduce only with an approved mapping from Employee Grade. |
| `people_mart_retention` | `regrettable_attrition_rate` | remove | Depends on regrettable_exits. |
| `people_mart_internal_mobility` | `job_family` | change |  |
| `people_mart_compensation_equity` | `job_family` | change |  |
| `people_mart_compensation_equity` | `mean_compa_ratio` | change | job.base_salary is unjustified. Compa needs documented midpoint (Grade.default_base_pay or structure). |
| `people_mart_learning_adoption` | `job_family` | change |  |
| `people_mart_learning_adoption` | `learning_hours_per_employee` | remove | hours column has no Frappe source. |
| `people_mart_recruiting` | `job_family` | change |  |
| `people_mart_skills` | `job_family` | change |  |
| `people_mart_skills` | `is_critical` | remove | Not a source field. Reintroduce only with a governed list, not generator constants. |
| `people_mart_manager_effectiveness` | `job_family` | change |  |
| `people_mart_manager_effectiveness` | `engagement_score` | remove | No engagement source contract. Serving already WARNs when empty. |
| `people_mart_attrition_segment` | `job_family` | change |  |
| `people_mart_skill_supply_demand` | `external_posting_count` | remove | Do not add JSearch. Field has no approved source. |
| `people_mart_external_talent_market` | `snapshot_date` | remove | No approved commercial job-posting source. Do not backfill with JSearch. |
| `people_mart_external_talent_market` | `company_id` | remove |  |
| `people_mart_external_talent_market` | `job_family` | remove |  |
| `people_mart_external_talent_market` | `open_jobs` | remove |  |
| `people_mart_external_talent_market` | `median_salary` | remove |  |

## Findings that block treating current marts as source-true

1. **Worker movement** is a wide `people_movement` table with sampled `location_transfer` dates. Frappe Employee Transfer uses `transfer_date` plus child **Employee Property History** (`property`, `current`, `new`).
2. **Recruiting** flattens Candidate←Requisition. Greenhouse v3 is Candidate 1→many Applications, with stage history on `/v3/application_stages` (`entered_at`, `exited_at`). `exited_at` is not stored. `time_in_stage_days` falls back to **11.0**.
3. **Hires** link workers to sequential `CAND0000001` ids, not to the application that was hired.
4. **Demographics** (`ethnicity_band`, `generation`) sit on the worker. Greenhouse EEOC / demographic answers are **application** grain. Frappe Employee has `gender` and `date_of_birth` but no ethnicity.
5. **FTE**, **pay_multiplier**, **job.base_salary**, **is_manager**, **job_family**, **engagement_score**, **learning hours**, **is_critical**, and **regrettable_exits** have no pinned source field.
6. **Microsoft Learn / O*NET / BLS** bronze is already closer to source-native and should be kept separate from internal HR/ATS.

Machine-readable copy: `docs/PEOPLE_FIELD_PROVENANCE_AUDIT.csv`.

Architecture follow-up (no migration yet): `docs/PEOPLE_SOURCE_CONTRACT_FIRST.md`.
