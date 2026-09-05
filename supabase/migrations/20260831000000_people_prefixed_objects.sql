-- People objects are named people_*. Keep in sync with data-platform/serving/schemas.
-- Fresh local supabase applies this after the legacy unprefixed workbench migration.
-- Staging is applied with: python data-platform/serving/apply.py

-- ===== 000_drop_legacy_unprefixed.sql =====
-- Remove unprefixed People leftovers created before the people_ rule.
-- Does not touch QuantReview tables such as panorama_daily.

drop view if exists public.mart_workforce_overview;
drop view if exists public.mart_retention;
drop view if exists public.mart_internal_mobility;
drop view if exists public.mart_compensation_equity;
drop view if exists public.mart_learning_adoption;
drop view if exists public.mart_skill_supply_demand;
drop view if exists public.mart_recruiting;
drop view if exists public.mart_external_talent_market;
drop view if exists public.dim_company;
drop view if exists public.dim_occupation;
drop view if exists public.dim_skill;
drop view if exists public.external_learning_content;
drop view if exists public.metric_definition;
drop view if exists public.source_freshness;
drop view if exists public.data_quality_incident;

drop schema if exists serving cascade;
drop schema if exists governance cascade;

drop table if exists public.workspaces cascade;
drop table if exists public.datasets cascade;
drop table if exists public.field_mappings cascade;
drop table if exists public.dataset_relationships cascade;
drop table if exists public.metric_definitions cascade;
drop table if exists public.analysis_questions cascade;
drop table if exists public.insights cascade;
drop table if exists public.executive_stories cascade;
drop table if exists public.ai_usage cascade;

drop function if exists public.consume_ai_quota();
drop function if exists public.cleanup_anonymous_workbench_data(interval);
drop function if exists public.knowledge_payload_is_safe(jsonb);
drop function if exists public.set_workbench_updated_at();

do $$
begin
  if to_regclass('cron.job') is not null
     and exists (
       select 1 from cron.job
       where jobname = 'cleanup-anonymous-workbench-data-daily'
     )
  then
    perform cron.unschedule('cleanup-anonymous-workbench-data-daily');
  end if;
end
$$;

-- ===== 010_people_warehouse.sql =====
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

-- ===== 011_people_workbench.sql =====
-- People workbench knowledge. Every name starts with people_.
-- Raw uploaded rows stay out of these tables.

create extension if not exists pgcrypto;

create or replace function public.people_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.people_knowledge_payload_is_safe(payload jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with recursive nodes(value) as (
    select coalesce($1, 'null'::jsonb)
    union all
    select children.value
    from nodes
    cross join lateral (
      select object_values.value
      from jsonb_each(
        case when jsonb_typeof(nodes.value) = 'object' then nodes.value else '{}'::jsonb end
      ) as object_values
      union all
      select array_values.value
      from jsonb_array_elements(
        case when jsonb_typeof(nodes.value) = 'array' then nodes.value else '[]'::jsonb end
      ) as array_values
    ) as children
  )
  select not exists (
    select 1
    from nodes
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(nodes.value) = 'object' then nodes.value else '{}'::jsonb end
    ) as object_key
    where lower(regexp_replace(object_key, '[^a-z0-9]', '', 'g')) = any (
      array['rows','rawrows','explorationrows','samplevalues','rawdata','datarows','rawrecords']
    )
  );
$$;

create table if not exists public.people_workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_key)
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'people_datasets',
    'people_field_mappings',
    'people_dataset_relationships',
    'people_workbench_metrics',
    'people_analysis_questions',
    'people_insights',
    'people_executive_stories'
  ]
  loop
    execute format($f$
      create table if not exists public.%I (
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null references public.people_workspaces(id) on delete cascade,
        entity_key text not null,
        payload jsonb not null check (
          jsonb_typeof(payload) = 'object'
          and public.people_knowledge_payload_is_safe(payload)
        ),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (workspace_id, entity_key)
      )
    $f$, t);
    execute format('create index if not exists %I on public.%I(workspace_id)', t || '_workspace_id_idx', t);
  end loop;
end
$$;

create table if not exists public.people_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'people_workspaces',
    'people_datasets',
    'people_field_mappings',
    'people_dataset_relationships',
    'people_workbench_metrics',
    'people_analysis_questions',
    'people_insights',
    'people_executive_stories',
    'people_ai_usage'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      t || '_set_updated_at',
      t
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.people_set_updated_at()',
      t || '_set_updated_at',
      t
    );
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

drop policy if exists people_workspaces_owner_all on public.people_workspaces;
create policy people_workspaces_owner_all
on public.people_workspaces for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array[
    'people_datasets',
    'people_field_mappings',
    'people_dataset_relationships',
    'people_workbench_metrics',
    'people_analysis_questions',
    'people_insights',
    'people_executive_stories'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (
        exists (
          select 1 from public.people_workspaces
          where people_workspaces.id = %I.workspace_id
            and people_workspaces.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.people_workspaces
          where people_workspaces.id = %I.workspace_id
            and people_workspaces.user_id = auth.uid()
        )
      )
    $f$, t || '_owner_all', t, t, t);
  end loop;
end
$$;

drop policy if exists people_ai_usage_owner_select on public.people_ai_usage;
create policy people_ai_usage_owner_select
on public.people_ai_usage for select to authenticated
using (user_id = auth.uid());

revoke all on public.people_workspaces from public, anon;
revoke all on public.people_datasets from public, anon;
revoke all on public.people_field_mappings from public, anon;
revoke all on public.people_dataset_relationships from public, anon;
revoke all on public.people_workbench_metrics from public, anon;
revoke all on public.people_analysis_questions from public, anon;
revoke all on public.people_insights from public, anon;
revoke all on public.people_executive_stories from public, anon;
revoke all on public.people_ai_usage from public, anon, authenticated;

grant select, insert, update, delete on public.people_workspaces to authenticated;
grant select, insert, update, delete on public.people_datasets to authenticated;
grant select, insert, update, delete on public.people_field_mappings to authenticated;
grant select, insert, update, delete on public.people_dataset_relationships to authenticated;
grant select, insert, update, delete on public.people_workbench_metrics to authenticated;
grant select, insert, update, delete on public.people_analysis_questions to authenticated;
grant select, insert, update, delete on public.people_insights to authenticated;
grant select, insert, update, delete on public.people_executive_stories to authenticated;
grant select on public.people_ai_usage to authenticated;

create or replace function public.people_consume_ai_quota()
returns table (
  allowed boolean,
  used integer,
  limit_count integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  daily_limit constant integer := 50;
  current_usage integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to consume AI quota.'
      using errcode = '42501';
  end if;

  insert into public.people_ai_usage as usage (user_id, usage_date, request_count)
  values (current_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date)
  do update
    set request_count = usage.request_count + 1
    where usage.request_count < daily_limit
  returning usage.request_count into current_usage;

  if found then
    return query
      select true, current_usage, daily_limit, date_trunc('day', now()) + interval '1 day';
    return;
  end if;

  select request_count into current_usage
  from public.people_ai_usage
  where user_id = current_user_id
    and usage_date = (now() at time zone 'utc')::date;

  return query
    select false, coalesce(current_usage, daily_limit), daily_limit,
           date_trunc('day', now()) + interval '1 day';
end;
$$;

revoke all on function public.people_consume_ai_quota() from public, anon;
grant execute on function public.people_consume_ai_quota() to authenticated;

create or replace function public.people_cleanup_anonymous_workbench_data(
  retention interval default interval '30 days'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_workspaces bigint;
begin
  if retention < interval '1 day' then
    raise exception 'Anonymous Workbench retention must be at least one day.';
  end if;

  with deleted as (
    delete from public.people_workspaces
    using auth.users
    where people_workspaces.user_id = users.id
      and users.is_anonymous is true
      and people_workspaces.updated_at < now() - retention
    returning people_workspaces.id
  )
  select count(*) into deleted_workspaces from deleted;

  delete from public.people_ai_usage
  using auth.users
  where people_ai_usage.user_id = users.id
    and users.is_anonymous is true
    and people_ai_usage.updated_at < now() - retention;

  return deleted_workspaces;
end;
$$;

revoke all on function public.people_cleanup_anonymous_workbench_data(interval)
from public, anon, authenticated;
revoke all on function public.people_knowledge_payload_is_safe(jsonb) from public, anon;
grant execute on function public.people_knowledge_payload_is_safe(jsonb) to authenticated;
revoke all on function public.people_set_updated_at() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'people-cleanup-anonymous-workbench-data-daily',
  '17 3 * * *',
  $$select public.people_cleanup_anonymous_workbench_data(interval '30 days');$$
)
where not exists (
  select 1 from cron.job where jobname = 'people-cleanup-anonymous-workbench-data-daily'
);

-- ===== 012_people_grants.sql =====
-- Public read for synthetic warehouse marts. Workbench tables stay owner-scoped.

do $$
declare
  r record;
  policy_name text;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and (
        tablename like 'people_mart_%'
        or tablename like 'people_dim_%'
        or tablename in (
          'people_metric_definition',
          'people_source_freshness',
          'people_data_quality_incident',
          'people_external_learning_content'
        )
      )
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    policy_name := r.tablename || '_public_read';
    execute format('drop policy if exists %I on public.%I', policy_name, r.tablename);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      policy_name,
      r.tablename
    );
    execute format('grant select on public.%I to anon, authenticated, service_role', r.tablename);
    execute format('grant all on public.%I to service_role', r.tablename);
  end loop;
end
$$;

grant select, insert, update, delete on public.people_api_usage to service_role;
alter table public.people_api_usage enable row level security;
drop policy if exists people_api_usage_service_all on public.people_api_usage;
-- service_role bypasses RLS; no anon read of API cost internals.

notify pgrst, 'reload schema';

-- ===== 013_people_seed_metrics.sql =====
insert into public.people_metric_definition (
  metric_id,
  metric_name,
  domain,
  business_definition,
  grain,
  status,
  version,
  data_sources
)
values
  (
    'headcount',
    'Headcount',
    'workforce',
    'Count of workers in the certified population as of the snapshot month. Aggregated snapshots use SUM(headcount); person-level files use COUNT DISTINCT of the employee identifier.',
    'org_id × job_family × location_id × month',
    'certified',
    1,
    array['synthetic_internal']
  ),
  (
    'voluntary_attrition',
    'Voluntary Attrition Rate',
    'retention',
    'Voluntary resignations divided by beginning headcount. Retirement is excluded unless a saved org definition says otherwise. Employees only.',
    'org_id × job_family × location_id × month',
    'draft',
    1,
    array['synthetic_internal']
  )
on conflict (metric_id) do nothing;

