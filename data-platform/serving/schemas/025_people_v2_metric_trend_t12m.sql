-- Patch already-published people_v2: Case 3 trend is trailing-12m over 24 month-ends.
-- Frozen data-v1 caches the Engineering series so the case page does not seq-scan snap.

create table if not exists people_v2.people_metric_trend_cache (
  cache_key text primary key,
  metric_id text not null,
  job_family text,
  grain text not null,
  points jsonb not null,
  refreshed_at timestamptz not null default now()
);

grant select on people_v2.people_metric_trend_cache to people_app, people_publisher, people_definer;
grant insert, update, delete on people_v2.people_metric_trend_cache to people_publisher, people_definer;

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
  v_cache_key text;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  n_months := greatest(3, least(coalesce(p_months, 24), 24));
  as_of := people_v2.people_latest_month();
  v_cache_key := p_metric_id || '|' || coalesce(nullif(p_job_family, ''), '*') || '|' || n_months::text;
  select m.sensitivity into metric_sens from people_v2.people_metric m where m.metric_id = p_metric_id;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    insert into people_v2.people_access_log
      (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
    values (ident.identity_id, ident.role, 'people_get_metric_trend', p_metric_id, 0, 0, 'demo');
    return jsonb_build_object('metric_id', p_metric_id, 'denied', true, 'points', '[]'::jsonb);
  end if;
  if p_metric_id = 'voluntary_attrition_rate' then
    select c.points into points
    from people_metric_trend_cache c
    where c.cache_key = v_cache_key;
    if points is not null then
      insert into people_v2.people_access_log
        (identity_id, role, rpc, metric_id, rows_returned, cells_suppressed, purpose_tag)
      values (ident.identity_id, ident.role, 'people_get_metric_trend', p_metric_id, n_months, 0, 'demo');
      return jsonb_build_object(
        'metric_id', p_metric_id,
        'grain', 'trailing_12m',
        'points', points,
        'identity_id', ident.identity_id,
        'scenario_start', '2026-03-01',
        'cached', true
      );
    end if;
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
    insert into people_metric_trend_cache (cache_key, metric_id, job_family, grain, points)
    values (v_cache_key, p_metric_id, nullif(p_job_family, ''), 'trailing_12m', points)
    on conflict (cache_key) do update
      set points = excluded.points, refreshed_at = now();
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
    'scenario_start', '2026-03-01',
    'cached', false
  );
end;
$$;

grant execute on function people_v2.people_get_metric_trend(text, text, integer, text) to people_app, people_publisher, people_definer;
