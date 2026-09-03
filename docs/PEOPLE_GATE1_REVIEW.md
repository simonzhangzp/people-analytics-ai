# GATE 1 review packet

**Stop after GATE 2.** Do not backfill until GATE 2 is approved. Silver DDL is still out of scope.

## What was done (§14 steps 1–2)

| Item | Location |
| --- | --- |
| Architecture doc | `docs/PEOPLE_DATA_ARCHITECTURE.md` |
| Contract field check | `docs/PEOPLE_CONTRACT_FIELD_CHECK.md` |
| Engagement instrument (E5) | `docs/ENGAGEMENT_INSTRUMENT.md` |
| v2 schema bootstrap SQL | `data-platform/serving/schemas/019_people_v2_bootstrap.sql` |
| Role tests | `data-platform/serving/test_people_v2_roles.py` |
| Pinned Training Event/Result Employee | `data-platform/people_source_contracts/frappe_hr/doctypes/training_event_employee.json` and `training_result_employee.json` |
| Harvest `job_hiring_manager` compact fields | `data-platform/people_source_contracts/greenhouse_v3/schemas/fields/job_hiring_manager.fields.json` |
| engagement_ext contract | `data-platform/people_source_contracts/engagement_ext/` |
| v2 mappings | `data-platform/people_mappings/` |
| v1 mappings archive | `data-platform/people_mappings/archive_v1/` |
| Business rules | `data-platform/people_business_rules.yaml` |
| E1–E8 registry | `data-platform/people_mappings/synthetic_extensions.yml` |
| Coverage checker | `data-platform/people_mappings/check_coverage.py` |
| HRMS Employee custom fields | `data-platform/people_source_contracts/frappe_hr/custom_fields.json` |
| Employee effective schema | `data-platform/people_source_contracts/frappe_hr/erpnext_doctypes/employee_effective.fields.json` |
| Employment Type pin | `data-platform/people_source_contracts/frappe_hr/doctypes/employment_type.json` |
| Bronze ODCS (condition 5) | `data-platform/people_source_contracts/odcs/` (`INDEX.yaml`, 51 contracts) |
| High-risk walkthrough (condition 6) | `docs/PEOPLE_HIGH_RISK_MAPPING.md` |
| BR-DQ-001 | `data-platform/people_business_rules.yaml` |
| SOURCE_GAP meta | `data-platform/people_mappings/people_meta_attribute.yml` |

## What was not done

- No Silver / Gold / mart DDL in `people_v2` (role test asserts zero tables)
- No 5-year backfill (GATE 2 must pass first)
- No metric RPCs, RLS policies, or demo identities
- No website / nav changes (dataset copy is `docs/PEOPLE_DATASET_PAGE_COPY.md` only)
- `public.people_*` serving tables were not replaced
- QuantReview production was not touched
- `apply.py` (full 000–018) was not run; only `apply_one.py 019_people_v2_bootstrap.sql`

## Conflicts vs SOURCE_CONTRACT_FIRST

| Topic | SOURCE_CONTRACT_FIRST | Architecture v1 | GATE 1 choice |
| --- | --- | --- | --- |
| Email join | Allowed `user.primary_email` = Employee.`company_email` | Forbidden; only `transaction` / `employee_id` / `manual` | **Architecture.** T8 uses Harvest `user.employee_id` = Employee.`name`. |
| Canonical table names | `people_silver_worker` etc. | `people_dim_*` / `people_evt_*` / `people_fact_*` | **Architecture** |
| Source field names | Pinned JSON | Draft `[核对]` names | **Pinned JSON** (see field check) |

## GATE 1 conditions (closed 2026-09-02)

### 1. E8 `employment_type` — **withdrawn** (not approved)

HRMS v16.15.0 `hrms/setup.py get_custom_fields()["Employee"]` **does** contain:

| fieldname | fieldtype | options |
| --- | --- | --- |
| `employment_type` | Link | Employment Type |
| `grade` | Link | Employee Grade |
| `job_applicant` | Link | Job Applicant |
| `default_shift` | Link | Shift Type |
| `health_insurance_provider` | Link | Employee Health Insurance |
| `health_insurance_no` | Data | — |
| `expense_approver` / `leave_approver` / `shift_request_approver` | Link | User |
| `employee_advance_account` | Link | Account |
| `payroll_cost_center` | Link | Cost Center |

ERPNext `employee.json` / `employee.fields.json` has **neither** `employment_type` nor `grade`.

**Mapped Employee fields missing from Employee.json:** only `employment_type` and `grade`. Both are in the HRMS overlay → provenance **SOURCE_NATIVE** (hrms custom field). Values are `Employment Type.name`. Certified headcount membership is **BR-WF-001** (status × Employment Type), owner pending.

Unmapped custom fields above are not §5 columns.

Pinned effective schema: `custom_fields.json` + `employee_effective.fields.json` + `doctypes/employment_type.json`.

### 2. Identity — **approved**

Match methods: `transaction | employee_id | manual`. Name/email forbidden.

`docs/PEOPLE_SOURCE_CONTRACT_FIRST.md` top **Superseded decisions** → architecture **§5.1** / **§2.1**.

### 3. SOURCE_GAP — **approved**

Written in architecture **§2.4**. Columns may be null; simulator must not fill; metric YAML must not depend (no metric YAML exists yet that references these columns). Rows in `people_mappings/people_meta_attribute.yml`: `people_dim_learning_resource.duration_minutes`, `people_dim_learning_resource.roles`. Internal Training Event duration is **DERIVED** from `start_time`/`end_time`, not this gap.

### 4. docstatus — **BR-DQ-001** (file-by-file)

`check_coverage.py` fails if a submittable or listed child `source_object` lacks `docstatus = 1`.

| Mapping file | Source objects | `source_filter` |
| --- | --- | --- |
| `frappe_employee.yml` | Employee (not submittable) | none |
| `frappe_department.yml` / `frappe_designation.yml` / `frappe_grade.yml` / `frappe_branch.yml` | masters | none |
| `frappe_employee_transfer.yml` | Employee Transfer | `docstatus = 1` |
| ↳ child | Employee Property History | `parent.docstatus = 1` |
| `frappe_employee_promotion.yml` | Employee Promotion | `docstatus = 1` |
| ↳ child | Employee Property History | `parent.docstatus = 1` |
| `frappe_employee_separation.yml` | Employee Separation | `docstatus = 1` |
| ↳ derived status rows | Employee (master) | none (not submittable) |
| `frappe_salary_assignment.yml` | Salary Structure Assignment | `docstatus = 1` |
| `frappe_appraisal.yml` | Appraisal | `docstatus = 1` |
| ↳ cycle | Appraisal Cycle (not submittable) | none |
| `frappe_training.yml` | Training Event / Training Result | `docstatus = 1` |
| ↳ children | Training Event Employee / Training Result Employee | parent `docstatus = 1` |
| `frappe_skill.yml` | Skill Map / Skill (not submittable) | none |
| Salary Structure / Salary Slip / Salary Detail / Training Feedback | **no silver mapping** | ODCS only; if mapped later must carry BR-DQ-001 |

`docstatus = 2` is a reversal event, not a second forward event.

### 5. Bronze ODCS — **added**

Per-object contracts were **not** previously covered (`bronze_ingest.yml` is a generic overlay only).

Location: `data-platform/people_source_contracts/odcs/` — `INDEX.yaml` lists **51** contracts. Each file has key, extract mode, cadence, `control_total_source`, `piiClassification`, `slaProperties.freshnessHours`.

### 6. High-risk walkthrough — **written**

`docs/PEOPLE_HIGH_RISK_MAPPING.md`. Canonical EEOC / demographic tables: **no** `worker_id`, **no** `person_id`. Harvest `eeoc` has `candidate_id` (ATS candidate) and is **not** mapped onto those tables. `demographic_answer` has neither. Harvest application has scalar `job_id`, not `jobs[]`.

## Decisions still in force

1. **`people_app` LOGIN:** NOLOGIN in SQL. Password only in env at step 7.
2. Learn `duration_minutes` / `roles[]` remain SOURCE_GAP.

## Test results (executed)

```text
cd data-platform/serving
python apply_one.py 019_people_v2_bootstrap.sql
# applied 019_people_v2_bootstrap.sql  applied_via pooler

python test_people_v2_roles.py
# people_v2_role_matrix_ok kgxbomcmgkwlmzyevqjw

cd data-platform/people_mappings
python emit_v2_mappings.py
python check_coverage.py
# synthetic_extensions_ok ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']
# canonical_columns 271
# mapping_files 41
# mapping_rows 357
# mapped_canonical 271
# coverage_ok
```

E8 remains in the registry with `status: withdrawn`.

| Check | Result |
| --- | --- |
| apply_one 019 | **pass** (pooler, staging `kgxbomcmgkwlmzyevqjw`) |
| test_people_v2_roles | **pass** |
| check_coverage (after conditions 1–4) | **pass** (271/271; no UNJUSTIFIED; E1–E7 present; E8 withdrawn) |

§14 steps 3–4 continue in `docs/PEOPLE_GATE2_REVIEW.md`. **Still no Silver DDL and no 5-year backfill.**
