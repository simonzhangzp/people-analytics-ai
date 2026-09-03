from __future__ import annotations

from datetime import date

import pandas as pd

from people_ingestion.people_base import PeopleRunRecord, PeopleSourceConnector
from people_ingestion.people_config import PeopleConfig
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import record_people_run, upsert_people_source_health
from people_synthetic.people_generate import generate_people_globaltech
from people_synthetic.people_incremental import generate_people_daily_events

BRONZE_SOURCES = {
    "people_org": "people_hris",
    "people_location": "people_hris",
    "people_job": "people_hris",
    "people_worker": "people_hris",
    "people_assignment": "people_hris",
    "people_movement": "people_hris",
    "people_compensation": "people_compensation",
    "people_performance_review": "people_performance",
    "people_engagement_response": "people_engagement",
    "people_worker_skill": "people_hris",
    "people_learning_enrollment": "people_lms",
    "people_learning_completion": "people_lms",
    "people_requisition": "people_ats",
    "people_candidate": "people_ats",
    "people_candidate_stage": "people_ats",
    "people_candidate_hire": "people_ats",
}


class PeopleSyntheticConnector:
    source_name = "people_synthetic_globaltech"

    def __init__(self, config: PeopleConfig, store: PeopleLakeStore):
        self.config = config
        self.store = store

    def fetch(self) -> dict[str, pd.DataFrame]:
        return generate_people_globaltech(self.config)

    def validate(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        workers = tables["people_worker"]
        if workers["worker_id"].duplicated().any():
            raise ValueError("duplicate worker_id in synthetic extract")
        if (workers["fte"] <= 0).any():
            raise ValueError("non-positive FTE")
        return tables

    def write_bronze(self, tables: dict[str, pd.DataFrame]) -> str:
        extract_date = self.config.as_of
        last_path = ""
        for name, frame in tables.items():
            source = BRONZE_SOURCES[name]
            path = self.store.partition("people_bronze", source, extract_date, f"{name}.parquet")
            self.store.write_parquet(path, frame)
            last_path = str(path.parent)
        self.store.write_json(
            self.store.root / "people_metadata" / "people_synthetic_state.json",
            {
                "bootstrap_completed": True,
                "as_of": extract_date.isoformat(),
                "next_worker_seq": len(tables["people_worker"]) + 1,
                "active_headcount": int(
                    (tables["people_worker"]["employment_status"] == "active").sum()
                ),
            },
        )
        return last_path

    def normalize(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        cleaned = {}
        for name, frame in tables.items():
            copy = frame.copy()
            copy = copy.drop_duplicates(subset=["source_record_id"], keep="last")
            cleaned[name] = copy
        return cleaned

    def write_silver(self, tables: dict[str, pd.DataFrame]) -> str:
        extract_date = self.config.as_of
        last_path = ""
        for name, frame in tables.items():
            source = BRONZE_SOURCES[name]
            path = self.store.partition("people_silver", source, extract_date, f"{name}.parquet")
            self.store.write_parquet(path, frame)
            last_path = str(path.parent)
        current_path = self.store.root / "people_metadata" / "people_worker_current.parquet"
        self.store.write_parquet(current_path, tables["people_worker"])
        return last_path

    def record_run(self, run: PeopleRunRecord) -> None:
        record_people_run(run)
        upsert_people_source_health(
            self.source_name,
            expected_frequency="1 day",
            records_last_run=run.records_written,
            freshness_status="healthy" if run.status == "success" else "failed",
            quality_status="unknown",
            provenance="synthetic_internal",
            error_message=run.error_message,
            last_source_timestamp=run.source_max_timestamp,
        )

    def run_incremental(self, workers: pd.DataFrame, next_worker_seq: int) -> dict[str, pd.DataFrame]:
        tables, current, next_seq = generate_people_daily_events(
            self.config, workers, next_worker_seq
        )
        extract_date = self.config.as_of
        for name, frame in tables.items():
            if name == "people_worker":
                source = "people_hris"
            else:
                source = BRONZE_SOURCES[name]
            path = self.store.partition(
                "people_bronze", source, extract_date, f"{name}_incremental.parquet"
            )
            self.store.write_parquet(path, frame)
        self.store.write_parquet(
            self.store.root / "people_metadata" / "people_worker_current.parquet",
            current,
        )
        self.store.write_json(
            self.store.root / "people_metadata" / "people_synthetic_state.json",
            {
                "bootstrap_completed": True,
                "as_of": extract_date.isoformat(),
                "next_worker_seq": next_seq,
                "active_headcount": int((current["employment_status"] == "active").sum()),
                "incremental": True,
            },
        )
        return tables
