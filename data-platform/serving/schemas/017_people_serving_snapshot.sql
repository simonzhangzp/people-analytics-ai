-- Serving snapshot: isolate current trusted metrics from APAC incident replay.
-- Does not modify QuantReview objects or the People pipeline.

create table if not exists public.people_serving_snapshot (
  snapshot_id text primary key check (snapshot_id in ('current', 'incident_replay')),
  label text not null,
  as_of_date date not null,
  quality_mode text not null check (quality_mode in ('trusted', 'replay')),
  incident_id text,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.people_serving_snapshot (
  snapshot_id, label, as_of_date, quality_mode, incident_id, notes
)
values
(
  'current',
  'Current trusted GlobalTech snapshot',
  coalesce((select max(as_of_month) from public.people_mart_workforce_overview), current_date),
  'trusted',
  null,
  'Latest certified marts. The incomplete APAC extract was not published as a workforce change.'
),
(
  'incident_replay',
  'APAC HRIS incomplete feed replay',
  coalesce((select max(as_of_month) from public.people_mart_workforce_overview), current_date),
  'replay',
  'people-incident-apac-hris-incomplete',
  'Historical quality incident. Downstream reporting is blocked in this replay only.'
)
on conflict (snapshot_id) do update
set
  label = excluded.label,
  as_of_date = excluded.as_of_date,
  quality_mode = excluded.quality_mode,
  incident_id = excluded.incident_id,
  notes = excluded.notes,
  updated_at = now();

alter table public.people_serving_snapshot enable row level security;
drop policy if exists people_serving_snapshot_public_read on public.people_serving_snapshot;
create policy people_serving_snapshot_public_read
  on public.people_serving_snapshot for select to anon, authenticated using (true);
grant select on public.people_serving_snapshot to anon, authenticated, service_role;
grant all on public.people_serving_snapshot to service_role;

drop function if exists public.people_metric_quality_status(text, boolean);

create or replace function public.people_metric_quality_status(
  p_metric_id text,
  p_slice_unhealthy boolean default false,
  p_snapshot_id text default 'current'
)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_mode text;
  v_replay_incident text;
  v_health text;
  v_quality text;
  v_snapshot text := coalesce(nullif(p_snapshot_id, ''), 'current');
begin
  select s.quality_mode, s.incident_id
    into v_mode, v_replay_incident
  from public.people_serving_snapshot s
  where s.snapshot_id = v_snapshot;

  if v_mode is null then
    v_mode := case when v_snapshot = 'incident_replay' then 'replay' else 'trusted' end;
  end if;

  if v_mode = 'trusted' then
    return 'healthy';
  end if;

  if exists (
    select 1
    from public.people_data_quality_incident i
    where i.status in ('open', 'investigating')
      and p_metric_id = any (i.affected_metrics)
      and (v_replay_incident is null or i.incident_id = v_replay_incident)
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

create or replace function public.people_get_serving_snapshot(
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
  snapshot_key text := coalesce(nullif(p_snapshot_id, ''), 'current');
begin
  if snapshot_key not in ('current', 'incident_replay') then
    raise exception 'invalid snapshot_id' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'snapshot_id', s.snapshot_id,
    'label', s.label,
    'as_of_date', s.as_of_date,
    'trusted_as_of_date', (select as_of_date from public.people_serving_snapshot where snapshot_id = 'current'),
    'incident_replay_date', (select as_of_date from public.people_serving_snapshot where snapshot_id = 'incident_replay'),
    'quality_mode', s.quality_mode,
    'incident_id', s.incident_id,
    'notes', s.notes,
    'headcount_quality', public.people_metric_quality_status('headcount', false, s.snapshot_id)
  )
  into result
  from public.people_serving_snapshot s
  where s.snapshot_id = snapshot_key;

  return result;
end;
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
      tests := tests || jsonb_build_array(jsonb_build_object(
        'test_name', 'current_headcount_trusted',
        'status', case when public.people_metric_quality_status('headcount', false, 'current') = 'healthy' then 'passed' else 'failed' end,
        'observed', quality
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
    where i.incident_id = 'people-incident-apac-hris-incomplete'
  ) and public.people_metric_quality_status('headcount', false, 'incident_replay') = 'healthy' then
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', 'replay_incident_not_displayed_healthy',
      'status', 'failed'
    ));
  else
    tests := tests || jsonb_build_array(jsonb_build_object(
      'test_name', 'replay_incident_not_displayed_healthy',
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

grant execute on function public.people_metric_quality_status(text, boolean, text) to anon, authenticated, service_role;
grant execute on function public.people_get_serving_snapshot(text) to anon, authenticated, service_role;
grant execute on function public.people_validate_certified_metrics() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
