-- Pipeline metadata, quality, extra dims. Does not touch QuantReview tables.

create table if not exists public.people_pipeline_runs (
  run_id uuid primary key,
  source text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed', 'partial')),
  records_received integer not null default 0,
  records_written integer not null default 0,
  records_rejected integer not null default 0,
  source_max_timestamp timestamptz,
  error_message text,
  estimated_api_cost numeric(10, 2) not null default 0,
  bronze_path text,
  silver_path text,
  as_of_date date,
  created_at timestamptz not null default now()
);

create index if not exists people_pipeline_runs_source_started_idx
  on public.people_pipeline_runs (source, started_at desc);

create table if not exists public.people_source_health (
  source_name text primary key,
  expected_frequency interval,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_source_timestamp timestamptz,
  records_last_run bigint,
  freshness_status text not null default 'healthy'
    check (freshness_status in ('healthy', 'late', 'failed', 'paused')),
  quality_status text not null default 'healthy'
    check (quality_status in ('healthy', 'unhealthy', 'unknown')),
  error_message text,
  provenance text not null default 'synthetic_internal',
  updated_at timestamptz not null default now()
);

create table if not exists public.people_quality_test_results (
  result_id uuid primary key,
  run_id uuid references public.people_pipeline_runs (run_id) on delete cascade,
  test_name text not null,
  test_group text not null,
  status text not null check (status in ('passed', 'failed', 'skipped')),
  observed_value text,
  expected_value text,
  details text,
  source_name text,
  affected_datasets text[] not null default '{}',
  checked_at timestamptz not null default now()
);

create index if not exists people_quality_test_results_run_idx
  on public.people_quality_test_results (run_id, status);

create table if not exists public.people_dataset_lineage (
  dataset_name text primary key,
  upstream_source text not null,
  grain text,
  serving_table text,
  updated_at timestamptz not null default now()
);

create table if not exists public.people_dim_org (
  org_id text primary key,
  org_name text not null,
  parent_org_id text,
  org_level integer not null,
  function_name text,
  region text,
  provenance text not null default 'synthetic_internal'
);

create table if not exists public.people_dim_location (
  location_id text primary key,
  location_name text not null,
  country text not null,
  region text not null,
  city text,
  provenance text not null default 'synthetic_internal'
);

create table if not exists public.people_dim_job (
  job_id text primary key,
  job_title text not null,
  job_family text not null,
  job_level text not null,
  occupation_id text,
  provenance text not null default 'synthetic_internal'
);

create table if not exists public.people_dim_worker (
  worker_id text primary key,
  org_id text,
  job_id text,
  location_id text,
  manager_worker_id text,
  hire_date date,
  termination_date date,
  employment_status text not null,
  fte numeric,
  effective_start date,
  effective_end date,
  provenance text not null default 'synthetic_internal'
);

insert into public.people_dataset_lineage (
  dataset_name, upstream_source, grain, serving_table
)
values
  ('people_mart_workforce_overview', 'people_hris', 'org × job_family × location × month', 'people_mart_workforce_overview'),
  ('people_mart_retention', 'people_hris', 'org × job_family × location × month', 'people_mart_retention'),
  ('people_mart_internal_mobility', 'people_hris', 'org × job_family × month', 'people_mart_internal_mobility'),
  ('people_mart_compensation_equity', 'people_compensation', 'job_family × location × month', 'people_mart_compensation_equity'),
  ('people_mart_learning_adoption', 'people_lms', 'org × job_family × month', 'people_mart_learning_adoption'),
  ('people_mart_recruiting', 'people_ats', 'job_family × location × week', 'people_mart_recruiting'),
  ('people_dim_occupation', 'people_onet', 'occupation', 'people_dim_occupation'),
  ('people_dim_skill', 'people_onet', 'skill', 'people_dim_skill'),
  ('people_external_learning_content', 'people_microsoft_learn', 'content', 'people_external_learning_content')
on conflict (dataset_name) do nothing;

alter table public.people_mart_workforce_overview
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_mart_retention
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_mart_internal_mobility
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_mart_compensation_equity
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_mart_learning_adoption
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_mart_recruiting
  add column if not exists quality_status text not null default 'healthy';

alter table public.people_source_freshness
  add column if not exists last_attempt_at timestamptz;
alter table public.people_source_freshness
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_source_freshness
  add column if not exists error_message text;

alter table public.people_metric_definition
  add column if not exists health_status text not null default 'healthy';

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'people_source_health',
        'people_quality_test_results',
        'people_dataset_lineage',
        'people_pipeline_runs',
        'people_dim_org',
        'people_dim_location',
        'people_dim_job',
        'people_dim_worker'
      )
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_public_read', r.tablename);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      r.tablename || '_public_read',
      r.tablename
    );
    execute format('grant select on public.%I to anon, authenticated, service_role', r.tablename);
    execute format('grant all on public.%I to service_role', r.tablename);
  end loop;
end
$$;

notify pgrst, 'reload schema';
