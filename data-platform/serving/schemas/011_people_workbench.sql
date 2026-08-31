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
