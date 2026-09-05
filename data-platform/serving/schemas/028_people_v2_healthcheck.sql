-- Serving healthcheck columns + RPCs. Apply only to PeopleAnalyticsAI.net (zapmigfrtnwnkmezjefx).
-- Streak is consecutive UTC calendar days with kind=healthcheck and ok=true. No lake file.

alter table people_v2.people_serving_run add column if not exists kind text;
alter table people_v2.people_serving_run add column if not exists run_date date;
alter table people_v2.people_serving_run add column if not exists database_bytes bigint;
alter table people_v2.people_serving_run add column if not exists wal_bytes bigint;
alter table people_v2.people_serving_run add column if not exists pointer_snapshot jsonb;
alter table people_v2.people_serving_run add column if not exists ok boolean;

update people_v2.people_serving_run
set
  kind = coalesce(kind, 'healthcheck'),
  run_date = coalesce(
    run_date,
    case
      when notes ~ '^{' then nullif(notes::jsonb->>'run_date', '')::date
      else null
    end,
    case
      when run_id ~ '^healthcheck-\d{4}-\d{2}-\d{2}$'
        then substring(run_id from 13)::date
      else null
    end
  ),
  ok = coalesce(ok, true),
  database_bytes = coalesce(
    database_bytes,
    case when notes ~ '^{' then nullif(notes::jsonb->>'database_bytes', '')::bigint else null end
  ),
  wal_bytes = coalesce(
    wal_bytes,
    case when notes ~ '^{' then nullif(notes::jsonb->>'wal_bytes', '')::bigint else null end
  ),
  pointer_snapshot = coalesce(
    pointer_snapshot,
    case when notes ~ '^{' then notes::jsonb->'pointer_snapshot' else null end
  )
where run_id like 'healthcheck-%';

create index if not exists people_serving_run_healthcheck_day_idx
  on people_v2.people_serving_run (run_date desc)
  where kind = 'healthcheck';

create or replace function people_v2.people_healthcheck_streak(p_as_of date default ((timezone('utc', now()))::date))
returns integer
language sql
stable
security definer
set search_path = people_v2
as $$
  with days as (
    select distinct run_date
    from people_serving_run
    where kind = 'healthcheck'
      and coalesce(ok, false) is true
      and run_date is not null
      and run_date <= p_as_of
  ),
  ordered as (
    select
      run_date,
      run_date - (row_number() over (order by run_date))::int as grp
    from days
  ),
  latest as (
    select grp
    from ordered
    order by run_date desc
    limit 1
  )
  select coalesce((
    select count(*)::int
    from ordered o
    join latest l on l.grp = o.grp
  ), 0);
$$;

create or replace function people_v2.people_healthcheck_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  last_row people_serving_run%rowtype;
  streak int;
begin
  select * into last_row
  from people_serving_run
  where kind = 'healthcheck'
  order by run_date desc nulls last, finished_at desc nulls last
  limit 1;
  streak := people_v2.people_healthcheck_streak();
  return jsonb_build_object(
    'consecutive_days', streak,
    'last_run_date', last_row.run_date,
    'last_ok', last_row.ok,
    'last_reason', last_row.notes,
    'frozen_as_of', '2026-08-31'
  );
end;
$$;

create or replace function people_v2.people_run_serving_healthcheck()
returns jsonb
language plpgsql
volatile
security definer
set search_path = people_v2, public
as $$
declare
  day date := (timezone('utc', now()))::date;
  run_key text := 'healthcheck-' || day::text;
  errors text[] := '{}';
  tbl record;
  has_insert boolean;
  npol int;
  rls_on boolean;
  rls_forced boolean;
  pointers jsonb;
  certified_as_of date;
  certified_extract text;
  db_bytes bigint;
  wal_bytes bigint := 0;
  ok_flag boolean := true;
  reason text := 'frozen_data_v1';
  streak int;
begin
  for tbl in
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'people_v2'
      and c.relkind = 'r'
      and c.relname like 'people_%'
      and c.relname not like '%_staging'
  loop
    select c.relrowsecurity, c.relforcerowsecurity
      into rls_on, rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'people_v2' and c.relname = tbl.name;
    if rls_on is not true then
      errors := array_append(errors, tbl.name || ': RLS not enabled');
    end if;
    if rls_forced is not true then
      errors := array_append(errors, tbl.name || ': FORCE ROW LEVEL SECURITY required');
    end if;
    select count(*) into npol
    from pg_policies
    where schemaname = 'people_v2' and tablename = tbl.name and policyname = 'people_app_read';
    if npol <> 1 then
      errors := array_append(errors, tbl.name || ': expected people_app_read policy, got ' || npol::text);
    end if;
    select has_table_privilege('people_publisher', format('people_v2.%I', tbl.name), 'INSERT') into has_insert;
    if has_insert is not true then
      errors := array_append(errors, tbl.name || ': people_publisher INSERT missing');
    end if;
  end loop;

  select coalesce(jsonb_agg(row_to_json(p) order by p.pointer_id), '[]'::jsonb)
    into pointers
  from (
    select pointer_id, as_of::text, extract_id, moved, notes
    from people_serving_pointer
    order by pointer_id
  ) p;

  select as_of, extract_id
    into certified_as_of, certified_extract
  from people_serving_pointer
  where pointer_id = 'current_certified';

  if certified_as_of is distinct from date '2026-08-31' then
    errors := array_append(errors, 'current_certified as_of moved from 2026-08-31');
  end if;
  if certified_extract is distinct from 'data-v1' then
    errors := array_append(errors, 'current_certified extract_id is not data-v1');
  end if;

  select pg_database_size(current_database()) into db_bytes;
  begin
    select coalesce(sum(size), 0)::bigint into wal_bytes from pg_ls_waldir();
  exception when others then
    wal_bytes := 0;
  end;

  if array_length(errors, 1) is not null then
    ok_flag := false;
    reason := 'healthcheck_failed';
  end if;

  insert into people_serving_run (
    run_id, started_at, finished_at, certified, notes, kind, run_date,
    database_bytes, wal_bytes, pointer_snapshot, ok
  )
  values (
    run_key, now(), now(), false, reason, 'healthcheck', day,
    db_bytes, wal_bytes, pointers, ok_flag
  )
  on conflict (run_id) do update set
    finished_at = excluded.finished_at,
    notes = excluded.notes,
    kind = excluded.kind,
    run_date = excluded.run_date,
    database_bytes = excluded.database_bytes,
    wal_bytes = excluded.wal_bytes,
    pointer_snapshot = excluded.pointer_snapshot,
    ok = excluded.ok;

  streak := people_v2.people_healthcheck_streak(day);

  return jsonb_build_object(
    'ok', ok_flag,
    'reason', reason,
    'run_id', run_key,
    'run_date', day,
    'consecutive_days', streak,
    'database_bytes', db_bytes,
    'wal_bytes', wal_bytes,
    'pointer_as_of', certified_as_of,
    'errors', to_jsonb(errors)
  );
end;
$$;

revoke all on function people_v2.people_healthcheck_streak(date) from public;
revoke all on function people_v2.people_healthcheck_status() from public;
revoke all on function people_v2.people_run_serving_healthcheck() from public;
grant execute on function people_v2.people_healthcheck_streak(date) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_healthcheck_status() to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_run_serving_healthcheck() to people_app, people_publisher, people_definer;
