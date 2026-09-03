# High-risk mapping walkthrough (GATE 1 condition 6)

Grain notes: candidate EEOC and demographic **canonical** tables are application-grained. They have **no** `worker_id` or `person_id` columns (BR-GOV-001). Confirmed in `canonical_model.yml` and `greenhouse_eeoc.yml` / `greenhouse_demographics.yml`. Harvest source `eeoc` has `candidate_id` (ATS candidate) and `application_id`; that `candidate_id` is **not** mapped onto the restricted tables. `demographic_answer` has neither `worker_id` nor `person_id`.

Filters: submittable Frappe documents use `docstatus = 1`. `docstatus = 2` is a reversal (BR-DQ-001). Employee is not submittable.

## Employee

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_dim_worker.worker_id | Employee.name | identity | none (master) | `HR-EMP-000123` |
| people_dim_worker.hire_date | Employee.date_of_joining | identity; T1 also writes this from offer.starts_on | none | `2024-04-08` |
| people_dim_worker.employment_type | Employee.employment_type | identity. **HRMS custom field** Link Employment Type | none | `Regular` |
| people_hist_worker_attr.grade_id | Employee.grade | identity as-of. **HRMS custom field** Link Employee Grade | none | `G5` |
| people_dim_person_restricted.full_name | Employee.employee_name | identity | none | `Asha Rao` |
| people_dim_person_restricted.gender | Employee.gender | identity. Never from EEOC | none | `Female` |
| people_evt_worker (hire) | Employee.date_of_joining | event_type hire or rehire (BR-WF-006) | none | event_date `2024-04-08` |

## Employee Transfer + Employee Property History

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_evt_worker.event_id | Employee Transfer.name | identity | `docstatus = 1` | `HR-EMP-TRN-2024-00018` |
| people_evt_worker.event_date | transfer_date | identity | `docstatus = 1` | `2024-09-01` |
| people_evt_worker_change.property | Employee Property History.fieldname | coalesce(fieldname, property) → department\|designation\|grade\|branch\|reports_to\|… | parent `docstatus = 1` | `department` |
| people_evt_worker_change.old_value | current | identity | parent `docstatus = 1` | `Engineering - Platform` |
| people_evt_worker_change.new_value | new | identity | parent `docstatus = 1` | `Engineering - Data` |

Cancelled transfer (`docstatus = 2`) emits a reversal of those change rows, not a second transfer.

## Salary Structure Assignment

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_fact_comp_assignment_restricted.comp_assignment_id | SSA.name | identity | `docstatus = 1` | `HR-SSA-2024-00401` |
| worker_id | SSA.employee | identity | `docstatus = 1` | `HR-EMP-000123` |
| from_date | SSA.from_date | identity | `docstatus = 1` | `2024-04-01` |
| to_date | SSA.from_date | lead(from_date)-1 day (BR-COMP-002) | `docstatus = 1` | `2025-03-31` |
| base / variable / currency | SSA.base / variable / currency | identity | `docstatus = 1` | `185000`, `USD` |
| SSA.grade | SSA.grade | payroll grade on the assignment (may differ from Employee.grade) | `docstatus = 1` | `G5` |

## applications.jobs[] (does not exist)

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_fact_application.requisition_id | application.job_id → opening.id | BR-TA-002. Harvest has scalar `job_id`, not `jobs[]`. Prospects use `prospective_job_ids` only when `job_id` is null | none | job_id `8811` → opening `99021` |
| people_fact_application.referrer_person_id | application.referrer_id → referrer.user_id | Harvest has no credited_to field | none | user 204 → PER-… |
| applied_at | application.created_at | identity (BR-TA-003) | none | `2024-02-11T15:04:00Z` |

## application_stages

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| application_id | application_stage.application_id | identity | none | `44001` |
| stage_id | job_interview_stage_id | identity | none | `12` |
| entered_at / exited_at | entered_at / exited_at | identity | none | `2024-02-12T10:00:00Z` / null |
| is_current | current | rename | none | `true` |

**Not mapped:** `days_in_stage` (source-computed). Time-in-stage is gold/metric from entered_at/exited_at.

## openings (requisition)

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| requisition_id | opening.id | identity | none | `99021` |
| gh_job_id | opening.job_id | identity | none | `8811` |
| status | open + closed_at | open=true → open else closed (BR-TA-006) | none | `open` |
| close_reason | close_reason_id | identity id | none | `3` |
| hired_application_id | opening.application_id | identity | none | `44001` |
| hiring_manager_person_id | job_hiring_manager.user_id | T8 user.employee_id → person | none | `PER-a1b2c3d4e5f6` |

## users.employee_id (T8)

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_xw_identity.source_id | user.id | identity | none | `204` |
| match_method | user.employee_id | `employee_id` iff equals Employee.name | none | `HR-EMP-000123` |

**Forbidden:** `user.primary_email` = Employee.`company_email`. Field `deactivated` is the disabled flag (not `disabled`).

## EEOC / demographics

| canonical | source | transform | filter | example |
| --- | --- | --- | --- | --- |
| people_fact_candidate_eeoc_restricted.application_id | eeoc.application_id | identity | none | `44001` |
| race / gender / veteran_status / disability_status | nested `.description` | unwrap | none | `Asian` |
| people_fact_candidate_demographic_restricted.application_id | demographic_answer.application_id | identity | none | `44001` |
| question_id | demographic_question_id | rename | none | `9` |
| answer_option_id | demographic_answer_option_id | rename | none | `31` |

Columns on these two tables: application_id, question/answer fields, submitted_at. **No worker_id. No person_id.**
