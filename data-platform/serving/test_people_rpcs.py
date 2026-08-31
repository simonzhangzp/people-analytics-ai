from __future__ import annotations

"""Integration tests for People serving RPCs. Staging only."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from people_metadata.people_serving import execute


def _rpc(sql: str):
    rows = execute(sql)
    return rows[0][0] if rows else None


def main() -> int:
    facts = _rpc("select public.people_get_platform_facts()")
    assert facts["certified_metrics"] >= 18, facts
    assert facts["active_employees"] > 1000, facts
    assert facts["dataset_label"] == "Synthetic Enterprise People Dataset"

    headcount = _rpc("select public.people_get_metric('headcount')")
    assert headcount["value"] >= 0, headcount
    assert headcount["quality_status"] in ("healthy", "unhealthy"), headcount
    assert headcount["trusted"] is False or headcount["quality_status"] == "healthy"

    attrition = _rpc("select public.people_get_metric('voluntary_attrition')")
    assert attrition["unit"] == "rate"
    if attrition["value"] is not None:
        assert 0 <= float(attrition["value"]) <= 1, attrition

    definition = _rpc("select public.people_get_metric_definition('voluntary_attrition')")
    assert definition["formula_sql"]
    assert definition["owner"]
    assert definition["source_tables"]

    engineering = _rpc("select public.people_get_metric('headcount', null, 'Engineering')")
    assert engineering["value"] >= 0

    incidents = _rpc("select public.people_get_quality_incidents()")
    apac = next(
        (item for item in incidents["incidents"] if item["incident_id"] == "people-incident-apac-hris-incomplete"),
        None,
    )
    assert apac is not None, incidents
    assert apac["business_change"] is False
    assert headcount["quality_status"] == "healthy", headcount
    assert headcount["trusted"] is True

    replay_quality = execute(
        "select public.people_metric_quality_status('headcount', false, 'incident_replay')"
    )[0][0]
    assert replay_quality == "unhealthy", replay_quality
    current_snapshot = _rpc("select public.people_get_serving_snapshot('current')")
    assert current_snapshot["quality_mode"] == "trusted", current_snapshot
    assert current_snapshot["headcount_quality"] == "healthy", current_snapshot

    lineage = _rpc("select public.people_trace_metric_lineage('headcount')")
    assert "people_mart_workforce_overview" in lineage["downstream_marts"]

    validation = _rpc("select public.people_validate_certified_metrics()")
    assert int(validation["failed"]) == 0, validation

    panorama = execute("select count(*) from public.panorama_daily")[0][0]
    assert panorama >= 0
    print("rpc integration tests passed")
    print("facts", facts)
    print("headcount", headcount["value"], headcount["quality_status"])
    print("engineering", engineering["value"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
