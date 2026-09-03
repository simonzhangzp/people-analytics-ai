from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PeopleLocation:
    location_id: str
    location_name: str
    country: str
    region: str
    city: str
    pay_multiplier: float


@dataclass(frozen=True)
class PeopleJob:
    job_id: str
    job_title: str
    job_family: str
    job_level: str
    occupation_id: str
    base_salary: int
    is_manager: bool


PEOPLE_LOCATIONS = [
    PeopleLocation("US-NY", "New York", "US", "AMER", "New York", 1.12),
    PeopleLocation("US-TX", "Austin", "US", "AMER", "Austin", 0.98),
    PeopleLocation("US-CA", "San Francisco", "US", "AMER", "San Francisco", 1.22),
    PeopleLocation("US-CHI", "Chicago", "US", "AMER", "Chicago", 1.02),
    PeopleLocation("UK-LON", "London", "GB", "EMEA", "London", 0.92),
    PeopleLocation("DE-BER", "Berlin", "DE", "EMEA", "Berlin", 0.88),
    PeopleLocation("IE-DUB", "Dublin", "IE", "EMEA", "Dublin", 0.90),
    PeopleLocation("SG-SIN", "Singapore", "SG", "APAC", "Singapore", 0.96),
    PeopleLocation("IN-BLR", "Bengaluru", "IN", "APAC", "Bengaluru", 0.38),
    PeopleLocation("AU-SYD", "Sydney", "AU", "APAC", "Sydney", 0.94),
    PeopleLocation("JP-TYO", "Tokyo", "JP", "APAC", "Tokyo", 0.91),
    PeopleLocation("CN-SHA", "Shanghai", "CN", "APAC", "Shanghai", 0.55),
]

PEOPLE_FUNCTIONS = [
    ("Engineering", "15-1252"),
    ("Product", "15-1211"),
    ("Sales", "41-4011"),
    ("Marketing", "13-1161"),
    ("Finance", "13-2011"),
    ("People", "13-1071"),
    ("Operations", "11-1021"),
    ("Legal", "23-1011"),
]

PEOPLE_LEVELS = [
    ("IC1", "Associate", 62000, False),
    ("IC2", "Specialist", 82000, False),
    ("IC3", "Senior", 115000, False),
    ("IC4", "Staff", 155000, False),
    ("IC5", "Principal", 195000, False),
    ("IC6", "Distinguished", 240000, False),
    ("M1", "Manager", 148000, True),
    ("M2", "Senior Manager", 188000, True),
    ("M3", "Director", 240000, True),
    ("DIR", "Senior Director", 290000, True),
    ("VP", "Vice President", 360000, True),
    ("C", "Executive", 520000, True),
]

PEOPLE_SKILLS = [
    ("skill_python", "Python", "technical"),
    ("skill_sql", "SQL", "technical"),
    ("skill_cloud", "Cloud platforms", "technical"),
    ("skill_data", "Workforce analytics", "technical"),
    ("skill_leadership", "People leadership", "behavioral"),
    ("skill_communication", "Stakeholder communication", "behavioral"),
    ("skill_sales", "Enterprise sales", "functional"),
    ("skill_finance", "Financial modeling", "functional"),
]

FIRST_NAMES = [
    "Amina", "Noah", "Mei", "Sofia", "Liam", "Priya", "Jonas", "Hana",
    "Mateo", "Elena", "Kenji", "Aisha", "Owen", "Zara", "Hugo", "Nia",
    "Ibrahim", "Chloe", "Ravi", "Ines", "Leo", "Yuki", "Sara", "Diego",
]
LAST_NAMES = [
    "Nguyen", "Patel", "Garcia", "Kim", "Andersen", "Silva", "Khan", "Muller",
    "Okafor", "Chen", "Ivanov", "Costa", "Nakamura", "Ali", "Berg", "Lopez",
]


def people_jobs() -> list[PeopleJob]:
    jobs: list[PeopleJob] = []
    for function_name, occupation_id in PEOPLE_FUNCTIONS:
        for level_code, level_title, salary, is_manager in PEOPLE_LEVELS:
            if level_code == "C" and function_name not in {"Engineering", "Sales", "Finance", "People"}:
                continue
            job_id = f"JOB-{function_name[:3].upper()}-{level_code}"
            title = f"{function_name} {level_title}"
            jobs.append(
                PeopleJob(
                    job_id=job_id,
                    job_title=title,
                    job_family=function_name,
                    job_level=level_code,
                    occupation_id=occupation_id,
                    base_salary=salary,
                    is_manager=is_manager,
                )
            )
    return jobs


def people_org_rows() -> list[dict]:
    rows = [
        {
            "org_id": "ORG-GT",
            "org_name": "GlobalTech",
            "parent_org_id": None,
            "org_level": 0,
            "function_name": "Company",
            "region": None,
        }
    ]
    for function_name, _occupation in PEOPLE_FUNCTIONS:
        function_id = f"ORG-{function_name[:3].upper()}"
        rows.append(
            {
                "org_id": function_id,
                "org_name": function_name,
                "parent_org_id": "ORG-GT",
                "org_level": 1,
                "function_name": function_name,
                "region": None,
            }
        )
        for index in range(1, 6):
            dept_id = f"{function_id}-D{index:02d}"
            rows.append(
                {
                    "org_id": dept_id,
                    "org_name": f"{function_name} Department {index}",
                    "parent_org_id": function_id,
                    "org_level": 2,
                    "function_name": function_name,
                    "region": None,
                }
            )
            for team in range(1, 6):
                rows.append(
                    {
                        "org_id": f"{dept_id}-T{team:02d}",
                        "org_name": f"{function_name} Team {index}.{team}",
                        "parent_org_id": dept_id,
                        "org_level": 3,
                        "function_name": function_name,
                        "region": None,
                    }
                )
    return rows
