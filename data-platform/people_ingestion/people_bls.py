from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pandas as pd

from people_ingestion.people_base import PeopleRunRecord
from people_ingestion.people_config import PeopleConfig
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import record_people_run, upsert_people_source_health
from people_orchestration.people_budget import people_record_api_usage

BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
SERIES = {
    "JTS000000000000000JOL": ("job_openings", "level"),
    "JTS000000000000000HIR": ("hires", "level"),
    "JTS000000000000000QUL": ("quits", "level"),
    "CES0000000001": ("nonfarm_employment", "level"),
    "OEUN000000000000015125213": ("software_developer_median_wage", "usd"),
    "OEUN000000000000013111113": ("management_analyst_median_wage", "usd"),
}


class PeopleBlsConnector:
    source_name = "people_bls"

    def __init__(self, config: PeopleConfig, store: PeopleLakeStore):
        self.config = config
        self.store = store

    def fetch(self) -> dict[str, pd.DataFrame]:
        payload = {
            "seriesid": list(SERIES.keys()),
            "startyear": str(self.config.as_of.year - 5),
            "endyear": str(self.config.as_of.year),
        }
        if self.config.bls_api_key:
            payload["registrationkey"] = self.config.bls_api_key
        response = httpx.post(BLS_URL, json=payload, timeout=60.0)
        response.raise_for_status()
        body = response.json()
        raw_path = self.store.partition(
            "people_bronze", "people_bls", self.config.as_of, "people_bls_response.json"
        )
        self.store.write_json(raw_path, body)
        if body.get("status") != "REQUEST_SUCCEEDED":
            raise ValueError(body.get("message") or body.get("status") or "BLS request failed")
        rows = []
        ingested_at = datetime.now(timezone.utc)
        for series in body["Results"]["series"]:
            series_id = series["seriesID"]
            metric, unit = SERIES.get(series_id, (series_id, "unknown"))
            for item in series.get("data", []):
                rows.append(
                    {
                        "source": "bls",
                        "series_id": series_id,
                        "metric": metric,
                        "unit": unit,
                        "source_period": f"{item['year']}-{item['period']}",
                        "value": item.get("value"),
                        "ingested_at": ingested_at,
                    }
                )
        return {"people_bls_series": pd.DataFrame(rows)}

    def validate(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        if tables["people_bls_series"].empty:
            raise ValueError("BLS returned no series rows")
        return tables

    def write_bronze(self, tables: dict[str, pd.DataFrame]) -> str:
        path = self.store.partition(
            "people_bronze", "people_bls", self.config.as_of, "people_bls_series.parquet"
        )
        self.store.write_parquet(path, tables["people_bls_series"])
        return str(path.parent)

    def normalize(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        return tables

    def write_silver(self, tables: dict[str, pd.DataFrame]) -> str:
        path = self.store.partition(
            "people_silver", "people_bls", self.config.as_of, "people_bls_series.parquet"
        )
        self.store.write_parquet(path, tables["people_bls_series"])
        return str(path.parent)

    def record_run(self, run: PeopleRunRecord) -> None:
        record_people_run(run)
        upsert_people_source_health(
            self.source_name,
            expected_frequency="30 days",
            records_last_run=run.records_written,
            freshness_status="healthy" if run.status == "success" else "failed",
            quality_status="healthy" if run.status == "success" else "unhealthy",
            provenance="live_public",
            error_message=run.error_message,
        )
        people_record_api_usage("bls", self.config.as_of, 1, run.records_written, 0)


def run_people_bls(config: PeopleConfig, store: PeopleLakeStore) -> PeopleRunRecord:
    connector = PeopleBlsConnector(config, store)
    run = PeopleRunRecord(source=connector.source_name, as_of_date=config.as_of.isoformat())
    try:
        tables = connector.validate(connector.fetch())
        run.records_received = len(tables["people_bls_series"])
        run.bronze_path = connector.write_bronze(tables)
        run.silver_path = connector.write_silver(connector.normalize(tables))
        gold_path = store.partition(
            "people_gold", "people_bls", config.as_of, "people_external_bls_benchmark.parquet"
        )
        store.write_parquet(gold_path, tables["people_bls_series"])
        run.records_written = run.records_received
        run.finish("success")
    except Exception as error:
        run.finish("failed", str(error))
        raise
    finally:
        connector.record_run(run)
    return run
