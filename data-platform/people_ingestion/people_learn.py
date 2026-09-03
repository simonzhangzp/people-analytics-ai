from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pandas as pd

from people_ingestion.people_base import PeopleRunRecord
from people_ingestion.people_config import PeopleConfig
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import record_people_run, upsert_people_source_health
from people_metadata.people_serving import execute_values
from people_orchestration.people_budget import people_record_api_usage

LEARN_URL = "https://learn.microsoft.com/api/catalog/?locale=en-us&type=modules,learningPaths,appliedSkills,certifications,courses"


class PeopleMicrosoftLearnConnector:
    source_name = "people_microsoft_learn"

    def __init__(self, config: PeopleConfig, store: PeopleLakeStore):
        self.config = config
        self.store = store

    def fetch(self) -> dict[str, pd.DataFrame]:
        response = httpx.get(LEARN_URL, timeout=120.0, follow_redirects=True)
        response.raise_for_status()
        payload = response.json()
        raw_path = self.store.partition(
            "people_bronze",
            "people_microsoft_learn",
            self.config.as_of,
            "people_learn_catalog.json",
        )
        self.store.write_json(raw_path, {"received_keys": list(payload.keys())})
        ingested_at = datetime.now(timezone.utc)
        rows = []
        mapping = {
            "modules": "module",
            "learningPaths": "learning_path",
            "appliedSkills": "applied_skills",
            "certifications": "certification",
            "courses": "course",
        }
        for key, content_type in mapping.items():
            for item in payload.get(key, []) or []:
                rows.append(
                    {
                        "content_id": item.get("uid") or item.get("id") or item.get("url"),
                        "content_type": content_type,
                        "title": item.get("title") or item.get("name") or "",
                        "level": ",".join(item.get("levels") or []) if isinstance(item.get("levels"), list) else item.get("level"),
                        "url": item.get("url"),
                        "provider": "microsoft_learn",
                        "last_modified": item.get("last_modified") or item.get("lastModified"),
                        "ingested_at": ingested_at,
                        "provenance": "live_public",
                        "skills": ",".join(item.get("products") or []) if isinstance(item.get("products"), list) else None,
                    }
                )
        return {"people_learn_catalog": pd.DataFrame(rows)}

    def validate(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        frame = tables["people_learn_catalog"]
        if frame.empty:
            raise ValueError("Microsoft Learn catalog was empty")
        frame = frame[frame["content_id"].notna() & (frame["title"].astype(str) != "")]
        tables["people_learn_catalog"] = frame.drop_duplicates("content_id")
        return tables

    def write_bronze(self, tables: dict[str, pd.DataFrame]) -> str:
        path = self.store.partition(
            "people_bronze",
            "people_microsoft_learn",
            self.config.as_of,
            "people_learn_catalog.parquet",
        )
        self.store.write_parquet(path, tables["people_learn_catalog"])
        return str(path.parent)

    def normalize(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        return tables

    def write_silver(self, tables: dict[str, pd.DataFrame]) -> str:
        path = self.store.partition(
            "people_silver",
            "people_microsoft_learn",
            self.config.as_of,
            "people_learn_catalog.parquet",
        )
        self.store.write_parquet(path, tables["people_learn_catalog"])
        return str(path.parent)

    def publish(self, tables: dict[str, pd.DataFrame]) -> int:
        rows = [
            (
                str(row.content_id)[:500],
                row.content_type,
                str(row.title)[:500],
                None if pd.isna(row.level) else str(row.level)[:100],
                None if pd.isna(row.url) else str(row.url)[:1000],
                "microsoft_learn",
                None,
                row.ingested_at,
                "live_public",
            )
            for row in tables["people_learn_catalog"].itertuples(index=False)
        ]
        sql = """
            insert into public.people_external_learning_content (
              content_id, content_type, title, level, url, provider,
              last_modified, ingested_at, provenance
            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (content_id) do update
            set title = excluded.title,
                content_type = excluded.content_type,
                url = excluded.url,
                ingested_at = excluded.ingested_at
        """
        from people_metadata.people_serving import execute_values as ev
        # chunk
        for start in range(0, len(rows), 1000):
            ev(sql, rows[start:start + 1000])
        return len(rows)

    def record_run(self, run: PeopleRunRecord) -> None:
        record_people_run(run)
        upsert_people_source_health(
            self.source_name,
            expected_frequency="1 day",
            records_last_run=run.records_written,
            freshness_status="healthy" if run.status == "success" else "failed",
            quality_status="healthy" if run.status == "success" else "unhealthy",
            provenance="live_public",
            error_message=run.error_message,
        )
        people_record_api_usage("microsoft_learn", self.config.as_of, 1, run.records_written, 0)


def run_people_microsoft_learn(config: PeopleConfig, store: PeopleLakeStore) -> PeopleRunRecord:
    connector = PeopleMicrosoftLearnConnector(config, store)
    run = PeopleRunRecord(source=connector.source_name, as_of_date=config.as_of.isoformat())
    try:
        tables = connector.validate(connector.fetch())
        run.records_received = len(tables["people_learn_catalog"])
        run.bronze_path = connector.write_bronze(tables)
        run.silver_path = connector.write_silver(connector.normalize(tables))
        gold_path = store.partition(
            "people_gold",
            "people_microsoft_learn",
            config.as_of,
            "people_external_learning_content.parquet",
        )
        store.write_parquet(gold_path, tables["people_learn_catalog"])
        run.records_written = connector.publish(tables)
        run.finish("success")
    except Exception as error:
        run.finish("failed", str(error))
        raise
    finally:
        connector.record_run(run)
    return run
