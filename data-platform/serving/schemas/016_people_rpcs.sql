-- Read-only People serving RPCs. Query curated marts only. No bronze.

create or replace function public.people_latest_month()
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select max(as_of_month) from public.people_mart_workforce_overview;
$$;

create or replace function public.people_assert_metric_id(p_metric_id text)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_metric_id is null or p_metric_id !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'invalid metric_id' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.people_metric_definition where metric_id = p_metric_id
  ) then
    raise exception 'unknown metric_id: %', p_metric_id using errcode = '22023';
  end if;
end;
$$;

create or replace function public.people_metric_quality_status(
  p_metric_id text,
  p_slice_unhealthy boolean default false
)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_health text;
  v_quality text;
begin
  if exists (
    select 1
    from public.people_data_quality_incident i
    where i.status in ('open', 'investigating')
      and p_metric_id = any (i.affected_metrics)
  ) then
    return 'unhealthy';
  end if;

  select d.health_status, d.quality_status
    into v_health, v_quality
  from public.people_metric_definition d
  where d.metric_id = p_metric_id;

  if v_health = 'unhealthy' or v_quality = 'unhealthy' then
    return 'unhealthy';
  end if;

  if p_slice_unhealthy then
    return 'unhealthy';
  end if;

  return 'healthy';
end;
$$;

create or replace function public.people_metric_freshness(p_metric_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'source_period', public.people_latest_month(),
    'source_tables', d.source_tables,
    'last_success_at', (
      select max(h.last_success_at) from public.people_source_health h
    ),
    'freshness_status', (
      select h.freshness_status
      from public.people_source_health h
      where h.source_name = 'people_synthetic_globaltech'
      limit 1
    )
  )
  from public.people_metric_definition d
  where d.metric_id = p_metric_id;
$$;

create or replace function public.people_get_metric_definition(p_metric_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.people_assert_metric_id(p_metric_id);
  select jsonb_build_object(
    'metric_id', d.metric_id,
    'metric_name', d.metric_name,
    'domain', d.domain,
    'business_definition', d.business_definition,
    'formula', coalesce(d.formula, d.formula_sql),
    'formula_sql', d.formula_sql,
    'numerator_definition', d.numerator_definition,
    'denominator_definition', d.denominator_definition,
    'population_rules', d.population_rules,
    'exclusions', d.exclusions,
    'time_logic', d.time_logic,
    'grain', d.grain,
    'dimensions', d.dimensions,
    'owner', d.owner,
    'status', d.status,
    'version', d.version,
    'effective_date', d.effective_date,
    'source_tables', d.source_tables,
    'downstream_marts', d.downstream_marts,
    'quality_status', public.people_metric_quality_status(d.metric_id, false),
    'health_status', d.health_status,
    'freshness', public.people_metric_freshness(d.metric_id)
  )
  into result
  from public.people_metric_definition d
  where d.metric_id = p_metric_id;
  return result;
end;
$$;

create or replace function public.people_get_metric(
  p_metric_id text,
  p_as_of date default null,
  p_job_family text default null,
  p_org_id text default null,
  p_location_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  as_of date;
  metric_value numeric;
  slice_unhealthy boolean := false;
  unit text := 'count';
begin
  perform public.people_assert_metric_id(p_metric_id);
  if p_job_family is not null and length(p_job_family) > 64 then
    raise exception 'invalid job_family' using errcode = '22023';
  end if;
  if p_org_id is not null and p_org_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'invalid org_id' using errcode = '22023';
  end if;
  as_of := coalesce(p_as_of, public.people_latest_month());

  if p_metric_id in ('headcount', 'hires') then
    select
      case when p_metric_id = 'hires' then coalesce(sum(w.hires), 0) else coalesce(sum(w.headcount), 0) end,
      coalesce(bool_or(w.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_workforce_overview w
    where w.as_of_month = as_of
      and (p_job_family is null or w.job_family = p_job_family)
      and (p_org_id is null or w.org_id = p_org_id)
      and (p_location_id is null or w.location_id = p_location_id);
  elsif p_metric_id = 'average_headcount' then
    select avg(monthly.hc), coalesce(bool_or(monthly.slice_unhealthy), false)
    into metric_value, slice_unhealthy
    from (
      select w.as_of_month, sum(w.headcount) as hc, bool_or(w.quality_status = 'unhealthy') as slice_unhealthy
      from public.people_mart_workforce_overview w
      where w.as_of_month > as_of - interval '12 months'
        and w.as_of_month <= as_of
        and (p_job_family is null or w.job_family = p_job_family)
        and (p_org_id is null or w.org_id = p_org_id)
        and (p_location_id is null or w.location_id = p_location_id)
      group by w.as_of_month
    ) monthly;
    unit := 'count';
  elsif p_metric_id in ('voluntary_attrition', 'regrettable_attrition') then
    unit := 'rate';
    select
      case
        when p_metric_id = 'regrettable_attrition'
          then coalesce(sum(r.regrettable_exits), 0) / nullif(sum(r.beginning_headcount), 0)
        else coalesce(sum(r.voluntary_exits), 0) / nullif(sum(r.beginning_headcount), 0)
      end,
      coalesce(bool_or(r.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_retention r
    where r.as_of_month = as_of
      and (p_job_family is null or r.job_family = p_job_family)
      and (p_org_id is null or r.org_id = p_org_id)
      and (p_location_id is null or r.location_id = p_location_id);
  elsif p_metric_id in ('promotion_rate', 'internal_mobility_rate') then
    unit := 'rate';
    select
      case
        when p_metric_id = 'promotion_rate'
          then coalesce(sum(m.promotions), 0) / nullif(coalesce(sum(m.headcount), sum(m.promotions + m.lateral_moves)), 0)
        else coalesce(sum(m.promotions + m.lateral_moves), 0)
          / nullif(coalesce(sum(m.headcount), sum(m.promotions + m.lateral_moves)), 0)
      end,
      coalesce(bool_or(m.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_internal_mobility m
    where m.as_of_month = as_of
      and (p_job_family is null or m.job_family = p_job_family)
      and (p_org_id is null or m.org_id = p_org_id);
  elsif p_metric_id in ('time_to_fill', 'time_in_stage', 'offer_acceptance_rate', 'quality_of_hire') then
    unit := case when p_metric_id in ('offer_acceptance_rate', 'quality_of_hire') then 'rate' else 'days' end;
    select
      case p_metric_id
        when 'time_to_fill' then avg(rec.time_to_fill_days)
        when 'time_in_stage' then avg(rec.time_in_stage_days)
        when 'offer_acceptance_rate' then avg(rec.offer_acceptance_rate)
        else avg(rec.quality_of_hire_index)
      end,
      coalesce(bool_or(rec.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_recruiting rec
    where (p_job_family is null or rec.job_family = p_job_family)
      and (p_location_id is null or rec.location_id = p_location_id);
  elsif p_metric_id = 'compa_ratio' then
    unit := 'ratio';
    select avg(c.mean_compa_ratio), coalesce(bool_or(c.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_compensation c
    where c.as_of_month = as_of
      and (p_job_family is null or c.job_family = p_job_family)
      and (p_location_id is null or c.location_id = p_location_id);
  elsif p_metric_id in ('span_of_control', 'engagement_score', 'manager_turnover_rate') then
    unit := case when p_metric_id = 'manager_turnover_rate' then 'rate' when p_metric_id = 'engagement_score' then 'score' else 'count' end;
    select
      case p_metric_id
        when 'span_of_control' then avg(me.span_of_control)
        when 'engagement_score' then avg(me.engagement_score)
        else avg(me.manager_turnover_rate)
      end,
      coalesce(bool_or(me.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_manager_effectiveness me
    where me.as_of_month = as_of
      and (p_job_family is null or me.job_family = p_job_family)
      and (p_org_id is null or me.org_id = p_org_id);
  elsif p_metric_id in ('learning_participation', 'learning_completion_rate', 'learning_hours_per_employee') then
    unit := case when p_metric_id = 'learning_hours_per_employee' then 'hours' else 'rate' end;
    select
      case p_metric_id
        when 'learning_participation' then avg(l.participation_rate)
        when 'learning_completion_rate' then avg(l.completion_rate)
        else avg(l.learning_hours_per_employee)
      end,
      coalesce(bool_or(l.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_learning l
    where l.as_of_month = as_of
      and (p_job_family is null or l.job_family = p_job_family)
      and (p_org_id is null or l.org_id = p_org_id);
  elsif p_metric_id in ('skill_coverage', 'critical_skill_gap') then
    unit := 'rate';
    select
      case
        when p_metric_id = 'critical_skill_gap'
          then avg(s.gap_rate) filter (where s.is_critical)
        else avg(s.internal_coverage_rate)
      end,
      coalesce(bool_or(s.quality_status = 'unhealthy'), false)
    into metric_value, slice_unhealthy
    from public.people_mart_skills s
    where s.as_of_month = as_of
      and (p_job_family is null or s.job_family = p_job_family);
  else
    raise exception 'metric % has no serving calculator', p_metric_id using errcode = '22023';
  end if;

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'value', metric_value,
    'unit', unit,
    'as_of', as_of,
    'job_family', p_job_family,
    'org_id', p_org_id,
    'location_id', p_location_id,
    'quality_status', public.people_metric_quality_status(p_metric_id, slice_unhealthy),
    'trusted', public.people_metric_quality_status(p_metric_id, slice_unhealthy) = 'healthy',
    'freshness', public.people_metric_freshness(p_metric_id),
    'provenance', 'synthetic_internal',
    'source_period', as_of
  );
end;
$$;

create or replace function public.people_get_metric_trend(
  p_metric_id text,
  p_months integer default 12,
  p_job_family text default null,
  p_org_id text default null,
  p_location_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  latest date;
  months integer;
  points jsonb := '[]'::jsonb;
begin
  perform public.people_assert_metric_id(p_metric_id);
  months := least(greatest(coalesce(p_months, 12), 1), 60);
  latest := public.people_latest_month();

  if p_metric_id in ('headcount', 'hires', 'average_headcount') then
    select jsonb_agg(point order by month)
    into points
    from (
      select
        w.as_of_month as month,
        case when p_metric_id = 'hires' then sum(w.hires) else sum(w.headcount) end as value,
        bool_or(w.quality_status = 'unhealthy') as slice_unhealthy
      from public.people_mart_workforce_overview w
      where w.as_of_month > latest - (months || ' months')::interval
        and (p_job_family is null or w.job_family = p_job_family)
        and (p_org_id is null or w.org_id = p_org_id)
        and (p_location_id is null or w.location_id = p_location_id)
      group by w.as_of_month
    ) t
    cross join lateral (
      select jsonb_build_object(
        'as_of', t.month,
        'value', t.value,
        'quality_status', public.people_metric_quality_status(p_metric_id, t.slice_unhealthy)
      ) as point
    ) x;
  elsif p_metric_id in ('voluntary_attrition', 'regrettable_attrition') then
    select jsonb_agg(point order by month)
    into points
    from (
      select
        r.as_of_month as month,
        case
          when p_metric_id = 'regrettable_attrition'
            then sum(r.regrettable_exits) / nullif(sum(r.beginning_headcount), 0)
          else sum(r.voluntary_exits) / nullif(sum(r.beginning_headcount), 0)
        end as value,
        bool_or(r.quality_status = 'unhealthy') as slice_unhealthy
      from public.people_mart_retention r
      where r.as_of_month > latest - (months || ' months')::interval
        and (p_job_family is null or r.job_family = p_job_family)
        and (p_org_id is null or r.org_id = p_org_id)
        and (p_location_id is null or r.location_id = p_location_id)
      group by r.as_of_month
    ) t
    cross join lateral (
      select jsonb_build_object(
        'as_of', t.month,
        'value', t.value,
        'quality_status', public.people_metric_quality_status(p_metric_id, t.slice_unhealthy)
      ) as point
    ) x;
  elsif p_metric_id in ('promotion_rate', 'internal_mobility_rate') then
    select jsonb_agg(point order by month)
    into points
    from (
      select
        m.as_of_month as month,
        case
          when p_metric_id = 'promotion_rate'
            then sum(m.promotions) / nullif(coalesce(sum(m.headcount), sum(m.promotions + m.lateral_moves)), 0)
          else sum(m.promotions + m.lateral_moves)
            / nullif(coalesce(sum(m.headcount), sum(m.promotions + m.lateral_moves)), 0)
        end as value,
        bool_or(m.quality_status = 'unhealthy') as slice_unhealthy
      from public.people_mart_internal_mobility m
      where m.as_of_month > latest - (months || ' months')::interval
        and (p_job_family is null or m.job_family = p_job_family)
        and (p_org_id is null or m.org_id = p_org_id)
      group by m.as_of_month
    ) t
    cross join lateral (
      select jsonb_build_object(
        'as_of', t.month,
        'value', t.value,
        'quality_status', public.people_metric_quality_status(p_metric_id, t.slice_unhealthy)
      ) as point
    ) x;
  elsif p_metric_id in ('learning_participation', 'learning_completion_rate', 'learning_hours_per_employee') then
    select jsonb_agg(point order by month)
    into points
    from (
      select
        l.as_of_month as month,
        case p_metric_id
          when 'learning_participation' then avg(l.participation_rate)
          when 'learning_completion_rate' then avg(l.completion_rate)
          else avg(l.learning_hours_per_employee)
        end as value,
        bool_or(l.quality_status = 'unhealthy') as slice_unhealthy
      from public.people_mart_learning l
      where l.as_of_month > latest - (months || ' months')::interval
        and (p_job_family is null or l.job_family = p_job_family)
        and (p_org_id is null or l.org_id = p_org_id)
      group by l.as_of_month
    ) t
    cross join lateral (
      select jsonb_build_object(
        'as_of', t.month,
        'value', t.value,
        'quality_status', public.people_metric_quality_status(p_metric_id, t.slice_unhealthy)
      ) as point
    ) x;
  else
    points := jsonb_build_array(public.people_get_metric(p_metric_id, latest, p_job_family, p_org_id, p_location_id));
  end if;

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'quality_status', public.people_metric_quality_status(p_metric_id, false),
    'freshness', public.people_metric_freshness(p_metric_id),
    'points', coalesce(points, '[]'::jsonb)
  );
end;
$$;

create or replace function public.people_get_metric_breakdown(
  p_metric_id text,
  p_dimension text,
  p_as_of date default null,
  p_job_family text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  as_of date;
  dim text;
  rows jsonb;
begin
  perform public.people_assert_metric_id(p_metric_id);
  dim := coalesce(p_dimension, 'job_family');
  if dim not in ('job_family', 'location_id', 'org_id', 'job_level', 'tenure_band') then
    raise exception 'invalid dimension' using errcode = '22023';
  end if;
  as_of := coalesce(p_as_of, public.people_latest_month());

  if p_metric_id in ('headcount', 'hires') and dim in ('job_family', 'location_id', 'org_id') then
    execute format(
      $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension', %1$I,
        'value', metric_value,
        'quality_status', public.people_metric_quality_status(%2$L, slice_unhealthy)
      ) order by metric_value desc), '[]'::jsonb)
      from (
        select %1$I,
          case when %3$L = 'hires' then sum(hires) else sum(headcount) end as metric_value,
          bool_or(quality_status = 'unhealthy') as slice_unhealthy
        from public.people_mart_workforce_overview
        where as_of_month = %4$L
          and (%5$L is null or job_family = %5$L)
        group by 1
      ) s
      $q$, dim, p_metric_id, p_metric_id, as_of, p_job_family
    ) into rows;
  elsif p_metric_id = 'voluntary_attrition' and dim in ('job_family', 'location_id', 'org_id') then
    execute format(
      $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension', %1$I,
        'value', metric_value,
        'quality_status', public.people_metric_quality_status('voluntary_attrition', slice_unhealthy)
      ) order by metric_value desc), '[]'::jsonb)
      from (
        select %1$I,
          sum(voluntary_exits) / nullif(sum(beginning_headcount), 0) as metric_value,
          bool_or(quality_status = 'unhealthy') as slice_unhealthy
        from public.people_mart_retention
        where as_of_month = %2$L
          and (%3$L is null or job_family = %3$L)
        group by 1
      ) s
      $q$, dim, as_of, p_job_family
    ) into rows;
  elsif dim in ('job_level', 'tenure_band', 'location_id', 'job_family') then
    execute format(
      $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension', %1$I,
        'value', metric_value,
        'quality_status', public.people_metric_quality_status(%2$L, slice_unhealthy)
      ) order by metric_value desc), '[]'::jsonb)
      from (
        select %1$I,
          sum(voluntary_exits) / nullif(sum(beginning_headcount), 0) as metric_value,
          bool_or(quality_status = 'unhealthy') as slice_unhealthy
        from public.people_mart_attrition_segment
        where as_of_month = %3$L
          and (%4$L is null or job_family = %4$L)
        group by 1
      ) s
      $q$, dim, p_metric_id, as_of, p_job_family
    ) into rows;
  else
    rows := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'dimension', dim,
    'as_of', as_of,
    'rows', coalesce(rows, '[]'::jsonb),
    'quality_status', public.people_metric_quality_status(p_metric_id, false),
    'freshness', public.people_metric_freshness(p_metric_id)
  );
end;
$$;

create or replace function public.people_get_workforce_overview(
  p_job_family text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  as_of date := public.people_latest_month();
begin
  return jsonb_build_object(
    'as_of_month', as_of,
    'provenance', 'synthetic_internal',
    'dataset_label', 'Synthetic Enterprise People Dataset',
    'headcount', public.people_get_metric('headcount', as_of, p_job_family),
    'voluntary_attrition', public.people_get_metric('voluntary_attrition', as_of, p_job_family),
    'internal_mobility', public.people_get_metric('internal_mobility_rate', as_of, p_job_family),
    'hires', public.people_get_metric('hires', as_of, p_job_family),
    'learning', public.people_get_metric('learning_hours_per_employee', as_of, p_job_family),
    'critical_skill_gap', public.people_get_metric('critical_skill_gap', as_of, p_job_family),
    'headcount_trend', public.people_get_metric_trend('headcount', 12, p_job_family),
    'attrition_trend', public.people_get_metric_trend('voluntary_attrition', 12, p_job_family),
    'source_period', as_of
  );
end;
$$;

create or replace function public.people_get_retention_analysis(
  p_job_family text default 'Engineering'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  as_of date := public.people_latest_month();
  family text := coalesce(p_job_family, 'Engineering');
  by_location jsonb;
  by_level jsonb;
  by_tenure jsonb;
  mobility jsonb;
  pay jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'location_id', s.location_id,
    'voluntary_attrition_rate', s.rate,
    'voluntary_exits', s.exits,
    'beginning_headcount', s.headcount,
    'quality_status', public.people_metric_quality_status('voluntary_attrition', s.slice_unhealthy)
  ) order by s.rate desc), '[]'::jsonb)
  into by_location
  from (
    select location_id,
      sum(voluntary_exits) / nullif(sum(beginning_headcount), 0) as rate,
      sum(voluntary_exits) as exits,
      sum(beginning_headcount) as headcount,
      bool_or(quality_status = 'unhealthy') as slice_unhealthy
    from public.people_mart_attrition_segment
    where as_of_month = as_of and job_family = family
    group by location_id
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'job_level', s.job_level,
    'voluntary_attrition_rate', s.rate,
    'voluntary_exits', s.exits,
    'quality_status', public.people_metric_quality_status('voluntary_attrition', s.slice_unhealthy)
  ) order by s.rate desc), '[]'::jsonb)
  into by_level
  from (
    select job_level,
      sum(voluntary_exits) / nullif(sum(beginning_headcount), 0) as rate,
      sum(voluntary_exits) as exits,
      bool_or(quality_status = 'unhealthy') as slice_unhealthy
    from public.people_mart_attrition_segment
    where as_of_month = as_of and job_family = family
    group by job_level
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tenure_band', s.tenure_band,
    'voluntary_attrition_rate', s.rate,
    'voluntary_exits', s.exits,
    'quality_status', public.people_metric_quality_status('voluntary_attrition', s.slice_unhealthy)
  ) order by s.rate desc), '[]'::jsonb)
  into by_tenure
  from (
    select tenure_band,
      sum(voluntary_exits) / nullif(sum(beginning_headcount), 0) as rate,
      sum(voluntary_exits) as exits,
      bool_or(quality_status = 'unhealthy') as slice_unhealthy
    from public.people_mart_attrition_segment
    where as_of_month = as_of and job_family = family
    group by tenure_band
  ) s;

  select jsonb_build_object(
    'internal_mobility_rate', avg(internal_mobility_rate),
    'promotions', sum(promotions),
    'lateral_moves', sum(lateral_moves),
    'quality_status', public.people_metric_quality_status('internal_mobility_rate', bool_or(quality_status = 'unhealthy'))
  )
  into mobility
  from public.people_mart_internal_mobility
  where as_of_month = as_of and job_family = family;

  select jsonb_build_object(
    'median_base_usd', avg(median_base_usd),
    'mean_compa_ratio', avg(mean_compa_ratio),
    'quality_status', public.people_metric_quality_status('compa_ratio', bool_or(quality_status = 'unhealthy'))
  )
  into pay
  from public.people_mart_compensation
  where as_of_month = as_of and job_family = family;

  return jsonb_build_object(
    'job_family', family,
    'as_of_month', as_of,
    'metric', public.people_get_metric('voluntary_attrition', as_of, family),
    'trend', public.people_get_metric_trend('voluntary_attrition', 12, family),
    'by_location', coalesce(by_location, '[]'::jsonb),
    'by_level', coalesce(by_level, '[]'::jsonb),
    'by_tenure', coalesce(by_tenure, '[]'::jsonb),
    'mobility', mobility,
    'compensation', pay,
    'provenance', 'synthetic_internal',
    'quality_status', public.people_metric_quality_status('voluntary_attrition', false)
  );
end;
$$;

create or replace function public.people_get_mobility_analysis(
  p_job_family text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'as_of_month', public.people_latest_month(),
    'internal_mobility', public.people_get_metric('internal_mobility_rate', public.people_latest_month(), p_job_family),
    'promotion_rate', public.people_get_metric('promotion_rate', public.people_latest_month(), p_job_family),
    'trend', public.people_get_metric_trend('internal_mobility_rate', 12, p_job_family),
    'quality_status', public.people_metric_quality_status('internal_mobility_rate', false),
    'freshness', public.people_metric_freshness('internal_mobility_rate')
  );
$$;

create or replace function public.people_get_recruiting_analysis(
  p_job_family text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'time_to_fill', public.people_get_metric('time_to_fill', public.people_latest_month(), p_job_family),
    'time_in_stage', public.people_get_metric('time_in_stage', public.people_latest_month(), p_job_family),
    'offer_acceptance_rate', public.people_get_metric('offer_acceptance_rate', public.people_latest_month(), p_job_family),
    'quality_of_hire', public.people_get_metric('quality_of_hire', public.people_latest_month(), p_job_family),
    'quality_status', public.people_metric_quality_status('time_to_fill', false),
    'freshness', public.people_metric_freshness('time_to_fill'),
    'provenance', 'synthetic_internal'
  );
$$;

create or replace function public.people_get_learning_analysis(
  p_job_family text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'participation', public.people_get_metric('learning_participation', public.people_latest_month(), p_job_family),
    'completion_rate', public.people_get_metric('learning_completion_rate', public.people_latest_month(), p_job_family),
    'hours_per_employee', public.people_get_metric('learning_hours_per_employee', public.people_latest_month(), p_job_family),
    'trend', public.people_get_metric_trend('learning_hours_per_employee', 12, p_job_family),
    'quality_status', public.people_metric_quality_status('learning_hours_per_employee', false),
    'freshness', public.people_metric_freshness('learning_hours_per_employee'),
    'provenance', 'synthetic_internal'
  );
$$;

create or replace function public.people_get_skill_gap(
  p_job_family text default 'Engineering'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  as_of date := public.people_latest_month();
  family text := coalesce(p_job_family, 'Engineering');
  gaps jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_id', s.skill_id,
    'skill_name', s.skill_name,
    'internal_coverage_rate', s.internal_coverage_rate,
    'gap_rate', s.gap_rate,
    'workers_with_skill', s.workers_with_skill,
    'workers_in_family', s.workers_in_family,
    'is_critical', s.is_critical,
    'quality_status', s.quality_status,
    'internal_provenance', 'synthetic_internal',
    'taxonomy_provenance', 'live_public'
  ) order by s.gap_rate desc), '[]'::jsonb)
  into gaps
  from public.people_mart_skills s
  where s.as_of_month = as_of
    and s.job_family = family;

  return jsonb_build_object(
    'job_family', family,
    'as_of_month', as_of,
    'gaps', coalesce(gaps, '[]'::jsonb),
    'critical_skill_gap', public.people_get_metric('critical_skill_gap', as_of, family),
    'quality_status', public.people_metric_quality_status('critical_skill_gap', false),
    'labels', jsonb_build_object(
      'internal_workforce', 'synthetic',
      'onet', 'external public data',
      'microsoft_learn', 'external public data'
    )
  );
end;
$$;

create or replace function public.people_get_learning_recommendations(
  p_job_family text default 'Engineering',
  p_skill_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  pattern text;
  recs jsonb;
begin
  pattern := case
    when p_skill_id = 'skill_python' then 'python|pandas|jupyter'
    when p_skill_id = 'skill_sql' then 'sql|kusto|query'
    when p_skill_id = 'skill_cloud' then 'azure|cloud|kubernetes'
    when p_skill_id = 'skill_data' then 'data|analytics|fabric|power bi'
    else 'python|azure|ai |machine learning|sql|cloud|data'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'content_id', c.content_id,
    'title', c.title,
    'url', c.url,
    'level', c.level,
    'provider', c.provider,
    'provenance', 'live_public'
  )), '[]'::jsonb)
  into recs
  from (
    select *
    from public.people_external_learning_content c
    where c.title ~* pattern
    order by c.title
    limit 8
  ) c;

  return jsonb_build_object(
    'job_family', p_job_family,
    'skill_id', p_skill_id,
    'recommendations', coalesce(recs, '[]'::jsonb),
    'labels', jsonb_build_object(
      'internal_workforce', 'synthetic',
      'microsoft_learn', 'external public data'
    )
  );
end;
$$;

create or replace function public.people_get_source_health()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_name', h.source_name,
        'freshness_status', h.freshness_status,
        'quality_status', h.quality_status,
        'records_last_run', h.records_last_run,
        'last_success_at', h.last_success_at,
        'error_message', h.error_message,
        'provenance', h.provenance
      ) order by h.source_name)
      from public.people_source_health h
    ), '[]'::jsonb)
  );
$$;

create or replace function public.people_get_quality_incidents()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'incident_id', i.incident_id,
        'title', i.title,
        'severity', i.severity,
        'status', i.status,
        'affected_metrics', i.affected_metrics,
        'source_name', i.source_name,
        'business_change', i.business_change,
        'summary', i.summary,
        'expected_records', i.expected_records,
        'actual_records', i.actual_records,
        'detected_at', i.detected_at
      ) order by i.detected_at desc)
      from public.people_data_quality_incident i
    ), '[]'::jsonb)
  );
$$;

create or replace function public.people_trace_metric_lineage(p_metric_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  def public.people_metric_definition%rowtype;
  lineage jsonb;
begin
  perform public.people_assert_metric_id(p_metric_id);
  select * into def from public.people_metric_definition where metric_id = p_metric_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dataset_name', l.dataset_name,
    'upstream_source', l.upstream_source,
    'grain', l.grain,
    'serving_table', l.serving_table
  )), '[]'::jsonb)
  into lineage
  from public.people_dataset_lineage l
  where l.dataset_name = any (def.downstream_marts)
     or l.serving_table = any (def.downstream_marts);

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'quality_status', public.people_metric_quality_status(p_metric_id, false),
    'source_tables', def.source_tables,
    'downstream_marts', def.downstream_marts,
    'lineage', lineage,
    'freshness', public.people_metric_freshness(p_metric_id)
  );
end;
$$;

create or replace function public.people_get_data_foundation()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  nodes jsonb;
  edges jsonb;
begin
  select jsonb_agg(node)
  into nodes
  from (
    select jsonb_build_object(
      'id', src.id,
      'type', 'source',
      'label', src.label,
      'owner', 'People Analytics',
      'freshness', coalesce(h.freshness_status, 'unknown'),
      'quality', case
        when src.id = 'HRIS' and exists (
          select 1 from public.people_data_quality_incident i
          where i.status in ('open', 'investigating') and i.source_name = 'people_hris'
        ) then 'unhealthy'
        else coalesce(h.quality_status, 'unknown')
      end,
      'row_count', case src.id
        when 'HRIS' then (select count(*) from public.people_dim_worker)
        when 'ATS' then (select count(*) from public.people_mart_recruiting)
        when 'LMS' then (select count(*) from public.people_mart_learning_adoption)
        else null
      end,
      'upstream', '[]'::jsonb,
      'downstream', src.downstream
    ) as node
    from (
      values
        ('HRIS', 'HRIS', 'people_synthetic_globaltech', '["silver_workforce"]'::jsonb),
        ('ATS', 'ATS', 'people_synthetic_globaltech', '["silver_recruiting"]'::jsonb),
        ('LMS', 'LMS', 'people_synthetic_globaltech', '["silver_learning"]'::jsonb),
        ('Performance', 'Performance', 'people_synthetic_globaltech', '["silver_workforce"]'::jsonb),
        ('Compensation', 'Compensation', 'people_synthetic_globaltech', '["silver_compensation"]'::jsonb),
        ('Engagement', 'Engagement', 'people_synthetic_globaltech', '["silver_workforce"]'::jsonb)
    ) as src(id, label, health_key, downstream)
    left join public.people_source_health h on h.source_name = src.health_key
    union all
    select jsonb_build_object(
      'id', layer.id,
      'type', 'layer',
      'label', layer.label,
      'owner', 'People Analytics',
      'freshness', 'healthy',
      'quality', 'healthy',
      'row_count', null,
      'upstream', layer.upstream,
      'downstream', layer.downstream
    )
    from (
      values
        ('silver_workforce', 'Silver / normalized workforce', '["HRIS","Performance","Engagement"]'::jsonb, '["headcount","voluntary_attrition"]'::jsonb),
        ('silver_recruiting', 'Silver / normalized recruiting', '["ATS"]'::jsonb, '["time_to_fill"]'::jsonb),
        ('silver_learning', 'Silver / normalized learning', '["LMS"]'::jsonb, '["learning_hours_per_employee"]'::jsonb),
        ('silver_compensation', 'Silver / normalized compensation', '["Compensation"]'::jsonb, '["compa_ratio"]'::jsonb),
        ('analytics_ai', 'Analytics / People AI', '["people_mart_workforce_overview","people_mart_skills"]'::jsonb, '[]'::jsonb)
    ) as layer(id, label, upstream, downstream)
    union all
    select jsonb_build_object(
      'id', d.metric_id,
      'type', 'metric',
      'label', d.metric_name,
      'owner', d.owner,
      'freshness', (public.people_metric_freshness(d.metric_id)->>'freshness_status'),
      'quality', public.people_metric_quality_status(d.metric_id, false),
      'row_count', null,
      'upstream', to_jsonb(d.source_tables),
      'downstream', to_jsonb(d.downstream_marts)
    )
    from public.people_metric_definition d
    where d.status = 'certified'
    union all
    select jsonb_build_object(
      'id', l.dataset_name,
      'type', 'mart',
      'label', l.dataset_name,
      'owner', 'People Analytics',
      'freshness', 'healthy',
      'quality', 'healthy',
      'row_count', null,
      'upstream', jsonb_build_array(l.upstream_source),
      'downstream', jsonb_build_array('analytics_ai')
    )
    from public.people_dataset_lineage l
  ) graph_nodes;

  select jsonb_agg(jsonb_build_object('source', e.source, 'target', e.target))
  into edges
  from (
    values
      ('HRIS', 'silver_workforce'),
      ('ATS', 'silver_recruiting'),
      ('LMS', 'silver_learning'),
      ('Performance', 'silver_workforce'),
      ('Compensation', 'silver_compensation'),
      ('Engagement', 'silver_workforce'),
      ('silver_workforce', 'headcount'),
      ('silver_workforce', 'voluntary_attrition'),
      ('headcount', 'people_mart_workforce_overview'),
      ('voluntary_attrition', 'people_mart_retention'),
      ('people_mart_workforce_overview', 'analytics_ai'),
      ('people_mart_retention', 'analytics_ai'),
      ('people_mart_skills', 'analytics_ai')
  ) as e(source, target);

  return jsonb_build_object(
    'nodes', coalesce(nodes, '[]'::jsonb),
    'edges', coalesce(edges, '[]'::jsonb),
    'quality_status', (
      select quality_status from public.people_source_health
      where source_name = 'people_synthetic_globaltech' limit 1
    )
  );
end;
$$;

create or replace function public.people_get_platform_facts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'active_employees', (select count(*) from public.people_dim_worker where employment_status = 'active'),
    'historical_years', 5,
    'hr_data_domains', 6,
    'certified_metrics', (select count(*) from public.people_metric_definition where status = 'certified'),
    'data_quality_tests', (select count(distinct test_name) from public.people_quality_test_results),
    'learning_resources', (select count(*) from public.people_external_learning_content),
    'pipeline_status', (
      select status from public.people_pipeline_runs
      where source = 'people_daily_pipeline'
      order by started_at desc
      limit 1
    ),
    'dataset_label', 'Synthetic Enterprise People Dataset',
    'company_label', 'GlobalTech'
  );
$$;

create or replace function public.people_validate_certified_metrics()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tests jsonb := '[]'::jsonb;
  rec record;
  payload jsonb;
  metric_value numeric;
  quality text;
begin
  for rec in
    select metric_id from public.people_metric_definition where status = 'certified'
  loop
    payload := public.people_get_metric(rec.metric_id);
    metric_value := (payload->>'value')::numeric;
    quality := payload->>'quality_status';

    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', rec.metric_id || '_has_definition',
      'status', case when (public.people_get_metric_definition(rec.metric_id)->>'formula_sql') is not null then 'passed' else 'failed' end
    ));
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', rec.metric_id || '_has_owner',
      'status', case when coalesce(public.people_get_metric_definition(rec.metric_id)->>'owner', '') <> '' then 'passed' else 'failed' end
    ));
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', rec.metric_id || '_has_lineage',
      'status', case when jsonb_array_length(public.people_get_metric_definition(rec.metric_id)->'source_tables') > 0 then 'passed' else 'failed' end
    ));
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', rec.metric_id || '_quality_present',
      'status', case when quality in ('healthy', 'unhealthy') then 'passed' else 'failed' end
    ));

    if rec.metric_id = 'headcount' then
      tests := tests || jsonb_build_array(jsonb_build_object(
        'test_name', 'headcount_non_negative',
        'status', case when metric_value >= 0 then 'passed' else 'failed' end,
        'observed', metric_value
      ));
    end if;
    if rec.metric_id in (
      'voluntary_attrition', 'regrettable_attrition', 'promotion_rate',
      'internal_mobility_rate', 'offer_acceptance_rate', 'quality_of_hire',
      'learning_participation', 'learning_completion_rate', 'skill_coverage',
      'critical_skill_gap', 'manager_turnover_rate'
    ) then
      tests := tests || jsonb_build_array(jsonb_build_object(
        'test_name', rec.metric_id || '_rate_bounds',
        'status', case when metric_value is null or (metric_value >= 0 and metric_value <= 1) then 'passed' else 'failed' end,
        'observed', metric_value
      ));
    end if;
    if rec.metric_id = 'compa_ratio' then
      tests := tests || jsonb_build_array(jsonb_build_object(
        'test_name', 'compa_ratio_reasonable_range',
        'status', case when metric_value is null or (metric_value between 0.25 and 2.5) then 'passed' else 'failed' end,
        'observed', metric_value
      ));
    end if;
  end loop;

  if exists (
    select 1 from public.people_data_quality_incident i
    where i.status in ('open', 'investigating')
      and 'headcount' = any (i.affected_metrics)
  ) and public.people_metric_quality_status('headcount', false) = 'healthy' then
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', 'unhealthy_source_not_displayed_healthy',
      'status', 'failed'
    ));
  else
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', 'unhealthy_source_not_displayed_healthy',
      'status', 'passed'
    ));
  end if;

  return jsonb_build_object(
    'tests', tests,
    'failed', (
      select count(*) from jsonb_array_elements(tests) t
      where t->>'status' = 'failed'
    )
  );
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'people_mart_skills',
        'people_mart_manager_effectiveness',
        'people_mart_attrition_segment'
      )
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_public_read', r.tablename);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      r.tablename || '_public_read',
      r.tablename
    );
    execute format('grant select on public.%I to anon, authenticated, service_role', r.tablename);
    execute format('grant all on public.%I to service_role', r.tablename);
  end loop;
end
$$;

grant select on public.people_mart_compensation to anon, authenticated, service_role;
grant select on public.people_mart_learning to anon, authenticated, service_role;

grant execute on function public.people_latest_month() to anon, authenticated, service_role;
grant execute on function public.people_assert_metric_id(text) to anon, authenticated, service_role;
grant execute on function public.people_metric_quality_status(text, boolean) to anon, authenticated, service_role;
grant execute on function public.people_metric_freshness(text) to anon, authenticated, service_role;
grant execute on function public.people_get_metric_definition(text) to anon, authenticated, service_role;
grant execute on function public.people_get_metric(text, date, text, text, text) to anon, authenticated, service_role;
grant execute on function public.people_get_metric_trend(text, integer, text, text, text) to anon, authenticated, service_role;
grant execute on function public.people_get_metric_breakdown(text, text, date, text) to anon, authenticated, service_role;
grant execute on function public.people_get_workforce_overview(text) to anon, authenticated, service_role;
grant execute on function public.people_get_retention_analysis(text) to anon, authenticated, service_role;
grant execute on function public.people_get_mobility_analysis(text) to anon, authenticated, service_role;
grant execute on function public.people_get_recruiting_analysis(text) to anon, authenticated, service_role;
grant execute on function public.people_get_learning_analysis(text) to anon, authenticated, service_role;
grant execute on function public.people_get_skill_gap(text) to anon, authenticated, service_role;
grant execute on function public.people_get_learning_recommendations(text, text) to anon, authenticated, service_role;
grant execute on function public.people_get_source_health() to anon, authenticated, service_role;
grant execute on function public.people_get_quality_incidents() to anon, authenticated, service_role;
grant execute on function public.people_trace_metric_lineage(text) to anon, authenticated, service_role;
grant execute on function public.people_get_data_foundation() to anon, authenticated, service_role;
grant execute on function public.people_get_platform_facts() to anon, authenticated, service_role;
grant execute on function public.people_validate_certified_metrics() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

