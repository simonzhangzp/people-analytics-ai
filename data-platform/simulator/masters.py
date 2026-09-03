from __future__ import annotations

"""Deterministic bronze masters derived from simulated state. No extra RNG."""

import hashlib
from datetime import date

from engine import BAND_MID, BRANCH, DEPT_BY_FAMILY, FAMILY_GRADES, JOB_BY_FAMILY, SKILLS, SOURCE_IDS, STAGE_IDS, SURVEY_ITEMS
from world import load_baseline

START = date(2021, 9, 1)
RACES = ("white", "asian", "black", "hispanic", "two_or_more", "decline")
GENDERS = ("female", "male", "non_binary", "decline")
VETERAN = ("protected_veteran", "not_protected", "decline")
DISABILITY = ("yes", "no", "decline")
DEMO_QUESTIONS = ("gender_identity", "race_ethnicity")


def _label(name: str) -> str:
    return name.replace(" ", "_").replace("-", "_")


def _pick(values: tuple[str, ...] | list[str], key: str) -> str:
    digest = hashlib.md5(key.encode("utf-8")).digest()[0]
    return values[digest % len(values)]


def bronze_masters(state: dict) -> dict[str, list[dict]]:
    baseline = load_baseline()
    workers = state.get("workers") or []
    openings = state.get("openings") or []
    applications = state.get("applications") or []
    promotions = state.get("promotions") or []
    transfers = state.get("transfers") or []
    property_history = list(state["property_history"]) if "property_history" in state else []
    training_events = state.get("training_events") or []
    emp_types = baseline.get("employment_type_master") or []
    cities = {
        "AMER": ("New York", "US", "AMER"),
        "EMEA": ("London", "GB", "EMEA"),
        "APAC": ("Singapore", "SG", "APAC"),
    }

    departments = [
        {
            "name": "GlobalTech",
            "parent_department": None,
            "company": "GlobalTech",
            "is_group": 1,
            "org_path": "GlobalTech",
            "depth": 0,
            "bg": "Corporate",
            "modified": START.isoformat(),
        }
    ]
    gh_departments = []
    xw_hint = []
    for idx, (family, name) in enumerate(sorted(DEPT_BY_FAMILY.items()), start=1):
        departments.append(
            {
                "name": name,
                "parent_department": "GlobalTech",
                "company": "GlobalTech",
                "is_group": 0,
                "org_path": f"GlobalTech.{_label(name)}",
                "depth": 1,
                "bg": family,
                "modified": START.isoformat(),
            }
        )
        gh_departments.append({"id": idx, "name": f"GH {name}", "parent_id": None})
        xw_hint.append({"frappe_department": name, "gh_department_id": idx, "job_family": family})

    designations = [
        {"name": title, "job_family": family, "modified": START.isoformat()}
        for family, title in sorted(JOB_BY_FAMILY.items())
    ]
    grades = [
        {
            "name": grade,
            "level_rank": int(grade[1:]),
            "default_salary_structure": "GT-PROF-USD",
            "modified": START.isoformat(),
        }
        for grade in baseline.get("grades", {}).get("ids") or list(BAND_MID)
    ]
    branches = []
    offices = []
    for idx, (region, branch) in enumerate(sorted(BRANCH.items()), start=1):
        city, country, _ = cities[region]
        branches.append(
            {
                "name": branch,
                "city": city,
                "country": country,
                "region": region,
                "modified": START.isoformat(),
            }
        )
        offices.append({"id": idx, "name": city, "location": {"name": city}})
    employment_types = [
        {"name": row["name"], "in_certified_headcount": bool(row.get("in_certified_headcount")), "modified": START.isoformat()}
        for row in emp_types
    ]
    skills = sorted({skill for pool in SKILLS.values() for skill in pool})
    skill_rows = [{"name": skill, "modified": START.isoformat()} for skill in skills]
    training_programs = [
        {
            "name": "GlobalTech Academy",
            "status": "Active",
            "modified": START.isoformat(),
        }
    ]
    jobs = []
    seen_jobs: set[int] = set()
    for opening in openings:
        job_id = int(opening["job_id"])
        if job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)
        family = opening.get("job_family") or "Other"
        jobs.append(
            {
                "id": job_id,
                "name": JOB_BY_FAMILY.get(family, family),
                "department_id": next((h["gh_department_id"] for h in xw_hint if h["job_family"] == family), None),
                "offices": [],
                "status": "open" if opening.get("open") else "closed",
            }
        )
    stages = []
    stage_id = 1
    for job in jobs:
        for name, priority in STAGE_IDS.items():
            stages.append(
                {
                    "id": stage_id,
                    "job_id": job["id"],
                    "name": name,
                    "priority": priority,
                }
            )
            stage_id += 1
    sources = [{"id": sid, "name": name, "type": name} for name, sid in SOURCE_IDS.items()]
    rejection_reasons = [
        {"id": 1, "name": "Hired", "type": "hired"},
        {"id": 10, "name": "Not a fit", "type": "rejected"},
        {"id": 99, "name": "Cancelled requisition", "type": "cancelled"},
    ]
    hiring_managers = []
    seen_hm: set[tuple[int, int]] = set()
    hm_ids: set[int] = set()
    recruiter_ids: set[int] = set(range(201, 225))
    for opening in openings:
        hm = int(opening.get("hiring_manager_id") or 0)
        job_id = int(opening["job_id"])
        if hm:
            hm_ids.add(hm)
            key = (job_id, hm)
            if key not in seen_hm:
                seen_hm.add(key)
                hiring_managers.append({"id": f"{job_id}-{hm}", "job_id": job_id, "user_id": hm})
    for app in applications:
        rid = app.get("recruiter_id")
        if rid:
            recruiter_ids.add(int(rid))

    worker_ids = sorted(w["worker_id"] for w in workers)
    users = []
    for user_id in sorted(hm_ids | recruiter_ids):
        employee_id = worker_ids[(user_id - 1) % len(worker_ids)] if worker_ids else None
        users.append(
            {
                "id": user_id,
                "employee_id": employee_id,
                "deactivated": False,
                "created_at": START.isoformat(),
            }
        )

    if "property_history" not in state:
        for row in promotions:
            property_history.append(
                {
                    "parent": row["name"],
                    "parenttype": "Employee Promotion",
                    "idx": 1,
                    "property": "grade",
                    "fieldname": "grade",
                    "current": row.get("old_grade"),
                    "new": row.get("grade"),
                    "employee": row["employee"],
                    "event_date": row["promotion_date"],
                }
            )
        for row in transfers:
            details = row.get("transfer_details") or []
            for detail in details:
                if detail.get("current") is None and detail.get("new") is None:
                    continue
                property_history.append(
                    {
                        "parent": row["name"],
                        "parenttype": "Employee Transfer",
                        "idx": int(detail.get("idx") or 1),
                        "property": detail.get("property") or detail.get("fieldname"),
                        "fieldname": detail.get("fieldname"),
                        "current": detail.get("current"),
                        "new": detail.get("new"),
                        "employee": row["employee"],
                        "event_date": row["transfer_date"],
                    }
                )

    salary_structure = [
        {"name": "GT-PROF-USD", "company": "GlobalTech", "currency": "USD", "docstatus": 1, "modified": START.isoformat()}
    ]
    survey_instrument = [
        {
            "instrument_version": "v1",
            "item_id": item_id,
            "dimension": dimension,
            "prompt": item_id,
            "reverse": False,
        }
        for item_id, dimension in SURVEY_ITEMS
    ]
    for event in training_events:
        event.setdefault("training_program", "GlobalTech Academy")

    return {
        "Department": departments,
        "Designation": designations,
        "Employee_Grade": grades,
        "Branch": branches,
        "Employment_Type": employment_types,
        "Skill": skill_rows,
        "Training_Program": training_programs,
        "Salary_Structure": salary_structure,
        "Employee_Property_History": property_history,
        "job": jobs,
        "job_interview_stage": stages,
        "job_hiring_manager": hiring_managers,
        "department": gh_departments,
        "office": offices,
        "user": users,
        "source": sources,
        "rejection_reason": rejection_reasons,
        "survey_instrument": survey_instrument,
        "_xw_org_hint": xw_hint,
    }


def eeoc_row(app: dict) -> dict:
    app_id = app["id"]
    submitted = str(app.get("created_at") or START.isoformat())
    return {
        "application_id": app_id,
        "race": _pick(RACES, f"race:{app_id}"),
        "gender": _pick(GENDERS, f"gender:{app_id}"),
        "veteran_status": _pick(VETERAN, f"vet:{app_id}"),
        "disability_status": _pick(DISABILITY, f"dis:{app_id}"),
        "submitted_at": submitted,
    }


def demographic_rows(app: dict) -> list[dict]:
    app_id = app["id"]
    submitted = str(app.get("created_at") or START.isoformat())
    return [
        {
            "id": int(app_id) * 2,
            "application_id": app_id,
            "question_id": "gender_identity",
            "answer_option_id": _pick(GENDERS, f"gender:{app_id}"),
            "free_form_text": None,
            "submitted_at": submitted,
        },
        {
            "id": int(app_id) * 2 + 1,
            "application_id": app_id,
            "question_id": "race_ethnicity",
            "answer_option_id": _pick(RACES, f"race:{app_id}"),
            "free_form_text": None,
            "submitted_at": submitted,
        },
    ]
