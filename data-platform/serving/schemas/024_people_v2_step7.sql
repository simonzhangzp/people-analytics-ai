-- Step 7 governance: demo identity, definer RPCs, suppression, access log.
-- Applied after publish swap. people_app LOGIN is issued separately from env password.

create table if not exists people_v2.people_policy_demo_identity (
  identity_id text primary key,
  role text not null,
  org_scope ltree[] not null default '{}',
  sensitivity_max text not null,
  grain_max text not null,
  label text
);

create table if not exists people_v2.people_access_log (
  log_id bigserial primary key,
  ts timestamptz not null default now(),
  identity_id text,
  role text,
  session_id text,
  trace_id text,
  rpc text,
  metric_id text,
  filters jsonb,
  rows_returned integer,
  cells_suppressed integer,
  purpose_tag text
);

create table if not exists people_v2.people_suppression_log (
  log_id bigserial primary key,
  ts timestamptz not null default now(),
  trace_id text,
  metric_id text,
  dimension text,
  cells_suppressed integer,
  rule text
);

grant select on people_v2.people_policy_demo_identity to people_app;
grant insert on people_v2.people_access_log, people_v2.people_suppression_log to people_definer, people_app;
grant all on people_v2.people_policy_demo_identity, people_v2.people_access_log, people_v2.people_suppression_log
  to people_publisher, people_definer;
grant usage, select on all sequences in schema people_v2 to people_definer, people_app, people_publisher;

grant usage on schema people_v2 to people_app, people_definer, people_publisher;
grant select on all tables in schema people_v2 to people_definer;
grant execute on all functions in schema people_v2 to people_definer;

create or replace function people_v2.people_assert_identity(p_identity_id text)
returns people_v2.people_policy_demo_identity
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
begin
  if p_identity_id is null or p_identity_id !~ '^[a-z0-9-]{3,64}$' then
    raise exception 'invalid identity' using errcode = '42501';
  end if;
  select * into ident from people_v2.people_policy_demo_identity where identity_id = p_identity_id;
  if ident.identity_id is null then
    raise exception 'unknown identity' using errcode = '42501';
  end if;
  perform set_config('people.identity_id', ident.identity_id, true);
  perform set_config('people.role', ident.role, true);
  perform set_config('people.org_scope', array_to_string(ident.org_scope, ','), true);
  perform set_config('people.sensitivity_max', ident.sensitivity_max, true);
  perform set_config('people.grain_max', ident.grain_max, true);
  return ident;
end;
$$;

create or replace function people_v2.people_sensitivity_rank(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'public' then 1
    when 'internal' then 2
    when 'confidential' then 3
    when 'restricted' then 4
    else 0
  end;
$$;

create or replace function people_v2.people_get_metric_for(
  p_identity_id text,
  p_metric_id text,
  p_as_of date default null,
  p_grain text default 'trailing_12m'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  metric_sens text;
  payload jsonb;
  denied boolean := false;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  select m.sensitivity into metric_sens from people_v2.people_metric m where m.metric_id = p_metric_id;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    denied := true;
    payload := jsonb_build_object(
      'metric_id', p_metric_id,
      'value', null,
      'denied', true,
      'reason', 'sensitivity'
    );
  else
    payload := people_v2.people_get_metric(p_metric_id, p_as_of, p_grain);
    payload := payload || jsonb_build_object('identity_id', ident.identity_id, 'denied', false);
  end if;
  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
  values
    (ident.identity_id, ident.role, 'people_get_metric_for', p_metric_id,
     case when denied then 0 else 1 end, 0, 'demo');
  return payload;
end;
$$;

create or replace function people_v2.people_get_metric_breakdown(
  p_identity_id text,
  p_metric_id text,
  p_dimension text,
  p_as_of date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  as_of date;
  min_cell integer;
  metric_sens text;
  cells jsonb;
  suppressed int := 0;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  as_of := coalesce(p_as_of, people_v2.people_latest_month());
  select coalesce(m.min_cell, 5), m.sensitivity into min_cell, metric_sens
  from people_v2.people_metric m where m.metric_id = p_metric_id;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    insert into people_v2.people_access_log
      (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
    values (ident.identity_id, ident.role, 'people_get_metric_breakdown', p_metric_id, 0, 0, 'demo');
    return jsonb_build_object('metric_id', p_metric_id, 'denied', true, 'cells', '[]'::jsonb);
  end if;
  if p_dimension is null or p_dimension not in ('region', 'job_family', 'tenure_band') then
    raise exception 'invalid dimension' using errcode = '22023';
  end if;
  if p_metric_id <> 'headcount' then
    cells := jsonb_build_array(
      jsonb_build_object(
        'key', '_company',
        'value', (people_v2.people_get_metric(p_metric_id, as_of, 'trailing_12m')->>'value')::numeric,
        'n', null,
        'suppressed', false
      )
    );
  elsif p_dimension = 'region' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', region,
      'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by region), '[]'::jsonb)
    into cells
    from (
      select region, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
      group by region
    ) s;
  elsif p_dimension = 'job_family' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', job_family,
      'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by job_family), '[]'::jsonb)
    into cells
    from (
      select job_family, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
      group by job_family
    ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', tenure_band,
      'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by tenure_band), '[]'::jsonb)
    into cells
    from (
      select tenure_band, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
      group by tenure_band
    ) s;
  end if;
  select count(*) into suppressed
  from jsonb_array_elements(cells) e
  where (e->>'suppressed')::boolean;
  insert into people_v2.people_suppression_log (trace_id, metric_id, dimension, cells_suppressed, rule)
  values ('demo', p_metric_id, p_dimension, suppressed, 'min_cell');
  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, filters, rows_returned, cells_suppressed, purpose_tag)
  values
    (ident.identity_id, ident.role, 'people_get_metric_breakdown', p_metric_id,
     jsonb_build_object('dimension', p_dimension), jsonb_array_length(cells), suppressed, 'demo');
  return jsonb_build_object('metric_id', p_metric_id, 'dimension', p_dimension, 'as_of', as_of, 'cells', cells);
end;
$$;

do $$
declare
  cmd text;
begin
  foreach cmd in array array[
    'alter function people_v2.people_latest_month() owner to people_definer',
    'alter function people_v2.people_get_metric(text, date, text) owner to people_definer',
    'alter function people_v2.people_assert_identity(text) owner to people_definer',
    'alter function people_v2.people_get_metric_for(text, text, date, text) owner to people_definer',
    'alter function people_v2.people_get_metric_breakdown(text, text, text, date) owner to people_definer',
    'alter function people_v2.people_sensitivity_rank(text) owner to people_definer',
    'alter function people_v2.people_latest_month() security definer',
    'alter function people_v2.people_get_metric(text, date, text) security definer'
  ]
  loop
    begin
      execute cmd;
    exception
      when insufficient_privilege then
        raise notice 'skip %', cmd;
    end;
  end loop;
end $$;

grant execute on function people_v2.people_latest_month() to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric(text, date, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_assert_identity(text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_for(text, text, date, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_breakdown(text, text, text, date) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_sensitivity_rank(text) to people_app, people_publisher, people_definer;
