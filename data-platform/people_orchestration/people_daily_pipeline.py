from __future__ import annotations

import json
import subprocess
import sys
import traceback
from pathlib import Path

import pandas as pd

from people_ingestion.people_base import PeopleRunRecord
from people_ingestion.people_bls import run_people_bls
from people_ingestion.people_config import PEOPLE_REF, load_people_config
from people_refs import refuse_blocked
from people_ingestion.people_learn import run_people_microsoft_learn
from people_ingestion.people_onet import run_people_onet
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import (
    insert_people_quality_results,
    record_people_run,
    upsert_people_source_health,
)
from people_quality.people_incident import apply_people_apac_incident
from people_quality.people_tests import run_people_quality_tests
from people_synthetic.people_connector import PeopleSyntheticConnector
from people_synthetic.people_reference import PEOPLE_SKILLS
from people_transform.people_gold import build_people_gold
from people_transform.people_publish import publish_people_gold
from people_metadata.people_serving import execute_values


def _load_silver(store: PeopleLakeStore, as_of) -> dict[str, pd.DataFrame]:
    tables: dict[str, pd.DataFrame] = {}
    for path in store.root.glob(f"people_silver/**/year={as_of.year}/month={as_of.month:02d}/day={as_of.day:02d}/*.parquet"):
        name = path.stem.replace("_incremental", "")
        frame = pd.read_parquet(path)
        if name in tables:
            tables[name] = pd.concat([tables[name], frame], ignore_index=True).drop_duplicates(
                subset=["source_record_id"], keep="last"
            )
        else:
            tables[name] = frame
    current = store.root / "people_metadata" / "people_worker_current.parquet"
    if current.exists():
        tables["people_worker"] = pd.read_parquet(current)
    return tables


def _sync_remote_lake(config, store: PeopleLakeStore) -> None:
    if not config.remote_lake_host or not config.remote_lake_path:
        return
    subprocess.run(
        [
            "scp",
            "-o",
            "BatchMode=yes",
            "-r",
            str(store.root / "people_bronze"),
            str(store.root / "people_silver"),
            str(store.root / "people_gold"),
            str(store.root / "people_metadata"),
            str(store.root / "people_logs"),
            f"{config.remote_lake_host}:{config.remote_lake_path}/",
        ],
        check=False,
    )


def main() -> int:
    config = load_people_config()
    refuse_blocked(config.supabase_ref, PEOPLE_REF)
    if config.supabase_ref != PEOPLE_REF:
        print("refused: People serving ref mismatch", file=sys.stderr)
        return 2
    store = PeopleLakeStore(config.lake_root)
    pipeline = PeopleRunRecord(source="people_daily_pipeline", as_of_date=config.as_of.isoformat())
    failures: list[str] = []
    try:
        connector = PeopleSyntheticConnector(config, store)
        record_people_run(pipeline)
        state_path = store.root / "people_metadata" / "people_synthetic_state.json"
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
        if not state.get("bootstrap_completed"):
            print("bootstrap GlobalTech")
            tables = connector.validate(connector.fetch())
            pipeline.records_received = sum(len(frame) for frame in tables.values())
            pipeline.bronze_path = connector.write_bronze(tables)
            silver = connector.normalize(tables)
            pipeline.silver_path = connector.write_silver(silver)
            pipeline.records_written = pipeline.records_received
            state = json.loads(state_path.read_text(encoding="utf-8"))
        else:
            print("reuse existing GlobalTech bootstrap")
        if not (state.get("incremental") and state.get("as_of") == config.as_of.isoformat()):
            print("incremental daily events")
            current = pd.read_parquet(store.root / "people_metadata" / "people_worker_current.parquet")
            connector.run_incremental(current, int(state.get("next_worker_seq", len(current) + 1)))
        else:
            print("incremental already applied for as_of; skipping regenerate")

        execute_values(
            """
            insert into public.people_dim_skill (
              skill_id, skill_name, skill_category, onet_reference, provenance
            ) values (%s, %s, %s, %s, %s)
            on conflict (skill_id) do update set skill_name = excluded.skill_name
            """,
            [(skill_id, name, category, None, "synthetic_internal") for skill_id, name, category in PEOPLE_SKILLS],
        )

        silver = _load_silver(store, config.as_of)
        upsert_people_source_health(
            connector.source_name,
            expected_frequency="1 day",
            records_last_run=len(silver.get("people_worker", [])),
            freshness_status="healthy",
            quality_status="healthy",
            provenance="synthetic_internal",
        )
        print("gold rebuild")
        gold = build_people_gold(store, config.as_of, silver)
        print("publish serving marts")
        published = publish_people_gold(gold)
        print("published", published)
        quality = run_people_quality_tests(silver, gold)
        if config.demo_incident == "apac_hris_incomplete":
            quality = apply_people_apac_incident(config, store, silver["people_worker"], quality)
        failed_tests = [row for row in quality if row["status"] == "failed"]
        insert_people_quality_results(pipeline.run_id, quality)
        print("quality", len(quality), "failed", len(failed_tests))
        for row in failed_tests:
            print("FAIL", row["test_name"], row["observed_value"], row["expected_value"])
            if row["test_name"] != "apac_hris_volume":
                failures.append(row["test_name"])

        for name, runner in (
            ("onet", run_people_onet),
            ("bls", run_people_bls),
            ("learn", run_people_microsoft_learn),
        ):
            print("ingest", name)
            try:
                runner(config, store)
            except Exception as error:
                failures.append(f"{name}:{error}")
                print("WARN", name, error)

        _sync_remote_lake(config, store)
        pipeline.finish("partial" if failures else "success", "; ".join(failures) or None)
    except Exception as error:
        traceback.print_exc()
        pipeline.finish("failed", str(error))
        failures.append(str(error))
    record_people_run(pipeline)
    store.write_json(store.root / "people_logs" / f"people_pipeline_{pipeline.run_id}.json", pipeline.__dict__)
    return 1 if pipeline.status == "failed" or failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
