-- Patch already-published people_v2: Case 3 location×tenure×grade uses trailing-12m
-- annualized rates (same formula as people_get_metric). min_cell still uses as-of
-- month n so identity suppression counts stay 44 / 42 / 34 / 30.

create table if not exists people_v2.people_metric_breakdown_cache (
  cache_key text primary key,
  metric_id text not null,
  job_family text,
  dimension text not null,
  as_of date not null,
  grain text not null,
  cells jsonb not null,
  refreshed_at timestamptz not null default now()
);

grant select on people_v2.people_metric_breakdown_cache to people_app, people_publisher, people_definer;
grant insert, update, delete on people_v2.people_metric_breakdown_cache to people_publisher, people_definer;

alter table people_v2.people_metric_breakdown_cache enable row level security;
drop policy if exists people_app_read on people_v2.people_metric_breakdown_cache;
create policy people_app_read on people_v2.people_metric_breakdown_cache
  for select to people_app using (current_setting('people.role', true) is not null);
drop policy if exists people_publisher_all on people_v2.people_metric_breakdown_cache;
create policy people_publisher_all on people_v2.people_metric_breakdown_cache
  for all to people_publisher using (true) with check (true);
drop policy if exists people_definer_all on people_v2.people_metric_breakdown_cache;
create policy people_definer_all on people_v2.people_metric_breakdown_cache
  for all to people_definer using (true) with check (true);

create or replace function people_v2.people_breakdown_t12m_raw(
  p_as_of date,
  p_job_family text,
  p_dimension text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  win_start date;
  job_fam text;
  cells jsonb;
begin
  if p_dimension not in ('location_tenure_grade', 'location_tenure') then
    raise exception 'invalid t12m dimension' using errcode = '22023';
  end if;
  win_start := p_as_of - interval '12 months';
  job_fam := nullif(p_job_family, '');
  if p_dimension = 'location_tenure_grade' then
    with monthly as materialized (
      select location_id, tenure_band, grade_id, month_end,
             count(*) filter (where is_certified) as hc,
             count(*) filter (where terminated_in_month and termination_category = 'voluntary') as terms
      from people_snap_worker_month
      where month_end <= p_as_of
        and month_end > win_start
        and (job_fam is null or job_family = job_fam)
      group by 1, 2, 3, 4
    ),
    asof as (
      select location_id, tenure_band, grade_id, hc as n
      from monthly
      where month_end = p_as_of
    ),
    t12 as (
      select location_id, tenure_band, grade_id,
             sum(terms) as terms_vol,
             avg(hc)::numeric as avg_hc
      from monthly
      group by 1, 2, 3
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', a.location_id || '|' || a.tenure_band || '|' || coalesce(a.grade_id, ''),
      'location_id', a.location_id,
      'tenure_band', a.tenure_band,
      'grade_id', a.grade_id,
      'n', a.n,
      'terms_vol', t.terms_vol,
      'avg_hc', t.avg_hc,
      'value', t.terms_vol * 1.0 / nullif(t.avg_hc, 0),
      'grain', 'trailing_12m',
      'window', 'trailing-12m (annualized)'
    ) order by a.location_id, a.tenure_band, a.grade_id), '[]'::jsonb)
    into cells
    from asof a
    join t12 t using (location_id, tenure_band, grade_id);
  else
    with monthly as materialized (
      select location_id, tenure_band, month_end,
             count(*) filter (where is_certified) as hc,
             count(*) filter (where terminated_in_month and termination_category = 'voluntary') as terms
      from people_snap_worker_month
      where month_end <= p_as_of
        and month_end > win_start
        and (job_fam is null or job_family = job_fam)
      group by 1, 2, 3
    ),
    asof as (
      select location_id, tenure_band, hc as n
      from monthly
      where month_end = p_as_of
    ),
    t12 as (
      select location_id, tenure_band,
             sum(terms) as terms_vol,
             avg(hc)::numeric as avg_hc
      from monthly
      group by 1, 2
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', a.location_id || '|' || a.tenure_band,
      'location_id', a.location_id,
      'tenure_band', a.tenure_band,
      'n', a.n,
      'terms_vol', t.terms_vol,
      'avg_hc', t.avg_hc,
      'value', t.terms_vol * 1.0 / nullif(t.avg_hc, 0),
      'grain', 'trailing_12m',
      'window', 'trailing-12m (annualized)'
    ) order by a.location_id, a.tenure_band), '[]'::jsonb)
    into cells
    from asof a
    join t12 t using (location_id, tenure_band);
  end if;
  return coalesce(cells, '[]'::jsonb);
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
  raw_cells jsonb;
  suppressed int := 0;
  job_fam text;
  v_cache_key text;
  v_grain text;
  v_window text;
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

  v_grain := case
    when p_metric_id = 'voluntary_attrition_rate' and p_dimension in ('location_tenure_grade', 'location_tenure')
      then 'trailing_12m'
    else 'month'
  end;
  v_window := case
    when v_grain = 'trailing_12m' then 'trailing-12m (annualized)'
    else 'month (as-of)'
  end;

  if p_metric_id = 'voluntary_attrition_rate' and p_dimension in ('location_tenure_grade', 'location_tenure') then
    v_cache_key := p_metric_id || '|' || coalesce(job_fam, '*') || '|' || p_dimension || '|' || as_of::text;
    select c.cells into raw_cells
    from people_metric_breakdown_cache c
    where c.cache_key = v_cache_key;
    if raw_cells is null then
      raw_cells := people_v2.people_breakdown_t12m_raw(as_of, job_fam, p_dimension);
      insert into people_metric_breakdown_cache
        (cache_key, metric_id, job_family, dimension, as_of, grain, cells)
      values (v_cache_key, p_metric_id, job_fam, p_dimension, as_of, 'trailing_12m', raw_cells)
      on conflict (cache_key) do update
        set cells = excluded.cells, refreshed_at = now();
    end if;
    select coalesce(jsonb_agg(mapped order by ord), '[]'::jsonb)
    into cells
    from (
      select t.ord,
        t.elem || jsonb_build_object(
          'value', case
            when (t.elem->>'n')::int < min_cell then null
            else (t.elem->>'value')::numeric
          end,
          'suppressed', (t.elem->>'n')::int < min_cell,
          'window', 'trailing-12m (annualized)',
          'grain', 'trailing_12m'
        ) as mapped
      from jsonb_array_elements(raw_cells) with ordinality as t(elem, ord)
    ) s;
  elsif p_metric_id = 'headcount' and p_dimension = 'location_tenure_grade' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id || '|' || tenure_band || '|' || coalesce(grade_id, ''),
      'location_id', location_id,
      'tenure_band', tenure_band,
      'grade_id', grade_id,
      'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
    ) order by location_id, tenure_band, grade_id), '[]'::jsonb)
    into cells
    from (
      select location_id, tenure_band, grade_id,
             count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by location_id, tenure_band, grade_id
    ) s;
  elsif p_metric_id = 'headcount' and p_dimension = 'location_tenure' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id || '|' || tenure_band,
      'location_id', location_id,
      'tenure_band', tenure_band,
      'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
    ) order by location_id, tenure_band), '[]'::jsonb)
    into cells
    from (
      select location_id, tenure_band,
             count(*) filter (where is_certified) as n
      from people_snap_worker_month
      where month_end = as_of
        and (job_fam is null or job_family = job_fam)
      group by location_id, tenure_band
    ) s;
  elsif p_metric_id = 'headcount' and p_dimension = 'location_id' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', location_id, 'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
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
        'suppressed', false,
        'window', 'trailing-12m (annualized)',
        'grain', 'trailing_12m'
      )
    );
  elsif p_dimension = 'region' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', region, 'n', n,
      'value', case when n < min_cell then null else n end,
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
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
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
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
      'suppressed', n < min_cell,
      'window', 'month (as-of)',
      'grain', 'month'
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
     jsonb_build_object('dimension', p_dimension, 'job_family', job_fam, 'min_cell', min_cell, 'grain', v_grain),
     jsonb_array_length(cells), suppressed, 'demo');
  return jsonb_build_object(
    'metric_id', p_metric_id,
    'dimension', p_dimension,
    'as_of', as_of,
    'min_cell', min_cell,
    'identity_id', ident.identity_id,
    'role', ident.role,
    'grain', v_grain,
    'window', v_window,
    'cells', cells
  );
end;
$$;

grant execute on function people_v2.people_breakdown_t12m_raw(date, text, text)
  to people_publisher, people_definer;
grant execute on function people_v2.people_get_metric_breakdown(text, text, text, date, text)
  to people_app, people_publisher, people_definer;
