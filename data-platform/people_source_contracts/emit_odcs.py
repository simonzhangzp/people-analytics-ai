from __future__ import annotations

"""ODCS-style bronze data contracts. One file per bronze object."""

from pathlib import Path

import yaml

EXTRACT_EXTRAS = {
    ("frappe_hr", "Employee"): {
        "full_extract_dow": "Friday",
        "other_days_mode": "incremental",
        "control_total_on_full": "all_employee_documents_including_left",
    },
}

ROOT = Path(__file__).resolve().parent / "odcs"
ROOT.mkdir(parents=True, exist_ok=True)

# cadence, mode, key, control_total, pii, freshness_hours
OBJECTS = [
    ("frappe_hr", "Employee", "name", "incremental_plus_weekly_full", "daily", "count of Employee rows in source (all statuses including Left)", "sensitive_pii", 24, "ERPNext JSON + HRMS custom fields. Not submittable. Full extract only on Friday (control_total = all Employee documents including Left). Other days incremental on modified. Employed count is derived (BR-WF-001). BR-DQ-003: absence means the document is missing, not status=Left."),
    ("frappe_hr", "Department", "name", "full", "daily", "count of Department rows", "internal", 24, "Org spine."),
    ("frappe_hr", "Designation", "name", "full", "daily", "count of Designation rows", "internal", 24, "Job spine."),
    ("frappe_hr", "Employee Grade", "name", "full", "daily", "count of Employee Grade rows", "internal", 24, "Grade spine."),
    ("frappe_hr", "Branch", "name", "full", "daily", "count of Branch rows", "internal", 24, "Location spine."),
    ("frappe_hr", "Employment Type", "name", "full", "daily", "count of Employment Type rows", "internal", 24, "HRMS master linked from Employee.employment_type custom field."),
    ("frappe_hr", "Employee Transfer", "name", "incremental", "daily", "count of submitted (docstatus=1) Employee Transfer", "internal", 24, "BR-DQ-001. Cancelled docs are reversals."),
    ("frappe_hr", "Employee Property History", "parent+idx", "nested_incremental", "daily", "count of child rows on submitted parents", "internal", 24, "Child of Transfer/Promotion."),
    ("frappe_hr", "Employee Promotion", "name", "incremental", "daily", "count of submitted Employee Promotion", "internal", 24, "BR-DQ-001."),
    ("frappe_hr", "Employee Separation", "name", "incremental", "daily", "count of submitted Employee Separation", "internal", 24, "BR-DQ-001."),
    ("frappe_hr", "Salary Structure Assignment", "name", "incremental", "daily", "count of submitted SSA", "restricted", 24, "BR-DQ-001. Compensation."),
    ("frappe_hr", "Salary Structure", "name", "full", "daily", "count of submitted Salary Structure", "internal", 24, "BR-DQ-001."),
    ("frappe_hr", "Salary Component", "name", "full", "daily", "count of Salary Component", "internal", 24, "Payroll reference."),
    ("frappe_hr", "Salary Slip", "name", "incremental", "daily", "count of submitted Salary Slip", "restricted", 24, "Lake only. BR-DQ-001."),
    ("frappe_hr", "Salary Detail", "parent+idx", "nested_incremental", "daily", "count of child rows on submitted slips", "restricted", 24, "Earnings/deductions child."),
    ("frappe_hr", "Appraisal Cycle", "name", "full", "daily", "count of Appraisal Cycle", "confidential", 24, "Not submittable."),
    ("frappe_hr", "Appraisal", "name", "incremental", "daily", "count of submitted Appraisal", "confidential", 24, "BR-DQ-001."),
    ("frappe_hr", "Training Program", "name", "full", "daily", "count of Training Program", "internal", 24, "Catalog parent."),
    ("frappe_hr", "Training Event", "name", "incremental", "daily", "count of submitted Training Event", "internal", 24, "BR-DQ-001."),
    ("frappe_hr", "Training Event Employee", "parent+employee", "nested_incremental", "daily", "count of child rows on submitted events", "internal", 24, "Parent filter docstatus=1."),
    ("frappe_hr", "Training Result", "name", "incremental", "daily", "count of submitted Training Result", "internal", 24, "BR-DQ-001."),
    ("frappe_hr", "Training Result Employee", "parent+employee", "nested_incremental", "daily", "count of child rows on submitted results", "internal", 24, "Parent filter docstatus=1."),
    ("frappe_hr", "Training Feedback", "name", "incremental", "daily", "count of submitted Training Feedback", "confidential", 24, "BR-DQ-001."),
    ("frappe_hr", "Employee Skill Map", "name", "incremental", "daily", "count of Employee Skill Map", "internal", 24, "Not submittable."),
    ("frappe_hr", "Employee Skill", "parent+skill", "nested_incremental", "daily", "count of child skill rows", "internal", 24, "Child of Skill Map."),
    ("frappe_hr", "Skill", "name", "full", "daily", "count of Skill", "internal", 24, "Frappe skill master."),
    ("greenhouse_v3", "candidate", "id", "incremental_plus_weekly_full", "daily", "Harvest list total for the extract window", "sensitive_pii", 24, "updated_after watermark."),
    ("greenhouse_v3", "application", "id", "incremental_plus_weekly_full", "daily", "Harvest list total", "internal", 24, "No jobs[] array; job_id scalar."),
    ("greenhouse_v3", "application_stage", "id", "incremental", "daily", "Harvest list total", "internal", 24, "Do not persist days_in_stage."),
    ("greenhouse_v3", "job", "id", "incremental_plus_weekly_full", "daily", "Harvest list total", "internal", 24, "Parent of openings."),
    ("greenhouse_v3", "opening", "id", "incremental_plus_weekly_full", "daily", "Harvest list total", "internal", 24, "Requisition grain."),
    ("greenhouse_v3", "job_interview_stage", "id", "full", "daily", "Harvest list total", "internal", 24, "sort_order not priority."),
    ("greenhouse_v3", "job_hiring_manager", "id", "full", "daily", "Harvest list total", "internal", 24, "/v3/job_hiring_managers."),
    ("greenhouse_v3", "department", "id", "full", "daily", "Harvest list total", "internal", 24, "Crosswalk only."),
    ("greenhouse_v3", "office", "id", "full", "daily", "Harvest list total", "internal", 24, "Crosswalk only."),
    ("greenhouse_v3", "user", "id", "full", "daily", "Harvest list total", "internal", 24, "employee_id is T8. Do not use primary_email."),
    ("greenhouse_v3", "source", "id", "full", "daily", "Harvest list total", "internal", 24, "Source master."),
    ("greenhouse_v3", "referrer", "id", "full", "daily", "Harvest list total", "internal", 24, "referrer.id ≠ user_id."),
    ("greenhouse_v3", "interview", "id", "incremental", "daily", "Harvest list total", "internal", 24, "starts_at/ends_at."),
    ("greenhouse_v3", "scorecard", "id", "incremental", "daily", "Harvest list total", "confidential", 24, "candidate_rating / submitter_id."),
    ("greenhouse_v3", "offer", "id", "incremental", "daily", "Harvest list total", "confidential", 24, "T1 trigger. starts_on."),
    ("greenhouse_v3", "rejection_reason", "id", "full", "daily", "Harvest list total", "internal", 24, "Reason master."),
    ("greenhouse_v3", "eeoc", "application_id", "incremental", "daily", "Harvest list total", "restricted", 24, "Application grain. Never join worker/person."),
    ("greenhouse_v3", "demographic_answer", "id", "incremental", "daily", "Harvest list total", "restricted", 24, "Application grain. Never join worker/person."),
    ("engagement_ext", "survey_instrument", "instrument_version", "full", "on_version_change", "count of items in the pinned instrument", "internal", 24, "E5. SYNTHETIC_EXTENSION."),
    ("engagement_ext", "survey_wave", "wave_id", "full", "per_wave", "count of waves", "internal", 24, "E5."),
    ("engagement_ext", "survey_response", "response_id", "incremental", "per_wave", "count of item-level answers in source", "confidential", 24, "Lake only. Not serving."),
    ("microsoft_learn", "catalog", "uid", "full", "weekly", "count of catalog items returned by the public API", "public", 168, "trust data_only. duration_minutes and roles are SOURCE_GAP."),
    ("onet", "Occupation Data.txt", "O*NET-SOC Code", "full", "on_pin_change", "count of occupation rows in the pinned zip", "public", 8760, "trust data_only."),
    ("onet", "Essential Skills.txt", "Element ID", "full", "on_pin_change", "count of skill element rows", "public", 8760, "trust data_only."),
    ("bls", "timeseries", "seriesID+period", "full", "monthly", "count of observations in the BLS response", "public", 720, "trust data_only. Calibration only."),
]


def slug(system: str, obj: str) -> str:
    return f"{system}__{obj.lower().replace(' ', '_').replace('.', '_').replace('/', '_')}.odcs.yaml"


def main() -> int:
    index = []
    for system, obj, key, mode, cadence, control, pii, sla, note in OBJECTS:
        name = slug(system, obj)
        payload = {
            "apiVersion": "v3.0.2",
            "kind": "DataContract",
            "id": f"urn:people:bronze:{system}:{obj}",
            "info": {
                "title": obj,
                "version": "1.0.0",
                "description": note,
            },
            "servers": [
                {
                    "server": "people_bronze",
                    "type": "s3",
                    "path": f"people_bronze/{system}/{obj.replace(' ', '_')}/extract_date={{date}}/run_id={{id}}/",
                }
            ],
            "schema": [
                {
                    "name": obj,
                    "physicalType": "parquet",
                    "physicalName": f"people_bronze/{system}/{obj}",
                    "primaryKey": [key],
                    "description": note,
                }
            ],
            "extract": {
                "mode": mode,
                "cadence": cadence,
                "key": key,
                "control_total_source": control,
                "watermark": "modified" if system == "frappe_hr" else "updated_at",
                **EXTRACT_EXTRAS.get((system, obj), {}),
            },
            "slaProperties": {"freshnessHours": sla},
            "piiClassification": pii,
        }
        path = ROOT / name
        path.write_text(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
        index.append({"id": payload["id"], "file": name, "source_system": system, "source_object": obj})
        print("wrote", name)
    (ROOT / "INDEX.yaml").write_text(
        yaml.safe_dump(
            {
                "canonical_version": "people_v2",
                "note": "GATE 1 condition 5. One ODCS-style contract per bronze object. Location: data-platform/people_source_contracts/odcs/",
                "contracts": index,
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    print("contracts", len(index))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
