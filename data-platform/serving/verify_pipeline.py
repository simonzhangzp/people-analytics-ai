from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from people_metadata.people_serving import execute

for label, sql in [
    ("dim_worker", "select count(*) from public.people_dim_worker"),
    ("dim_worker_active", "select count(*) filter (where employment_status='active') from public.people_dim_worker"),
    ("dim_org", "select count(*) from public.people_dim_org"),
    ("dim_location", "select count(*) from public.people_dim_location"),
    ("dim_job", "select count(*) from public.people_dim_job"),
    ("dim_occupation", "select count(*) from public.people_dim_occupation"),
    ("dim_skill", "select count(*) from public.people_dim_skill"),
    ("mart_workforce", "select count(*) from public.people_mart_workforce_overview"),
    ("mart_retention", "select count(*) from public.people_mart_retention"),
    ("learn_content", "select count(*) from public.people_external_learning_content"),
    ("pipeline_runs", "select count(*) from public.people_pipeline_runs"),
    ("quality_results", "select count(*) from public.people_quality_test_results"),
    ("quality_passed", "select count(*) filter (where status='passed') from public.people_quality_test_results"),
    ("quality_failed", "select count(*) filter (where status='failed') from public.people_quality_test_results"),
    ("incidents", "select incident_id, business_change, source_name from public.people_data_quality_incident"),
    ("source_health", "select source_name, freshness_status, quality_status, records_last_run from public.people_source_health order by 1"),
    ("runs", "select source, status, records_written from public.people_pipeline_runs order by started_at"),
    ("metrics", "select metric_id, health_status from public.people_metric_definition"),
    ("panorama_daily", "select count(*) from public.panorama_daily"),
    ("unhealthy_slices", "select count(*) filter (where quality_status='unhealthy') from public.people_mart_workforce_overview"),
    ("lineage_headcount", "select * from public.people_dataset_lineage where dataset_name='people_mart_workforce_overview'"),
    ("certified_metrics", "select count(*) from public.people_metric_definition where status='certified'"),
    ("mart_skills", "select count(*) from public.people_mart_skills"),
    ("mart_manager", "select count(*) from public.people_mart_manager_effectiveness"),
    ("mart_compensation_view", "select count(*) from public.people_mart_compensation"),
    ("mart_learning_view", "select count(*) from public.people_mart_learning"),
]:
    print(label, execute(sql))
