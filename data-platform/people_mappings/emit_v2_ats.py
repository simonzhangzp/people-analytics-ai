from __future__ import annotations

from emit_v2_mappings import F, SCD, file_doc


def greenhouse_mappings() -> dict:
    return {
        "greenhouse_user.yml": file_doc(
            "user",
            "T8: user.employee_id = Employee.name. Field is deactivated, not disabled. Do not join on primary_email.",
            {"pin": "schemas/fields/user.fields.json"},
            [
                F("people_xw_identity", "source_id", "greenhouse_v3", "user", "id", "identity", False, "text", "created_at", "SOURCE_NATIVE", "Harvest user.id."),
                F("people_xw_identity", "match_method", "greenhouse_v3", "user", "employee_id", "employee_id when user.employee_id = Employee.name", False, "text", "created_at", "CANONICAL_KEY", "T8. Never email."),
            ],
        ),
        "greenhouse_source.yml": file_doc(
            "source",
            "Harvest source.type is a nested object with a name.",
            {"pin": "schemas/fields/source.fields.json"},
            [
                F("people_dim_source", "id", "greenhouse_v3", "source", "id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Source.id."),
                F("people_dim_source", "name", "greenhouse_v3", "source", "name", "identity", False, "text", "created_at", "SOURCE_NATIVE", "Source label."),
                F("people_dim_source", "type", "greenhouse_v3", "source", "type", "type.name when type is object", True, "text", "created_at", "SOURCE_NATIVE", "Sourcing strategy name."),
            ],
        ),
        "greenhouse_rejection_reason.yml": file_doc(
            "rejection_reason",
            "type is a nested object.",
            {"pin": "schemas/fields/rejection_reason.fields.json"},
            [
                F("people_dim_rejection_reason", "id", "greenhouse_v3", "rejection_reason", "id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Reason.id."),
                F("people_dim_rejection_reason", "name", "greenhouse_v3", "rejection_reason", "name", "identity", False, "text", "created_at", "SOURCE_NATIVE", "Reason label."),
                F("people_dim_rejection_reason", "type", "greenhouse_v3", "rejection_reason", "type", "type.name when type is object", True, "text", "created_at", "SOURCE_NATIVE", "We rejected them | They rejected us | …"),
            ],
        ),
        "greenhouse_candidate.yml": file_doc(
            "candidate",
            "Candidate is not an application. person_id is null until T1. first_source_id is derived from the earliest application.source_id.",
            {"pin": "schemas/fields/candidate.fields.json"},
            [
                F("people_dim_candidate", "candidate_id", "greenhouse_v3", "candidate", "id", "canonical key = Harvest candidate.id", False, "bigint", "created_at", "CANONICAL_KEY", "Candidate key."),
                F("people_dim_candidate", "gh_candidate_id", "greenhouse_v3", "candidate", "id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Harvest candidate.id."),
                F("people_dim_candidate", "person_id", "greenhouse_v3", "offer", "application_id", "filled after T1 via xw_identity; null before hire", True, "uuid", "starts_on", "CANONICAL_KEY", "Person after accepted offer."),
                F("people_dim_candidate", "created_at", "greenhouse_v3", "candidate", "created_at", "identity", False, "timestamptz", "created_at", "SOURCE_NATIVE", "Candidate created_at."),
                F("people_dim_candidate", "first_source_id", "greenhouse_v3", "application", "source_id", "source_id of the earliest application for this candidate", True, "bigint", "created_at", "DERIVED", "First attributed source. Candidate has no source_id."),
            ],
        ),
        "greenhouse_application.yml": file_doc(
            "application",
            "applied_at ← created_at (BR-TA-003). Requisition via job_id + opening (BR-TA-002). referrer_person_id via referrer.user_id → user.employee_id. Harvest has no separate credited user field.",
            {"pin": "schemas/fields/application.fields.json"},
            [
                F("people_fact_application", "application_id", "greenhouse_v3", "application", "id", "identity", False, "bigint", "created_at", "CANONICAL_KEY", "Harvest application.id."),
                F("people_fact_application", "candidate_id", "greenhouse_v3", "application", "candidate_id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Candidate of this application."),
                F("people_fact_application", "requisition_id", "greenhouse_v3", "application", "job_id", "opening.id for this job_id (BR-TA-002); prospect uses prospective_job_ids[0] only when job_id is null", True, "bigint", "created_at", "DERIVED", "Requisition = opening. No jobs[] array on Harvest v3 application."),
                F("people_fact_application", "applied_at", "greenhouse_v3", "application", "created_at", "identity (BR-TA-003)", False, "timestamptz", "created_at", "SOURCE_NATIVE", "Harvest has no applied_at; created_at is the apply timestamp."),
                F("people_fact_application", "status", "greenhouse_v3", "application", "status", "in_process→active; rejected→rejected; hired→hired; converted stays converted then treated as active (BR-TA-004)", False, "text", "updated_at", "DERIVED", "Canonical active | rejected | hired."),
                F("people_fact_application", "rejected_at", "greenhouse_v3", "application", "rejected_at", "identity", True, "timestamptz", "rejected_at", "SOURCE_NATIVE", "Rejection timestamp."),
                F("people_fact_application", "hired_at", "greenhouse_v3", "application", "status", "when status=hired use accepted offer.resolved_at, else null (BR-TA-005)", True, "timestamptz", "resolved_at", "DERIVED", "No Harvest hired_at field."),
                F("people_fact_application", "source_id", "greenhouse_v3", "application", "source_id", "identity", True, "bigint", "created_at", "SOURCE_NATIVE", "Attributed source."),
                F("people_fact_application", "referrer_person_id", "greenhouse_v3", "referrer", "user_id", "application.referrer_id → referrer.user_id → user.employee_id → person_id; null if referrer.user_id is null. Not a distinct credited_to field.", True, "uuid", "created_at", "DERIVED", "Referrer person when the referrer maps to an employee_id. Harvest v3 has referrer_id only."),
                F("people_fact_application", "rejection_reason_id", "greenhouse_v3", "application", "rejection_reason_id", "identity", True, "bigint", "rejected_at", "SOURCE_NATIVE", "Rejection reason id."),
                F("people_fact_application", "rejection_type", "greenhouse_v3", "rejection_reason", "type", "type.name via rejection_reason_id", True, "text", "rejected_at", "SOURCE_NATIVE", "Reason type."),
                F("people_fact_application", "current_stage_id", "greenhouse_v3", "application", "job_interview_stage_id", "identity; not stage_id", True, "bigint", "updated_at", "SOURCE_NATIVE", "Current job_interview_stage."),
            ],
        ),
        "greenhouse_application_stage.yml": file_doc(
            "application_stage",
            "Do not persist days_in_stage. Time-in-stage is gold/metric from entered_at/exited_at.",
            {"pin": "schemas/fields/application_stage.fields.json"},
            [
                F("people_evt_application_stage", "application_id", "greenhouse_v3", "application_stage", "application_id", "identity", False, "bigint", "entered_at", "SOURCE_NATIVE", "Application of the stage entry."),
                F("people_evt_application_stage", "stage_id", "greenhouse_v3", "application_stage", "job_interview_stage_id", "identity", False, "bigint", "entered_at", "SOURCE_NATIVE", "Stage definition id."),
                F("people_evt_application_stage", "entered_at", "greenhouse_v3", "application_stage", "entered_at", "identity", True, "timestamptz", "entered_at", "SOURCE_NATIVE", "Stage entry time."),
                F("people_evt_application_stage", "exited_at", "greenhouse_v3", "application_stage", "exited_at", "identity", True, "timestamptz", "exited_at", "SOURCE_NATIVE", "Null while current."),
                F("people_evt_application_stage", "is_current", "greenhouse_v3", "application_stage", "current", "identity", False, "boolean", "entered_at", "SOURCE_NATIVE", "Harvest field is current, not is_current."),
            ],
        ),
        "greenhouse_job_opening.yml": file_doc(
            "requisition",
            "Requisition = opening. Status from open + closed_at (BR-TA-006). Hiring manager from job_hiring_manager. Recruiter from application.recruiter_id via T8.",
            {"pin": ["schemas/fields/opening.fields.json", "schemas/fields/job.fields.json", "schemas/fields/job_hiring_manager.fields.json"]},
            [
                F("people_dim_requisition", "requisition_id", "greenhouse_v3", "opening", "id", "identity", False, "bigint", "opened_at", "CANONICAL_KEY", "Opening.id is the requisition key."),
                F("people_dim_requisition", "gh_job_id", "greenhouse_v3", "opening", "job_id", "identity", False, "bigint", "opened_at", "SOURCE_NATIVE", "Parent job."),
                F("people_dim_requisition", "gh_opening_id", "greenhouse_v3", "opening", "id", "identity", False, "bigint", "opened_at", "SOURCE_NATIVE", "Opening.id."),
                F("people_dim_requisition", "job_id", "greenhouse_v3", "job", "name", "map job.name through people_xw_job.frappe_designation; null until mapped", True, "text", "opened_at", "CANONICAL_KEY", "Canonical job. Harvest job.name is not Frappe Designation."),
                F("people_dim_requisition", "org_id", "greenhouse_v3", "job", "department_id", "via people_xw_org.gh_department_id", True, "text", "opened_at", "CANONICAL_KEY", "Org from GH department crosswalk."),
                F("people_dim_requisition", "location_id", "greenhouse_v3", "job", "office_ids", "first office_ids[] via people_xw_location.gh_office_id", True, "text", "opened_at", "CANONICAL_KEY", "Location from first office."),
                F("people_dim_requisition", "hiring_manager_person_id", "greenhouse_v3", "job_hiring_manager", "user_id", "user.employee_id → person_id (T8)", True, "uuid", "opened_at", "DERIVED", "Hiring manager from /v3/job_hiring_managers."),
                F("people_dim_requisition", "recruiter_person_id", "greenhouse_v3", "application", "recruiter_id", "responsible recruiter user → employee_id → person_id; job has no recruiter field", True, "uuid", "opened_at", "DERIVED", "Recruiter from application.recruiter_id."),
                F("people_dim_requisition", "opened_at", "greenhouse_v3", "opening", "opened_at", "identity", True, "timestamptz", "opened_at", "SOURCE_NATIVE", "Opening opened_at."),
                F("people_dim_requisition", "closed_at", "greenhouse_v3", "opening", "closed_at", "identity", True, "timestamptz", "closed_at", "SOURCE_NATIVE", "Opening closed_at."),
                F("people_dim_requisition", "status", "greenhouse_v3", "opening", ["open", "closed_at"], "open=true → open; else closed (BR-TA-006)", False, "text", "updated_at", "DERIVED", "Harvest opening has no status enum."),
                F("people_dim_requisition", "close_reason", "greenhouse_v3", "opening", "close_reason_id", "identity id; resolve label later", True, "bigint", "closed_at", "SOURCE_NATIVE", "close_reason_id."),
                F("people_dim_requisition", "hired_application_id", "greenhouse_v3", "opening", "application_id", "identity", True, "bigint", "closed_at", "SOURCE_NATIVE", "Application that filled the opening."),
            ],
        ),
        "greenhouse_job_interview_stage.yml": file_doc(
            "stage",
            "priority ← sort_order. canonical_stage from name tokens (BR-TA-001).",
            {"pin": "schemas/fields/job_interview_stage.fields.json"},
            [
                F("people_dim_stage", "stage_id", "greenhouse_v3", "job_interview_stage", "id", "identity", False, "bigint", "created_at", "CANONICAL_KEY", "job_interview_stage.id."),
                F("people_dim_stage", "gh_job_id", "greenhouse_v3", "job_interview_stage", "job_id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Parent job."),
                F("people_dim_stage", "stage_name", "greenhouse_v3", "job_interview_stage", "name", "identity", False, "text", "created_at", "SOURCE_NATIVE", "Stage label."),
                F("people_dim_stage", "priority", "greenhouse_v3", "job_interview_stage", "sort_order", "identity", False, "integer", "created_at", "SOURCE_NATIVE", "Harvest field is sort_order, not priority."),
                F("people_dim_stage", "canonical_stage", "greenhouse_v3", "job_interview_stage", "name", "Review|Screen|Onsite|Offer from name tokens (BR-TA-001)", False, "text", "created_at", "DERIVED", "Canonical funnel bucket."),
            ],
        ),
        "greenhouse_department.yml": file_doc(
            "gh_department",
            "Feeds people_xw_org only. Not a second org spine.",
            {"pin": "schemas/fields/department.fields.json"},
            [
                F("people_xw_org", "gh_department_id", "greenhouse_v3", "department", "id", "identity", True, "integer", SCD, "SOURCE_NATIVE", "Harvest department.id."),
            ],
        ),
        "greenhouse_office.yml": file_doc(
            "gh_office",
            "office.location is free-text and is not the join key.",
            {"pin": "schemas/fields/office.fields.json"},
            [
                F("people_xw_location", "gh_office_id", "greenhouse_v3", "office", "id", "identity", True, "integer", SCD, "SOURCE_NATIVE", "Harvest office.id."),
            ],
        ),
        "greenhouse_referrer.yml": file_doc(
            "referrer",
            "applications.referrer_id points at referrer.id, not user_id.",
            {"pin": "schemas/fields/referrer.fields.json"},
            [
                F("people_fact_application", "referrer_person_id", "greenhouse_v3", "referrer", ["id", "user_id"], "referrer_id → referrer.user_id → user.employee_id", True, "uuid", "created_at", "DERIVED", "Referrer person. Not a separate credited-to user."),
            ],
        ),
        "greenhouse_interview.yml": file_doc(
            "interview",
            "Scheduled interviews are Harvest interview, not job_interview. Interviewers are not on the interview schema; use scorecard.interviewer_id (BR-TA-009).",
            {"pin": "schemas/fields/interview.fields.json"},
            [
                F("people_fact_interview", "interview_id", "greenhouse_v3", "interview", "id", "identity", False, "bigint", "starts_at", "CANONICAL_KEY", "Harvest interview.id."),
                F("people_fact_interview", "application_id", "greenhouse_v3", "interview", "application_id", "identity", False, "bigint", "starts_at", "SOURCE_NATIVE", "Application."),
                F("people_fact_interview", "stage_id", "greenhouse_v3", "job_interview", "job_interview_stage_id", "interview.job_interview_id → job_interview.job_interview_stage_id", True, "bigint", "starts_at", "DERIVED", "Stage via job_interview slot."),
                F("people_fact_interview", "start_at", "greenhouse_v3", "interview", "starts_at", "coalesce(starts_at, all_day_start_on)", True, "timestamptz", "starts_at", "SOURCE_NATIVE", "Harvest field is starts_at."),
                F("people_fact_interview", "end_at", "greenhouse_v3", "interview", "ends_at", "coalesce(ends_at, all_day_end_on)", True, "timestamptz", "ends_at", "SOURCE_NATIVE", "Harvest field is ends_at."),
                F("people_fact_interview", "status", "greenhouse_v3", "interview", "status", "identity", False, "text", "updated_at", "SOURCE_NATIVE", "Interview lifecycle status."),
                F("people_fact_interview", "interviewer_person_ids", "greenhouse_v3", "scorecard", "interviewer_id", "array_agg distinct interviewer_id → person_id for this application/kit (BR-TA-009)", True, "uuid[]", "submitted_at", "DERIVED", "Interview schema has no interviewers[]."),
            ],
        ),
        "greenhouse_scorecard.yml": file_doc(
            "scorecard",
            "overall_recommendation ← candidate_rating. submitted_by ← submitter_id. interview_id via BR-TA-008.",
            {"pin": "schemas/fields/scorecard.fields.json"},
            [
                F("people_fact_scorecard", "scorecard_id", "greenhouse_v3", "scorecard", "id", "identity", False, "bigint", "submitted_at", "CANONICAL_KEY", "Scorecard.id."),
                F("people_fact_scorecard", "application_id", "greenhouse_v3", "scorecard", "application_id", "identity", False, "bigint", "submitted_at", "SOURCE_NATIVE", "Application."),
                F("people_fact_scorecard", "interview_id", "greenhouse_v3", "scorecard", ["application_id", "interview_kit_id", "interviewed_at"], "join interview on application_id and job_interview_id/interview_kit (BR-TA-008)", True, "bigint", "interviewed_at", "DERIVED", "Scorecard has interview_kit_id, not interview_id."),
                F("people_fact_scorecard", "submitted_by_person_id", "greenhouse_v3", "scorecard", "submitter_id", "submitter_id → user.employee_id → person_id", True, "uuid", "submitted_at", "DERIVED", "Harvest field is submitter_id."),
                F("people_fact_scorecard", "submitted_at", "greenhouse_v3", "scorecard", "submitted_at", "identity", True, "timestamptz", "submitted_at", "SOURCE_NATIVE", "Submit time. Null while draft."),
                F("people_fact_scorecard", "overall_recommendation", "greenhouse_v3", "scorecard", "candidate_rating", "identity", True, "text", "submitted_at", "SOURCE_NATIVE", "Harvest field is candidate_rating."),
            ],
        ),
        "greenhouse_offer.yml": file_doc(
            "offer",
            "T1 trigger. starts_at ← starts_on. sent_at ← sent_on. Status mapped to lowercase (BR-TA-007).",
            {"pin": "schemas/fields/offer.fields.json"},
            [
                F("people_fact_offer", "offer_id", "greenhouse_v3", "offer", "id", "identity", False, "bigint", "created_at", "CANONICAL_KEY", "Offer.id."),
                F("people_fact_offer", "version", "greenhouse_v3", "offer", "version", "identity", False, "integer", "created_at", "SOURCE_NATIVE", "Offer version."),
                F("people_fact_offer", "application_id", "greenhouse_v3", "offer", "application_id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Application."),
                F("people_fact_offer", "requisition_id", "greenhouse_v3", "offer", "opening_id", "identity; fallback BR-TA-002 from job_id when opening_id is null", True, "bigint", "created_at", "SOURCE_NATIVE", "Opening this offer fills."),
                F("people_fact_offer", "created_at", "greenhouse_v3", "offer", "created_at", "identity", False, "timestamptz", "created_at", "SOURCE_NATIVE", "Offer created_at."),
                F("people_fact_offer", "sent_at", "greenhouse_v3", "offer", "sent_on", "cast date to timestamptz noon UTC", True, "timestamptz", "sent_on", "SOURCE_NATIVE", "Harvest field is sent_on."),
                F("people_fact_offer", "resolved_at", "greenhouse_v3", "offer", "resolved_at", "identity", True, "timestamptz", "resolved_at", "SOURCE_NATIVE", "Accepted/Rejected timestamp."),
                F("people_fact_offer", "starts_at", "greenhouse_v3", "offer", "starts_on", "cast date; this is T1 joining date into Employee.date_of_joining", True, "date", "starts_on", "SOURCE_NATIVE", "Harvest field is starts_on."),
                F("people_fact_offer", "status", "greenhouse_v3", "offer", "status", "Created→unresolved; Accepted→accepted; Rejected→rejected; Deprecated→deprecated (BR-TA-007)", False, "text", "updated_at", "DERIVED", "Canonical lowercase status."),
                F("people_dim_worker", "hire_date", "greenhouse_v3", "offer", "starts_on", "T1: Employee.date_of_joining ← offer.starts_on when Accepted", False, "date", "starts_on", "SOURCE_NATIVE", "Hire date from accepted offer."),
            ],
        ),
        "greenhouse_eeoc.yml": file_doc(
            "eeoc",
            "Application grain. Nested {id, description} unwrapped. Never join to worker (BR-GOV-001).",
            {"pin": "schemas/fields/eeoc.fields.json"},
            [
                F("people_fact_candidate_eeoc_restricted", "application_id", "greenhouse_v3", "eeoc", "application_id", "identity", False, "bigint", "submitted_at", "SOURCE_NATIVE", "Application grain. Not candidate grain."),
                F("people_fact_candidate_eeoc_restricted", "race", "greenhouse_v3", "eeoc", "race", "race.description", True, "text", "submitted_at", "SOURCE_NATIVE", "Unwrap nested description."),
                F("people_fact_candidate_eeoc_restricted", "gender", "greenhouse_v3", "eeoc", "gender", "gender.description", True, "text", "submitted_at", "SOURCE_NATIVE", "Unwrap nested description."),
                F("people_fact_candidate_eeoc_restricted", "veteran_status", "greenhouse_v3", "eeoc", "veteran_status", "veteran_status.description", True, "text", "submitted_at", "SOURCE_NATIVE", "Unwrap nested description."),
                F("people_fact_candidate_eeoc_restricted", "disability_status", "greenhouse_v3", "eeoc", "disability_status", "disability_status.description", True, "text", "submitted_at", "SOURCE_NATIVE", "Unwrap nested description."),
                F("people_fact_candidate_eeoc_restricted", "submitted_at", "greenhouse_v3", "eeoc", "submitted_at", "identity", True, "timestamptz", "submitted_at", "SOURCE_NATIVE", "Questionnaire submit time."),
            ],
        ),
        "greenhouse_demographics.yml": file_doc(
            "demographics",
            "Application grain. Never join to worker (BR-GOV-001).",
            {"pin": "schemas/fields/demographic_answer.fields.json"},
            [
                F("people_fact_candidate_demographic_restricted", "application_id", "greenhouse_v3", "demographic_answer", "application_id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Application grain."),
                F("people_fact_candidate_demographic_restricted", "question_id", "greenhouse_v3", "demographic_answer", "demographic_question_id", "identity", False, "bigint", "created_at", "SOURCE_NATIVE", "Harvest field is demographic_question_id."),
                F("people_fact_candidate_demographic_restricted", "answer_option_id", "greenhouse_v3", "demographic_answer", "demographic_answer_option_id", "identity", True, "bigint", "created_at", "SOURCE_NATIVE", "Harvest field is demographic_answer_option_id."),
                F("people_fact_candidate_demographic_restricted", "free_form_text", "greenhouse_v3", "demographic_answer", "free_form_text", "identity", True, "text", "created_at", "SOURCE_NATIVE", "Free-form text."),
                F("people_fact_candidate_demographic_restricted", "submitted_at", "greenhouse_v3", "demographic_answer", "created_at", "identity; no submitted_at on demographic_answer", False, "timestamptz", "created_at", "SOURCE_NATIVE", "Answer created_at."),
            ],
        ),
    }


def ext_mappings() -> dict:
    return {
        "engagement_ext.yml": file_doc(
            "engagement",
            "E5. Item-level survey_response stays in the lake. Serving is worker × wave × dimension with min cell 5.",
            {"pin": "people_source_contracts/engagement_ext/", "docs": "docs/ENGAGEMENT_INSTRUMENT.md"},
            [
                F("people_dim_survey_item", "item_id", "engagement_ext", "survey_instrument", "item_id", "identity", False, "text", "instrument_version", "SYNTHETIC_EXTENSION", "E5 item id."),
                F("people_dim_survey_item", "dimension", "engagement_ext", "survey_instrument", "dimension", "identity", False, "text", "instrument_version", "SYNTHETIC_EXTENSION", "engagement | manager | growth | wellbeing."),
                F("people_dim_survey_item", "reverse", "engagement_ext", "survey_instrument", "reverse", "identity", False, "boolean", "instrument_version", "SYNTHETIC_EXTENSION", "Reverse-scored flag."),
                F("people_dim_survey_item", "prompt", "engagement_ext", "survey_instrument", "prompt", "identity", False, "text", "instrument_version", "SYNTHETIC_EXTENSION", "Item text."),
                F("people_dim_survey_item", "instrument_version", "engagement_ext", "survey_instrument", "instrument_version", "identity", False, "text", "instrument_version", "SYNTHETIC_EXTENSION", "engagement_ext.instrument.v1."),
                F("people_dim_survey_wave", "wave_id", "engagement_ext", "survey_wave", "wave_id", "identity", False, "text", "start_date", "SYNTHETIC_EXTENSION", "Wave key."),
                F("people_dim_survey_wave", "instrument_version", "engagement_ext", "survey_wave", "instrument_version", "identity", False, "text", "start_date", "SYNTHETIC_EXTENSION", "Instrument used."),
                F("people_dim_survey_wave", "start_date", "engagement_ext", "survey_wave", "start_date", "identity", False, "date", "start_date", "SYNTHETIC_EXTENSION", "Wave start."),
                F("people_dim_survey_wave", "end_date", "engagement_ext", "survey_wave", "end_date", "identity", False, "date", "end_date", "SYNTHETIC_EXTENSION", "Wave end."),
                F("people_dim_survey_wave", "target_population", "engagement_ext", "survey_wave", "target_population", "identity", False, "text", "start_date", "SYNTHETIC_EXTENSION", "Active workers as of start_date."),
                F("people_dim_survey_wave", "response_rate", "engagement_ext", "survey_wave", "response_rate", "identity", True, "numeric", "end_date", "SYNTHETIC_EXTENSION", "Completed / invited."),
                F("people_fact_survey_score_restricted", "worker_id", "engagement_ext", "survey_response", "worker_id", "identity", False, "text", "wave_id", "SYNTHETIC_EXTENSION", "Respondent worker."),
                F("people_fact_survey_score_restricted", "wave_id", "engagement_ext", "survey_response", "wave_id", "identity", False, "text", "wave_id", "SYNTHETIC_EXTENSION", "Wave."),
                F("people_fact_survey_score_restricted", "dimension", "engagement_ext", "survey_instrument", "dimension", "group items by dimension", False, "text", "wave_id", "SYNTHETIC_EXTENSION", "Dimension key."),
                F("people_fact_survey_score_restricted", "score_mean", "engagement_ext", "survey_response", "score", "mean of reverse-adjusted Likert (BR-E5-001)", False, "numeric", "wave_id", "DERIVED", "Dimension mean after reverse scoring."),
                F("people_fact_survey_score_restricted", "items_answered", "engagement_ext", "survey_response", "item_id", "count of items in the dimension with a score", False, "integer", "wave_id", "DERIVED", "Item completion count."),
            ],
        ),
        "microsoft_learn.yml": file_doc(
            "learn",
            "Catalog keys actually extracted: uid/id/url, title, levels, products. duration_minutes and roles[] are [Learn schema gap].",
            {"pin": "people_source_contracts/microsoft_learn/VERSION", "connector": "people_ingestion/people_learn.py"},
            [
                F("people_dim_learning_resource", "resource_id", "microsoft_learn", "catalog", "uid", "coalesce(uid, id, url)", False, "text", "last_modified", "SOURCE_NATIVE", "Catalog identity."),
                F("people_dim_learning_resource", "source", "microsoft_learn", "catalog", None, "literal microsoft_learn", False, "text", "last_modified", "CANONICAL_KEY", "External catalog."),
                F("people_dim_learning_resource", "title", "microsoft_learn", "catalog", "title", "coalesce(title, name)", False, "text", "last_modified", "SOURCE_NATIVE", "Catalog title."),
                F("people_dim_learning_resource", "url", "microsoft_learn", "catalog", "url", "identity", True, "text", "last_modified", "SOURCE_NATIVE", "Catalog url."),
                F("people_dim_learning_resource", "level", "microsoft_learn", "catalog", "levels", "join levels[] or scalar level", True, "text", "last_modified", "SOURCE_NATIVE", "Catalog levels."),
                F("people_dim_learning_resource", "duration_minutes", "microsoft_learn", "catalog", None, "null — not in current catalog extract [Learn schema gap]", True, "integer", "last_modified", "SOURCE_GAP", "Do not invent duration_minutes."),
                F("people_dim_learning_resource", "roles", "microsoft_learn", "catalog", None, "null — not in current catalog extract [Learn schema gap]", True, "text[]", "last_modified", "SOURCE_GAP", "Do not invent roles[]."),
                F("people_dim_learning_resource", "products", "microsoft_learn", "catalog", "products", "identity array", True, "text[]", "last_modified", "SOURCE_NATIVE", "Catalog products."),
            ],
        ),
        "onet.yml": file_doc(
            "onet",
            "trust: data_only. Feeds job/skill crosswalks and people_ref_job_skill_target.",
            {"pin": "db_31_0_text.zip"},
            [
                F("people_xw_job", "onet_soc_code", "onet", "Occupation Data.txt", "O*NET-SOC Code", "strip trailing .00", True, "text", "current", "SOURCE_NATIVE", "SOC code."),
                F("people_dim_job", "job_name", "onet", "Occupation Data.txt", "Title", "used only to validate the constructed Designation map; canonical job_name remains Designation.designation_name", True, "text", "current", "SOURCE_NATIVE", "O*NET title for QA."),
                F("people_xw_skill", "onet_element_id", "onet", "Essential Skills.txt", "Element ID", "identity", True, "text", "current", "SOURCE_NATIVE", "O*NET element id."),
            ],
        ),
        "bls.yml": file_doc(
            "bls",
            "trust: data_only. Calibrates simulator rates. Not a §5 silver table.",
            {"pin": "publicAPI/v2", "connector": "people_ingestion/people_bls.py"},
            [
                F("people_bronze", "_source_id", "bls", "timeseries", "seriesID", "identity", False, "text", "source_period", "SOURCE_NATIVE", "BLS series id. Calibration only."),
            ],
        ),
        "synthetic_extensions.yml": {
            "canonical_version": "people_v2",
            "gate": 1,
            "note": "Every SYNTHETIC_EXTENSION must appear here and later in people_meta_attribute. E8 was proposed then withdrawn: HRMS custom field Employee.employment_type exists.",
            "extensions": [
                {"id": "E1", "object": "people_ref_comp_band", "reason": "Frappe HR has no compensation band object; compa-ratio requires band_mid.", "real_world_source": "Compensation system / market survey"},
                {"id": "E2", "object": "people_dim_grade.level_rank", "reason": "Employee Grade has no sort order.", "real_world_source": "Job architecture document"},
                {"id": "E3", "object": "people_ref_city", "reason": "Frappe Branch has only a name.", "real_world_source": "Address master"},
                {"id": "E4", "object": "people_dim_recruiter", "reason": "Harvest user has identity and permissions only.", "real_world_source": "TA operating config"},
                {"id": "E5", "object": "engagement_ext (survey_instrument, survey_wave, survey_response)", "reason": "No open-source HRIS in this pin has a survey module.", "real_world_source": "Engagement platform", "contract": "people_source_contracts/engagement_ext/"},
                {"id": "E6", "object": "people_ref_separation_reason_map", "reason": "Employee.reason_for_leaving is free text; simulator uses a controlled vocabulary.", "real_world_source": "Separation reason master"},
                {"id": "E7", "object": "GlobalTech org tree names and structure", "reason": "Synthetic company overlay on people_dim_org.", "real_world_source": "none"},
                {"id": "E8", "object": "people_dim_worker.employment_type", "reason": "Withdrawn. HRMS v16.15.0 get_custom_fields() adds Employee.employment_type (Link Employment Type) and Employee.grade (Link Employee Grade). Provenance is SOURCE_NATIVE (hrms custom field).", "real_world_source": "hrms/setup.py", "status": "withdrawn", "gate1_decision": "Not approved. Use SOURCE_NATIVE from the HRMS custom-field overlay."},
            ],
            "fields": [
                F("people_ref_comp_band", "grade_id", "engagement_ext", "people_ref_comp_band", "grade_id", "identity", False, "text", "valid_from", "SYNTHETIC_EXTENSION", "E1 grade."),
                F("people_ref_comp_band", "country", "engagement_ext", "people_ref_comp_band", "country", "identity", False, "text", "valid_from", "SYNTHETIC_EXTENSION", "E1 country."),
                F("people_ref_comp_band", "currency", "engagement_ext", "people_ref_comp_band", "currency", "identity", False, "text", "valid_from", "SYNTHETIC_EXTENSION", "E1 currency."),
                F("people_ref_comp_band", "band_min", "engagement_ext", "people_ref_comp_band", "band_min", "identity", False, "numeric", "valid_from", "SYNTHETIC_EXTENSION", "E1 minimum."),
                F("people_ref_comp_band", "band_mid", "engagement_ext", "people_ref_comp_band", "band_mid", "identity", False, "numeric", "valid_from", "SYNTHETIC_EXTENSION", "E1 midpoint. BR-COMP-001 uses this."),
                F("people_ref_comp_band", "band_max", "engagement_ext", "people_ref_comp_band", "band_max", "identity", False, "numeric", "valid_from", "SYNTHETIC_EXTENSION", "E1 maximum."),
                F("people_ref_comp_band", "valid_from", "engagement_ext", "people_ref_comp_band", "valid_from", "identity", False, "date", "valid_from", "SYNTHETIC_EXTENSION", "Band version start."),
                F("people_ref_comp_band", "valid_to", "engagement_ext", "people_ref_comp_band", "valid_to", "identity", True, "date", "valid_to", "SYNTHETIC_EXTENSION", "Band version end."),
                F("people_ref_city", "city", "engagement_ext", "people_ref_city", "city", "identity", False, "text", "current", "SYNTHETIC_EXTENSION", "E3 city."),
                F("people_ref_city", "country", "engagement_ext", "people_ref_city", "country", "identity", False, "text", "current", "SYNTHETIC_EXTENSION", "E3 country."),
                F("people_ref_city", "region", "engagement_ext", "people_ref_city", "region", "identity", False, "text", "current", "SYNTHETIC_EXTENSION", "E3 region."),
                F("people_ref_separation_reason_map", "raw_reason", "engagement_ext", "people_ref_separation_reason_map", "raw_reason", "identity", False, "text", "current", "SYNTHETIC_EXTENSION", "E6 raw text key."),
                F("people_ref_separation_reason_map", "termination_category", "engagement_ext", "people_ref_separation_reason_map", "termination_category", "voluntary | involuntary | other (BR-RET-001)", False, "text", "current", "SYNTHETIC_EXTENSION", "E6 category."),
                F("people_dim_recruiter", "person_id", "greenhouse_v3", "user", "employee_id", "user.employee_id → person_id (T8)", False, "uuid", "valid_from", "CANONICAL_KEY", "Recruiter person. Must be an employee."),
                F("people_dim_recruiter", "specialization", "engagement_ext", "people_dim_recruiter", "specialization", "identity", True, "text", "valid_from", "SYNTHETIC_EXTENSION", "E4 specialization."),
                F("people_dim_recruiter", "supported_region", "engagement_ext", "people_dim_recruiter", "supported_region", "identity", True, "text", "valid_from", "SYNTHETIC_EXTENSION", "E4 region."),
                F("people_dim_recruiter", "supported_job_family", "engagement_ext", "people_dim_recruiter", "supported_job_family", "identity", True, "text", "valid_from", "SYNTHETIC_EXTENSION", "E4 job family."),
                F("people_dim_recruiter", "valid_from", "engagement_ext", "people_dim_recruiter", "valid_from", "identity", False, "date", "valid_from", "SYNTHETIC_EXTENSION", "E4 version start."),
                F("people_dim_recruiter", "valid_to", "engagement_ext", "people_dim_recruiter", "valid_to", "identity", True, "date", "valid_to", "SYNTHETIC_EXTENSION", "E4 version end."),
            ],
        },
    }


def main() -> int:
    from emit_v2_mappings import dump, ROOT

    for name, payload in {**greenhouse_mappings(), **ext_mappings()}.items():
        dump(ROOT / name, payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
