-- people_v2 metric RPCs generated for architecture §8. No people_app LOGIN.

create or replace function people_v2.people_latest_month()
returns date
language sql
stable
security invoker
set search_path = people_v2
as $$
  select max(month_end) from people_v2.people_snap_worker_month;
$$;

create or replace function people_v2.people_get_metric(
  p_metric_id text,
  p_as_of date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = people_v2
as $$
declare
  as_of date;
  v numeric;
  unit text := 'count';
begin
  if p_metric_id is null or p_metric_id !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'invalid metric_id' using errcode = '22023';
  end if;
  if not exists (select 1 from people_v2.people_metric where metric_id = p_metric_id) then
    raise exception 'unknown metric_id: %', p_metric_id using errcode = '22023';
  end if;
  as_of := coalesce(p_as_of, people_v2.people_latest_month());

  if p_metric_id = 'headcount' then
    select count(*) into v from people_snap_worker_month where month_end = as_of and is_certified;
  elsif p_metric_id = 'average_headcount' then
    select avg(hc) into v from (
      select count(*) as hc from people_snap_worker_month
      where is_certified and month_end <= as_of group by month_end
    ) t;
  elsif p_metric_id = 'hires' then
    select count(*) into v from people_snap_worker_month
    where month_end = as_of and hired_in_month and is_certified;
  elsif p_metric_id = 'voluntary_attrition_rate' then
    unit := 'rate';
    select
      (count(*) filter (where terminated_in_month and termination_category = 'voluntary')) * 12.0
      / nullif(count(*) filter (where is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'involuntary_attrition_rate' then
    unit := 'rate';
    select
      (count(*) filter (where terminated_in_month and termination_category = 'involuntary')) * 12.0
      / nullif(count(*) filter (where is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'regrettable_attrition_rate' then
    unit := 'rate';
    select
      (count(*) filter (where is_regrettable)) * 12.0
      / nullif(count(*) filter (where is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'promotion_rate' then
    unit := 'rate';
    select
      count(*) filter (where promoted_in_month and is_certified) * 1.0
      / nullif(count(*) filter (where is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'internal_mobility_rate' then
    unit := 'rate';
    select
      count(*) filter (where transferred_in_month and is_certified) * 1.0
      / nullif(count(*) filter (where is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'manager_turnover_rate' then
    unit := 'rate';
    select
      count(*) filter (where terminated_in_month and is_manager) * 1.0
      / nullif(count(*) filter (where is_manager and is_certified), 0)
    into v from people_snap_worker_month where month_end = as_of;
  elsif p_metric_id = 'span_of_control' then
    select avg(direct_report_count) into v
    from people_snap_worker_month
    where month_end = as_of and is_manager and is_certified;
  elsif p_metric_id = 'time_to_fill_days' then
    unit := 'days';
    select percentile_cont(0.5) within group (
      order by (cast(closed_at as date) - cast(opened_at as date))
    ) into v
    from people_dim_requisition
    where close_reason = 'hired' and closed_at is not null
      and cast(closed_at as date) <= as_of
      and date_trunc('month', cast(closed_at as timestamp)) = date_trunc('month', as_of::timestamp);
  elsif p_metric_id = 'time_in_stage_hours' then
    unit := 'hours';
    select percentile_cont(0.5) within group (
      order by extract(epoch from (coalesce(exited_at, entered_at) - entered_at)) / 3600.0
    ) into v
    from people_evt_application_stage
    where entered_at is not null
      and cast(entered_at as date) <= as_of
      and date_trunc('month', entered_at) = date_trunc('month', as_of::timestamp);
  elsif p_metric_id = 'offer_acceptance_rate' then
    unit := 'rate';
    select count(*) filter (where status = 'accepted') * 1.0
         / nullif(count(*) filter (where status in ('accepted','rejected')), 0)
    into v from people_fact_offer
    where coalesce(cast(resolved_at as date), cast(created_at as date)) <= as_of
      and date_trunc('month', coalesce(resolved_at, created_at)) = date_trunc('month', as_of::timestamp);
  elsif p_metric_id = 'applications_per_opening' then
    select
      (select count(*) from people_fact_application where cast(applied_at as date) <= as_of) * 1.0
      / nullif((select count(*) from people_dim_requisition where cast(opened_at as date) <= as_of), 0)
    into v;
  elsif p_metric_id = 'quality_of_hire' then
    unit := 'rate';
    select
      count(*) filter (
        where s.is_certified
          and s.via_t1
          and a.final_score::double precision >= 3.5
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
      and s.hire_date >= (as_of - interval '12 months')
      and s.hire_date < (as_of - interval '11 months');
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
      round((
        (select coalesce(sum(hours),0) from people_fact_training_participation) * 1.0
        / nullif((select count(*) from people_snap_worker_month where month_end = as_of and is_certified), 0)
      )::numeric, 12)
    into v;
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
    'unit', unit
  );
end;
$$;

grant execute on function people_v2.people_latest_month() to people_publisher, people_definer;
grant execute on function people_v2.people_get_metric(text, date) to people_publisher, people_definer;
