# People Data Platform — source-contract-first (review, no migration)

Status: **GATE 1 superseded for identity and table names**. Serving tables, lake parquet, and the public site are still unchanged until later gates.

## Superseded decisions

These SOURCE_CONTRACT_FIRST choices are **no longer in force**. Follow `docs/PEOPLE_DATA_ARCHITECTURE.md`.

| Topic | This document originally | Now |
| --- | --- | --- |
| Identity match | Allowed `user.primary_email` = Employee.`company_email` | **Forbidden.** Only `transaction` \| `employee_id` \| `manual`. See architecture **§5.1** and T8. |
| Canonical table names | `people_silver_worker` and related v1 silver names | Architecture **§2.1** prefixes: `people_dim_` / `people_evt_` / `people_fact_` / `people_hist_` / `people_xw_` / `people_ref_`. |
| Employee.`employment_type` / `grade` | Treated as missing on Employee.json | **HRMS custom fields** (`hrms/setup.py get_custom_fields()["Employee"]`). Effective schema = Employee.json + custom fields. SOURCE_NATIVE. E8 withdrawn. |
| §11 match method 3 (email) | Greenhouse `user.primary_email` = Frappe `Employee.company_email` listed as allowed | **Struck.** Same as identity row. Architecture **§5.1**. |
| §12 dual-run shadow tables | Publish Gold v2 to `people_mart_*_v2` (name suffix) | Publish into schema **`people_v2`**. Do not create `public.people_mart_*_v2`. |

Related:

- `docs/PEOPLE_DATA_ARCHITECTURE.md`
- `docs/PEOPLE_GATE1_REVIEW.md`
- `docs/PEOPLE_CONTRACT_FIELD_CHECK.md`
- `docs/PEOPLE_FIELD_PROVENANCE_AUDIT.md`
- `docs/PEOPLE_FIELD_PROVENANCE_AUDIT.csv`
- `data-platform/people_source_contracts/`
- `data-platform/people_mappings/`

---

## 1. Current-field provenance audit

338 fields across lake Bronze/Silver (the current generator tables), gold parquet facts, serving `people_dim_*`, and `people_mart_*`.

| classification | fields |
| --- | ---: |
| SOURCE_NATIVE | 49 |
| SOURCE_NESTED | 2 |
| CANONICAL_KEY | 80 |
| DERIVED | 49 |
| SYNTHETIC_EXTENSION | 79 |
| UNJUSTIFIED | 79 |

Keep 81 / change 184 / remove 73.

There are **no** `people_fact_*` tables in Postgres. Gold parquet still writes `people_fact_worker_movement`, `people_fact_compensation`, `people_fact_learning`, `people_fact_performance`, `people_fact_engagement`, `people_fact_recruiting` as copies of assumed silver.

Microsoft Learn, O*NET, and BLS bronze are already close to source-native. Internal HR/ATS/LMS silver is **not**.

---

## 2. Source systems selected

| Domain | System | Role |
| --- | --- | --- |
| Core HR, lifecycle, payroll, performance, internal learning, skills | **Frappe HR** (`frappe/hrms`) + ERPNext master data | Operational HRIS contract |
| ATS / recruiting | **Greenhouse Harvest API v3** | Recruiting contract |
| External learning catalog | **Microsoft Learn** public catalog | Keep separate from Frappe Training Event |
| Occupation / skills taxonomy | **O*NET** `db_31_0` | External occupation/skills |
| Labor market | **BLS** publicAPI v2 (JOLTS + OEWS series already used) | Rates and wage benchmarks |

Not selected: JSearch, Harvest v1/v2, invented `globaltech_hris` / `globaltech_ats` schemas as authority.

---

## 3. Source versions pinned

| System | Pin | Evidence |
| --- | --- | --- |
| Frappe HR | tag **v16.15.0**, commit **`1924234884731e389ecc4e5500653fcd59666911`** | `people_source_contracts/frappe_hr/VERSION` |
| ERPNext | tag **v16.0.0** | Employee, Department, Designation, Branch DocType JSON |
| Greenhouse Harvest | **v3**, OpenAPI **3.1.0**, `info.title=Harvest API` | `greenhouse_v3/openapi/harvest_v3.openapi.json` extracted from `https://harvestdocs.greenhouse.io/reference/get_v3-applications` |
| Microsoft Learn | live `https://learn.microsoft.com/api/catalog/?locale=en-us&type=modules,learningPaths,appliedSkills,certifications,courses` | `microsoft_learn/VERSION` |
| O*NET | **db_31_0_text.zip** | `onet/VERSION` |
| BLS | **publicAPI/v2** | `bls/VERSION` |

DocTypes were downloaded from GitHub raw at the pinned tags. They were not reconstructed from memory.

Discoveries that differ from assumed names:

- Transfer/Promotion children are DocType **Employee Property History**, not `employee_transfer_detail`.
- Payroll lives in **hrms/payroll** in v16, not `erpnext/payroll`.
- ERPNext Employee.json has **no** `grade` and **no** `fte`. Grade is on Salary Structure Assignment and Employee Grade.
- Harvest `application_stages.days_in_stage` is source-computed. Canonical time-in-stage must use `entered_at` / `exited_at`.

---

## 4. Source objects and actual schemas discovered

### 4.1 Frappe HR / ERPNext

| Object | Repo path at pin | Notable fields |
| --- | --- | --- |
| Employee | `erpnext/setup/doctype/employee` | `name`, `first_name`, `last_name`, `status`, `date_of_joining`, `relieving_date`, `reason_for_leaving`, `department`, `designation`, `reports_to`, `branch`, `company`, `gender`, `date_of_birth`, `company_email`, `user_id` |
| Department | ERPNext | `department_name`, `parent_department`, `company`, `lft`, `rgt` |
| Designation | ERPNext | `designation_name`, `description` only |
| Branch | ERPNext | single Data field `branch` (no country/region/city) |
| Employee Grade | HRMS | `default_salary_structure`, `default_base_pay`, `currency` |
| Employee Transfer | HRMS | `employee`, **`transfer_date`**, `new_company`, `transfer_details` → Employee Property History |
| Employee Property History | HRMS child | **`property`**, **`current`**, **`new`**, `fieldname` |
| Employee Promotion | HRMS | `employee`, **`promotion_date`**, `promotion_details` → same child, plus `current_ctc` / `revised_ctc` |
| Employee Separation | HRMS | `employee`, `resignation_letter_date`, `boarding_begins_on`, `employee_grade` |
| Salary Structure / Assignment / Slip / Component / Detail | HRMS payroll | Assignment: `employee`, `salary_structure`, **`from_date`**, **`base`**, `currency`, `ctc`, **`grade`** |
| Appraisal / Appraisal Cycle | HRMS | Float scores (`total_score`, `self_score`, `avg_feedback_score`), not a 1–5 label |
| Training Program / Event / Result / Feedback | HRMS | Event `start_time` / `end_time` / `event_status`; Result links `training_event` |
| Employee Skill Map / Employee Skill / Skill | HRMS | child `skill`, `proficiency` (Rating), `evaluation_date` |

Compact field lists: `people_source_contracts/frappe_hr/doctypes/*.fields.json`.

### 4.2 Greenhouse Harvest v3

135 paths in the pinned OpenAPI. Required resources are present, including `/v3/application_stages`, `/v3/candidates`, `/v3/applications`, `/v3/offers`, `/v3/scorecards`, `/v3/scorecard_questions`, `/v3/scorecard_question_answers`, `/v3/eeoc`, `/v3/demographic_*`, `/v3/openings`, `/v3/job_interview_stages`, `/v3/job_interviews`, `/v3/approval_flows`, `/v3/rejection_reasons`, `/v3/users`.

Native relationships (do not flatten in Bronze):

```text
Candidate 1 → many Applications
Application → job_id, recruiter_id, source_id, stage_id
Application → application_stages (entered_at, exited_at, current)
Application → offers (versioned rows)
Application → eeoc (at most one) and demographic_answers (per application)
Scorecard → interviewer_id (Greenhouse user)
User.employee_id ↔ Frappe Employee.name
Opening belongs to Job; offer.opening_id fills a slot
```

Compact field lists: `people_source_contracts/greenhouse_v3/schemas/fields/*.fields.json`.

`application_stage` source fields: `id`, `created_at`, `updated_at`, `application_id`, `job_interview_stage_id`, `entered_at`, `exited_at`, `days_in_stage`, `current`.

### 4.3 Microsoft Learn / O*NET / BLS

Unchanged live contracts. Catalog vs internal LMS remain separate.

---

## 5. Bronze redesign

Bronze is source-native. No analytical fields.

Per object:

| Column | Rule |
| --- | --- |
| `raw_payload` | Full source JSON |
| source primary key | Frappe `name` or Greenhouse `id` |
| source created | Frappe `creation` / Greenhouse `created_at` |
| source updated | Frappe `modified` / Greenhouse `updated_at` |
| `ingested_at` | Pipeline clock |
| `ingestion_run_id` | Pipeline run |
| `source_contract_version` | Pin id from VERSION files |

Nested data: raw JSON **plus** child Bronze tables (Frappe child DocTypes, Greenhouse sub-resources).

Proposed Bronze datasets (not created yet):

**Frappe:** `people_bronze_frappe_employee`, `_department`, `_designation`, `_branch`, `_employee_grade`, `_employee_transfer`, `_employee_property_history`, `_employee_promotion`, `_employee_separation`, `_salary_structure`, `_salary_structure_assignment`, `_salary_slip`, `_salary_component`, `_appraisal`, `_appraisal_cycle`, `_training_program`, `_training_event`, `_training_result`, `_training_feedback`, `_employee_skill_map`, `_employee_skill`, `_skill`.

**Greenhouse:** `people_bronze_greenhouse_candidate`, `_application`, `_application_stage`, `_job`, `_opening`, `_department`, `_office`, `_user`, `_source`, `_referrer`, `_job_interview_stage`, `_job_interview`, `_scorecard`, `_scorecard_question`, `_scorecard_question_answer`, `_offer`, `_approval_flow`, `_rejection_reason`, `_demographic_question_set`, `_demographic_question`, `_demographic_answer_option`, `_demographic_answer`, `_eeoc`.

**Keep:** Learn / O*NET / BLS bronze as they are, plus `raw_payload` + `ingestion_run_id` where missing.

Forbidden on Bronze: `time_in_stage_days`, `fte`, `pay_multiplier`, `job_family`, `is_manager`, `ethnicity_band`, `generation`, `quality_of_hire_index`.

Employee Transfer Bronze must retain `employee`, `transfer_date`, `new_company`, and child rows `property` / `current` / `new`.

Greenhouse `application_stages` Bronze must retain `application_id`, `job_interview_stage_id`, `entered_at`, `exited_at`, `current`, `created_at`, `updated_at`. `days_in_stage` may remain inside `raw_payload` only.

---

## 6. Mapping files

All under `data-platform/people_mappings/`. No mapping = no canonical field.

| File | Maps |
| --- | --- |
| `frappe_employee.yml` | Employee → `people_silver_worker` |
| `frappe_employee_transfer.yml` | Transfer + Property History → worker event + event_change |
| `frappe_employee_promotion.yml` | Promotion → same event model |
| `frappe_employee_separation.yml` | Separation process event; last day remains `relieving_date` |
| `frappe_salary_assignment.yml` | Assignment `from_date` / `base` / `currency` / `grade` |
| `frappe_appraisal.yml` | Float scores, not 1–5 labels |
| `frappe_training.yml` | Training Event/Result; no invented COURSE catalog |
| `frappe_skill.yml` | Employee Skill proficiency + evaluation_date |
| `greenhouse_candidate.yml` | Person grain only |
| `greenhouse_application.yml` | Application + recruiter_id + job_id |
| `greenhouse_application_stage.yml` | Stage history; `time_in_stage_hours` derived |
| `greenhouse_offer.yml` | Versioned offers |
| `greenhouse_scorecard.yml` | Scorecards + questions/answers |
| `greenhouse_job_opening.yml` | Job vs Opening |
| `greenhouse_demographics.yml` | EEOC + demographic_answers at **application** grain |
| `people_identity_crosswalk.yml` | Id joins only |
| `canonical_model.yml` | Target Silver list |

Examples already encoded:

- `effective_at` ← Employee Transfer.`transfer_date` (identity)
- `time_in_stage_hours` ← `timestamp_diff_hours(exited_at, entered_at)`

---

## 7. Canonical model after mapping

Replace wide assignment/movement/candidate tables with:

```text
people_silver_worker
people_silver_department
people_silver_designation
people_silver_branch
people_silver_employee_grade
people_silver_worker_event
people_silver_worker_event_change
people_silver_compensation_assignment
people_silver_appraisal
people_silver_training_event
people_silver_worker_skill
people_silver_candidate
people_silver_application
people_silver_application_stage
people_silver_offer
people_silver_scorecard
people_silver_job
people_silver_opening
people_silver_applicant_demographics
people_identity_crosswalk
```

`people_silver_worker_event`:

| column | meaning |
| --- | --- |
| event_id | Source document name |
| worker_id | Employee.name |
| event_type | hire / transfer / promotion / separation (from source object, not RNG) |
| effective_at | `date_of_joining` / `transfer_date` / `promotion_date` / `relieving_date` |
| source_system | `frappe_hr` |
| source_object | DocType name |
| source_record_id | DocType `name` |

`people_silver_worker_event_change`: `event_id`, `attribute_name`, `old_value`, `new_value`.

Gold/marts remain rebuildable from Bronze + these mappings. Existing mart **metrics** are not expanded in this phase; some mart columns will drop (see §8) because they are unjustified.

---

## 8. Fields removed because they were unjustified

Remove from canonical Silver/Gold (serving columns stay until cutover):

**Worker / org / job / location**

- `fte`
- `generation` (until `date_of_birth` is mapped and a derivation is approved)
- `ethnicity_band` on the worker
- `region` on worker/org
- Branch `country` / `region` / `city` / `pay_multiplier`
- Designation `job_family`, `is_manager`, `base_salary`
- Invented `JOB-*` / `ORG-*` / `US-NY` keys as source ids

**Movement / assignment**

- `people_assignment` entire table
- Wide `people_movement.org_id` / `job_id` / `location_id`
- Sampled `location_transfer` `event_date` (not `transfer_date`)

**Recruiting**

- Candidate.`requisition_id`, `current_stage`, `applied_on`
- Stage history without `application_id` / `exited_at` / `job_interview_stage_id`
- `people_candidate_hire` sequential `CAND0000001` links
- Flattened `people_fact_recruiting`
- Mart `time_in_stage_days` default **11.0**
- Mart `quality_of_hire_index` until hire crosswalk is real

**Pay / performance / learning / engagement**

- `pay_rate_type` constant `annual`
- Appraisal `rating` / `rating_label`
- `people_engagement_response` and mart `engagement_score`
- Invented `COURSE-xxx` and learning `hours`
- Skills `is_critical` hardcoded set
- Retention `regrettable_exits` / `regrettable_attrition_rate` (hardcoded IC4+ set)

**External leftovers**

- `people_dim_company` synthetic Acme/Northwind
- `people_mart_external_talent_market`
- `people_mart_skill_supply_demand.external_posting_count` (no JSearch)

---

## 9. Source simulator design

Name: **People Business Event Simulator**.

It writes **source-shaped** records only (Frappe DocType payloads and Greenhouse v3 resources). It must not write Silver, Gold, or serving marts.

Event vocabulary (must obey source FKs):

```text
requisition opened          → greenhouse job + opening
candidate created           → greenhouse candidate
application submitted       → greenhouse application (candidate_id, job_id)
candidate entered stage     → application_stages.entered_at
candidate exited stage      → previous row exited_at; current=false
interview scheduled         → job_interviews
scorecard submitted         → scorecards status=complete
offer created               → offers version=1
offer revised               → new offers row, version+=1
offer accepted              → offer status + application hired
opening filled/closed       → opening.closed_at
identity crosswalk          → Greenhouse hired application ↔ new Employee
employee created            → Frappe Employee (date_of_joining)
salary assigned             → Salary Structure Assignment (from_date, base)
promotion recorded          → Employee Promotion + Property History
transfer recorded           → Employee Transfer + Property History
training completed          → Training Event + Training Result
skill assessment performed  → Employee Skill Map child
termination recorded        → Employee.relieving_date + Employee Separation
```

Sequencing example:

```text
Offer Accepted
  → Application Hired
  → Opening Filled/Closed
  → Candidate/Worker crosswalk (ids, not names)
  → Employee Hire (Frappe Employee)
```

Randomness may choose **who**, **when**, **which valid event**, **which valid category/value**. It may not choose schema, FK structure, field meaning, or sequencing rules.

Rate calibration: BLS/JOLTS series already ingested; published People Analytics benchmarks; current generator **only as a statistical prior**, not as a schema. No independent uniform draws as the data model (`pay_multiplier * U(0.92,1.12)` goes away).

Implementation sketch (not built this phase): `data-platform/people_synthetic/people_source_simulator.py` emitting JSON into `lake/people_source/{system}/{object}/...` then a separate ingest job copies to Bronze.

---

## 10. Daily CDC / update design

Simulator and warehouse ingestion stay **separate processes**.

```text
Day N simulator
  writes source-shaped inserts/updates (Frappe docs / Harvest resources)
        ↓
Bronze ingestion
  append/merge by source PK
  stamp ingested_at, ingestion_run_id, source_contract_version
        ↓
CDC / incremental
  changed source PKs since last run (modified/updated_at watermark)
        ↓
people_mappings YAML
        ↓
Silver (worker, events, applications, stages, offers, …)
        ↓
Event history + daily/month-end snapshots
        ↓
Gold / governed metrics / quality / serving
```

Current `people_daily_pipeline.py` generates silver in the same process as “source”. That coupling is retired at cutover.

Watermarks: Frappe `modified`, Greenhouse `updated_at`, Learn `last_modified`, BLS request period, O*NET file hash.

---

## 11. Cross-system identity design

Table: `people_identity_crosswalk`

| column | meaning |
| --- | --- |
| canonical_person_id | Person spanning candidate and employee |
| canonical_worker_id | Frappe Employee.name when hired |
| source_system | `frappe_hr` / `greenhouse_v3` |
| source_object | Employee / users / candidates / applications |
| source_id | Source PK |
| match_method | enumerated; names forbidden |
| effective_start / effective_end | Link validity |

Allowed match methods:

1. Frappe `Employee.name`
2. Greenhouse `user.employee_id` = Frappe `Employee.name`
3. ~~Greenhouse `user.primary_email` = Frappe `Employee.company_email`~~ **SUPERSEDED.** Forbidden. Architecture **§5.1**; see top-of-file Superseded decisions.
4. Simulator workflow: hired application → new Employee (stores both ids)

Forbidden: first/last name, sequential CAND ids, recruiter display names.

Recruiters remain Greenhouse `users`. Span-of-control uses Frappe `reports_to`.

---

## 12. Migration plan for existing data (not executed)

**Do not apply warehouse DDL, drop marts, or regenerate 50k workers until mappings are approved.**

| Step | Action | Risk |
| --- | --- | --- |
| 0 | This review | None |
| 1 | Freeze current serving snapshot (`people_serving_snapshot.current`) as the public site source | None |
| 2 | Implement source simulator + Bronze writers in a **new lake prefix** (`people_bronze_v2`) | No serving change |
| 3 | Run mappings → Silver v2 → Gold v2 in lake only | No serving change |
| 4 | Acceptance tests in §13 of the original brief | Fail closed |
| 5 | Dual-run: publish Gold v2 into schema **`people_v2`** (not `public.people_mart_*_v2` name-suffix shadows; **superseded**) | Site still on v1 `public` marts |
| 6 | Compare certified metrics; document deltas (attrition will change because transfers/hires become source-true) | Review |
| 7 | Cut serving RPCs to v2; keep v1 parquet for rollback | One-way after success |
| 8 | Drop v1 assumed tables only after rollback window | Destructive — later |

Existing synthetic parquet is **not** source-of-truth. It cannot be mapped field-for-field into Frappe/Greenhouse (no `transfer_date`, no `exited_at`, no offer versions). Cutover is a **rebuild from the new simulator**, not an ALTER of `people_worker`.

QuantReview production (`fyvivwgyisrtmehzjqlv`) is not touched. v1 live serving remains `quantreview-staging` until cutover. v2 serving is PeopleAnalyticsAI.net (`zapmigfrtnwnkmezjefx`).

---

## Hetzner Frappe HR decision (Phase 12)

Host `edgeai@37.27.107.154`: 20 vCPU, 62 GiB RAM, ~367 GB free. **Docker is not installed.** QuantReview already occupies the host.

A real Frappe bench needs MariaDB, Redis, nginx, workers, and ongoing upgrades. Installing Docker + HRMS beside QuantReview is operationally heavy and is **not** required to pin contracts.

**Decision: do not deploy Frappe HR on Hetzner in this phase.**

The Business Event Simulator will **emulate** pinned DocType JSON and Harvest v3 payloads. If a dedicated HRIS VM is approved later, the same contracts apply; only the source writer changes (API calls instead of JSON files).

---

## Acceptance criteria vs this phase

| Criterion | Now |
| --- | --- |
| 100% Bronze fields source-native + ingest metadata | Designed; **not** true of current generator tables |
| 100% Silver fields mapped or derived | YAML written; **not** applied |
| 0 unexplained UNJUSTIFIED | Audit lists 79; removals proposed |
| Transfer effective date = `transfer_date` | Mapped; current data does not |
| Stage timing = `entered_at`/`exited_at` | Mapped; current data lacks `exited_at` |
| Candidate ≠ Application | Mapped; current data flattened |
| Demographics at application grain | Mapped |
| Offer version history | Mapped |
| Recruiter = Greenhouse user | Mapped |
| Joins via crosswalk | Mapped |
| Simulator writes source only | Designed; not built |
| Gold rebuildable from Bronze + mappings | Designed |
| No dashboard value on unknown synthetic fields | **False today** (fte, hours, regrettable, stage default 11.0, hire_links). Remains until cutover |

No UI was built. No People tables were altered.
