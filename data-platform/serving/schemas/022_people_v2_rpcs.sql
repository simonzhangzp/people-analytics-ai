-- people_v2 metric RPCs. Default window is trailing-12m annualized for rates.
-- Optional p_grain = 'month' is the as-of month (rates still annualized ×12).
-- No people_app LOGIN.

create or replace function people_v2.people_latest_month()
returns date
language sql
stable
security invoker
set search_path = people_v2
as $$
  select max(month_end) from people_v2.people_snap_worker_month;
$$;

drop function if exists people_v2.people_get_metric(text, date);
drop function if exists people_v2.people_get_metric(text, date, text);

create or replace function people_v2.people_get_metric(
  p_metric_id text,
  p_as_of date default null,
  p_grain text default 'trailing_12m'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = people_v2
as $$
declare
  as_of date;
  grain text;
  win_start date;
  v numeric;
  unit text := 'count';
  avg_hc numeric;
  month_hc numeric;
  stages jsonb;
begin
  if p_metric_id is null or p_metric_id !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'invalid metric_id' using errcode = '22023';
  end if;
  if not exists (select 1 from people_v2.people_metric where metric_id = p_metric_id) then
    raise exception 'unknown metric_id: %', p_metric_id using errcode = '22023';
  end if;
  grain := coalesce(nullif(p_grain, ''), 'trailing_12m');
  if grain not in ('trailing_12m', 'month') then
    raise exception 'invalid grain' using errcode = '22023';
  end if;
  as_of := coalesce(p_as_of, people_v2.people_latest_month());
  win_start := as_of - interval '12 months';

  select count(*) into month_hc
  from people_snap_worker_month
  where month_end = as_of and is_certified;

  select avg(hc) into avg_hc from (
    select count(*) as hc
    from people_snap_worker_month
    where is_certified and month_end <= as_of and month_end > win_start
    group by month_end
  ) t;

  if p_metric_id = 'headcount' then
    v := month_hc;
  elsif p_metric_id = 'average_headcount' then
    if grain = 'month' then
      v := month_hc;
    else
      v := avg_hc;
    end if;
  elsif p_metric_id = 'hires' then
    if grain = 'month' then
      select count(*) into v from people_snap_worker_month
      where month_end = as_of and hired_in_month and is_certified and via_t1 and coalesce(is_rehire, false) = false;
    else
      select count(*) into v from people_snap_worker_month
      where hired_in_month and is_certified and via_t1 and coalesce(is_rehire, false) = false
        and month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'rehires' then
    if grain = 'month' then
      select count(*) into v from people_snap_worker_month
      where month_end = as_of and hired_in_month and is_certified and is_rehire;
    else
      select count(*) into v from people_snap_worker_month
      where hired_in_month and is_certified and is_rehire
        and month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'voluntary_attrition_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (where terminated_in_month and termination_category = 'voluntary')) * 12.0
             / nullif(count(*) filter (where is_certified), 0)
      into v from people_snap_worker_month where month_end = as_of;
    else
      select count(*) filter (where terminated_in_month and termination_category = 'voluntary') * 1.0
             / nullif(avg_hc, 0)
      into v from people_snap_worker_month
      where month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'involuntary_attrition_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (where terminated_in_month and termination_category = 'involuntary')) * 12.0
             / nullif(count(*) filter (where is_certified), 0)
      into v from people_snap_worker_month where month_end = as_of;
    else
      select count(*) filter (where terminated_in_month and termination_category = 'involuntary') * 1.0
             / nullif(avg_hc, 0)
      into v from people_snap_worker_month
      where month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'regrettable_attrition_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (where is_regrettable)) * 12.0
             / nullif(count(*) filter (where is_certified), 0)
      into v from people_snap_worker_month where month_end = as_of;
    else
      select count(*) filter (where is_regrettable) * 1.0
             / nullif(avg_hc, 0)
      into v from people_snap_worker_month
      where month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'promotion_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (where promoted_in_month and is_certified)) * 12.0
             / nullif(count(*) filter (where is_certified), 0)
      into v from people_snap_worker_month where month_end = as_of;
    else
      select count(*) filter (where promoted_in_month and is_certified) * 1.0
             / nullif(avg_hc, 0)
      into v from people_snap_worker_month
      where month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'internal_mobility_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (where transferred_in_month and is_certified)) * 12.0
             / nullif(count(*) filter (where is_certified), 0)
      into v from people_snap_worker_month where month_end = as_of;
    else
      select count(*) filter (where transferred_in_month and is_certified) * 1.0
             / nullif(avg_hc, 0)
      into v from people_snap_worker_month
      where month_end <= as_of and month_end > win_start;
    end if;
  elsif p_metric_id = 'manager_turnover_rate' then
    unit := 'rate';
    if grain = 'month' then
      select (count(*) filter (
               where month_end = as_of and terminated_in_month
                 and (is_manager or coalesce(was_manager, false))
             )) * 12.0
             / nullif(count(*) filter (where month_end = as_of and is_manager and is_certified), 0)
      into v
      from (
        select *,
               lag(is_manager) over (partition by worker_id order by month_end) as was_manager
        from people_snap_worker_month
        where month_end <= as_of and month_end >= (as_of - interval '1 month')
      ) t;
    else
      select
        (select count(*) from (
           select *,
                  lag(is_manager) over (partition by worker_id order by month_end) as was_manager
           from people_snap_worker_month
           where month_end <= as_of and month_end > (win_start - interval '1 month')
         ) t
         where terminated_in_month and (is_manager or coalesce(was_manager, false))
           and month_end <= as_of and month_end > win_start) * 1.0
        / nullif((
          select avg(n) from (
            select count(*) as n from people_snap_worker_month
            where is_manager and is_certified
              and month_end <= as_of and month_end > win_start
            group by month_end
          ) m
        ), 0)
      into v;
    end if;
  elsif p_metric_id = 'span_of_control' then
    select avg(direct_report_count) into v
    from people_snap_worker_month
    where month_end = as_of and is_manager and is_certified;
  elsif p_metric_id = 'time_to_fill_days' then
    unit := 'days';
    if grain = 'month' then
      select percentile_cont(0.5) within group (
        order by (cast(closed_at as date) - cast(opened_at as date))
      ) into v
      from people_dim_requisition
      where close_reason = 'hired' and closed_at is not null
        and date_trunc('month', cast(closed_at as timestamp)) = date_trunc('month', as_of::timestamp);
    else
      select percentile_cont(0.5) within group (
        order by (cast(closed_at as date) - cast(opened_at as date))
      ) into v
      from people_dim_requisition
      where close_reason = 'hired' and closed_at is not null
        and cast(closed_at as date) <= as_of
        and cast(closed_at as date) > win_start;
    end if;
  elsif p_metric_id = 'time_in_stage_hours' then
    unit := 'hours';
    select percentile_cont(0.5) within group (
      order by extract(epoch from (coalesce(exited_at, entered_at) - entered_at)) / 3600.0
    ) into v
    from people_evt_application_stage
    where entered_at is not null
      and cast(entered_at as date) <= as_of
      and cast(entered_at as date) > win_start;
    select jsonb_object_agg(canonical_stage, med) into stages
    from (
      select canonical_stage,
             percentile_cont(0.5) within group (
               order by extract(epoch from (coalesce(exited_at, entered_at) - entered_at)) / 3600.0
             ) as med
      from people_evt_application_stage
      where entered_at is not null
        and cast(entered_at as date) <= as_of
        and cast(entered_at as date) > win_start
      group by canonical_stage
    ) s;
  elsif p_metric_id = 'offer_acceptance_rate' then
    unit := 'rate';
    select count(*) filter (where status = 'accepted') * 1.0
         / nullif(count(*) filter (where status in ('accepted','rejected')), 0)
    into v from people_fact_offer
    where coalesce(cast(resolved_at as date), cast(created_at as date)) <= as_of
      and coalesce(cast(resolved_at as date), cast(created_at as date)) > win_start;
  elsif p_metric_id = 'applications_per_opening' then
    select
      (select count(*) from people_fact_application
        where cast(applied_at as date) <= as_of and cast(applied_at as date) > win_start) * 1.0
      / nullif((select count(*) from people_dim_requisition
        where cast(opened_at as date) <= as_of and cast(opened_at as date) > win_start), 0)
    into v;
  elsif p_metric_id = 'quality_of_hire' then
    unit := 'rate';
    select
      count(*) filter (
        where s.is_certified
          and a.final_score >= 3.5
      ) * 1.0
      / nullif(count(*), 0)
    into v
    from people_snap_worker_month s
    left join lateral (
      select final_score from people_fact_appraisal p
      where p.worker_id = s.worker_id
      order by p.submitted_at
      limit 1
    ) a on true
    where s.month_end = as_of
      and s.via_t1
      and s.hire_date <= (as_of - interval '12 months')
      and s.hire_date > (as_of - interval '24 months');
  elsif p_metric_id = 'recruiter_load' then
    select avg(open_requisitions) into v
    from people_snap_recruiter_month where month_end = as_of;
  elsif p_metric_id = 'compa_ratio_median' then
    unit := 'ratio';
    select percentile_cont(0.5) within group (order by latest.compa)
    into v
    from (
      select c.base * 1.0 / nullif(b.band_mid, 0) as compa,
             row_number() over (partition by s.worker_id order by c.from_date desc) as rn
      from people_snap_worker_month s
      join people_hist_worker_attr h
        on h.worker_id = s.worker_id and h.valid_from <= s.month_end
       and (h.valid_to is null or h.valid_to > s.month_end)
      join people_fact_comp_assignment_restricted c
        on c.worker_id = s.worker_id and c.from_date <= s.month_end
       and (c.to_date is null or c.to_date >= s.month_end)
      join people_ref_comp_band b on b.grade_id = h.grade_id
      where s.month_end = as_of and s.is_certified
    ) latest
    where rn = 1;
  elsif p_metric_id = 'engagement_score' then
    unit := 'score';
    select round(avg(score_mean)::numeric, 12) into v from people_fact_survey_score_restricted;
  elsif p_metric_id = 'training_hours_per_worker' then
    select
      (select coalesce(sum(training_hours), 0) from people_mart_learning_monthly
        where month_start <= as_of and month_start > win_start) * 1.0
      / nullif(avg_hc, 0)
    into v;
    v := round(v::numeric, 12);
  elsif p_metric_id = 'skill_coverage' then
    unit := 'rate';
    select avg(coverage_ratio) into v
    from people_mart_skill_coverage_monthly
    where month_end = as_of;
  else
    raise exception 'unwired metric_id: %', p_metric_id using errcode = '22023';
  end if;

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'as_of', as_of,
    'value', v,
    'unit', unit,
    'window', grain,
    'annualized', (unit = 'rate' and grain = 'trailing_12m') or (unit = 'rate' and grain = 'month'),
    'by_stage', stages
  );
end;
$$;

grant execute on function people_v2.people_latest_month() to people_publisher, people_definer;
grant execute on function people_v2.people_get_metric(text, date, text) to people_publisher, people_definer;
