from __future__ import annotations

import pandas as pd

from people_ingestion.people_config import PeopleConfig
from people_ingestion.people_storage import PeopleLakeStore
from people_metadata.people_runs import mark_people_metrics_unhealthy, upsert_people_incident
from people_metadata.people_serving import execute
from people_quality.people_tests import _result


def apply_people_apac_incident(
    config: PeopleConfig,
    store: PeopleLakeStore,
    workers: pd.DataFrame,
    quality_results: list[dict],
) -> list[dict]:
    extract_date = config.as_of
    baseline = int((workers["region"] == "APAC").sum())
    incomplete = workers[workers["region"] != "APAC"].copy()
    apac = workers[workers["region"] == "APAC"]
    kept = apac.sample(frac=0.35, random_state=config.seed)
    incident_workers = pd.concat([incomplete, kept], ignore_index=True)
    path = store.partition(
        "people_bronze", "people_hris", extract_date, "people_worker_incident_apac.parquet"
    )
    store.write_parquet(path, incident_workers)
    observed = int((incident_workers["region"] == "APAC").sum())
    dropped = observed < baseline * 0.8
    quality_results.append(
        _result(
            "apac_hris_volume",
            "freshness",
            not dropped,
            observed,
            f">= {int(baseline * 0.8)} (baseline {baseline})",
            "people_hris",
            ["people_mart_workforce_overview", "people_dim_worker"],
            "Deliberate APAC HRIS incomplete feed for demo incident.",
        )
    )
    if dropped:
        upsert_people_incident(
            "people-incident-apac-hris-incomplete",
            "APAC HRIS feed incomplete for daily load",
            "people_hris",
            ["headcount", "voluntary_attrition", "average_headcount", "hires"],
            (
                f"APAC worker rows dropped from {baseline} to {observed}. "
                "Certified headcount was not republished as a business change. "
                "This is a data issue, not a workforce change. "
                "Upstream source: people_hris via people_dataset_lineage."
            ),
            expected_records=baseline,
            actual_records=observed,
        )
        mark_people_metrics_unhealthy(["headcount", "voluntary_attrition"])
        execute(
            """
            update public.people_mart_workforce_overview w
            set quality_status = 'unhealthy'
            from public.people_dim_location loc
            where loc.location_id = w.location_id
              and loc.region = 'APAC'
            """
        )
        execute(
            """
            update public.people_mart_retention r
            set quality_status = 'unhealthy'
            from public.people_dim_location loc
            where loc.location_id = r.location_id
              and loc.region = 'APAC'
            """
        )
        execute(
            """
            update public.people_source_health
            set quality_status = 'unhealthy',
                error_message = 'APAC HRIS volume drop detected',
                updated_at = now()
            where source_name = 'people_synthetic_globaltech'
            """
        )
        execute(
            """
            update public.people_source_freshness
            set quality_status = 'unhealthy',
                error_message = 'APAC HRIS volume drop detected',
                updated_at = now()
            where source_name = 'people_synthetic_globaltech'
            """
        )
    return quality_results
