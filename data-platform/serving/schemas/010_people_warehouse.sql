-- People warehouse objects. Every name starts with people_.

create table if not exists public.people_metric_definition (
  metric_id text primary key,
  metric_name text not null,
  domain text not null,
  business_definition text not null,
  formula_sql text,
  grain text not null,
  numerator_definition text,
  denominator_definition text,
  population_rules text,
  exclusions text,
  time_logic text,
  dimensions text[] not null default '{}',
  owner text,
  status text not null check (status in ('certified', 'draft', 'deprecated')),
  version integer not null default 1,
  effective_date date,
  data_sources text[] not null default '{}',
  validation_status text,
  updated_at timestamptz not null default now()
);

create table if not exists public.people_source_freshness (
  source_name text primary key,
  provenance text not null check (
    provenance in (
      'synthetic_internal',
      'live_public',
      'live_commercial',
      'derived',
      'manual_reference'
    )
  ),
  last_successful_ingestion timestamptz,
  expected_frequency interval,
  row_count bigint,
  previous_row_count bigint,
  freshness_status text not null check (
    freshness_status in ('healthy', 'late', 'failed', 'paused')
  ),
  updated_at timestamptz not null default now()
);

create table if not exists public.people_data_quality_incident (
  incident_id text primary key,
  title text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null check (status in ('open', 'investigating', 'resolved')),
  affected_metrics text[] not null default '{}',
  source_name text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  business_change boolean not null default false,
  summary text not null
);

create table if not exists public.people_api_usage (
  provider text not null,
  period_month date not null,
  requests integer not null default 0,
  records integer not null default 0,
  estimated_cost numeric(10, 2) not null default 0,
  hard_limit numeric(10, 2) not null default 28,
  last_call_at timestamptz,
  primary key (provider, period_month)
);

create table if not exists public.people_dim_company (
  company_id text primary key,
  company_name text not null,
  ticker text,
  cik text,
  industry text,
  hq_country text,
  public_private text,
  employee_count_latest integer,
  employee_count_source text,
  company_size_band text,
  provenance text not null
);

create table if not exists public.people_dim_occupation (
  occupation_id text primary key,
  soc_code text,
  title text not null,
  provenance text not null default 'live_public'
);

create table if not exists public.people_dim_skill (
  skill_id text primary key,
  skill_name text not null,
  skill_category text,
  onet_reference text,
  provenance text not null
);

create table if not exists public.people_mart_workforce_overview (
  as_of_month date not null,
  org_id text not null,
  job_family text not null,
  location_id text not null,
  headcount numeric not null,
  fte numeric,
  hires numeric,
  exits numeric,
  provenance text not null default 'synthetic_internal',
  metric_id text not null default 'headcount',
  primary key (as_of_month, org_id, job_family, location_id)
);

create table if not exists public.people_mart_retention (
  as_of_month date not null,
  org_id text not null,
  job_family text not null,
  location_id text not null,
  voluntary_exits numeric,
  beginning_headcount numeric,
  voluntary_attrition_rate numeric,
  provenance text not null default 'synthetic_internal',
  metric_id text not null default 'voluntary_attrition',
  primary key (as_of_month, org_id, job_family, location_id)
);

create table if not exists public.people_mart_internal_mobility (
  as_of_month date not null,
  org_id text not null,
  job_family text not null,
  promotions numeric,
  lateral_moves numeric,
  internal_mobility_rate numeric,
  provenance text not null default 'synthetic_internal',
  metric_id text not null default 'internal_mobility_rate',
  primary key (as_of_month, org_id, job_family)
);

create table if not exists public.people_mart_compensation_equity (
  as_of_month date not null,
  job_family text not null,
  location_id text not null,
  median_base_usd numeric,
  mean_compa_ratio numeric,
  bls_median_wage numeric,
  market_position_index numeric,
  provenance text not null default 'derived',
  metric_id text not null default 'compa_ratio',
  primary key (as_of_month, job_family, location_id)
);

create table if not exists public.people_mart_learning_adoption (
  as_of_month date not null,
  org_id text not null,
  job_family text not null,
  learning_hours_per_employee numeric,
  completion_rate numeric,
  provenance text not null default 'synthetic_internal',
  metric_id text not null default 'learning_hours_per_employee',
  primary key (as_of_month, org_id, job_family)
);

create table if not exists public.people_mart_skill_supply_demand (
  as_of_week date not null,
  skill_id text not null references public.people_dim_skill (skill_id),
  occupation_id text not null default '',
  internal_coverage_rate numeric,
  external_posting_count integer,
  provenance text not null default 'derived',
  primary key (as_of_week, skill_id, occupation_id)
);

create table if not exists public.people_mart_recruiting (
  as_of_week date not null,
  job_family text not null,
  location_id text not null,
  open_requisitions integer,
  time_to_fill_days numeric,
  offer_acceptance_rate numeric,
  provenance text not null default 'synthetic_internal',
  metric_id text not null default 'time_to_fill',
  primary key (as_of_week, job_family, location_id)
);

create table if not exists public.people_mart_external_talent_market (
  snapshot_date date not null,
  company_id text not null references public.people_dim_company (company_id),
  job_family text not null,
  open_jobs integer,
  median_salary numeric,
  provenance text not null,
  primary key (snapshot_date, company_id, job_family)
);

create table if not exists public.people_external_learning_content (
  content_id text primary key,
  content_type text not null,
  title text not null,
  level text,
  url text,
  provider text not null default 'microsoft_learn',
  last_modified timestamptz,
  ingested_at timestamptz not null default now(),
  provenance text not null default 'live_public'
);

comment on table public.people_mart_workforce_overview is
  'Slice-level headcount mart for website reads. Not employee-event grain.';
