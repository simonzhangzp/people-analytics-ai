from __future__ import annotations

"""Read-only provenance audit of current People warehouse/lake fields.

Does not alter tables. Writes docs/PEOPLE_FIELD_PROVENANCE_AUDIT.csv and .md
"""

import csv
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT_CSV = REPO / "docs" / "PEOPLE_FIELD_PROVENANCE_AUDIT.csv"
OUT_MD = REPO / "docs" / "PEOPLE_FIELD_PROVENANCE_AUDIT.md"

COLS = [
    "dataset",
    "column",
    "classification",
    "source_system",
    "source_object",
    "source_field",
    "transformation",
    "business_definition",
    "keep_change_remove",
    "notes",
]


def row(
    dataset: str,
    column: str,
    classification: str,
    source_system: str,
    source_object: str,
    source_field: str,
    transformation: str,
    business_definition: str,
    keep_change_remove: str,
    notes: str,
) -> dict[str, str]:
    return {
        "dataset": dataset,
        "column": column,
        "classification": classification,
        "source_system": source_system,
        "source_object": source_object,
        "source_field": source_field,
        "transformation": transformation,
        "business_definition": business_definition,
        "keep_change_remove": keep_change_remove,
        "notes": notes,
    }


def ingest(dataset: str, source_label: str) -> list[dict[str, str]]:
    return [
        row(
            dataset,
            "source_system",
            "SYNTHETIC_EXTENSION",
            source_label,
            "",
            "",
            "constant globaltech_*",
            "Label of the generating system",
            "change",
            "Replace with frappe_hr / greenhouse_v3 / microsoft_learn / onet / bls. Not a source HR field.",
        ),
        row(
            dataset,
            "source_record_id",
            "CANONICAL_KEY",
            source_label,
            "",
            "name or id",
            "identity of source PK",
            "Source primary key persisted on ingest",
            "change",
            "Keep as ingestion key; value must equal the source PK (Frappe name / Greenhouse integer id).",
        ),
        row(
            dataset,
            "source_updated_at",
            "SYNTHETIC_EXTENSION",
            source_label,
            "",
            "",
            "set to pipeline ingested_at",
            "Claimed source update timestamp",
            "change",
            "Must copy Frappe modified or Greenhouse updated_at. Currently the generator stamps ingest time.",
        ),
        row(
            dataset,
            "ingested_at",
            "CANONICAL_KEY",
            "people_pipeline",
            "ingestion_run",
            "",
            "pipeline clock",
            "When the lake row was written",
            "keep",
            "Allowed Bronze ingestion metadata. Add ingestion_run_id (missing today).",
        ),
    ]


def rows() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []

    # --- lake bronze/silver: current generator writes the same assumed tables to both ---
    out += ingest("people_bronze.people_worker / people_silver.people_worker", "globaltech_hris")
    out += [
        row("people_bronze.people_worker / people_silver.people_worker", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee", "name / employee", "identity after mapping", "Canonical worker key", "change", "Today generated as W#####. Must equal or crosswalk Frappe Employee.name."),
        row("people_bronze.people_worker / people_silver.people_worker", "preferred_first_name", "SOURCE_NATIVE", "frappe_hr", "Employee", "first_name", "identity; optional preferred overlay later", "Given name", "change", "Frappe field is first_name, not preferred_first_name. Greenhouse Candidate.preferred_name is ATS-only."),
        row("people_bronze.people_worker / people_silver.people_worker", "preferred_last_name", "SOURCE_NATIVE", "frappe_hr", "Employee", "last_name", "identity", "Family name", "change", "Rename to last_name to match ERPNext Employee."),
        row("people_bronze.people_worker / people_silver.people_worker", "employment_status", "SOURCE_NATIVE", "frappe_hr", "Employee", "status", "map Active/Inactive/Suspended/Left → canonical codes", "Employment lifecycle status", "change", "Current values are active/terminated. Source enum is Active, Inactive, Suspended, Left."),
        row("people_bronze.people_worker / people_silver.people_worker", "hire_date", "SOURCE_NATIVE", "frappe_hr", "Employee", "date_of_joining", "identity", "First day of employment", "change", "Must use date_of_joining. Do not invent."),
        row("people_bronze.people_worker / people_silver.people_worker", "termination_date", "SOURCE_NATIVE", "frappe_hr", "Employee", "relieving_date", "identity", "Last day of employment", "change", "Frappe also has Employee Separation.boarding_begins_on; relieving_date is the Employee master field."),
        row("people_bronze.people_worker / people_silver.people_worker", "termination_reason", "SOURCE_NATIVE", "frappe_hr", "Employee", "reason_for_leaving", "identity", "Reason recorded on exit", "change", "Employee Separation is the process object; reason_for_leaving is on Employee."),
        row("people_bronze.people_worker / people_silver.people_worker", "job_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "designation", "assumed job catalog key", "Current job", "change", "Frappe has Link Designation, not a synthetic JOB-FAM-LVL id. occupation_id must be a later mapping, not a worker source field."),
        row("people_bronze.people_worker / people_silver.people_worker", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "department", "assumed org tree key", "Current organization unit", "change", "Must be Department.name. Current ORG-Function-Team ids are invented."),
        row("people_bronze.people_worker / people_silver.people_worker", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "branch", "assumed city codes", "Current work location", "change", "ERPNext Branch has only field branch (name). US-NY style ids are invented."),
        row("people_bronze.people_worker / people_silver.people_worker", "region", "UNJUSTIFIED", "", "", "", "copied from synthetic location", "AMER/EMEA/APAC band", "remove", "Not on Employee or Branch. If needed, add a documented branch→region reference map — do not treat as HRIS native."),
        row("people_bronze.people_worker / people_silver.people_worker", "manager_worker_id", "SOURCE_NATIVE", "frappe_hr", "Employee", "reports_to", "identity via employee crosswalk", "Manager employee", "change", "reports_to is Link Employee. Join by employee id, never name."),
        row("people_bronze.people_worker / people_silver.people_worker", "fte", "UNJUSTIFIED", "", "", "", "sampled 0.5–1.0", "Full-time equivalent", "remove", "ERPNext v16.0.0 Employee.json has no fte/occupancy field. Do not keep as canonical until a source field exists."),
        row("people_bronze.people_worker / people_silver.people_worker", "gender", "SOURCE_NATIVE", "frappe_hr", "Employee", "gender", "identity", "HRIS gender on the employee master", "change", "Applicant EEOC gender is Greenhouse application grain and must not overwrite this field."),
        row("people_bronze.people_worker / people_silver.people_worker", "generation", "UNJUSTIFIED", "frappe_hr", "Employee", "date_of_birth", "age band invented without storing DOB", "Generation cohort", "remove", "DOB exists on Employee but is not persisted today. After mapping date_of_birth, generation may become DERIVED. Until then unjustified."),
        row("people_bronze.people_worker / people_silver.people_worker", "ethnicity_band", "UNJUSTIFIED", "greenhouse_v3", "eeoc / demographic_answers", "race", "random band on worker", "Ethnicity on the employee row", "remove", "Greenhouse EEOC and demographic_answers are application-scoped. Frappe Employee has no ethnicity field. Do not store on worker."),
    ]

    out += ingest("people_bronze.people_org / people_silver.people_org", "globaltech_hris")
    out += [
        row("people_bronze.people_org / people_silver.people_org", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "invented ORG-* ids", "Organization unit key", "change", "Use Department.name. Nested teams are parent_department, not invented team ids."),
        row("people_bronze.people_org / people_silver.people_org", "org_name", "SOURCE_NATIVE", "frappe_hr", "Department", "department_name", "identity", "Department display name", "change", "Keep meaning; source field is department_name."),
        row("people_bronze.people_org / people_silver.people_org", "parent_org_id", "SOURCE_NATIVE", "frappe_hr", "Department", "parent_department", "identity", "Parent department", "change", ""),
        row("people_bronze.people_org / people_silver.people_org", "org_level", "DERIVED", "frappe_hr", "Department", "lft,rgt / parent_department", "tree depth", "Hierarchy depth", "change", "lft/rgt exist on Department. Do not invent levels independent of the tree."),
        row("people_bronze.people_org / people_silver.people_org", "function_name", "SYNTHETIC_EXTENSION", "", "", "", "first path segment of invented org_id", "Function label", "remove", "Not a Frappe Department field. Derive from a documented department→function map if required."),
        row("people_bronze.people_org / people_silver.people_org", "region", "UNJUSTIFIED", "", "", "", "copied from workers", "Region on org", "remove", "Department has company, not region."),
    ]

    out += ingest("people_bronze.people_location / people_silver.people_location", "globaltech_hris")
    out += [
        row("people_bronze.people_location / people_silver.people_location", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name / branch", "invented US-NY codes", "Location key", "change", "Branch DocType has a single Data field `branch`. Use Branch.name."),
        row("people_bronze.people_location / people_silver.people_location", "location_name", "SOURCE_NATIVE", "frappe_hr", "Branch", "branch", "identity", "Branch name", "keep", "Source-native once Branch is the bronze object."),
        row("people_bronze.people_location / people_silver.people_location", "country", "UNJUSTIFIED", "", "", "", "hardcoded in PEOPLE_LOCATIONS", "Country", "remove", "Not on Branch. Optional people_ref_branch_geo is a separate documented map, not Bronze."),
        row("people_bronze.people_location / people_silver.people_location", "region", "UNJUSTIFIED", "", "", "", "hardcoded AMER/EMEA/APAC", "Region", "remove", "Same as country."),
        row("people_bronze.people_location / people_silver.people_location", "city", "UNJUSTIFIED", "", "", "", "hardcoded city", "City", "remove", "Same as country."),
        row("people_bronze.people_location / people_silver.people_location", "pay_multiplier", "UNJUSTIFIED", "", "", "", "hardcoded 0.38–1.22", "Geo pay differential", "remove", "Not an HRIS field. Compensation comes from Salary Structure Assignment.base / currency."),
    ]

    out += ingest("people_bronze.people_job / people_silver.people_job", "globaltech_hris")
    out += [
        row("people_bronze.people_job / people_silver.people_job", "job_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Designation", "name", "JOB-family-level catalog", "Job key", "change", "Designation is designation_name. Grade is a separate Employee Grade / assignment.grade."),
        row("people_bronze.people_job / people_silver.people_job", "job_title", "SOURCE_NATIVE", "frappe_hr", "Designation", "designation_name", "identity", "Job title", "change", ""),
        row("people_bronze.people_job / people_silver.people_job", "job_family", "UNJUSTIFIED", "", "", "", "split from invented job_id", "Job family", "remove", "Designation.json has designation_name and description only. Family requires a documented map, not a source field."),
        row("people_bronze.people_job / people_silver.people_job", "job_level", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee Grade / Salary Structure Assignment", "grade", "IC/M/DIR catalog", "Level", "change", "Source is Employee Grade.name or assignment.grade. IC1–C codes are invented."),
        row("people_bronze.people_job / people_silver.people_job", "occupation_id", "DERIVED", "onet", "Occupation Data", "O*NET-SOC Code", "manual designation→SOC map (currently hardcoded on synthetic jobs)", "Occupation code", "change", "Valid as DERIVED only after an explicit designation/job→O*NET map. Today it is baked into the generator."),
        row("people_bronze.people_job / people_silver.people_job", "base_salary", "UNJUSTIFIED", "frappe_hr", "Salary Structure Assignment / Employee Grade", "base / default_base_pay", "pay midpoint invented on the job row", "Job midpoint salary", "remove", "Pay lives on Salary Structure Assignment.base (and Grade.default_base_pay). Not a Designation field."),
        row("people_bronze.people_job / people_silver.people_job", "is_manager", "UNJUSTIFIED", "", "", "", "True for M*/DIR/VP/C in PEOPLE_LEVELS", "Manager flag", "remove", "Not on Designation. Span/manager metrics must use reports_to."),
    ]

    out += ingest("people_bronze.people_assignment / people_silver.people_assignment", "globaltech_hris")
    out += [
        row("people_bronze.people_assignment / people_silver.people_assignment", "assignment_id", "SYNTHETIC_EXTENSION", "", "", "", "worker_id-A0", "Current assignment surrogate", "remove", "Frappe has no assignment table. Current org/job/location are Employee master fields; history is Transfer/Promotion Property History."),
        row("people_bronze.people_assignment / people_silver.people_assignment", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee", "name", "identity", "Worker", "change", "Replace assignment grain with worker events."),
        row("people_bronze.people_assignment / people_silver.people_assignment", "job_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "designation", "copied current state", "Job on assignment", "remove", "Wide current-state assignment table is not a source object."),
        row("people_bronze.people_assignment / people_silver.people_assignment", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "department", "copied current state", "Org on assignment", "remove", ""),
        row("people_bronze.people_assignment / people_silver.people_assignment", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "branch", "copied current state", "Location on assignment", "remove", ""),
        row("people_bronze.people_assignment / people_silver.people_assignment", "manager_worker_id", "SOURCE_NATIVE", "frappe_hr", "Employee", "reports_to", "copied current state", "Manager on assignment", "remove", "Persist on Employee bronze; changes via Property History."),
        row("people_bronze.people_assignment / people_silver.people_assignment", "effective_start", "UNJUSTIFIED", "frappe_hr", "Employee", "date_of_joining", "copied hire_date", "Assignment start", "remove", "Not Frappe transfer_date. Hire is Employee.date_of_joining / hire event."),
        row("people_bronze.people_assignment / people_silver.people_assignment", "effective_end", "UNJUSTIFIED", "frappe_hr", "Employee", "relieving_date", "copied termination_date", "Assignment end", "remove", ""),
    ]

    out += ingest("people_bronze.people_movement / people_silver.people_movement", "globaltech_hris")
    out += [
        row("people_bronze.people_movement / people_silver.people_movement", "event_id", "CANONICAL_KEY", "frappe_hr", "Employee Transfer / Promotion / Separation / Employee", "name", "invented worker-type ids", "Movement event key", "change", "Must be source record id of Transfer/Promotion/Separation or hire from Employee."),
        row("people_bronze.people_movement / people_silver.people_movement", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee Transfer", "employee", "identity", "Worker on the event", "keep", "Keep as canonical after mapping."),
        row("people_bronze.people_movement / people_silver.people_movement", "event_type", "SYNTHETIC_EXTENSION", "frappe_hr", "multiple", "", "sampled hire/termination/promotion/lateral/manager_change/location_transfer", "Event class", "change", "Must be determined by source object, not independent sampling. Laterals/manager_change/location_transfer are Property History property names, not random event_types."),
        row("people_bronze.people_movement / people_silver.people_movement", "event_date", "UNJUSTIFIED", "frappe_hr", "Employee Transfer", "transfer_date", "random offset from hire for transfers", "Effective date", "change", "Transfers MUST use transfer_date. Promotions use promotion_date. Today location_transfer dates are sampled and unrelated to Frappe."),
        row("people_bronze.people_movement / people_silver.people_movement", "org_id", "UNJUSTIFIED", "frappe_hr", "Employee Property History", "new where property=Department", "wide current org on the event row", "Org after move", "remove", "Replace with people_silver_worker_event_change.attribute_name/old_value/new_value."),
        row("people_bronze.people_movement / people_silver.people_movement", "job_id", "UNJUSTIFIED", "frappe_hr", "Employee Property History", "new where property=Designation", "wide current job on the event row", "Job after move", "remove", "Same. One transfer becomes N change rows."),
        row("people_bronze.people_movement / people_silver.people_movement", "location_id", "UNJUSTIFIED", "frappe_hr", "Employee Property History", "new where property=Branch", "wide current location on the event row", "Location after move", "remove", "Same."),
        row("people_bronze.people_movement / people_silver.people_movement", "reason", "SOURCE_NATIVE", "frappe_hr", "Employee", "reason_for_leaving", "populated only for termination", "Exit reason", "change", "Valid on separation/employee; null on transfer."),
    ]

    out += ingest("people_bronze.people_compensation / people_silver.people_compensation", "globaltech_hris")
    out += [
        row("people_bronze.people_compensation / people_silver.people_compensation", "compensation_id", "CANONICAL_KEY", "frappe_hr", "Salary Structure Assignment", "name", "invented COMP ids", "Compensation record key", "change", "Use assignment name plus salary slip name for paid amounts."),
        row("people_bronze.people_compensation / people_silver.people_compensation", "worker_id", "CANONICAL_KEY", "frappe_hr", "Salary Structure Assignment", "employee", "identity", "Worker", "keep", ""),
        row("people_bronze.people_compensation / people_silver.people_compensation", "effective_date", "SOURCE_NATIVE", "frappe_hr", "Salary Structure Assignment", "from_date", "identity", "Pay effective date", "change", "Must be from_date, not hire_date plus noise."),
        row("people_bronze.people_compensation / people_silver.people_compensation", "currency", "SOURCE_NATIVE", "frappe_hr", "Salary Structure Assignment", "currency", "identity", "Currency", "keep", ""),
        row("people_bronze.people_compensation / people_silver.people_compensation", "base_salary", "SOURCE_NATIVE", "frappe_hr", "Salary Structure Assignment", "base", "currently job.base_salary * pay_multiplier * uniform noise", "Base pay", "change", "Source field is base. pay_multiplier and uniform noise are not source."),
        row("people_bronze.people_compensation / people_silver.people_compensation", "pay_rate_type", "UNJUSTIFIED", "", "", "", "constant annual", "Pay frequency label", "remove", "Not on Salary Structure Assignment. Payroll frequency lives on Salary Structure / Salary Slip."),
    ]

    out += ingest("people_bronze.people_performance_review / people_silver.people_performance_review", "globaltech_hris")
    out += [
        row("people_bronze.people_performance_review / people_silver.people_performance_review", "review_id", "CANONICAL_KEY", "frappe_hr", "Appraisal", "name", "invented PR ids", "Appraisal key", "change", ""),
        row("people_bronze.people_performance_review / people_silver.people_performance_review", "worker_id", "CANONICAL_KEY", "frappe_hr", "Appraisal", "employee", "identity", "Employee appraised", "keep", ""),
        row("people_bronze.people_performance_review / people_silver.people_performance_review", "review_date", "SYNTHETIC_EXTENSION", "frappe_hr", "Appraisal / Appraisal Cycle", "start_date / end_date", "fixed Nov 15 sample", "Review date", "change", "Use Appraisal Cycle dates or Appraisal creation/modified. There is no review_date field on Appraisal."),
        row("people_bronze.people_performance_review / people_silver.people_performance_review", "rating", "SYNTHETIC_EXTENSION", "frappe_hr", "Appraisal", "final_score / total_score", "independent 1–5 choice", "Integer rating", "change", "Source scores are Float final_score, total_score, self_score, avg_feedback_score. Do not invent a 1–5 scale unless a documented discretization is approved."),
        row("people_bronze.people_performance_review / people_silver.people_performance_review", "rating_label", "UNJUSTIFIED", "", "", "", "below/developing/meets/exceeds/outstanding", "Rating label", "remove", "Not a Frappe Appraisal field."),
    ]

    out += ingest("people_bronze.people_engagement_response / people_silver.people_engagement_response", "globaltech_hris")
    out += [
        row("people_bronze.people_engagement_response / people_silver.people_engagement_response", "response_id", "UNJUSTIFIED", "", "", "", "invented ENG ids", "Survey response key", "remove", "Pinned Frappe HR set has no Engagement Survey DocType. No source contract."),
        row("people_bronze.people_engagement_response / people_silver.people_engagement_response", "worker_id", "UNJUSTIFIED", "", "", "", "", "Respondent", "remove", "No source."),
        row("people_bronze.people_engagement_response / people_silver.people_engagement_response", "survey_date", "UNJUSTIFIED", "", "", "", "fixed May 20 sample", "Survey date", "remove", "No source."),
        row("people_bronze.people_engagement_response / people_silver.people_engagement_response", "engagement_score", "UNJUSTIFIED", "", "", "", "randint 45–96", "Engagement score", "remove", "Dashboard engagement_score currently depends on this unjustified field."),
    ]

    out += ingest("people_bronze.people_worker_skill / people_silver.people_worker_skill", "globaltech_hris")
    out += [
        row("people_bronze.people_worker_skill / people_silver.people_worker_skill", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee Skill Map", "employee", "identity", "Employee", "keep", ""),
        row("people_bronze.people_worker_skill / people_silver.people_worker_skill", "skill_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee Skill", "skill", "skill_python etc from PEOPLE_SKILLS", "Skill key", "change", "Must be Skill.name from Frappe Skill DocType. O*NET skills stay in the external catalog."),
        row("people_bronze.people_worker_skill / people_silver.people_worker_skill", "proficiency", "SOURCE_NATIVE", "frappe_hr", "Employee Skill", "proficiency", "randint 1–4 vs Frappe Rating", "Proficiency", "change", "Source type is Rating. evaluation_date is also on the child table and is currently dropped."),
    ]

    out += ingest("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "globaltech_lms")
    out += [
        row("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "enrollment_id", "CANONICAL_KEY", "frappe_hr", "Training Event.employees / Training Result", "name", "invented LRN ids", "Internal enrollment key", "change", "Internal LMS is Frappe Training Event + Training Result, not COURSE-xxx."),
        row("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "worker_id", "CANONICAL_KEY", "frappe_hr", "Training Event Employee", "employee", "identity", "Learner", "keep", ""),
        row("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "course_id", "UNJUSTIFIED", "frappe_hr", "Training Program / Training Event", "name / event_name", "COURSE-001..080 invented catalog", "Course", "remove", "Must be Training Program/Event name. Keep Microsoft Learn catalog separate."),
        row("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "enrolled_on", "SYNTHETIC_EXTENSION", "frappe_hr", "Training Event", "start_time", "random offset from hire", "Enrollment date", "change", "Use event start_time / employee child dates if present."),
        row("people_bronze.people_learning_enrollment / people_silver.people_learning_enrollment", "status", "SYNTHETIC_EXTENSION", "frappe_hr", "Training Event", "event_status", "constant completed", "Enrollment status", "change", "Source event_status is Scheduled/Completed/Cancelled."),
    ]

    out += ingest("people_bronze.people_learning_completion / people_silver.people_learning_completion", "globaltech_lms")
    out += [
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "completion_id", "CANONICAL_KEY", "frappe_hr", "Training Result", "name", "invented", "Completion key", "change", ""),
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "enrollment_id", "CANONICAL_KEY", "frappe_hr", "Training Result", "training_event", "identity", "Parent event", "change", ""),
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "worker_id", "CANONICAL_KEY", "frappe_hr", "Training Result.employees", "employee", "identity", "Learner", "keep", ""),
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "course_id", "UNJUSTIFIED", "", "", "", "COURSE-xxx", "Course", "remove", "Same as enrollment."),
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "completed_on", "SYNTHETIC_EXTENSION", "frappe_hr", "Training Event", "end_time", "enrolled_on + 1–20 days", "Completion date", "change", "Use Training Event.end_time / Result submission."),
        row("people_bronze.people_learning_completion / people_silver.people_learning_completion", "hours", "UNJUSTIFIED", "", "", "", "choice 1/2/4/6/8", "Learning hours", "remove", "Not on Training Event/Result in the pinned schema. Derive only if a source duration field is added."),
    ]

    out += ingest("people_bronze.people_requisition / people_silver.people_requisition", "globaltech_ats")
    out += [
        row("people_bronze.people_requisition / people_silver.people_requisition", "requisition_id", "SYNTHETIC_EXTENSION", "greenhouse_v3", "jobs / openings", "id", "REQ######", "Requisition key", "change", "Greenhouse Job is the requisition; Opening is the headcount slot. Do not invent REQ ids."),
        row("people_bronze.people_requisition / people_silver.people_requisition", "job_id", "SYNTHETIC_EXTENSION", "greenhouse_v3", "jobs", "id", "random internal job_id", "Linked HR job", "change", "Use Greenhouse job.id. Crosswalk to Frappe Designation via mapping, not name."),
        row("people_bronze.people_requisition / people_silver.people_requisition", "location_id", "SYNTHETIC_EXTENSION", "greenhouse_v3", "offices / openings", "office_ids / opening location", "random US-NY etc", "Req location", "change", "Use Greenhouse office / opening fields."),
        row("people_bronze.people_requisition / people_silver.people_requisition", "opened_on", "SOURCE_NATIVE", "greenhouse_v3", "openings / jobs", "opened_at / created_at", "random date in history window", "Opened date", "change", "Opening.opened_at is the source for a filled slot."),
        row("people_bronze.people_requisition / people_silver.people_requisition", "status", "SYNTHETIC_EXTENSION", "greenhouse_v3", "jobs / openings", "status / closed_at", "open/filled/closed with independent p", "Req status", "change", "Must follow Greenhouse job/opening status, not independent multinomial."),
    ]

    out += ingest("people_bronze.people_candidate / people_silver.people_candidate", "globaltech_ats")
    out += [
        row("people_bronze.people_candidate / people_silver.people_candidate", "candidate_id", "CANONICAL_KEY", "greenhouse_v3", "candidates", "id", "CAND#######", "Candidate person key", "change", "Must be Greenhouse candidate.id. Person grain only."),
        row("people_bronze.people_candidate / people_silver.people_candidate", "requisition_id", "UNJUSTIFIED", "greenhouse_v3", "applications", "job_id", "flattened onto candidate", "Job applied to", "remove", "Candidate 1→many Applications. job_id belongs on application, not candidate."),
        row("people_bronze.people_candidate / people_silver.people_candidate", "applied_on", "UNJUSTIFIED", "greenhouse_v3", "applications", "applied_at / created_at", "flattened onto candidate", "Application date", "remove", "Application grain."),
        row("people_bronze.people_candidate / people_silver.people_candidate", "current_stage", "UNJUSTIFIED", "greenhouse_v3", "applications / application_stages", "stage_id / current application_stage", "independent stage sample on candidate", "Current stage", "remove", "Current stage is the application_stages row with current=true. Do not store on candidate."),
    ]

    out += ingest("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "globaltech_ats")
    out += [
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "stage_event_id", "CANONICAL_KEY", "greenhouse_v3", "application_stages", "id", "candidate-stage string", "Stage history key", "change", "Use application_stages.id."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "candidate_id", "SOURCE_NESTED", "greenhouse_v3", "applications", "candidate_id", "via application", "Candidate", "change", "Bronze stage row should carry application_id; candidate_id is reachable through application."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "requisition_id", "UNJUSTIFIED", "greenhouse_v3", "applications", "job_id", "flattened", "Job", "remove", "Use application.job_id."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "stage", "SYNTHETIC_EXTENSION", "greenhouse_v3", "job_interview_stages", "name", "applied/screen/interview/offer", "Stage name", "change", "Must be job_interview_stage_id; name comes from job_interview_stages."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "stage_entered_on", "SOURCE_NATIVE", "greenhouse_v3", "application_stages", "entered_at", "applied_on + fixed 0/7/16/28", "Entered stage", "change", "Source field entered_at. Missing: application_id, job_interview_stage_id, exited_at, current, created_at, updated_at."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "exited_at", "UNJUSTIFIED", "greenhouse_v3", "application_stages", "exited_at", "not persisted", "Left stage", "change", "Column is ABSENT today. Must be added from source. Do not persist Greenhouse days_in_stage as canonical."),
        row("people_bronze.people_candidate_stage / people_silver.people_candidate_stage", "time_in_stage_days", "DERIVED", "greenhouse_v3", "application_stages", "exited_at, entered_at", "currently mean of consecutive entered dates or default 11.0", "Time in stage", "change", "Canonical derivation timestamp_diff only. Greenhouse API also returns days_in_stage (source-computed); Bronze may store the raw payload but Silver must recompute from timestamps."),
    ]

    out += ingest("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "globaltech_ats")
    out += [
        row("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "candidate_id", "UNJUSTIFIED", "greenhouse_v3", "applications", "id / candidate_id", "CAND0000001.. sequential, not the applied candidate", "Hired candidate", "remove", "Joins hired workers to sequential candidate ids. Not a Greenhouse hire. Use application hired + identity crosswalk."),
        row("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee", "name", "sampled workers", "New employee", "change", "Valid only via people_identity_crosswalk after Application Hired → Employee created."),
        row("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "hired_on", "SOURCE_NATIVE", "greenhouse_v3", "applications", "last_activity / hire endpoint timestamps", "copied Employee hire_date", "Hire date", "change", "Use Greenhouse hired application timestamps plus Frappe date_of_joining; do not copy independently."),
        row("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "requisition_id", "UNJUSTIFIED", "greenhouse_v3", "applications", "job_id", "random REQ", "Job hired into", "remove", "Random requisition, not the application.job_id."),
        row("people_bronze.people_candidate_hire / people_silver.people_candidate_hire", "applied_on", "UNJUSTIFIED", "greenhouse_v3", "applications", "applied_at", "hire_date - 21 days", "Applied date", "remove", "Invented constant lag."),
    ]

    # --- gold lake facts (not serving SQL) ---
    out += [
        row("people_gold.people_fact_worker_movement", "(same as people_movement)", "UNJUSTIFIED", "frappe_hr", "Employee Transfer", "transfer_date + transfer_details", "copy of silver movement", "Movement fact", "remove", "Gold must rebuild from Bronze + mappings. Current gold copies unjustified silver."),
        row("people_gold.people_fact_compensation", "(same as people_compensation)", "SYNTHETIC_EXTENSION", "frappe_hr", "Salary Structure Assignment", "base", "copy of silver", "Compensation fact", "change", ""),
        row("people_gold.people_fact_learning", "(same as people_learning_completion)", "UNJUSTIFIED", "frappe_hr", "Training Result", "", "copy of silver", "Learning fact", "change", ""),
        row("people_gold.people_fact_performance", "(same as people_performance_review)", "SYNTHETIC_EXTENSION", "frappe_hr", "Appraisal", "final_score", "copy of silver", "Performance fact", "change", ""),
        row("people_gold.people_fact_engagement", "(same as people_engagement_response)", "UNJUSTIFIED", "", "", "", "copy of silver", "Engagement fact", "remove", "No source contract."),
        row("people_gold.people_fact_recruiting", "(same as people_candidate)", "UNJUSTIFIED", "greenhouse_v3", "candidates", "", "flattened candidates as recruiting fact", "Recruiting fact", "remove", "Violates Candidate vs Application grain."),
    ]

    # --- serving dims ---
    out += [
        row("people_dim_worker", "worker_id", "CANONICAL_KEY", "frappe_hr", "Employee", "name", "from silver worker", "Worker key", "change", ""),
        row("people_dim_worker", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "department", "from silver", "Org", "change", ""),
        row("people_dim_worker", "job_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "designation", "from silver", "Job", "change", ""),
        row("people_dim_worker", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee", "branch", "from silver", "Location", "change", ""),
        row("people_dim_worker", "manager_worker_id", "SOURCE_NATIVE", "frappe_hr", "Employee", "reports_to", "from silver", "Manager", "change", ""),
        row("people_dim_worker", "hire_date", "SOURCE_NATIVE", "frappe_hr", "Employee", "date_of_joining", "from silver", "Hire date", "change", ""),
        row("people_dim_worker", "termination_date", "SOURCE_NATIVE", "frappe_hr", "Employee", "relieving_date", "from silver", "Termination date", "change", ""),
        row("people_dim_worker", "employment_status", "SOURCE_NATIVE", "frappe_hr", "Employee", "status", "from silver", "Status", "change", ""),
        row("people_dim_worker", "fte", "UNJUSTIFIED", "", "", "", "from silver", "FTE", "remove", "No Frappe source field."),
        row("people_dim_worker", "effective_start", "UNJUSTIFIED", "frappe_hr", "Employee", "date_of_joining", "copied hire_date", "Dim SCD start", "change", "SCD must be built from worker events, not hire copy."),
        row("people_dim_worker", "effective_end", "UNJUSTIFIED", "frappe_hr", "Employee", "relieving_date", "copied termination_date", "Dim SCD end", "change", ""),
        row("people_dim_worker", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "constant synthetic_internal", "Provenance flag", "change", "After rebuild: frappe_hr + mappings."),
        row("people_dim_org", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "from silver org", "Org key", "change", ""),
        row("people_dim_org", "org_name", "SOURCE_NATIVE", "frappe_hr", "Department", "department_name", "from silver", "Name", "change", ""),
        row("people_dim_org", "parent_org_id", "SOURCE_NATIVE", "frappe_hr", "Department", "parent_department", "from silver", "Parent", "change", ""),
        row("people_dim_org", "org_level", "DERIVED", "frappe_hr", "Department", "parent_department", "from silver", "Level", "change", ""),
        row("people_dim_org", "function_name", "SYNTHETIC_EXTENSION", "", "", "", "from silver", "Function", "remove", ""),
        row("people_dim_org", "region", "UNJUSTIFIED", "", "", "", "from silver", "Region", "remove", ""),
        row("people_dim_org", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_dim_location", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name", "from silver", "Location key", "change", ""),
        row("people_dim_location", "location_name", "SOURCE_NATIVE", "frappe_hr", "Branch", "branch", "from silver", "Name", "keep", ""),
        row("people_dim_location", "country", "UNJUSTIFIED", "", "", "", "from silver", "Country", "remove", "Not on Branch."),
        row("people_dim_location", "region", "UNJUSTIFIED", "", "", "", "from silver", "Region", "remove", ""),
        row("people_dim_location", "city", "UNJUSTIFIED", "", "", "", "from silver", "City", "remove", ""),
        row("people_dim_location", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_dim_job", "job_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Designation", "name", "from silver", "Job key", "change", ""),
        row("people_dim_job", "job_title", "SOURCE_NATIVE", "frappe_hr", "Designation", "designation_name", "from silver", "Title", "change", ""),
        row("people_dim_job", "job_family", "UNJUSTIFIED", "", "", "", "from silver", "Family", "remove", "Not on Designation."),
        row("people_dim_job", "job_level", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee Grade", "name", "from silver", "Level", "change", ""),
        row("people_dim_job", "occupation_id", "DERIVED", "onet", "Occupation Data", "O*NET-SOC Code", "from silver", "SOC", "change", "Requires explicit map."),
        row("people_dim_job", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_dim_occupation", "occupation_id", "SOURCE_NATIVE", "onet", "Occupation Data.txt", "O*NET-SOC Code", "normalize strip .00", "Occupation key", "keep", "Live public O*NET db_31_0."),
        row("people_dim_occupation", "soc_code", "SOURCE_NATIVE", "onet", "Occupation Data.txt", "O*NET-SOC Code", "identity", "SOC code", "keep", ""),
        row("people_dim_occupation", "title", "SOURCE_NATIVE", "onet", "Occupation Data.txt", "Title", "identity", "Occupation title", "keep", ""),
        row("people_dim_occupation", "provenance", "CANONICAL_KEY", "onet", "", "", "live_public", "Provenance", "keep", ""),
        row("people_dim_skill", "skill_id", "SOURCE_NATIVE", "onet / frappe_hr", "Essential Skills.txt / Skill", "Element ID / name", "onet_ prefix or synthetic skill_python", "Skill key", "change", "Serving mixes O*NET skills and synthetic PEOPLE_SKILLS. Internal skills must come from Frappe Skill."),
        row("people_dim_skill", "skill_name", "SOURCE_NATIVE", "onet / frappe_hr", "Essential Skills.txt / Skill", "Element Name / skill_name", "identity", "Skill name", "change", ""),
        row("people_dim_skill", "skill_category", "SYNTHETIC_EXTENSION", "", "", "", "onet or technical/behavioral", "Category", "change", "O*NET has its own taxonomy; synthetic categories are not source-native."),
        row("people_dim_skill", "onet_reference", "SOURCE_NATIVE", "onet", "Essential Skills.txt", "Element ID", "identity", "O*NET element", "keep", ""),
        row("people_dim_skill", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "live_public or synthetic_internal", "Provenance", "keep", ""),
        row("people_dim_company", "company_id", "UNJUSTIFIED", "", "", "", "acme_public / northwind_private seed", "External company key", "remove", "Not Frappe Company. Seeded synthetic competitors. Out of HR source contracts. Do not use for People metrics."),
        row("people_dim_company", "company_name", "UNJUSTIFIED", "", "", "", "seed", "Name", "remove", ""),
        row("people_dim_company", "ticker", "UNJUSTIFIED", "", "", "", "seed", "Ticker", "remove", ""),
        row("people_dim_company", "cik", "UNJUSTIFIED", "", "", "", "unused", "CIK", "remove", ""),
        row("people_dim_company", "industry", "UNJUSTIFIED", "", "", "", "seed", "Industry", "remove", ""),
        row("people_dim_company", "hq_country", "UNJUSTIFIED", "", "", "", "seed", "HQ", "remove", ""),
        row("people_dim_company", "public_private", "UNJUSTIFIED", "", "", "", "seed", "Listing flag", "remove", ""),
        row("people_dim_company", "employee_count_latest", "UNJUSTIFIED", "", "", "", "seed", "Headcount", "remove", ""),
        row("people_dim_company", "employee_count_source", "UNJUSTIFIED", "", "", "", "unused", "Source", "remove", ""),
        row("people_dim_company", "company_size_band", "UNJUSTIFIED", "", "", "", "unused", "Size band", "remove", ""),
        row("people_dim_company", "provenance", "CANONICAL_KEY", "", "", "", "synthetic_internal", "Provenance", "remove", ""),
    ]

    # --- marts ---
    out += [
        row("people_mart_workforce_overview", "as_of_month", "DERIVED", "frappe_hr", "Employee", "date_of_joining / relieving_date", "month-end snapshot", "Snapshot month", "keep", "Valid derivation once worker source is Frappe."),
        row("people_mart_workforce_overview", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "from worker.org_id", "Org grain", "change", ""),
        row("people_mart_workforce_overview", "job_family", "UNJUSTIFIED", "", "", "", "from job.job_family", "Family grain", "change", "Cannot remain canonical until a documented family map exists. Interim: designation."),
        row("people_mart_workforce_overview", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name", "from worker.location_id", "Location grain", "change", ""),
        row("people_mart_workforce_overview", "headcount", "DERIVED", "frappe_hr", "Employee", "status, date_of_joining, relieving_date", "count active at month end", "Headcount", "keep", "Rebuild from mapped worker."),
        row("people_mart_workforce_overview", "fte", "UNJUSTIFIED", "", "", "", "sum of worker.fte", "FTE", "remove", "Worker FTE has no source."),
        row("people_mart_workforce_overview", "hires", "DERIVED", "frappe_hr", "Employee", "date_of_joining", "count hire_date in month", "Hires", "keep", ""),
        row("people_mart_workforce_overview", "exits", "DERIVED", "frappe_hr", "Employee", "relieving_date", "count termination_date in month", "Exits", "keep", ""),
        row("people_mart_workforce_overview", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_workforce_overview", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "headcount", "constant", "Metric pointer", "keep", "Governance, not a source field."),
        row("people_mart_retention", "as_of_month", "DERIVED", "frappe_hr", "Employee", "relieving_date", "month", "Month", "keep", ""),
        row("people_mart_retention", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "", "Org", "change", ""),
        row("people_mart_retention", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_retention", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name", "", "Location", "change", ""),
        row("people_mart_retention", "voluntary_exits", "DERIVED", "frappe_hr", "Employee", "reason_for_leaving / relieving_date", "reason contains voluntary", "Voluntary exits", "change", "Reason vocabulary must come from Frappe, not generator labels."),
        row("people_mart_retention", "beginning_headcount", "DERIVED", "frappe_hr", "Employee", "date_of_joining / relieving_date", "prior month-end headcount", "Beginning HC", "keep", ""),
        row("people_mart_retention", "voluntary_attrition_rate", "DERIVED", "frappe_hr", "Employee", "voluntary_exits / beginning_headcount", "division", "Attrition rate", "keep", ""),
        row("people_mart_retention", "regrettable_exits", "UNJUSTIFIED", "", "", "", "voluntary AND job_level in IC4+/manager set", "Regrettable exits", "remove", "Regrettable definition is a hardcoded level set, not a source field. Reintroduce only with an approved mapping from Employee Grade."),
        row("people_mart_retention", "regrettable_attrition_rate", "UNJUSTIFIED", "", "", "", "regrettable_exits / beginning_headcount", "Regrettable rate", "remove", "Depends on regrettable_exits."),
        row("people_mart_retention", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_retention", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "voluntary_attrition", "constant", "Metric pointer", "keep", ""),
        row("people_mart_internal_mobility", "as_of_month", "DERIVED", "frappe_hr", "Employee Transfer / Promotion", "transfer_date / promotion_date", "month of event_date", "Month", "change", "Today uses sampled movement event_date."),
        row("people_mart_internal_mobility", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "", "Org", "change", ""),
        row("people_mart_internal_mobility", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_internal_mobility", "promotions", "DERIVED", "frappe_hr", "Employee Promotion", "name", "count event_type=promotion", "Promotion count", "change", "Must count Promotion source objects, not sampled rows."),
        row("people_mart_internal_mobility", "lateral_moves", "DERIVED", "frappe_hr", "Employee Transfer", "transfer_details.property", "count event_type=lateral", "Lateral count", "change", "A transfer is lateral vs promotion based on source object / designation change, not a random event_type."),
        row("people_mart_internal_mobility", "internal_mobility_rate", "DERIVED", "frappe_hr", "Transfer + Promotion", "counts / headcount", "division", "Mobility rate", "change", ""),
        row("people_mart_internal_mobility", "headcount", "DERIVED", "frappe_hr", "Employee", "status", "month-end HC", "Denominator HC", "keep", ""),
        row("people_mart_internal_mobility", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_internal_mobility", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "internal_mobility_rate", "constant", "Metric pointer", "keep", ""),
        row("people_mart_compensation_equity", "as_of_month", "DERIVED", "frappe_hr", "Salary Structure Assignment", "from_date", "month-end latest assignment", "Month", "change", ""),
        row("people_mart_compensation_equity", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_compensation_equity", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name", "", "Location", "change", ""),
        row("people_mart_compensation_equity", "median_base_usd", "DERIVED", "frappe_hr", "Salary Structure Assignment", "base, currency", "median of latest base_salary", "Median base", "change", "Must convert via assignment.currency; generator forces USD."),
        row("people_mart_compensation_equity", "mean_compa_ratio", "UNJUSTIFIED", "", "", "", "latest_salary / job.base_salary", "Compa ratio", "change", "job.base_salary is unjustified. Compa needs documented midpoint (Grade.default_base_pay or structure)."),
        row("people_mart_compensation_equity", "bls_median_wage", "SOURCE_NATIVE", "bls", "OEWS series", "value", "lookup OEUN* series", "BLS wage", "keep", "Live BLS publicAPI v2."),
        row("people_mart_compensation_equity", "market_position_index", "DERIVED", "bls + frappe_hr", "OEWS + assignment.base", "value, base", "internal median / bls median", "Market position", "change", "Valid after base is source-native."),
        row("people_mart_compensation_equity", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "derived", "Provenance", "keep", ""),
        row("people_mart_compensation_equity", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "compa_ratio", "constant", "Metric pointer", "keep", ""),
        row("people_mart_learning_adoption", "as_of_month", "DERIVED", "frappe_hr", "Training Event", "end_time", "month", "Month", "change", ""),
        row("people_mart_learning_adoption", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "", "Org", "change", ""),
        row("people_mart_learning_adoption", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_learning_adoption", "learning_hours_per_employee", "UNJUSTIFIED", "", "", "", "sum(hours)/headcount from invented hours", "Hours / EE", "remove", "hours column has no Frappe source."),
        row("people_mart_learning_adoption", "completion_rate", "DERIVED", "frappe_hr", "Training Result / Training Event", "employees vs completed", "completions/enrollments", "Completion rate", "change", "Valid after Training Result mapping."),
        row("people_mart_learning_adoption", "participation_rate", "DERIVED", "frappe_hr", "Training Event.employees", "employee", "enrolled workers / HC", "Participation", "change", ""),
        row("people_mart_learning_adoption", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_learning_adoption", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "learning_hours_per_employee", "constant", "Metric pointer", "change", "Metric currently depends on unjustified hours."),
        row("people_mart_recruiting", "as_of_week", "DERIVED", "greenhouse_v3", "jobs / openings", "opened_at", "week grain", "Week", "change", ""),
        row("people_mart_recruiting", "job_family", "UNJUSTIFIED", "", "", "", "from internal job", "Family", "change", ""),
        row("people_mart_recruiting", "location_id", "SYNTHETIC_EXTENSION", "greenhouse_v3", "offices", "id", "", "Location", "change", ""),
        row("people_mart_recruiting", "open_requisitions", "DERIVED", "greenhouse_v3", "jobs / openings", "status / closed_at", "count status=open", "Open reqs", "change", "Count Greenhouse openings/jobs, not REQ rows."),
        row("people_mart_recruiting", "time_to_fill_days", "DERIVED", "greenhouse_v3", "openings / applications / offers", "opened_at, hired timestamps", "hired_on - applied_on from hire_links", "Time to fill", "change", "Must use opening.opened_at to hired application/offer accepted — not applied_on-21d."),
        row("people_mart_recruiting", "offer_acceptance_rate", "DERIVED", "greenhouse_v3", "offers", "status / version", "placeholder / unused in generator path", "Offer accept rate", "change", "Requires offer status history. Not in current ATS tables."),
        row("people_mart_recruiting", "time_in_stage_days", "DERIVED", "greenhouse_v3", "application_stages", "exited_at, entered_at", "mean consecutive stage_entered_on diffs or 11.0", "Time in stage", "change", "Must be timestamp_diff_hours/days(exited_at, entered_at). Default 11.0 is unjustified."),
        row("people_mart_recruiting", "quality_of_hire_index", "DERIVED", "frappe_hr + greenhouse_v3", "Employee.relieving_date + hired application", "relieving_date", "12-month survival of crosswalked hires", "Quality of hire", "change", "Survival is a valid derivation only after real hire crosswalk. Current hire_links are sequential CAND ids."),
        row("people_mart_recruiting", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_recruiting", "metric_id", "CANONICAL_KEY", "people_pipeline", "people_metric_definition", "time_to_fill", "constant", "Metric pointer", "keep", ""),
        row("people_mart_skills", "as_of_month", "DERIVED", "frappe_hr", "Employee Skill", "evaluation_date", "month-end", "Month", "change", ""),
        row("people_mart_skills", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_skills", "skill_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Skill", "name", "PEOPLE_SKILLS", "Skill", "change", ""),
        row("people_mart_skills", "skill_name", "SOURCE_NATIVE", "frappe_hr", "Skill", "skill_name", "lookup", "Name", "change", ""),
        row("people_mart_skills", "workers_with_skill", "DERIVED", "frappe_hr", "Employee Skill", "skill", "count", "Coverage numerator", "keep", ""),
        row("people_mart_skills", "workers_in_family", "DERIVED", "frappe_hr", "Employee", "designation", "count", "Coverage denominator", "change", ""),
        row("people_mart_skills", "internal_coverage_rate", "DERIVED", "frappe_hr", "Employee Skill", "skill", "division", "Coverage", "keep", ""),
        row("people_mart_skills", "gap_rate", "DERIVED", "frappe_hr", "Employee Skill", "skill", "1 - coverage", "Gap", "keep", ""),
        row("people_mart_skills", "is_critical", "UNJUSTIFIED", "", "", "", "hardcoded {python,sql,cloud,data}", "Critical skill flag", "remove", "Not a source field. Reintroduce only with a governed list, not generator constants."),
        row("people_mart_skills", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "derived", "Provenance", "keep", ""),
        row("people_mart_skills", "quality_status", "CANONICAL_KEY", "people_pipeline", "", "", "healthy", "Quality", "keep", ""),
        row("people_mart_manager_effectiveness", "as_of_month", "DERIVED", "frappe_hr", "Employee", "reports_to", "month", "Month", "keep", ""),
        row("people_mart_manager_effectiveness", "org_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Department", "name", "", "Org", "change", ""),
        row("people_mart_manager_effectiveness", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_manager_effectiveness", "manager_count", "DERIVED", "frappe_hr", "Employee", "reports_to", "count distinct managers", "Manager count", "keep", "Valid from reports_to."),
        row("people_mart_manager_effectiveness", "span_of_control", "DERIVED", "frappe_hr", "Employee", "reports_to", "direct reports / managers", "Span", "keep", ""),
        row("people_mart_manager_effectiveness", "manager_turnover_rate", "DERIVED", "frappe_hr", "Employee", "relieving_date where worker is manager", "exits / manager_count", "Manager turnover", "keep", ""),
        row("people_mart_manager_effectiveness", "engagement_score", "UNJUSTIFIED", "", "", "", "avg engagement_score from unjustified survey", "Engagement", "remove", "No engagement source contract. Serving already WARNs when empty."),
        row("people_mart_manager_effectiveness", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_manager_effectiveness", "quality_status", "CANONICAL_KEY", "people_pipeline", "", "", "healthy", "Quality", "keep", ""),
        row("people_mart_attrition_segment", "as_of_month", "DERIVED", "frappe_hr", "Employee", "relieving_date", "month", "Month", "keep", ""),
        row("people_mart_attrition_segment", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "change", ""),
        row("people_mart_attrition_segment", "location_id", "SYNTHETIC_EXTENSION", "frappe_hr", "Branch", "name", "", "Location", "change", ""),
        row("people_mart_attrition_segment", "job_level", "SYNTHETIC_EXTENSION", "frappe_hr", "Employee Grade", "name", "IC/M codes", "Level", "change", ""),
        row("people_mart_attrition_segment", "tenure_band", "DERIVED", "frappe_hr", "Employee", "date_of_joining", "years since hire", "Tenure band", "keep", "Documented derivation."),
        row("people_mart_attrition_segment", "voluntary_exits", "DERIVED", "frappe_hr", "Employee", "reason_for_leaving", "count", "Voluntary exits", "change", ""),
        row("people_mart_attrition_segment", "beginning_headcount", "DERIVED", "frappe_hr", "Employee", "date_of_joining / relieving_date", "prior HC", "Beginning HC", "keep", ""),
        row("people_mart_attrition_segment", "voluntary_attrition_rate", "DERIVED", "frappe_hr", "Employee", "exits/HC", "division", "Rate", "keep", ""),
        row("people_mart_attrition_segment", "median_base_usd", "DERIVED", "frappe_hr", "Salary Structure Assignment", "base", "median", "Pay", "change", ""),
        row("people_mart_attrition_segment", "quality_status", "CANONICAL_KEY", "people_pipeline", "", "", "healthy", "Quality", "keep", ""),
        row("people_mart_attrition_segment", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "synthetic_internal", "Provenance", "change", ""),
        row("people_mart_skill_supply_demand", "as_of_week", "DERIVED", "onet", "", "", "week grain", "Week", "keep", ""),
        row("people_mart_skill_supply_demand", "skill_id", "SOURCE_NATIVE", "onet / frappe_hr", "Skill", "name", "", "Skill", "change", ""),
        row("people_mart_skill_supply_demand", "occupation_id", "SOURCE_NATIVE", "onet", "Occupation Data", "O*NET-SOC Code", "", "Occupation", "keep", ""),
        row("people_mart_skill_supply_demand", "internal_coverage_rate", "DERIVED", "frappe_hr", "Employee Skill", "skill", "coverage", "Internal coverage", "keep", ""),
        row("people_mart_skill_supply_demand", "external_posting_count", "UNJUSTIFIED", "", "", "", "JSearch leftover / unused", "External postings", "remove", "Do not add JSearch. Field has no approved source."),
        row("people_mart_skill_supply_demand", "provenance", "CANONICAL_KEY", "people_pipeline", "", "", "derived", "Provenance", "keep", ""),
        row("people_mart_external_talent_market", "snapshot_date", "UNJUSTIFIED", "", "", "", "unused/empty path", "Snapshot", "remove", "No approved commercial job-posting source. Do not backfill with JSearch."),
        row("people_mart_external_talent_market", "company_id", "UNJUSTIFIED", "", "", "", "people_dim_company", "Company", "remove", ""),
        row("people_mart_external_talent_market", "job_family", "UNJUSTIFIED", "", "", "", "", "Family", "remove", ""),
        row("people_mart_external_talent_market", "open_jobs", "UNJUSTIFIED", "", "", "", "", "Open jobs", "remove", ""),
        row("people_mart_external_talent_market", "median_salary", "UNJUSTIFIED", "", "", "", "", "Median salary", "remove", ""),
        row("people_mart_external_talent_market", "provenance", "CANONICAL_KEY", "", "", "", "", "Provenance", "remove", ""),
        row("people_external_learning_content", "content_id", "SOURCE_NATIVE", "microsoft_learn", "catalog", "uid / id / url", "identity", "Catalog id", "keep", "Live Microsoft Learn catalog. Separate from internal Training Event."),
        row("people_external_learning_content", "content_type", "SOURCE_NATIVE", "microsoft_learn", "catalog", "collection key", "modules→module etc", "Type", "keep", ""),
        row("people_external_learning_content", "title", "SOURCE_NATIVE", "microsoft_learn", "catalog", "title / name", "identity", "Title", "keep", ""),
        row("people_external_learning_content", "level", "SOURCE_NESTED", "microsoft_learn", "catalog", "levels[]", "join list", "Level", "keep", ""),
        row("people_external_learning_content", "url", "SOURCE_NATIVE", "microsoft_learn", "catalog", "url", "identity", "URL", "keep", ""),
        row("people_external_learning_content", "provider", "CANONICAL_KEY", "microsoft_learn", "", "", "constant microsoft_learn", "Provider", "keep", ""),
        row("people_external_learning_content", "last_modified", "SOURCE_NATIVE", "microsoft_learn", "catalog", "last_modified / lastModified", "identity", "Source modified", "keep", ""),
        row("people_external_learning_content", "ingested_at", "CANONICAL_KEY", "people_pipeline", "ingestion_run", "", "pipeline clock", "Ingested", "keep", ""),
        row("people_external_learning_content", "provenance", "CANONICAL_KEY", "microsoft_learn", "", "", "live_public", "Provenance", "keep", ""),
    ]

    # live bronze that already exists
    out += [
        row("people_bronze.people_learn_catalog", "content_id", "SOURCE_NATIVE", "microsoft_learn", "catalog", "uid", "identity", "Catalog id", "keep", "Already source-shaped. Add raw payload + ingestion_run_id."),
        row("people_bronze.people_bls_series", "series_id", "SOURCE_NATIVE", "bls", "publicAPI/v2", "seriesID", "identity", "BLS series", "keep", ""),
        row("people_bronze.people_bls_series", "source_period", "SOURCE_NATIVE", "bls", "publicAPI/v2", "year + period", "concat", "Period", "keep", ""),
        row("people_bronze.people_bls_series", "value", "SOURCE_NATIVE", "bls", "publicAPI/v2", "value", "identity", "Observation", "keep", ""),
        row("people_bronze.people_bls_series", "metric", "DERIVED", "bls", "publicAPI/v2", "seriesID", "local SERIES map", "Metric label", "keep", "Documented series→metric map in people_bls.py."),
        row("people_bronze.people_bls_series", "unit", "DERIVED", "bls", "publicAPI/v2", "seriesID", "local SERIES map", "Unit", "keep", ""),
        row("people_bronze.people_onet.occupation", "(O*NET text columns)", "SOURCE_NATIVE", "onet", "Occupation Data.txt", "(file columns)", "identity", "Occupation extract", "keep", "Bronze already mirrors db_31_0 files."),
    ]

    seen = set()
    unique = []
    for item in out:
        key = (item["dataset"], item["column"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def write_md(items: list[dict[str, str]]) -> str:
    counts = Counter(item["classification"] for item in items)
    decisions = Counter(item["keep_change_remove"] for item in items)
    unjustified = [item for item in items if item["classification"] == "UNJUSTIFIED"]
    lines = [
        "# People field provenance audit",
        "",
        "Status: **read-only**. No warehouse tables were altered.",
        "",
        "Audit date: 2026-08-31.",
        "",
        "Current Bronze/Silver HR and ATS tables are produced by `people_synthetic/people_generate.py` (`globaltech_hris`, `globaltech_ats`, `globaltech_lms`). They are **not** Frappe HR or Greenhouse Harvest v3 payloads. Serving dims/marts are rebuilt from that silver. There are **no** `people_fact_*` tables in Postgres; gold parquet still copies `people_fact_*` frames.",
        "",
        "## Classification counts",
        "",
        "| classification | fields |",
        "| --- | ---: |",
    ]
    for key in [
        "SOURCE_NATIVE",
        "SOURCE_NESTED",
        "CANONICAL_KEY",
        "DERIVED",
        "SYNTHETIC_EXTENSION",
        "UNJUSTIFIED",
    ]:
        lines.append(f"| {key} | {counts.get(key, 0)} |")
    lines += [
        "",
        f"| **total** | **{len(items)}** |",
        "",
        "## Keep / change / remove",
        "",
        "| decision | fields |",
        "| --- | ---: |",
        f"| keep | {decisions.get('keep', 0)} |",
        f"| change | {decisions.get('change', 0)} |",
        f"| remove | {decisions.get('remove', 0)} |",
        "",
        "## Classification rules used",
        "",
        "| class | meaning |",
        "| --- | --- |",
        "| SOURCE_NATIVE | Field exists on a pinned source object with the same meaning. |",
        "| SOURCE_NESTED | Nested source property or child table. |",
        "| CANONICAL_KEY | Surrogate, crosswalk, or allowed ingestion metadata (`ingested_at`, provenance). |",
        "| DERIVED | Deterministic function of source fields, documented in a mapping. |",
        "| SYNTHETIC_EXTENSION | Generator invented the field or the identifier shape. Concept may map after rename. |",
        "| UNJUSTIFIED | No source field and no approved derivation. Must not remain in canonical Silver/Gold. |",
        "",
        "## UNJUSTIFIED fields (must be reviewed)",
        "",
        "Every row below is unexplained relative to Frappe HR, Greenhouse v3, Microsoft Learn, O*NET, or BLS.",
        "",
        "| dataset | column | keep_change_remove | notes |",
        "| --- | --- | --- | --- |",
    ]
    for item in unjustified:
        note = item["notes"].replace("|", "/")
        lines.append(
            f"| `{item['dataset']}` | `{item['column']}` | {item['keep_change_remove']} | {note} |"
        )
    lines += [
        "",
        "## Findings that block treating current marts as source-true",
        "",
        "1. **Worker movement** is a wide `people_movement` table with sampled `location_transfer` dates. Frappe Employee Transfer uses `transfer_date` plus child **Employee Property History** (`property`, `current`, `new`).",
        "2. **Recruiting** flattens Candidate←Requisition. Greenhouse v3 is Candidate 1→many Applications, with stage history on `/v3/application_stages` (`entered_at`, `exited_at`). `exited_at` is not stored. `time_in_stage_days` falls back to **11.0**.",
        "3. **Hires** link workers to sequential `CAND0000001` ids, not to the application that was hired.",
        "4. **Demographics** (`ethnicity_band`, `generation`) sit on the worker. Greenhouse EEOC / demographic answers are **application** grain. Frappe Employee has `gender` and `date_of_birth` but no ethnicity.",
        "5. **FTE**, **pay_multiplier**, **job.base_salary**, **is_manager**, **job_family**, **engagement_score**, **learning hours**, **is_critical**, and **regrettable_exits** have no pinned source field.",
        "6. **Microsoft Learn / O*NET / BLS** bronze is already closer to source-native and should be kept separate from internal HR/ATS.",
        "",
        "Machine-readable copy: `docs/PEOPLE_FIELD_PROVENANCE_AUDIT.csv`.",
        "",
        "Architecture follow-up (no migration yet): `docs/PEOPLE_SOURCE_CONTRACT_FIRST.md`.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    items = rows()
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLS)
        writer.writeheader()
        writer.writerows(items)
    OUT_MD.write_text(write_md(items), encoding="utf-8")
    counts = Counter(item["classification"] for item in items)
    print("wrote", OUT_CSV, "rows", len(items), dict(counts))
    print("wrote", OUT_MD)


if __name__ == "__main__":
    main()
