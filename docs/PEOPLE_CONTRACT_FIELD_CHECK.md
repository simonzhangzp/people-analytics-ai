# People contract field check (GATE 1)

Architecture draft field names from `docs/PEOPLE_DATA_ARCHITECTURE.md` §4 `[核对]`, compared to pinned contracts:

- Frappe HR **v16.15.0** (`1924234884731e389ecc4e5500653fcd59666911`)
- ERPNext **v16.0.0**
- Greenhouse Harvest **v3** OpenAPI 3.1.0

**Rule:** mapping `source_field` uses the contract name, not the architecture draft name.

| Architecture draft | Pinned contract | Mapping decision |
| --- | --- | --- |
| Employee.`grade` | ERPNext `employee.json` **无**; **HRMS custom field** `grade` (Link Employee Grade) | SOURCE_NATIVE from HRMS overlay. Hist as-of uses Employee.`grade`. SSA.`grade` remains payroll assignment grade. |
| Employee.`employment_type` | ERPNext `employee.json` **无**; **HRMS custom field** `employment_type` (Link Employment Type) | SOURCE_NATIVE from HRMS overlay. **E8 withdrawn.** Values are Employment Type.name. |
| Employee name/status/dates/org/job/branch/manager/gender/DOB | Present | SOURCE_NATIVE |
| Employee.`modified` | DocType metadata | SOURCE_NATIVE ingest watermark |
| Transfer child rows | **Employee Property History** (`property`, `current`, `new`, `fieldname`) | SOURCE_NESTED |
| SSA `from_date`, `base`, `variable`, `currency`, `grade` | Present | SOURCE_NATIVE |
| Appraisal scores | `final_score`, `total_score`, `self_score` | SOURCE_NATIVE. Status ← `docstatus`. |
| Appraisal Cycle | `cycle_name`, `start_date`, `end_date`, `status` | SOURCE_NATIVE |
| Training Event employees | Child **Training Event Employee** | SOURCE_NESTED |
| Training Result employees | Child **Training Result Employee** | SOURCE_NESTED |
| application.`applied_at` | Absent; `created_at` exists | Canonical `applied_at` ← `created_at` (BR-TA-003) |
| application.`jobs[]` | Scalar `job_id` | BR-TA-002 |
| application.`credited_to` | **Absent.** Only `referrer_id` (points at referrer.id, not a user) | Canonical column is **`referrer_person_id`**. Crosswalk referrer → user → `employee_id` when `referrer.user_id` is set. Not a separate credited-to user. |
| application current stage | `job_interview_stage_id` | SOURCE_NATIVE |
| application.`status` | `in_process` / `rejected` / `hired` / `converted` | BR-TA-004 |
| hired_at | No Harvest field | BR-TA-005 from T1 / status=hired |
| `job_stages`.`priority` | `job_interview_stages`.`sort_order` | Canonical `priority` ← `sort_order` |
| opening.`status` | `open` boolean + `closed_at` | BR-TA-006 |
| opening.`close_reason` | `close_reason_id` | identity id |
| offer.`starts_at` / `sent_at` | `starts_on` / `sent_on` | T1 joining date ← `starts_on` |
| offer status | `Created` / `Accepted` / `Rejected` / `Deprecated` | BR-TA-007 |
| scorecard.`interview_step` / `submitted_by` | `interview_kit_id` / `submitter_id` | contract names |
| scorecard overall | `candidate_rating` | rename |
| scheduled_interviews | schema `interview` | `starts_at` / `ends_at` |
| users.`disabled` | `deactivated` | rename |
| EEOC nested race/gender | `{id, description}` | unwrap description |
| Learn `roles[]` / `duration_minutes` | Not in current catalog extract | `[Learn schema gap]` — not invented |

Frappe `name`, `creation`, `modified`, `docstatus` are SOURCE_NATIVE on every DocType.

**Effective Employee schema** = `erpnext_doctypes/employee.fields.json` + `frappe_hr/custom_fields.json` → `employee_effective.fields.json`.

HRMS custom fields on Employee that are **not** currently mapped (not required by §5): `job_applicant`, `default_shift`, `health_insurance_*`, `expense_approver`, `leave_approver`, `shift_request_approver`, `employee_advance_account`, `payroll_cost_center`.

