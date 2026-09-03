from __future__ import annotations

"""Atomic transactions T1–T13. Each returns the full source-shaped object set for one business day."""

from datetime import date, timedelta

from ids import person_id, utc
from world import TinyWorld, tiny_world
from business_rules import E6_REASON_MAP, appraisal_final_score, e6_category

STAGES = ("Application Review", "Phone Screen", "Onsite", "Offer")


def _employee(
    name: str,
    world: TinyWorld,
    joining: date,
    department: str,
    designation: str,
    grade: str,
    branch: str,
    employment_type: str,
    reports_to: str | None = None,
    status: str = "Active",
    relieving=None,
    reason=None,
) -> dict:
    return {
        "doctype": "Employee",
        "name": name,
        "employee_name": name.replace("HR-EMP-", "Worker "),
        "status": status,
        "date_of_joining": joining.isoformat(),
        "department": department,
        "designation": designation,
        "grade": grade,
        "branch": branch,
        "employment_type": employment_type,
        "reports_to": reports_to,
        "relieving_date": relieving.isoformat() if relieving else None,
        "reason_for_leaving": reason,
        "gender": "Female",
        "date_of_birth": "1990-01-15",
        "docstatus": 0,
        "creation": utc(joining),
        "modified": utc(joining),
    }


def t1_hire_instance(
    day: date,
    world: TinyWorld | None = None,
    *,
    emp: str = "HR-EMP-000301",
    app_id: int = 44001,
    job_id: int = 8811,
    opening_id: int = 99021,
    offer_id: int = 77001,
    cand_id: int = 33001,
    user_id: int = 204,
    offer_status: str = "Accepted",
    offer_version: int = 1,
    opening_open: bool | None = None,
    employment_type: str = "Regular",
    department: str | None = None,
    designation: str | None = None,
    grade: str = "G5",
    branch: str = "APAC-SIN",
    person_id_value: str | None = None,
    application_status: str | None = None,
) -> dict:
    world = world or tiny_world()
    accepted = offer_status == "Accepted"
    if opening_open is None:
        opening_open = not accepted
    if application_status is None:
        application_status = "hired" if accepted else "rejected"
    return {
        "transaction": "T1",
        "offer": {
            "id": offer_id,
            "application_id": app_id,
            "job_id": job_id,
            "opening_id": opening_id,
            "status": offer_status,
            "starts_on": day.isoformat() if accepted else (day + timedelta(days=14)).isoformat(),
            "sent_on": (day - timedelta(days=7)).isoformat(),
            "resolved_at": utc(day, 9),
            "created_at": utc(day - timedelta(days=10)),
            "version": offer_version,
        },
        "application": {
            "id": app_id,
            "candidate_id": cand_id,
            "job_id": job_id,
            "status": application_status,
            "created_at": utc(day - timedelta(days=40)),
            "job_interview_stage_id": 4,
            "recruiter_id": user_id,
        },
        "opening": {
            "id": opening_id,
            "job_id": job_id,
            "open": opening_open,
            "opened_at": utc(day - timedelta(days=50)),
            "closed_at": None if opening_open else utc(day, 9),
            "application_id": app_id if accepted else None,
            "close_reason_id": 1 if accepted else None,
        },
        "candidate": {"id": cand_id, "created_at": utc(day - timedelta(days=41))},
        "employee": _employee(
            emp,
            world,
            day,
            department or world.departments[0],
            designation or world.designations[0],
            grade,
            branch,
            employment_type,
        ),
        "salary_structure_assignment": {
            "doctype": "Salary Structure Assignment",
            "name": f"HR-SSA-{emp.split('-')[-1]}",
            "employee": emp,
            "salary_structure": "GT-PROF-USD",
            "from_date": day.isoformat(),
            "base": 140000,
            "variable": 15000,
            "currency": "USD",
            "grade": grade,
            "docstatus": 1,
        },
        "identity": {
            "person_id": person_id_value or person_id("greenhouse_v3", "candidate", str(cand_id)),
            "worker_id": emp,
            "match_method": "transaction",
            "source_system": "greenhouse_v3",
            "source_object": "offer",
            "source_id": str(offer_id),
        },
        "user": {
            "id": user_id,
            "employee_id": world.recruiter_employee,
            "deactivated": False,
        },
    }


def t1_hire(day: date, world: TinyWorld | None = None) -> dict:
    return t1_hire_instance(day, world)


def t2_transfer(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = world.existing_employee
    return {
        "transaction": "T2",
        "employee_transfer": {
            "doctype": "Employee Transfer",
            "name": "HR-EMP-TRN-0001",
            "employee": emp,
            "transfer_date": day.isoformat(),
            "docstatus": 1,
            "creation": utc(day),
            "modified": utc(day),
            "transfer_details": [
                {
                    "doctype": "Employee Property History",
                    "property": "Department",
                    "fieldname": "department",
                    "current": world.departments[0],
                    "new": world.departments[1],
                },
                {
                    "doctype": "Employee Property History",
                    "property": "Branch",
                    "fieldname": "branch",
                    "current": "APAC-SIN",
                    "new": "AMER-NYC",
                },
            ],
        },
        "employee": _employee(
            emp, world, date(2020, 1, 6), world.departments[1], world.designations[0], "G5", "AMER-NYC", "Regular"
        ),
    }


def t3_promotion(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = world.existing_employee
    return {
        "transaction": "T3",
        "employee_promotion": {
            "doctype": "Employee Promotion",
            "name": "HR-EMP-PRO-0001",
            "employee": emp,
            "promotion_date": day.isoformat(),
            "docstatus": 1,
            "promotion_details": [
                {
                    "doctype": "Employee Property History",
                    "property": "Designation",
                    "fieldname": "designation",
                    "current": world.designations[0],
                    "new": world.designations[1],
                },
                {
                    "doctype": "Employee Property History",
                    "property": "Grade",
                    "fieldname": "grade",
                    "current": "G5",
                    "new": "G6",
                },
            ],
        },
        "salary_structure_assignment": {
            "doctype": "Salary Structure Assignment",
            "name": "HR-SSA-000102",
            "employee": emp,
            "from_date": day.isoformat(),
            "base": 165000,
            "variable": 20000,
            "currency": "USD",
            "grade": "G6",
            "salary_structure": "GT-PROF-USD",
            "docstatus": 1,
        },
        "employee": _employee(
            emp, world, date(2020, 1, 6), world.departments[0], world.designations[1], "G6", "APAC-SIN", "Regular"
        ),
    }


def t4_comp_cycle(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    return {
        "transaction": "T4",
        "salary_structure_assignment": {
            "doctype": "Salary Structure Assignment",
            "name": "HR-SSA-CYCLE-0001",
            "employee": world.existing_employee,
            "from_date": date(day.year, 4, 1).isoformat(),
            "base": 150000,
            "variable": 18000,
            "currency": "USD",
            "grade": "G5",
            "salary_structure": "GT-PROF-USD",
            "docstatus": 1,
        },
    }


def t5_separation(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = "HR-EMP-000150"
    return {
        "transaction": "T5",
        "employee": _employee(
            emp,
            world,
            date(2021, 3, 1),
            world.departments[0],
            world.designations[0],
            "G4",
            "APAC-SIN",
            "Regular",
            status="Left",
            relieving=day,
            reason="Resignation - Better opportunity",
        ),
        "termination_category": e6_category("Resignation - Better opportunity"),
        "e6_vocabulary": sorted(E6_REASON_MAP),
        "employee_separation": {
            "doctype": "Employee Separation",
            "name": "HR-EMP-SEP-0001",
            "employee": emp,
            "boarding_begins_on": day.isoformat(),
            "boarding_status": "In Process",
            "docstatus": 1,
        },
    }


def t6_rehire(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    prior = "HR-EMP-000150"
    new_emp = "HR-EMP-000151"
    person = person_id("frappe_hr", "Employee", prior)
    return {
        "transaction": "T6",
        "prior_employee": prior,
        "employee": _employee(
            new_emp, world, day, world.departments[0], world.designations[0], "G4", "APAC-SIN", "Regular"
        ),
        "identity": {
            "person_id": person,
            "worker_id": new_emp,
            "match_method": "transaction",
            "is_rehire": True,
        },
        "hire_event": {
            "event_type": "rehire",
            "worker_id": new_emp,
            "person_id": person,
            "source_id": new_emp,
            "prior_worker_id": prior,
        },
        "salary_structure_assignment": {
            "doctype": "Salary Structure Assignment",
            "name": "HR-SSA-000151",
            "employee": new_emp,
            "from_date": day.isoformat(),
            "base": 130000,
            "variable": 10000,
            "currency": "USD",
            "grade": "G4",
            "salary_structure": "GT-PROF-USD",
            "docstatus": 1,
        },
    }


def t7_manager_change(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = world.existing_employee
    employee = _employee(
        emp, world, date(2020, 1, 6), world.departments[0], world.designations[0], "G5", "APAC-SIN", "Regular",
        reports_to="HR-EMP-000200",
    )
    employee["modified"] = utc(day)
    employee["_extract_diff"] = True
    return {
        "transaction": "T7",
        "employee": employee,
        "source_object": "Employee (extract diff)",
        "change": {"fieldname": "reports_to", "current": "HR-EMP-000099", "new": "HR-EMP-000200"},
    }


def t8_recruiter_employee(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    return {
        "transaction": "T8",
        "user": {
            "id": 204,
            "employee_id": world.recruiter_employee,
            "deactivated": False,
            "created_at": utc(day),
        },
        "employee": _employee(
            world.recruiter_employee,
            world,
            date(2018, 6, 1),
            world.departments[1],
            world.designations[1],
            "G6",
            "AMER-NYC",
            "Regular",
        ),
        "identity": {
            "match_method": "employee_id",
            "source_system": "greenhouse_v3",
            "source_object": "user",
            "source_id": "204",
        },
    }


def t9_appraisal(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    total_score = 4.0
    self_score = 4.2
    avg_feedback_score = 3.9
    cycle = {
        "doctype": "Appraisal Cycle",
        "name": "FY2026",
        "cycle_name": "FY2026",
        "start_date": f"{day.year}-01-01",
        "end_date": f"{day.year}-12-31",
        "status": "In Progress",
        "calculate_final_score_based_on_formula": 0,
        "final_score_formula": None,
    }
    final_score = appraisal_final_score(
        total_score, self_score, avg_feedback_score, cycle["calculate_final_score_based_on_formula"]
    )
    return {
        "transaction": "T9",
        "appraisal_cycle": cycle,
        "appraisal": {
            "doctype": "Appraisal",
            "name": "HR-APR-000100",
            "employee": world.existing_employee,
            "appraisal_cycle": "FY2026",
            "total_score": total_score,
            "self_score": self_score,
            "avg_feedback_score": avg_feedback_score,
            "final_score": final_score,
            "docstatus": 1,
            "modified": utc(day),
        },
    }


def t10_survey_wave(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    items = ["E1", "E2", "E3", "M1", "M2", "M3", "G1", "G2", "G3", "W1", "W2", "W3"]
    return {
        "transaction": "T10",
        "survey_wave": {
            "wave_id": f"WAV-{day.year}-05",
            "instrument_version": "engagement_ext.instrument.v1",
            "start_date": day.isoformat(),
            "end_date": (day + timedelta(days=14)).isoformat(),
            "target_population": "active_workers",
            "response_rate": 0.78,
        },
        "survey_response": [
            {
                "response_id": f"RSP-{world.existing_employee}-{item}",
                "wave_id": f"WAV-{day.year}-05",
                "worker_id": world.existing_employee,
                "item_id": item,
                "score": 4 if item not in {"E3", "M3", "G3", "W3"} else 2,
            }
            for item in items
        ],
    }


def t11_recruiting_internal(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    app_id = 44099
    stages = []
    cursor = day - timedelta(days=21)
    for idx, name in enumerate(STAGES, start=1):
        exited = cursor + timedelta(days=5) if idx < len(STAGES) else None
        stages.append(
            {
                "id": 8000 + idx,
                "application_id": app_id,
                "job_interview_stage_id": idx,
                "stage_name": name,
                "entered_at": utc(cursor),
                "exited_at": utc(exited) if exited else None,
                "current": exited is None,
            }
        )
        if exited:
            cursor = exited
    return {
        "transaction": "T11",
        "application": {
            "id": app_id,
            "candidate_id": 33999,
            "job_id": 8811,
            "status": "in_process",
            "created_at": utc(day - timedelta(days=21)),
            "job_interview_stage_id": 3,
        },
        "application_stages": stages,
        "interview": {
            "id": 56001,
            "application_id": app_id,
            "job_interview_id": 3,
            "starts_at": utc(day, 14),
            "ends_at": utc(day, 15),
            "status": "scheduled",
        },
        "scorecard": {
            "id": 61001,
            "application_id": app_id,
            "interview_kit_id": 3,
            "submitter_id": 204,
            "interviewer_id": 204,
            "candidate_rating": "yes",
            "submitted_at": utc(day, 16),
            "status": "complete",
        },
        "offer": {
            "id": 77099,
            "application_id": app_id,
            "opening_id": 99021,
            "job_id": 8811,
            "status": "Created",
            "starts_on": (day + timedelta(days=21)).isoformat(),
            "created_at": utc(day, 17),
            "version": 1,
        },
    }


def t12_training(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = world.existing_employee
    event_name = "HR-TRN-EVT-0001"
    result_name = "HR-TRN-RES-0001"
    start = utc(day, 9)
    end = utc(day, 17)
    return {
        "transaction": "T12",
        "training_event": {
            "doctype": "Training Event",
            "name": event_name,
            "event_name": "Platform onboarding",
            "start_time": start,
            "end_time": end,
            "level": "Beginner",
            "course": "Engineering Onboarding",
            "docstatus": 1,
            "modified": utc(day),
        },
        "training_event_employee": [
            {
                "doctype": "Training Event Employee",
                "parent": event_name,
                "employee": emp,
                "attendance": "Present",
                "status": "Completed",
            }
        ],
        "training_result": {
            "doctype": "Training Result",
            "name": result_name,
            "training_event": event_name,
            "docstatus": 1,
            "modified": utc(day),
        },
        "training_result_employee": [
            {
                "doctype": "Training Result Employee",
                "parent": result_name,
                "employee": emp,
                "hours": 8.0,
                "grade": "A",
            }
        ],
    }


def t13_employee_skill_map(day: date, world: TinyWorld | None = None) -> dict:
    world = world or tiny_world()
    emp = world.existing_employee
    map_name = f"HR-SKM-{emp.split('-')[-1]}"
    return {
        "transaction": "T13",
        "employee_skill_map": {
            "doctype": "Employee Skill Map",
            "name": map_name,
            "employee": emp,
            "modified": utc(day),
        },
        "employee_skills": [
            {
                "doctype": "Employee Skill",
                "parent": map_name,
                "skill": "Python",
                "proficiency": 0.8,
                "evaluation_date": day.isoformat(),
            },
            {
                "doctype": "Employee Skill",
                "parent": map_name,
                "skill": "SQL",
                "proficiency": 0.6,
                "evaluation_date": day.isoformat(),
            },
        ],
    }


TRANSACTIONS = {
    "T1": t1_hire,
    "T2": t2_transfer,
    "T3": t3_promotion,
    "T4": t4_comp_cycle,
    "T5": t5_separation,
    "T6": t6_rehire,
    "T7": t7_manager_change,
    "T8": t8_recruiter_employee,
    "T9": t9_appraisal,
    "T10": t10_survey_wave,
    "T11": t11_recruiting_internal,
    "T12": t12_training,
    "T13": t13_employee_skill_map,
}

REQUIRED_OBJECTS = {
    "T1": ("offer", "application", "opening", "candidate", "employee", "salary_structure_assignment", "identity"),
    "T2": ("employee_transfer", "employee"),
    "T3": ("employee_promotion", "salary_structure_assignment", "employee"),
    "T4": ("salary_structure_assignment",),
    "T5": ("employee", "employee_separation", "termination_category"),
    "T6": ("employee", "identity", "salary_structure_assignment", "hire_event"),
    "T7": ("employee", "change"),
    "T8": ("user", "employee", "identity"),
    "T9": ("appraisal_cycle", "appraisal"),
    "T10": ("survey_wave", "survey_response"),
    "T11": ("application", "application_stages", "interview", "scorecard", "offer"),
    "T12": ("training_event", "training_result", "training_event_employee", "training_result_employee"),
    "T13": ("employee_skill_map", "employee_skills"),
}


def run_all_transactions(day: date, world: TinyWorld | None = None) -> dict[str, dict]:
    world = world or tiny_world()
    return {code: fn(day, world) for code, fn in TRANSACTIONS.items()}
