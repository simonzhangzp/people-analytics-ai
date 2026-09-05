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

drop function if exists people_v2.people_get_metric_for(text, text, date, text);
drop function if exists people_v2.people_get_metric_for(text, text, date, text, text);
drop function if exists people_v2.people_get_metric_breakdown(text, text, text, date);
drop function if exists people_v2.people_get_metric_breakdown(text, text, text, date, text);

create or replace function people_v2.people_get_metric_for(
  p_identity_id text,
  p_metric_id text,
  p_as_of date default null,
  p_grain text default 'trailing_12m',
  p_job_family text default null
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
    payload := people_v2.people_get_metric(p_metric_id, p_as_of, p_grain, p_job_family);
    payload := payload || jsonb_build_object('identity_id', ident.identity_id, 'denied', false);
  end if;
  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, filters, rows_returned, cells_suppressed, purpose_tag)
  values
    (ident.identity_id, ident.role, 'people_get_metric_for', p_metric_id,
     jsonb_build_object('grain', p_grain, 'job_family', p_job_family),
     case when denied then 0 else 1 end, 0, 'demo');
  return payload;
end;
$$;

create or replace function people_v2.people_get_metric_breakdown(
  p_identity_id text,
  p_metric_id text,
  p_dimension text,
  p_as_of date default null,
  p_job_family text default null
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
  job_fam text;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  as_of := coalesce(p_as_of, people_v2.people_latest_month());
  job_fam := nullif(p_job_family, '');
  select coalesce(m.min_cell, 5), m.sensitivity into min_cell, metric_sens
  from people_v2.people_metric m where m.metric_id = p_metric_id;
  if ident.role = 'external_viewer' then
    min_cell := greatest(coalesce(min_cell, 5), 50);
  elsif ident.role = 'leader' then
    min_cell := greatest(coalesce(min_cell, 5), 20);
  elsif ident.role = 'hrbp' then
    min_cell := greatest(coalesce(min_cell, 5), 10);
  end if;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    insert into people_v2.people_access_log
      (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
    values (ident.identity_id, ident.role, 'people_get_metric_breakdown', p_metric_id, 0, 0, 'demo');
    return jsonb_build_object('metric_id', p_metric_id, 'denied', true, 'cells', '[]'::jsonb);
  end if;
  if p_dimension is null or p_dimension not in ('region', 'job_family', 'tenure_band', 'location_id', 'location_tenure', 'location_tenure_grade') then
    raise exception 'invalid dimension' using errcode = '22023';
  end if;
  if p_metric_id in ('headcount', 'voluntary_attrition_rate') and p_dimension = 'location_tenure_grade' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id || '|' || tenure_band || '|' || coalesce(grade_id, ''),
      'location_id', location_id,
      'tenure_band', tenure_band,
      'grade_id', grade_id,
      'n', n,
      'terms_vol', terms_vol,
      'value', case
        when n < min_cell then null
        when p_metric_id = 'headcount' then n
        else terms_vol * 12.0 / nullif(n, 0)
      end,
      'suppressed', n < min_cell
    ) order by location_id, tenure_band, grade_id), '[]'::jsonb)
    into cells
    from (
      select location_id, tenure_band, grade_id,
             count(*) filter (where is_certified) as n,
             count(*) filter (where terminated_in_month and termination_category = 'voluntary') as terms_vol
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by location_id, tenure_band, grade_id
    ) s;
  elsif p_metric_id in ('headcount', 'voluntary_attrition_rate') and p_dimension = 'location_tenure' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id || '|' || tenure_band,
      'location_id', location_id,
      'tenure_band', tenure_band,
      'n', n,
      'terms_vol', terms_vol,
      'value', case
        when n < min_cell then null
        when p_metric_id = 'headcount' then n
        else terms_vol * 12.0 / nullif(n, 0)
      end,
      'suppressed', n < min_cell
    ) order by location_id, tenure_band), '[]'::jsonb)
    into cells
    from (
      select location_id, tenure_band,
             count(*) filter (where is_certified) as n,
             count(*) filter (where terminated_in_month and termination_category = 'voluntary') as terms_vol
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by location_id, tenure_band
    ) s;
  elsif p_metric_id = 'headcount' and p_dimension = 'location_id' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id, 'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by location_id), '[]'::jsonb)
    into cells
    from (
      select location_id, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by location_id
    ) s;
  elsif p_metric_id <> 'headcount' then
    cells := jsonb_build_array(
      jsonb_build_object(
        'key', '_company',
        'value', (people_v2.people_get_metric(p_metric_id, as_of, 'trailing_12m', job_fam)->>'value')::numeric,
        'n', null,
        'suppressed', false
      )
    );
  elsif p_dimension = 'region' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', region, 'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by region), '[]'::jsonb)
    into cells
    from (
      select region, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by region
    ) s;
  elsif p_dimension = 'job_family' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', job_family, 'n', n,
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
      'key', tenure_band, 'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell
    ) order by tenure_band), '[]'::jsonb)
    into cells
    from (
      select tenure_band, count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
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
     jsonb_build_object('dimension', p_dimension, 'job_family', job_fam, 'min_cell', min_cell),
     jsonb_array_length(cells), suppressed, 'demo');
  return jsonb_build_object(
    'metric_id', p_metric_id,
    'dimension', p_dimension,
    'as_of', as_of,
    'min_cell', min_cell,
    'identity_id', ident.identity_id,
    'role', ident.role,
    'cells', cells
  );
end;
$$;

-- Serving applies 025 for cache; keep this body aligned with 025_people_v2_metric_trend_t12m.sql.
create or replace function people_v2.people_get_metric_trend(
  p_identity_id text,
  p_metric_id text,
  p_months integer default 24,
  p_job_family text default null
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
  as_of date;
  points jsonb;
  n_months integer;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  n_months := greatest(3, least(coalesce(p_months, 24), 24));
  as_of := people_v2.people_latest_month();
  select m.sensitivity into metric_sens from people_v2.people_metric m where m.metric_id = p_metric_id;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    insert into people_v2.people_access_log
      (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
    values (ident.identity_id, ident.role, 'people_get_metric_trend', p_metric_id, 0, 0, 'demo');
    return jsonb_build_object('metric_id', p_metric_id, 'denied', true, 'points', '[]'::jsonb);
  end if;
  if p_metric_id = 'headcount' then
    select coalesce(jsonb_agg(jsonb_build_object('as_of', month_end, 'value', hc, 'grain', 'month') order by month_end), '[]'::jsonb)
    into points
    from (
      select month_end, count(*) filter (where is_certified) as hc
      from people_snap_worker_month
      where month_end <= as_of
        and month_end > (as_of - (n_months || ' months')::interval)
        and (nullif(p_job_family, '') is null or job_family = p_job_family)
      group by month_end
    ) t;
  elsif p_metric_id = 'voluntary_attrition_rate' then
    with monthly as materialized (
      select month_end,
             count(*) filter (where is_certified) as hc,
             count(*) filter (where terminated_in_month and termination_category = 'voluntary') as terms
      from people_snap_worker_month
      where month_end <= as_of
        and month_end > (as_of - ((n_months + 12) || ' months')::interval)
        and (nullif(p_job_family, '') is null or job_family = p_job_family)
      group by month_end
    ),
    display as materialized (
      select month_end
      from monthly
      where month_end <= as_of
        and month_end > (as_of - (n_months || ' months')::interval)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'as_of', d.month_end,
      'value', r.rate,
      'grain', 'trailing_12m'
    ) order by d.month_end), '[]'::jsonb)
    into points
    from display d
    cross join lateral (
      select sum(m.terms) * 1.0 / nullif(avg(m.hc), 0) as rate
      from monthly m
      where m.month_end <= d.month_end
        and m.month_end > d.month_end - interval '12 months'
    ) r;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'as_of', month_end,
      'value', (people_v2.people_get_metric(p_metric_id, month_end, 'month', p_job_family)->>'value')::numeric
    ) order by month_end), '[]'::jsonb)
    into points
    from (
      select distinct month_end
      from people_snap_worker_month
      where month_end <= as_of
      order by month_end desc
      limit n_months
    ) m;
  end if;
  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
  values (ident.identity_id, ident.role, 'people_get_metric_trend', p_metric_id, n_months, 0, 'demo');
  return jsonb_build_object(
    'metric_id', p_metric_id,
    'grain', case when p_metric_id = 'voluntary_attrition_rate' then 'trailing_12m' else 'month' end,
    'points', points,
    'identity_id', ident.identity_id,
    'scenario_start', '2026-03-01'
  );
end;
$$;

create or replace function people_v2.people_get_case3_signals(
  p_identity_id text,
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
  payload jsonb;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  as_of := coalesce(p_as_of, people_v2.people_latest_month());
  with snap as (
    select worker_id, region, job_family, tenure_band, grade_id
    from people_snap_worker_month
    where month_end = as_of and is_certified
  ),
  latest_comp as (
    select distinct on (c.worker_id) c.worker_id, c.base, s.grade_id
    from snap s
    join people_fact_comp_assignment_restricted c
      on c.worker_id = s.worker_id and c.from_date <= as_of
    order by c.worker_id, c.from_date desc
  ),
  compa as (
    select case when s.region = 'APAC' and s.job_family = 'Engineering'
                 and s.tenure_band in ('<1y', '1–3y')
                then 'slice' else 'control' end as grp,
           percentile_cont(0.5) within group (order by l.base * 1.0 / nullif(b.band_mid, 0)) as median_compa,
           count(*) as n
    from latest_comp l
    join snap s on s.worker_id = l.worker_id
    join people_ref_comp_band b on b.grade_id = l.grade_id
    group by 1
  ),
  chg as (
    select w.worker_id, count(*) as n
    from people_evt_worker w
    join people_evt_worker_change c
      on c.worker_id = w.worker_id
     and c.event_date = w.event_date
     and c.property = 'reports_to'
    where w.event_type = 'manager_change'
      and w.event_date >= date '2025-10-01'
      and coalesce(c.change_reason, 'reorg') = 'reorg'
    group by 1
  ),
  mgr as (
    select case when s.region = 'APAC' and s.job_family = 'Engineering'
                 and s.tenure_band in ('<1y', '1–3y')
                then 'slice' else 'control' end as grp,
           count(*) as n_workers,
           coalesce(sum(c.n), 0) as n_chg
    from snap s
    left join chg c on c.worker_id = s.worker_id
    group by 1
  )
  select jsonb_build_object(
    'as_of', as_of,
    'identity_id', ident.identity_id,
    'compa', (select coalesce(jsonb_agg(jsonb_build_object(
                'group', grp, 'median_compa', median_compa, 'n', n) order by grp), '[]'::jsonb) from compa),
    'manager_change_reorg', (select coalesce(jsonb_agg(jsonb_build_object(
                'group', grp, 'n_workers', n_workers, 'manager_changes', n_chg) order by grp), '[]'::jsonb) from mgr),
    'bls', jsonb_build_object(
      'series', 'JOLTS quits rate',
      'role', 'calibration only',
      'note', 'BLS series calibrate GlobalTech attrition. They are not this company''s employees.'
    )
  ) into payload;
  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
  values (ident.identity_id, ident.role, 'people_get_case3_signals', 'voluntary_attrition_rate', 1, 0, 'demo');
  return payload;
end;
$$;

do $$
declare
  cmd text;
begin
  foreach cmd in array array[
    'alter function people_v2.people_latest_month() owner to people_definer',
    'alter function people_v2.people_get_metric(text, date, text, text) owner to people_definer',
    'alter function people_v2.people_assert_identity(text) owner to people_definer',
    'alter function people_v2.people_get_metric_for(text, text, date, text, text) owner to people_definer',
    'alter function people_v2.people_get_metric_breakdown(text, text, text, date, text) owner to people_definer',
    'alter function people_v2.people_get_metric_trend(text, text, integer, text) owner to people_definer',
    'alter function people_v2.people_get_case3_signals(text, date) owner to people_definer',
    'alter function people_v2.people_sensitivity_rank(text) owner to people_definer',
    'alter function people_v2.people_latest_month() security definer',
    'alter function people_v2.people_get_metric(text, date, text, text) security definer'
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
grant execute on function people_v2.people_get_metric(text, date, text, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_assert_identity(text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_for(text, text, date, text, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_breakdown(text, text, text, date, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_trend(text, text, integer, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_case3_signals(text, date) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_sensitivity_rank(text) to people_app, people_publisher, people_definer;
