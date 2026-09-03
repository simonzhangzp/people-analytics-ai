from __future__ import annotations

"""Rebuild gold marts from existing silver. Does not regenerate GlobalTech workers."""

import sys
import traceback

from people_ingestion.people_config import PEOPLE_REF, load_people_config
from people_refs import refuse_blocked
from people_ingestion.people_storage import PeopleLakeStore
from people_orchestration.people_daily_pipeline import _load_silver
from people_quality.people_incident import apply_people_apac_incident
from people_quality.people_tests import run_people_quality_tests
from people_transform.people_gold import build_people_gold
from people_transform.people_publish import publish_people_gold


def main() -> int:
    config = load_people_config()
    refuse_blocked(config.supabase_ref, PEOPLE_REF)
    if config.supabase_ref != PEOPLE_REF:
        print("refused: People serving ref mismatch", file=sys.stderr)
        return 2
    store = PeopleLakeStore(config.lake_root)
    try:
        silver = _load_silver(store, config.as_of)
        if "people_worker" not in silver:
            print("missing people_worker silver; run the daily pipeline first", file=sys.stderr)
            return 2
        print("gold rebuild from silver", {name: len(frame) for name, frame in silver.items()})
        gold = build_people_gold(store, config.as_of, silver)
        print("publish serving marts")
        published = publish_people_gold(gold)
        print("published", published)
        quality = run_people_quality_tests(silver, gold)
        if config.demo_incident == "apac_hris_incomplete":
            quality = apply_people_apac_incident(config, store, silver["people_worker"], quality)
        failed = [row for row in quality if row["status"] == "failed"]
        print("quality", len(quality), "failed", [row["test_name"] for row in failed])
        return 0 if all(row["test_name"] == "apac_hris_volume" for row in failed) else 1
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
