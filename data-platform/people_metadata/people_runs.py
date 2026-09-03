from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from people_ingestion.people_base import PeopleRunRecord
from people_metadata.people_serving import execute, execute_values


def record_people_run(run: PeopleRunRecord) -> None:
    execute_values(
        """
        insert into public.people_pipeline_runs (
          run_id, source, started_at, completed_at, status,
          records_received, records_written, records_rejected,
          source_max_timestamp, error_message, estimated_api_cost,
          bronze_path, silver_path, as_of_date
        )
        values (
          %s::uuid, %s, %s, %s, %s,
          %s, %s, %s,
          %s, %s, %s,
          %s, %s, %s
        )
        on conflict (run_id) do update
        set completed_at = excluded.completed_at,
            status = excluded.status,
            records_received = excluded.records_received,
            records_written = excluded.records_written,
            records_rejected = excluded.records_rejected,
            source_max_timestamp = excluded.source_max_timestamp,
            error_message = excluded.error_message,
            estimated_api_cost = excluded.estimated_api_cost,
            bronze_path = excluded.bronze_path,
            silver_path = excluded.silver_path
        """,
        [
            (
                run.run_id,
                run.source,
                run.started_at,
                run.completed_at,
                run.status,
                run.records_received,
                run.records_written,
                run.records_rejected,
                run.source_max_timestamp,
                run.error_message,
                run.estimated_api_cost,
                run.bronze_path,
                run.silver_path,
                run.as_of_date,
            )
        ],
    )


def upsert_people_source_health(
    source_name: str,
    *,
    expected_frequency: str,
    records_last_run: int,
    freshness_status: str,
    quality_status: str,
    provenance: str,
    error_message: str | None = None,
    last_source_timestamp: datetime | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    success_at = now if freshness_status != "failed" else None
    execute(
        """
        insert into public.people_source_health (
          source_name, expected_frequency, last_attempt_at, last_success_at,
          last_source_timestamp, records_last_run, freshness_status,
          quality_status, error_message, provenance, updated_at
        )
        values (
          %s, %s::interval, %s, %s,
          %s, %s, %s, %s, %s, %s, now()
        )
        on conflict (source_name) do update
        set expected_frequency = excluded.expected_frequency,
            last_attempt_at = excluded.last_attempt_at,
            last_success_at = coalesce(excluded.last_success_at, people_source_health.last_success_at),
            last_source_timestamp = excluded.last_source_timestamp,
            records_last_run = excluded.records_last_run,
            freshness_status = excluded.freshness_status,
            quality_status = excluded.quality_status,
            error_message = excluded.error_message,
            provenance = excluded.provenance,
            updated_at = now()
        """,
        (
            source_name,
            expected_frequency,
            now,
            success_at,
            last_source_timestamp,
            records_last_run,
            freshness_status,
            quality_status,
            error_message,
            provenance,
        ),
    )
    execute(
        """
        insert into public.people_source_freshness (
          source_name, provenance, last_successful_ingestion, expected_frequency,
          row_count, previous_row_count, freshness_status, last_attempt_at,
          quality_status, error_message, updated_at
        )
        values (
          %s, %s, %s, %s::interval, %s, 0, %s, %s, %s, %s, now()
        )
        on conflict (source_name) do update
        set provenance = excluded.provenance,
            last_successful_ingestion = coalesce(excluded.last_successful_ingestion, people_source_freshness.last_successful_ingestion),
            expected_frequency = excluded.expected_frequency,
            previous_row_count = people_source_freshness.row_count,
            row_count = excluded.row_count,
            freshness_status = excluded.freshness_status,
            last_attempt_at = excluded.last_attempt_at,
            quality_status = excluded.quality_status,
            error_message = excluded.error_message,
            updated_at = now()
        """,
        (
            source_name,
            provenance,
            success_at,
            expected_frequency,
            records_last_run,
            freshness_status,
            now,
            quality_status,
            error_message,
        ),
    )


def insert_people_quality_results(run_id: str, rows: list[dict]) -> None:
    payload = [
        (
            str(uuid4()),
            run_id,
            row["test_name"],
            row["test_group"],
            row["status"],
            str(row.get("observed_value", "")),
            str(row.get("expected_value", "")),
            row.get("details"),
            row.get("source_name"),
            row.get("affected_datasets") or [],
        )
        for row in rows
    ]
    execute_values(
        """
        insert into public.people_quality_test_results (
          result_id, run_id, test_name, test_group, status,
          observed_value, expected_value, details, source_name, affected_datasets
        )
        values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        payload,
    )


def upsert_people_incident(
    incident_id: str,
    title: str,
    source_name: str,
    affected_metrics: list[str],
    summary: str,
    expected_records: int | None = None,
    actual_records: int | None = None,
) -> None:
    execute(
        """
        insert into public.people_data_quality_incident (
          incident_id, title, severity, status, affected_metrics, source_name,
          detected_at, business_change, summary, expected_records, actual_records
        )
        values (%s, %s, 'high', 'open', %s, %s, now(), false, %s, %s, %s)
        on conflict (incident_id) do update
        set summary = excluded.summary,
            status = 'open',
            business_change = false,
            detected_at = now(),
            affected_metrics = excluded.affected_metrics,
            expected_records = excluded.expected_records,
            actual_records = excluded.actual_records
        """,
        (incident_id, title, affected_metrics, source_name, summary, expected_records, actual_records),
    )


def mark_people_metrics_unhealthy(metric_ids: list[str]) -> None:
    execute(
        """
        update public.people_metric_definition
        set health_status = 'unhealthy',
            quality_status = 'unhealthy',
            validation_status = 'unhealthy',
            updated_at = now()
        where metric_id = any(%s)
        """,
        (metric_ids,),
    )
