-- LEGACY unprefixed Workbench tables. Superseded by people_* objects in
-- data-platform/serving/schemas and 20260831000000_people_prefixed_objects.sql.
-- Do not create new unprefixed People tables.

-- Workbench persists semantic knowledge only. Raw employee rows remain local.
create extension if not exists pgcrypto;

create or replace function public.set_workbench_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.knowledge_payload_is_safe(payload jsonb)
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
        case
          when jsonb_typeof(nodes.value) = 'object' then nodes.value
          else '{}'::jsonb
        end
      ) as object_values
      union all
      select array_values.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(nodes.value) = 'array' then nodes.value
          else '[]'::jsonb
        end
      ) as array_values
    ) as children
  )
  select not exists (
    select 1
    from nodes
    cross join lateral jsonb_object_keys(
      case
        when jsonb_typeof(nodes.value) = 'object' then nodes.value
        else '{}'::jsonb
      end
    ) as object_key
    where lower(regexp_replace(object_key, '[^a-z0-9]', '', 'g')) = any (
      array[
        'rows',
        'rawrows',
        'explorationrows',
        'samplevalues',
        'rawdata',
        'datarows',
        'rawrecords'
      ]
    )
  );
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_key)
);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.field_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.dataset_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.analysis_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

create table public.executive_stories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_key text not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and public.knowledge_payload_is_safe(payload)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_key)
);

comment on table public.datasets is
  'Safe dataset metadata and profiles only; never raw or sampled rows.';
comment on table public.field_mappings is
  'Reviewable semantic field mappings; never source row values.';
comment on table public.dataset_relationships is
  'Reviewable dataset relationships and aggregate match evidence.';
comment on table public.metric_definitions is
  'Versioned structured metric definitions; never executable SQL.';
comment on table public.analysis_questions is
  'People Analytics business questions and referenced metric ids.';
comment on table public.insights is
  'Validated aggregate insights, evidence references, and limitations.';
comment on table public.executive_stories is
  'Executive story knowledge grounded in persisted insights.';

create index datasets_workspace_id_idx on public.datasets(workspace_id);
create index field_mappings_workspace_id_idx on public.field_mappings(workspace_id);
create index dataset_relationships_workspace_id_idx on public.dataset_relationships(workspace_id);
create index metric_definitions_workspace_id_idx on public.metric_definitions(workspace_id);
create index analysis_questions_workspace_id_idx on public.analysis_questions(workspace_id);
create index insights_workspace_id_idx on public.insights(workspace_id);
create index executive_stories_workspace_id_idx on public.executive_stories(workspace_id);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_workbench_updated_at();
create trigger datasets_set_updated_at
before update on public.datasets
for each row execute function public.set_workbench_updated_at();
create trigger field_mappings_set_updated_at
before update on public.field_mappings
for each row execute function public.set_workbench_updated_at();
create trigger dataset_relationships_set_updated_at
before update on public.dataset_relationships
for each row execute function public.set_workbench_updated_at();
create trigger metric_definitions_set_updated_at
before update on public.metric_definitions
for each row execute function public.set_workbench_updated_at();
create trigger analysis_questions_set_updated_at
before update on public.analysis_questions
for each row execute function public.set_workbench_updated_at();
create trigger insights_set_updated_at
before update on public.insights
for each row execute function public.set_workbench_updated_at();
create trigger executive_stories_set_updated_at
before update on public.executive_stories
for each row execute function public.set_workbench_updated_at();

alter table public.workspaces enable row level security;
alter table public.datasets enable row level security;
alter table public.field_mappings enable row level security;
alter table public.dataset_relationships enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.analysis_questions enable row level security;
alter table public.insights enable row level security;
alter table public.executive_stories enable row level security;

-- FOR ALL applies the ownership predicate to select, insert, update, and delete.
create policy workspaces_owner_all
on public.workspaces
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy datasets_workspace_owner_all
on public.datasets
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = datasets.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = datasets.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy field_mappings_workspace_owner_all
on public.field_mappings
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = field_mappings.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = field_mappings.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy dataset_relationships_workspace_owner_all
on public.dataset_relationships
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = dataset_relationships.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = dataset_relationships.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy metric_definitions_workspace_owner_all
on public.metric_definitions
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = metric_definitions.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = metric_definitions.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy analysis_questions_workspace_owner_all
on public.analysis_questions
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = analysis_questions.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = analysis_questions.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy insights_workspace_owner_all
on public.insights
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = insights.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = insights.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

create policy executive_stories_workspace_owner_all
on public.executive_stories
for all
to authenticated
using (
  exists (
    select 1 from public.workspaces
    where workspaces.id = executive_stories.workspace_id
      and workspaces.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces
    where workspaces.id = executive_stories.workspace_id
      and workspaces.user_id = auth.uid()
  )
);

revoke all on public.workspaces from public, anon;
revoke all on public.datasets from public, anon;
revoke all on public.field_mappings from public, anon;
revoke all on public.dataset_relationships from public, anon;
revoke all on public.metric_definitions from public, anon;
revoke all on public.analysis_questions from public, anon;
revoke all on public.insights from public, anon;
revoke all on public.executive_stories from public, anon;

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.datasets to authenticated;
grant select, insert, update, delete on public.field_mappings to authenticated;
grant select, insert, update, delete on public.dataset_relationships to authenticated;
grant select, insert, update, delete on public.metric_definitions to authenticated;
grant select, insert, update, delete on public.analysis_questions to authenticated;
grant select, insert, update, delete on public.insights to authenticated;
grant select, insert, update, delete on public.executive_stories to authenticated;

create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create trigger ai_usage_set_updated_at
before update on public.ai_usage
for each row execute function public.set_workbench_updated_at();

alter table public.ai_usage enable row level security;

create policy ai_usage_owner_select
on public.ai_usage
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;

create or replace function public.consume_ai_quota()
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

  insert into public.ai_usage as usage (user_id, usage_date, request_count)
  values (current_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date)
  do update
    set request_count = usage.request_count + 1
    where usage.request_count < daily_limit
  returning usage.request_count into current_usage;

  if found then
    return query
      select
        true,
        current_usage,
        daily_limit,
        date_trunc('day', now()) + interval '1 day';
    return;
  end if;

  select request_count
  into current_usage
  from public.ai_usage
  where user_id = current_user_id
    and usage_date = (now() at time zone 'utc')::date;

  return query
    select
      false,
      coalesce(current_usage, daily_limit),
      daily_limit,
      date_trunc('day', now()) + interval '1 day';
end;
$$;

comment on function public.consume_ai_quota() is
  'Atomically enforces a fixed 50-request UTC daily quota for the authenticated user.';

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;

create or replace function public.cleanup_anonymous_workbench_data(
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
    delete from public.workspaces
    using auth.users
    where workspaces.user_id = users.id
      and users.is_anonymous is true
      and workspaces.updated_at < now() - retention
    returning workspaces.id
  )
  select count(*) into deleted_workspaces from deleted;

  delete from public.ai_usage
  using auth.users
  where ai_usage.user_id = users.id
    and users.is_anonymous is true
    and ai_usage.updated_at < now() - retention;

  return deleted_workspaces;
end;
$$;

comment on function public.cleanup_anonymous_workbench_data(interval) is
  'Retention policy: schedule daily from a trusted database-owner job. It deletes anonymous Workbench knowledge after 30 inactive days by default; child knowledge cascades. The app and authenticated users cannot execute it.';

revoke all on function public.cleanup_anonymous_workbench_data(interval)
from public, anon, authenticated;
revoke all on function public.knowledge_payload_is_safe(jsonb)
from public, anon;
grant execute on function public.knowledge_payload_is_safe(jsonb)
to authenticated;
revoke all on function public.set_workbench_updated_at()
from public, anon, authenticated;

-- Supabase provides pg_cron for database-owner maintenance jobs. The cleanup
-- remains unreachable from application roles and runs once per UTC day.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'cleanup-anonymous-workbench-data-daily',
  '17 3 * * *',
  $$select public.cleanup_anonymous_workbench_data(interval '30 days');$$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cleanup-anonymous-workbench-data-daily'
);
