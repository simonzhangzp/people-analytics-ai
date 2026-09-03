from __future__ import annotations

"""Redistribute clamped termination dates, then rebuild gold marts. Does not regenerate workers."""

from datetime import date, timedelta
from pathlib import Path
import sys

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from people_ingestion.people_config import PEOPLE_REF, load_people_config
from people_refs import refuse_blocked
from people_ingestion.people_storage import PeopleLakeStore
from people_orchestration.people_daily_pipeline import _load_silver
from people_quality.people_incident import apply_people_apac_incident
from people_quality.people_tests import run_people_quality_tests
from people_transform.people_gold import build_people_gold
from people_transform.people_publish import publish_people_gold


def redistribute_termination_dates(workers: pd.DataFrame, as_of: date, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    history_start = date(as_of.year - 5, as_of.month, 1)
    frame = workers.copy()
    hire = pd.to_datetime(frame["hire_date"]).dt.date
    term = pd.to_datetime(frame["termination_date"], errors="coerce").dt.date
    status = frame["employment_status"].astype(str)
    new_terms = []
    for active, hired, existing in zip(status == "active", hire, term):
        if active or hired is None:
            new_terms.append(None)
            continue
        if existing == as_of:
            new_terms.append(existing)
            continue
        earliest = max(hired + timedelta(days=30), history_start)
        latest = as_of - timedelta(days=1)
        if earliest >= latest:
            new_terms.append(latest if latest > hired else hired + timedelta(days=30))
        else:
            new_terms.append(earliest + timedelta(days=int(rng.integers(0, (latest - earliest).days + 1))))
    frame["termination_date"] = new_terms
    return frame


def main() -> int:
    import os

    os.environ.setdefault("PEOPLE_AS_OF_DATE", "2026-08-30")
    config = load_people_config()
    refuse_blocked(config.supabase_ref, PEOPLE_REF)
    if config.supabase_ref != PEOPLE_REF:
        print("refused: People serving ref mismatch", file=sys.stderr)
        return 2
    store = PeopleLakeStore(config.lake_root)
    silver = _load_silver(store, config.as_of)
    workers = silver["people_worker"]
    print("workers_before", len(workers), workers["employment_status"].value_counts().to_dict())
    repaired = redistribute_termination_dates(workers, config.as_of, config.seed)
    term = pd.to_datetime(repaired["termination_date"], errors="coerce")
    print("term_on_as_of_minus_1", int((term.dt.date == (config.as_of - timedelta(days=1))).sum()))
    print("term_on_as_of", int((term.dt.date == config.as_of).sum()))
    silver["people_worker"] = repaired
    path = store.partition("people_silver", "people_hris", config.as_of, "people_worker.parquet")
    store.write_parquet(path, repaired)
    gold = build_people_gold(store, config.as_of, silver)
    published = publish_people_gold(gold)
    print("published", published)
    quality = run_people_quality_tests(silver, gold)
    if config.demo_incident == "apac_hris_incomplete":
        quality = apply_people_apac_incident(config, store, silver["people_worker"], quality)
    failed = [row["test_name"] for row in quality if row["status"] == "failed"]
    print("quality_failed", failed)
    return 0 if all(name == "apac_hris_volume" for name in failed) else 1


if __name__ == "__main__":
    raise SystemExit(main())
