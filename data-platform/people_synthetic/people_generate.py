from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from people_ingestion.people_config import PeopleConfig
from people_synthetic.people_reference import (
    FIRST_NAMES,
    LAST_NAMES,
    PEOPLE_FUNCTIONS,
    PEOPLE_LEVELS,
    PEOPLE_LOCATIONS,
    PEOPLE_SKILLS,
    people_jobs,
    people_org_rows,
)

SOURCE = "globaltech_hris"


def _dates(start: date, count: int, rng: np.random.Generator) -> np.ndarray:
    offsets = rng.integers(0, max((date.today() - start).days, 1), size=count)
    return np.array([start + timedelta(days=int(x)) for x in offsets])


def _worker_ids(n: int) -> np.ndarray:
    return np.array([f"GTW{i:07d}" for i in range(1, n + 1)])


def generate_people_globaltech(config: PeopleConfig) -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(config.seed)
    as_of = config.as_of
    history_start = config.history_start
    ingested_at = datetime.now(timezone.utc)
    n_active = config.active_headcount
    n_term = config.terminated_headcount
    n = n_active + n_term
    jobs = people_jobs()
    orgs = people_org_rows()
    team_orgs = [row for row in orgs if row["org_level"] == 3]
    locations = PEOPLE_LOCATIONS
    job_ids = np.array([job.job_id for job in jobs])
    job_by_id = {job.job_id: job for job in jobs}
    manager_job_ids = [job.job_id for job in jobs if job.is_manager]
    ic_job_ids = [job.job_id for job in jobs if not job.is_manager]

    worker_id = _worker_ids(n)
    is_active = np.concatenate([np.ones(n_active, dtype=bool), np.zeros(n_term, dtype=bool)])
    hire_span = max((as_of - date(as_of.year - 12, 1, 1)).days, 365)
    hire_offset = rng.integers(30, hire_span, size=n)
    hire_date = np.array([as_of - timedelta(days=int(x)) for x in hire_offset])

    location_idx = rng.choice(len(locations), size=n, p=_location_weights(len(locations)))
    function_idx = rng.choice(len(PEOPLE_FUNCTIONS), size=n, p=_function_weights(len(PEOPLE_FUNCTIONS)))
    level_idx = rng.choice(len(PEOPLE_LEVELS), size=n, p=_level_weights(len(PEOPLE_LEVELS)))
    assigned_jobs = []
    for fn_i, lv_i in zip(function_idx, level_idx):
        function_name = PEOPLE_FUNCTIONS[fn_i][0]
        level_code = PEOPLE_LEVELS[lv_i][0]
        job_id = f"JOB-{function_name[:3].upper()}-{level_code}"
        if job_id not in job_by_id:
            job_id = f"JOB-{function_name[:3].upper()}-IC3"
        assigned_jobs.append(job_id)
    assigned_jobs = np.array(assigned_jobs)

    # Force a leadership layer so manager FKs resolve.
    n_managers = max(int(n_active * 0.11), 400)
    manager_pool = worker_id[:n_managers]
    assigned_jobs[:n_managers] = rng.choice(manager_job_ids, size=n_managers)
    assigned_jobs[0] = "JOB-ENG-C"
    team_ids = np.array([team_orgs[i % len(team_orgs)]["org_id"] for i in range(n)])
    manager_worker_id = np.empty(n, dtype=object)
    manager_worker_id[0] = None
    for i in range(1, n):
        manager_worker_id[i] = manager_pool[i % n_managers]
        if manager_worker_id[i] == worker_id[i]:
            manager_worker_id[i] = manager_pool[(i + 1) % n_managers]

    fte = np.where(rng.random(n) < 0.06, rng.choice([0.5, 0.6, 0.8], size=n), 1.0)
    gender = rng.choice(["female", "male", "nonbinary", "undisclosed"], size=n, p=[0.46, 0.50, 0.02, 0.02])
    generation = rng.choice(["gen_z", "millennial", "gen_x", "boomer"], size=n, p=[0.22, 0.48, 0.25, 0.05])
    ethnicity = rng.choice(
        ["group_a", "group_b", "group_c", "group_d", "undisclosed"],
        size=n,
        p=[0.28, 0.22, 0.18, 0.22, 0.10],
    )
    first = rng.choice(FIRST_NAMES, size=n)
    last = rng.choice(LAST_NAMES, size=n)
    status = np.where(is_active, "active", "terminated")
    term_reason = np.where(
        is_active,
        None,
        rng.choice(["voluntary", "involuntary", "retirement"], size=n, p=[0.72, 0.22, 0.06]),
    )
    history_start = date(as_of.year - 5, as_of.month, 1)
    termination_date = []
    for active, hired in zip(is_active, hire_date):
        if active:
            termination_date.append(None)
            continue
        earliest = max(hired + timedelta(days=30), history_start)
        latest = as_of - timedelta(days=1)
        if earliest >= latest:
            termination_date.append(latest if latest > hired else hired + timedelta(days=30))
        else:
            termination_date.append(earliest + timedelta(days=int(rng.integers(0, (latest - earliest).days + 1))))
    termination_date = np.array(termination_date, dtype=object)

    workers = pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": worker_id,
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "worker_id": worker_id,
            "preferred_first_name": first,
            "preferred_last_name": last,
            "employment_status": status,
            "hire_date": hire_date,
            "termination_date": termination_date,
            "termination_reason": term_reason,
            "job_id": assigned_jobs,
            "org_id": team_ids,
            "location_id": np.array([locations[i].location_id for i in location_idx]),
            "region": np.array([locations[i].region for i in location_idx]),
            "manager_worker_id": manager_worker_id,
            "fte": np.round(fte, 2),
            "gender": gender,
            "generation": generation,
            "ethnicity_band": ethnicity,
        }
    )
    workers.loc[workers["worker_id"] == workers["manager_worker_id"], "manager_worker_id"] = None

    org_df = pd.DataFrame(orgs)
    org_df["source_system"] = SOURCE
    org_df["source_record_id"] = org_df["org_id"]
    org_df["source_updated_at"] = ingested_at
    org_df["ingested_at"] = ingested_at

    location_df = pd.DataFrame(
        [
            {
                "source_system": SOURCE,
                "source_record_id": loc.location_id,
                "source_updated_at": ingested_at,
                "ingested_at": ingested_at,
                "location_id": loc.location_id,
                "location_name": loc.location_name,
                "country": loc.country,
                "region": loc.region,
                "city": loc.city,
                "pay_multiplier": loc.pay_multiplier,
            }
            for loc in locations
        ]
    )
    job_df = pd.DataFrame(
        [
            {
                "source_system": SOURCE,
                "source_record_id": job.job_id,
                "source_updated_at": ingested_at,
                "ingested_at": ingested_at,
                "job_id": job.job_id,
                "job_title": job.job_title,
                "job_family": job.job_family,
                "job_level": job.job_level,
                "occupation_id": job.occupation_id,
                "base_salary": job.base_salary,
                "is_manager": job.is_manager,
            }
            for job in jobs
        ]
    )

    assignments = _assignment_history(workers, rng, ingested_at)
    movements = _movement_events(workers, assignments, rng, ingested_at, history_start, as_of)
    compensation = _compensation(workers, job_by_id, locations, rng, ingested_at)
    performance = _performance(workers, rng, ingested_at, history_start, as_of)
    engagement = _engagement(workers, rng, ingested_at, history_start, as_of)
    skills = _worker_skills(workers, rng, ingested_at)
    learning_enroll, learning_complete = _learning(workers, rng, ingested_at, history_start, as_of)
    requisitions, candidates, stages, hire_links = _ats(
        workers, job_df, location_df, rng, ingested_at, history_start, as_of
    )

    return {
        "people_org": org_df,
        "people_location": location_df,
        "people_job": job_df,
        "people_worker": workers,
        "people_assignment": assignments,
        "people_movement": movements,
        "people_compensation": compensation,
        "people_performance_review": performance,
        "people_engagement_response": engagement,
        "people_worker_skill": skills,
        "people_learning_enrollment": learning_enroll,
        "people_learning_completion": learning_complete,
        "people_requisition": requisitions,
        "people_candidate": candidates,
        "people_candidate_stage": stages,
        "people_candidate_hire": hire_links,
    }


def _location_weights(n: int) -> np.ndarray:
    weights = np.array([0.14, 0.10, 0.12, 0.08, 0.08, 0.06, 0.05, 0.07, 0.14, 0.05, 0.06, 0.05], dtype=float)
    return weights[:n] / weights[:n].sum()


def _function_weights(n: int) -> np.ndarray:
    weights = np.array([0.34, 0.10, 0.16, 0.08, 0.08, 0.07, 0.12, 0.05], dtype=float)
    return weights[:n] / weights[:n].sum()


def _level_weights(n: int) -> np.ndarray:
    weights = np.array([0.12, 0.18, 0.22, 0.16, 0.08, 0.03, 0.09, 0.05, 0.04, 0.02, 0.008, 0.002], dtype=float)
    return weights[:n] / weights[:n].sum()


def _assignment_history(workers: pd.DataFrame, rng: np.random.Generator, ingested_at: datetime) -> pd.DataFrame:
    del rng
    frame = workers[
        ["worker_id", "job_id", "org_id", "location_id", "manager_worker_id", "hire_date", "termination_date"]
    ].copy()
    frame["assignment_id"] = frame["worker_id"] + "-A0"
    frame["source_record_id"] = frame["assignment_id"]
    frame["source_system"] = SOURCE
    frame["source_updated_at"] = ingested_at
    frame["ingested_at"] = ingested_at
    frame["effective_start"] = frame["hire_date"]
    frame["effective_end"] = frame["termination_date"]
    return frame.drop(columns=["hire_date", "termination_date"])


def _movement_events(
    workers: pd.DataFrame,
    assignments: pd.DataFrame,
    rng: np.random.Generator,
    ingested_at: datetime,
    history_start: date,
    as_of: date,
) -> pd.DataFrame:
    del assignments, history_start
    hires = _vector_events(workers, "hire", workers["hire_date"], ingested_at)
    terminated = workers[workers["termination_date"].notna()]
    terms = _vector_events(terminated, "termination", terminated["termination_date"], ingested_at)
    extra = []
    extra.append(_sampled_events(workers, rng, ingested_at, as_of, "promotion", 2400, 180, 1400))
    extra.append(_sampled_events(workers, rng, ingested_at, as_of, "lateral", 4000, 120, 1200))
    extra.append(_sampled_events(workers, rng, ingested_at, as_of, "manager_change", 5250, 90, 1100))
    extra.append(_sampled_events(workers, rng, ingested_at, as_of, "location_transfer", 1600, 200, 1300))
    return pd.concat([hires, terms, *extra], ignore_index=True)


def _vector_events(frame: pd.DataFrame, event_type: str, event_dates, ingested_at: datetime) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": frame["worker_id"].astype(str) + f"-{event_type}",
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "event_id": frame["worker_id"].astype(str) + f"-{event_type}",
            "worker_id": frame["worker_id"].to_numpy(),
            "event_type": event_type,
            "event_date": event_dates.to_numpy(),
            "org_id": frame["org_id"].to_numpy(),
            "job_id": frame["job_id"].to_numpy(),
            "location_id": frame["location_id"].to_numpy(),
            "reason": frame["termination_reason"].to_numpy() if event_type == "termination" else None,
        }
    )


def _sampled_events(workers, rng, ingested_at, as_of, event_type, count, min_days, max_days):
    active = workers[workers["employment_status"] == "active"]
    n = min(len(active), count)
    sample = active.sample(n=n, replace=True, random_state=int(rng.integers(1, 10_000))).copy()
    offsets = rng.integers(min_days, max_days, size=n)
    sample["event_date"] = [
        hire + timedelta(days=int(delta)) for hire, delta in zip(sample["hire_date"], offsets)
    ]
    sample = sample[sample["event_date"] < as_of]
    sample = sample[sample["event_date"] > sample["hire_date"]]
    return _vector_events(sample, event_type, sample["event_date"], ingested_at)


def _compensation(workers, job_by_id, locations, rng, ingested_at):
    loc_mult = {loc.location_id: loc.pay_multiplier for loc in locations}
    base = workers["job_id"].map(lambda job_id: job_by_id[job_id].base_salary).astype(float)
    mult = workers["location_id"].map(loc_mult).astype(float)
    noise = rng.uniform(0.92, 1.12, len(workers))
    salary = (base * mult * noise).astype(int).clip(lower=1)
    hire_comp = pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": workers["worker_id"] + "-COMP-HIRE",
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "compensation_id": workers["worker_id"] + "-COMP-HIRE",
            "worker_id": workers["worker_id"],
            "effective_date": workers["hire_date"],
            "currency": "USD",
            "base_salary": salary,
            "pay_rate_type": "annual",
        }
    )
    active = workers[workers["employment_status"] == "active"]
    n_changes = min(len(active), 45_000)
    changed = active.sample(n=n_changes, replace=True, random_state=11).copy().reset_index(drop=True)
    changed_base = changed["job_id"].map(lambda job_id: job_by_id[job_id].base_salary).astype(float)
    changed_mult = changed["location_id"].map(loc_mult).astype(float)
    changed_salary = (changed_base * changed_mult * rng.uniform(0.95, 1.20, n_changes)).astype(int).clip(lower=1)
    offsets = rng.integers(180, 1500, size=n_changes)
    effective = [
        hire + timedelta(days=int(delta)) for hire, delta in zip(changed["hire_date"], offsets)
    ]
    change_comp = pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": changed["worker_id"] + "-COMP-CHG",
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "compensation_id": changed["worker_id"] + np.array([f"-COMP-CHG-{i}" for i in range(n_changes)]),
            "worker_id": changed["worker_id"],
            "effective_date": effective,
            "currency": "USD",
            "base_salary": changed_salary,
            "pay_rate_type": "annual",
        }
    )
    change_comp = change_comp[pd.to_datetime(change_comp["effective_date"]).dt.date < date(2026, 8, 30)]
    return pd.concat([hire_comp, change_comp], ignore_index=True)


def _cycle_table(workers, rng, ingested_at, history_start, as_of, month, day, sample_n, prefix):
    sample = workers.sample(n=min(len(workers), sample_n), random_state=int(rng.integers(1, 10_000)))
    years = [date(year, month, day) for year in range(history_start.year, as_of.year + 1) if date(year, month, day) <= as_of]
    frames = []
    for cycle_date in years:
        slice_df = sample.copy()
        slice_df = slice_df[slice_df["hire_date"] <= cycle_date]
        term = slice_df["termination_date"]
        slice_df = slice_df[term.isna() | (term >= cycle_date)]
        slice_df["cycle_date"] = cycle_date
        frames.append(slice_df)
    if not frames:
        return pd.DataFrame()
    frame = pd.concat(frames, ignore_index=True)
    frame["source_system"] = SOURCE
    frame["source_updated_at"] = ingested_at
    frame["ingested_at"] = ingested_at
    return frame


def _performance(workers, rng, ingested_at, history_start, as_of):
    frame = _cycle_table(workers, rng, ingested_at, history_start, as_of, 11, 15, 45000, "PR")
    if frame.empty:
        return frame
    rating = rng.choice([1, 2, 3, 4, 5], size=len(frame), p=[0.05, 0.12, 0.48, 0.28, 0.07])
    labels = {1: "below", 2: "developing", 3: "meets", 4: "exceeds", 5: "outstanding"}
    return pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": frame["worker_id"] + "-PR-" + frame["cycle_date"].astype(str),
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "review_id": frame["worker_id"] + "-PR-" + frame["cycle_date"].astype(str),
            "worker_id": frame["worker_id"],
            "review_date": frame["cycle_date"],
            "rating": rating,
            "rating_label": [labels[int(x)] for x in rating],
        }
    )


def _engagement(workers, rng, ingested_at, history_start, as_of):
    frame = _cycle_table(workers, rng, ingested_at, history_start, as_of, 5, 20, 40000, "ENG")
    if frame.empty:
        return frame
    return pd.DataFrame(
        {
            "source_system": SOURCE,
            "source_record_id": frame["worker_id"] + "-ENG-" + frame["cycle_date"].astype(str),
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "response_id": frame["worker_id"] + "-ENG-" + frame["cycle_date"].astype(str),
            "worker_id": frame["worker_id"],
            "survey_date": frame["cycle_date"],
            "engagement_score": rng.integers(45, 96, size=len(frame)),
        }
    )


def _worker_skills(workers, rng, ingested_at):
    skill_ids = np.array([item[0] for item in PEOPLE_SKILLS])
    sample = workers.sample(n=min(len(workers), 50000), random_state=7)
    counts = rng.integers(2, 5, size=len(sample))
    rows = []
    worker_ids = sample["worker_id"].to_numpy()
    for worker, count in zip(worker_ids, counts):
        chosen = rng.choice(skill_ids, size=int(count), replace=False)
        for skill_id in chosen:
            rows.append((worker, skill_id, int(rng.integers(1, 5))))
    frame = pd.DataFrame(rows, columns=["worker_id", "skill_id", "proficiency"])
    frame["source_system"] = SOURCE
    frame["source_record_id"] = frame["worker_id"] + "-" + frame["skill_id"]
    frame["source_updated_at"] = ingested_at
    frame["ingested_at"] = ingested_at
    return frame


def _learning(workers, rng, ingested_at, history_start, as_of):
    n_events = min(len(workers) * 3, 280_000)
    sample = workers.sample(n=n_events, replace=True, random_state=19).reset_index(drop=True)
    max_days = ((pd.to_datetime(as_of) - pd.to_datetime(sample["hire_date"])).dt.days).clip(lower=1)
    offsets = [int(rng.integers(0, int(days))) for days in max_days]
    enrolled = [
        hire + timedelta(days=offset) for hire, offset in zip(sample["hire_date"], offsets)
    ]
    sample["enrolled_on"] = enrolled
    sample = sample[(sample["enrolled_on"] >= history_start) & (sample["enrolled_on"] <= as_of)]
    seq = np.arange(len(sample))
    course_id = np.array([f"COURSE-{int(x):03d}" for x in rng.integers(1, 80, size=len(sample))])
    enrollment_id = sample["worker_id"].to_numpy() + np.array([f"-LRN-{i}" for i in seq])
    complete_days = rng.integers(1, 21, size=len(sample))
    enroll = pd.DataFrame(
        {
            "source_system": "globaltech_lms",
            "source_record_id": enrollment_id,
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "enrollment_id": enrollment_id,
            "worker_id": sample["worker_id"].to_numpy(),
            "course_id": course_id,
            "enrolled_on": sample["enrolled_on"].to_numpy(),
            "status": "completed",
        }
    )
    complete = pd.DataFrame(
        {
            "source_system": "globaltech_lms",
            "source_record_id": enrollment_id + "-C",
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "completion_id": enrollment_id + "-C",
            "enrollment_id": enrollment_id,
            "worker_id": sample["worker_id"].to_numpy(),
            "course_id": course_id,
            "completed_on": [
                day + timedelta(days=int(delta))
                for day, delta in zip(sample["enrolled_on"], complete_days)
            ],
            "hours": rng.choice([1.0, 2.0, 4.0, 6.0, 8.0], size=len(sample)),
        }
    )
    return enroll, complete


def _ats(workers, jobs, locations, rng, ingested_at, history_start, as_of):
    n_req = 18_000
    req_ids = np.array([f"REQ{i:06d}" for i in range(1, n_req + 1)])
    span = max((as_of - history_start).days, 1)
    requisitions = pd.DataFrame(
        {
            "source_system": "globaltech_ats",
            "source_record_id": req_ids,
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "requisition_id": req_ids,
            "job_id": rng.choice(jobs["job_id"].to_numpy(), size=n_req),
            "location_id": rng.choice(locations["location_id"].to_numpy(), size=n_req),
            "opened_on": [history_start + timedelta(days=int(x)) for x in rng.integers(0, span, n_req)],
            "status": rng.choice(["open", "filled", "closed"], size=n_req, p=[0.18, 0.62, 0.20]),
        }
    )
    n_cand = 90_000
    cand_ids = np.array([f"CAND{i:07d}" for i in range(1, n_cand + 1)])
    applied = np.array([history_start + timedelta(days=int(x)) for x in rng.integers(0, span, n_cand)])
    candidates = pd.DataFrame(
        {
            "source_system": "globaltech_ats",
            "source_record_id": cand_ids,
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "candidate_id": cand_ids,
            "requisition_id": rng.choice(req_ids, size=n_cand),
            "applied_on": applied,
            "current_stage": rng.choice(
                ["applied", "screen", "interview", "offer", "hired", "rejected"], size=n_cand
            ),
        }
    )
    sample_n = min(n_cand, 80_000)
    stage_names = np.array(["applied", "screen", "interview", "offer"])
    base = candidates.iloc[:sample_n]
    repeated = base.loc[base.index.repeat(4)].copy()
    repeated["stage"] = np.tile(stage_names, sample_n)
    delays = np.tile([0, 7, 16, 28], sample_n)
    repeated["stage_entered_on"] = [
        applied_on + timedelta(days=int(delay))
        for applied_on, delay in zip(repeated["applied_on"], delays)
    ]
    repeated = repeated[repeated["stage_entered_on"] <= as_of]
    stages = pd.DataFrame(
        {
            "source_system": "globaltech_ats",
            "source_record_id": repeated["candidate_id"].astype(str) + "-" + repeated["stage"].astype(str),
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "stage_event_id": repeated["candidate_id"].astype(str) + "-" + repeated["stage"].astype(str),
            "candidate_id": repeated["candidate_id"].to_numpy(),
            "requisition_id": repeated["requisition_id"].to_numpy(),
            "stage": repeated["stage"].to_numpy(),
            "stage_entered_on": repeated["stage_entered_on"].to_numpy(),
        }
    )
    hired_workers = workers.sample(n=min(len(workers), 40_000), random_state=3).reset_index(drop=True)
    n_hired = len(hired_workers)
    hire_links = pd.DataFrame(
        {
            "source_system": "globaltech_ats",
            "source_record_id": hired_workers["worker_id"] + "-HIRE",
            "source_updated_at": ingested_at,
            "ingested_at": ingested_at,
            "candidate_id": np.array([f"CAND{i:07d}" for i in range(1, n_hired + 1)]),
            "worker_id": hired_workers["worker_id"].to_numpy(),
            "hired_on": hired_workers["hire_date"].to_numpy(),
            "requisition_id": rng.choice(req_ids, size=n_hired),
            "applied_on": [
                hire - timedelta(days=21) for hire in hired_workers["hire_date"]
            ],
        }
    )
    return requisitions, candidates, stages, hire_links
