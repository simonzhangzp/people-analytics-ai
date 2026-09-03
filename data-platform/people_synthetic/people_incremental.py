from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from people_ingestion.people_config import PeopleConfig
from people_synthetic.people_generate import SOURCE
from people_synthetic.people_reference import PEOPLE_LOCATIONS, people_jobs, people_org_rows

DAILY = {
    "hires": 35,
    "exits": 25,
    "promotions": 12,
    "laterals": 20,
    "manager_changes": 35,
    "compensation_changes": 50,
    "learning_completions": 250,
    "ats_stage_moves": 500,
}


def generate_people_daily_events(
    config: PeopleConfig,
    workers: pd.DataFrame,
    next_worker_seq: int,
) -> tuple[dict[str, pd.DataFrame], pd.DataFrame, int]:
    rng = np.random.default_rng(config.seed + config.as_of.toordinal())
    ingested_at = datetime.now(timezone.utc)
    as_of = config.as_of
    jobs = people_jobs()
    job_by_id = {job.job_id: job for job in jobs}
    team_orgs = [row for row in people_org_rows() if row["org_level"] == 3]
    locations = PEOPLE_LOCATIONS
    active = workers[workers["employment_status"] == "active"].copy()
    current = workers.copy()
    events = []
    compensation = []
    learning = []
    stages = []

    new_ids = [f"GTW{i:07d}" for i in range(next_worker_seq, next_worker_seq + DAILY["hires"])]
    next_seq = next_worker_seq + DAILY["hires"]
    hire_rows = []
    for i, worker_id in enumerate(new_ids):
        loc = locations[int(rng.integers(0, len(locations)))]
        job = jobs[int(rng.integers(0, len(jobs)))]
        org = team_orgs[int(rng.integers(0, len(team_orgs)))]
        manager = active["worker_id"].iloc[int(rng.integers(0, len(active)))]
        hire_rows.append(
            {
                "source_system": SOURCE,
                "source_record_id": worker_id,
                "source_updated_at": ingested_at,
                "ingested_at": ingested_at,
                "worker_id": worker_id,
                "preferred_first_name": "New",
                "preferred_last_name": worker_id[-4:],
                "employment_status": "active",
                "hire_date": as_of,
                "termination_date": None,
                "termination_reason": None,
                "job_id": job.job_id,
                "org_id": org["org_id"],
                "location_id": loc.location_id,
                "region": loc.region,
                "manager_worker_id": manager,
                "fte": 1.0,
                "gender": "undisclosed",
                "generation": "millennial",
                "ethnicity_band": "undisclosed",
            }
        )
        events.append(_event(worker_id, "hire", as_of, ingested_at, org["org_id"], job.job_id, loc.location_id))
        salary = max(int(job.base_salary * loc.pay_multiplier), 1)
        compensation.append(_comp(worker_id, as_of, salary, ingested_at, i))
    hires_df = pd.DataFrame(hire_rows)
    current = pd.concat([current, hires_df], ignore_index=True)
    active = current[current["employment_status"] == "active"]

    leavers = active.sample(n=DAILY["exits"], random_state=int(rng.integers(1, 10_000)))
    current.loc[current["worker_id"].isin(leavers["worker_id"]), "employment_status"] = "terminated"
    current.loc[current["worker_id"].isin(leavers["worker_id"]), "termination_date"] = as_of
    current.loc[current["worker_id"].isin(leavers["worker_id"]), "termination_reason"] = "voluntary"
    for person in leavers.itertuples(index=False):
        events.append(
            _event(person.worker_id, "termination", as_of, ingested_at, person.org_id, person.job_id, person.location_id, "voluntary")
        )

    active = current[current["employment_status"] == "active"]
    for event_type, n in (("promotion", DAILY["promotions"]), ("lateral", DAILY["laterals"]), ("manager_change", DAILY["manager_changes"])):
        sample = active.sample(n=min(len(active), n), random_state=int(rng.integers(1, 10_000)))
        for person in sample.itertuples(index=False):
            events.append(_event(person.worker_id, event_type, as_of, ingested_at, person.org_id, person.job_id, person.location_id))

    comp_sample = active.sample(n=min(len(active), DAILY["compensation_changes"]), random_state=5)
    for i, person in enumerate(comp_sample.itertuples(index=False)):
        job = job_by_id[person.job_id]
        loc = next(item for item in locations if item.location_id == person.location_id)
        salary = max(int(job.base_salary * loc.pay_multiplier * 1.03), 1)
        compensation.append(_comp(person.worker_id, as_of, salary, ingested_at, 1000 + i))

    learn_sample = active.sample(n=min(len(active), DAILY["learning_completions"]), replace=True, random_state=9)
    for i, person in enumerate(learn_sample.itertuples(index=False)):
        enrollment_id = f"{person.worker_id}-LRN-D{as_of.isoformat()}-{i}"
        learning.append(
            {
                "source_system": "globaltech_lms",
                "source_record_id": enrollment_id + "-C",
                "source_updated_at": ingested_at,
                "ingested_at": ingested_at,
                "completion_id": enrollment_id + "-C",
                "enrollment_id": enrollment_id,
                "worker_id": person.worker_id,
                "course_id": f"COURSE-{(i % 79) + 1:03d}",
                "completed_on": as_of,
                "hours": 2.0,
            }
        )

    for i in range(DAILY["ats_stage_moves"]):
        stages.append(
            {
                "source_system": "globaltech_ats",
                "source_record_id": f"CAND{i+900000:07d}-screen-{as_of}",
                "source_updated_at": ingested_at,
                "ingested_at": ingested_at,
                "stage_event_id": f"CAND{i+900000:07d}-screen-{as_of}",
                "candidate_id": f"CAND{i+900000:07d}",
                "requisition_id": f"REQ{(i % 18000) + 1:06d}",
                "stage": "screen",
                "stage_entered_on": as_of,
            }
        )

    tables = {
        "people_movement": pd.DataFrame(events),
        "people_compensation": pd.DataFrame(compensation),
        "people_learning_completion": pd.DataFrame(learning),
        "people_candidate_stage": pd.DataFrame(stages),
        "people_worker": current,
    }
    return tables, current, next_seq


def _event(worker_id, event_type, event_date, ingested_at, org_id, job_id, location_id, reason=None):
    return {
        "source_system": SOURCE,
        "source_record_id": f"{worker_id}-{event_type}-{event_date}",
        "source_updated_at": ingested_at,
        "ingested_at": ingested_at,
        "event_id": f"{worker_id}-{event_type}-{event_date}",
        "worker_id": worker_id,
        "event_type": event_type,
        "event_date": event_date,
        "org_id": org_id,
        "job_id": job_id,
        "location_id": location_id,
        "reason": reason,
    }


def _comp(worker_id, effective_date, salary, ingested_at, seq):
    return {
        "source_system": SOURCE,
        "source_record_id": f"{worker_id}-COMP-{effective_date}-{seq}",
        "source_updated_at": ingested_at,
        "ingested_at": ingested_at,
        "compensation_id": f"{worker_id}-COMP-{effective_date}-{seq}",
        "worker_id": worker_id,
        "effective_date": effective_date,
        "currency": "USD",
        "base_salary": salary,
        "pay_rate_type": "annual",
    }
