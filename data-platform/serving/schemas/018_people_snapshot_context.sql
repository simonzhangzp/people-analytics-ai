-- Snapshot-scoped serving context and enterprise learning ranking.
-- Does not modify QuantReview objects or the People pipeline tables.

create or replace function public.people_assert_snapshot_id(p_snapshot_id text)
returns text
language plpgsql
immutable
as $$
declare
  snapshot_key text := coalesce(nullif(p_snapshot_id, ''), 'current');
begin
  if snapshot_key not in ('current', 'incident_replay') then
    raise exception 'invalid snapshot_id' using errcode = '22023';
  end if;
  return snapshot_key;
end;
$$;

drop function if exists public.people_metric_freshness(text);
create or replace function public.people_metric_freshness(
  p_metric_id text,
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  snapshot_key text := public.people_assert_snapshot_id(p_snapshot_id);
  stored jsonb;
begin
  select jsonb_build_object(
    'source_period', public.people_latest_month(),
    'source_tables', d.source_tables,
    'last_success_at', (select max(h.last_success_at) from public.people_source_health h),
    'freshness_status', (
      select h.freshness_status
      from public.people_source_health h
      where h.source_name = 'people_synthetic_globaltech'
      limit 1
    )
  )
  into stored
  from public.people_metric_definition d
  where d.metric_id = p_metric_id;

  if snapshot_key = 'current' then
    stored := jsonb_set(coalesce(stored, '{}'::jsonb), '{freshness_status}', '"healthy"');
  elsif snapshot_key = 'incident_replay' then
    stored := jsonb_set(coalesce(stored, '{}'::jsonb), '{freshness_status}', '"failed"');
    stored := stored || jsonb_build_object('blocked', true, 'reason', 'APAC HRIS incomplete extract');
  end if;
  return stored;
end;
$$;

drop function if exists public.people_get_source_health();
create or replace function public.people_get_source_health(
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  snapshot_key text := public.people_assert_snapshot_id(p_snapshot_id);
  sources jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_name', h.source_name,
    'freshness_status', case
      when snapshot_key = 'current' then 'healthy'
      when snapshot_key = 'incident_replay' and h.source_name in ('people_hris', 'people_synthetic_globaltech') then 'failed'
      else h.freshness_status
    end,
    'quality_status', case
      when snapshot_key = 'current' then 'healthy'
      when snapshot_key = 'incident_replay' and h.source_name in ('people_hris', 'people_synthetic_globaltech') then 'unhealthy'
      else h.quality_status
    end,
    'records_last_run', h.records_last_run,
    'last_success_at', h.last_success_at,
    'error_message', case
      when snapshot_key = 'current' then null
      else h.error_message
    end,
    'provenance', h.provenance,
    'snapshot_id', snapshot_key
  ) order by h.source_name), '[]'::jsonb)
  into sources
  from public.people_source_health h;

  return jsonb_build_object('sources', sources, 'snapshot_id', snapshot_key);
end;
$$;

drop function if exists public.people_get_quality_incidents();
create or replace function public.people_get_quality_incidents(
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  snapshot_key text := public.people_assert_snapshot_id(p_snapshot_id);
  incidents jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
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
  ) order by i.detected_at desc), '[]'::jsonb)
  into incidents
  from public.people_data_quality_incident i
  where case
    when snapshot_key = 'incident_replay' then i.incident_id = 'people-incident-apac-hris-incomplete'
    else i.incident_id is distinct from 'people-incident-apac-hris-incomplete'
  end;

  return jsonb_build_object('incidents', incidents, 'snapshot_id', snapshot_key);
end;
$$;

create or replace function public.people_get_quality_tests(
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  snapshot_key text := public.people_assert_snapshot_id(p_snapshot_id);
  tests jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'test_name', t.test_name,
    'test_group', t.test_group,
    'status', t.status,
    'observed_value', t.observed_value,
    'expected_value', t.expected_value,
    'details', t.details,
    'source_name', t.source_name,
    'checked_at', t.checked_at
  ) order by t.checked_at desc), '[]'::jsonb)
  into tests
  from public.people_quality_test_results t
  where case
    when snapshot_key = 'current' then t.test_name is distinct from 'apac_hris_volume'
    else true
  end;

  return jsonb_build_object('tests', tests, 'snapshot_id', snapshot_key);
end;
$$;

drop function if exists public.people_trace_metric_lineage(text);
create or replace function public.people_trace_metric_lineage(
  p_metric_id text,
  p_snapshot_id text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  snapshot_key text := public.people_assert_snapshot_id(p_snapshot_id);
  def public.people_metric_definition%rowtype;
  lineage jsonb;
  quality text;
begin
  perform public.people_assert_metric_id(p_metric_id);
  select * into def from public.people_metric_definition where metric_id = p_metric_id;
  quality := public.people_metric_quality_status(p_metric_id, false, snapshot_key);

  select coalesce(jsonb_agg(jsonb_build_object(
    'dataset_name', l.dataset_name,
    'upstream_source', l.upstream_source,
    'grain', l.grain,
    'serving_table', l.serving_table,
    'quality_status', quality,
    'publish_status', case when snapshot_key = 'incident_replay' then 'blocked' else 'published' end
  )), '[]'::jsonb)
  into lineage
  from public.people_dataset_lineage l
  where l.dataset_name = any (def.downstream_marts)
     or l.serving_table = any (def.downstream_marts);

  return jsonb_build_object(
    'metric_id', p_metric_id,
    'snapshot_id', snapshot_key,
    'quality_status', quality,
    'publish_status', case when snapshot_key = 'incident_replay' then 'not_published' else 'published' end,
    'source_tables', def.source_tables,
    'downstream_marts', def.downstream_marts,
    'lineage', lineage,
    'freshness', public.people_metric_freshness(p_metric_id, snapshot_key)
  );
end;
$$;

create or replace function public.people_learning_relevance_score(
  p_title text,
  p_content_type text,
  p_level text
)
returns integer
language sql
immutable
as $$
  select
    (case
      when coalesce(p_title, '') ~* 'minecraft|makecode|k-?12|for kids|student|minigame|mini-game|education edition|hour of code'
        then -100
      else 0
    end)
    + (case
      when coalesce(p_content_type, '') in ('learning_path', 'certification', 'applied_skills', 'course') then 8
      when coalesce(p_content_type, '') = 'module' then 3
      else 1
    end)
    + (case
      when coalesce(p_title, '') ~* 'azure|machine learning|data engineer|analytics|software engineer|cloud|fabric|spark|kubernetes|python for data|applied skill|certif|copilot studio|openai'
        then 14
      when coalesce(p_title, '') ~* 'python|sql|pandas|jupyter'
        then 6
      else 0
    end)
    + (case
      when coalesce(p_level, '') ~* 'intermediate|advanced' then 4
      when coalesce(p_level, '') ~* 'beginner' then 0
      else 2
    end);
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
    when p_skill_id = 'skill_cloud' then 'azure|cloud|kubernetes|fabric'
    when p_skill_id = 'skill_data' then 'data engineer|analytics|fabric|power bi|machine learning'
    else 'python|azure|machine learning|sql|cloud|analytics'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'content_id', c.content_id,
    'title', c.title,
    'url', c.url,
    'level', c.level,
    'content_type', c.content_type,
    'provider', c.provider,
    'relevance_score', c.score,
    'provenance', 'live_public'
  ) order by c.score desc, c.title), '[]'::jsonb)
  into recs
  from (
    select *
    from (
      select distinct on (lower(c.title))
        c.content_id,
        c.title,
        c.url,
        c.level,
        c.content_type,
        c.provider,
        public.people_learning_relevance_score(c.title, c.content_type, c.level) as score
      from public.people_external_learning_content c
      where c.title ~* pattern
        and public.people_learning_relevance_score(c.title, c.content_type, c.level) > 0
      order by lower(c.title),
        public.people_learning_relevance_score(c.title, c.content_type, c.level) desc
    ) deduped
    order by score desc, title
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

grant execute on function public.people_assert_snapshot_id(text) to anon, authenticated, service_role;
grant execute on function public.people_metric_freshness(text, text) to anon, authenticated, service_role;
grant execute on function public.people_get_source_health(text) to anon, authenticated, service_role;
grant execute on function public.people_get_quality_incidents(text) to anon, authenticated, service_role;
grant execute on function public.people_get_quality_tests(text) to anon, authenticated, service_role;
grant execute on function public.people_trace_metric_lineage(text, text) to anon, authenticated, service_role;
grant execute on function public.people_learning_relevance_score(text, text, text) to anon, authenticated, service_role;
grant execute on function public.people_get_learning_recommendations(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
