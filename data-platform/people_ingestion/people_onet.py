from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone

import httpx
import pandas as pd

from people_ingestion.people_base import PeopleRunRecord
from people_ingestion.people_config import PeopleConfig
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import record_people_run, upsert_people_source_health
from people_metadata.people_serving import execute_values
from people_orchestration.people_budget import people_record_api_usage

ONET_ZIP = "https://www.onetcenter.org/dl_files/database/db_31_0_text.zip"


def _read_onet_table(archive: zipfile.ZipFile, fragment: str) -> pd.DataFrame:
    names = archive.namelist()
    matches = [name for name in names if name.replace("\\", "/").split("/")[-1] == fragment]
    if not matches:
        matches = [name for name in names if fragment.lower() in name.lower()]
    if not matches:
        raise FileNotFoundError(fragment)
    with archive.open(matches[0]) as handle:
        return pd.read_csv(handle, sep="\t", dtype=str)


class PeopleOnetConnector:
    source_name = "people_onet"

    def __init__(self, config: PeopleConfig, store: PeopleLakeStore):
        self.config = config
        self.store = store

    def fetch(self) -> dict[str, pd.DataFrame]:
        response = httpx.get(ONET_ZIP, timeout=120.0, follow_redirects=True, headers={"User-Agent": "PeopleAnalyticsAI/1.0"})
        response.raise_for_status()
        raw_path = self.store.partition(
            "people_bronze", "people_onet", self.config.as_of, "db_31_0_text.zip"
        )
        self.store.write_bytes(raw_path, response.content)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            tables = {
                "occupation": _read_onet_table(archive, "Occupation Data.txt"),
                "alternate_titles": _read_onet_table(archive, "Job Titles.txt"),
                "skills": _read_onet_table(archive, "Essential Skills.txt"),
                "knowledge": _read_onet_table(archive, "Knowledge.txt"),
                "abilities": _read_onet_table(archive, "Abilities.txt"),
                "tasks": _read_onet_table(archive, "Task Statements.txt"),
                "work_activities": _read_onet_table(archive, "Work Activities.txt"),
            }
        return tables

    def validate(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        if tables["occupation"].empty:
            raise ValueError("O*NET occupation file is empty")
        return tables

    def write_bronze(self, tables: dict[str, pd.DataFrame]) -> str:
        last = ""
        for name, frame in tables.items():
            path = self.store.partition("people_bronze", "people_onet", self.config.as_of, f"{name}.parquet")
            self.store.write_parquet(path, frame)
            last = str(path.parent)
        return last

    def normalize(self, tables: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        occ = tables["occupation"].copy()
        occ.columns = [col.strip() for col in occ.columns]
        code_col = next(col for col in occ.columns if "CODE" in col.upper() or "SOC" in col.upper())
        title_col = next(col for col in occ.columns if "TITLE" in col.upper())
        occ["occupation_id"] = occ[code_col].str.replace(r"\.00$", "", regex=True)
        occ["soc_code"] = occ["occupation_id"]
        occ["title"] = occ[title_col]
        occ["provenance"] = "live_public"
        skills = tables["skills"].copy()
        skills.columns = [col.strip() for col in skills.columns]
        element = next(col for col in skills.columns if "ELEMENT ID" in col.upper() or col.upper() == "ELEMENT ID")
        name_col = next((col for col in skills.columns if "ELEMENT NAME" in col.upper()), None)
        if name_col is None:
            name_col = element
        skill_dim = skills[[element, name_col]].drop_duplicates()
        skill_dim = skill_dim.rename(columns={element: "skill_id", name_col: "skill_name"})
        skill_dim["skill_id"] = "onet_" + skill_dim["skill_id"].astype(str)
        skill_dim["skill_category"] = "onet"
        skill_dim["onet_reference"] = skill_dim["skill_id"]
        skill_dim["provenance"] = "live_public"
        return {"people_dim_occupation": occ[["occupation_id", "soc_code", "title", "provenance"]].drop_duplicates("occupation_id"), "people_dim_skill": skill_dim}

    def write_silver(self, tables: dict[str, pd.DataFrame]) -> str:
        last = ""
        for name, frame in tables.items():
            path = self.store.partition("people_silver", "people_onet", self.config.as_of, f"{name}.parquet")
            self.store.write_parquet(path, frame)
            last = str(path.parent)
        return last

    def publish(self, tables: dict[str, pd.DataFrame]) -> int:
        occ_rows = [
            (row.occupation_id, row.soc_code, row.title, "live_public")
            for row in tables["people_dim_occupation"].itertuples(index=False)
        ]
        execute_values(
            """
            insert into public.people_dim_occupation (occupation_id, soc_code, title, provenance)
            values (%s, %s, %s, %s)
            on conflict (occupation_id) do update
            set title = excluded.title, soc_code = excluded.soc_code, provenance = excluded.provenance
            """,
            occ_rows,
        )
        skill_rows = [
            (row.skill_id, row.skill_name, row.skill_category, row.onet_reference, "live_public")
            for row in tables["people_dim_skill"].itertuples(index=False)
        ]
        execute_values(
            """
            insert into public.people_dim_skill (
              skill_id, skill_name, skill_category, onet_reference, provenance
            ) values (%s, %s, %s, %s, %s)
            on conflict (skill_id) do update
            set skill_name = excluded.skill_name, onet_reference = excluded.onet_reference
            """,
            skill_rows,
        )
        return len(occ_rows) + len(skill_rows)

    def record_run(self, run: PeopleRunRecord) -> None:
        record_people_run(run)
        upsert_people_source_health(
            self.source_name,
            expected_frequency="90 days",
            records_last_run=run.records_written,
            freshness_status="healthy" if run.status == "success" else "failed",
            quality_status="healthy" if run.status == "success" else "unhealthy",
            provenance="live_public",
            error_message=run.error_message,
        )
        people_record_api_usage("onet", self.config.as_of, 1, run.records_written, 0)


def run_people_onet(config: PeopleConfig, store: PeopleLakeStore) -> PeopleRunRecord:
    connector = PeopleOnetConnector(config, store)
    run = PeopleRunRecord(source=connector.source_name, as_of_date=config.as_of.isoformat())
    try:
        raw = connector.fetch()
        run.records_received = sum(len(frame) for frame in raw.values())
        raw = connector.validate(raw)
        run.bronze_path = connector.write_bronze(raw)
        silver = connector.normalize(raw)
        run.silver_path = connector.write_silver(silver)
        run.records_written = connector.publish(silver)
        run.finish("success")
    except Exception as error:
        run.finish("failed", str(error))
        raise
    finally:
        connector.record_run(run)
    return run
