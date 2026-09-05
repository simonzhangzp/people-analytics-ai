-- Phase 4: Analyst Agent traces, LLM budget ledger, catalog RPCs.
-- Apply only to PeopleAnalyticsAI.net (zapmigfrtnwnkmezjefx).

create table if not exists people_v2.people_llm_budget (
  budget_key text primary key,
  limit_value integer not null,
  "window" text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  note text
);

create table if not exists people_v2.people_llm_call (
  call_id bigserial primary key,
  ts timestamptz not null default now(),
  trace_id uuid,
  ip_hash text not null,
  country text,
  route text not null,
  model text,
  tokens_in integer,
  tokens_out integer,
  ok boolean,
  skipped_reason text,
  latency_ms integer
);

create table if not exists people_v2.people_agent_trace (
  trace_id uuid primary key,
  ts timestamptz not null default now(),
  identity_id text not null,
  question text not null,
  tier text not null,
  snapshot_id text,
  latency_ms integer,
  llm_calls integer not null default 0,
  critic_ok boolean,
  llm_skipped text,
  answer_summary jsonb
);

create table if not exists people_v2.people_agent_tool_call (
  tool_call_id bigserial primary key,
  trace_id uuid not null references people_v2.people_agent_trace (trace_id) on delete cascade,
  seq integer not null,
  ts timestamptz not null default now(),
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  latency_ms integer,
  rpc text,
  ok boolean not null default true,
  error text,
  unique (trace_id, seq)
);

create index if not exists people_llm_call_ip_ts_idx
  on people_v2.people_llm_call (ip_hash, ts desc);
create index if not exists people_llm_call_ts_consumed_idx
  on people_v2.people_llm_call (ts)
  where skipped_reason is null;
create index if not exists people_agent_trace_ts_idx
  on people_v2.people_agent_trace (ts desc);

insert into people_v2.people_llm_budget (budget_key, limit_value, "window", enabled, note)
values
  ('per_ip_daily', 3, 'utc_day', true, 'UTC calendar day. Owner may edit limit_value in Table Editor.'),
  ('per_ip_rolling_30d', 10, 'rolling_30d', true, 'Per hashed IP, 30-day rolling window.'),
  ('site_rolling_30d', 50, 'rolling_30d', true, 'Site-wide hard cap shared by Agent and Lab AI routes.'),
  ('max_tokens_per_call', 1024, 'per_call', true, 'DeepSeek max_tokens for one planning call.')
on conflict (budget_key) do nothing;

grant all on people_v2.people_llm_budget, people_v2.people_llm_call,
  people_v2.people_agent_trace, people_v2.people_agent_tool_call
  to people_publisher, people_definer;
grant usage, select on sequence people_v2.people_llm_call_call_id_seq to people_publisher, people_definer;
grant usage, select on sequence people_v2.people_agent_tool_call_tool_call_id_seq to people_publisher, people_definer;

-- people_app: no table SELECT/INSERT. Writes go through security definer RPCs only.

create or replace function people_v2.people_try_consume_llm(
  p_ip_hash text,
  p_route text,
  p_country text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
declare
  lim_daily int := 3;
  lim_ip30 int := 10;
  lim_site int := 50;
  lim_tokens int := 1024;
  n_daily int := 0;
  n_ip30 int := 0;
  n_site int := 0;
  blocked text;
  new_id bigint;
  utc_day_start timestamptz;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('allowed', false, 'blocked_by', 'invalid_ip_hash');
  end if;
  if p_route is null or p_route !~ '^[a-z][a-z0-9_]{1,62}$' then
    return jsonb_build_object('allowed', false, 'blocked_by', 'invalid_route');
  end if;

  perform pg_advisory_xact_lock(82991001);

  select limit_value into lim_daily from people_llm_budget
    where budget_key = 'per_ip_daily' and enabled is true;
  select limit_value into lim_ip30 from people_llm_budget
    where budget_key = 'per_ip_rolling_30d' and enabled is true;
  select limit_value into lim_site from people_llm_budget
    where budget_key = 'site_rolling_30d' and enabled is true;
  select limit_value into lim_tokens from people_llm_budget
    where budget_key = 'max_tokens_per_call' and enabled is true;

  lim_daily := coalesce(lim_daily, 3);
  lim_ip30 := coalesce(lim_ip30, 10);
  lim_site := coalesce(lim_site, 50);
  lim_tokens := coalesce(lim_tokens, 1024);
  utc_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';

  select count(*) into n_daily from people_llm_call
    where ip_hash = p_ip_hash
      and skipped_reason is null
      and ts >= utc_day_start;
  select count(*) into n_ip30 from people_llm_call
    where ip_hash = p_ip_hash
      and skipped_reason is null
      and ts >= now() - interval '30 days';
  select count(*) into n_site from people_llm_call
    where skipped_reason is null
      and ts >= now() - interval '30 days';

  if n_daily >= lim_daily then
    blocked := 'per_ip_daily';
  elsif n_ip30 >= lim_ip30 then
    blocked := 'per_ip_rolling_30d';
  elsif n_site >= lim_site then
    blocked := 'site_rolling_30d';
  elsif lim_tokens <= 0 then
    blocked := 'max_tokens_per_call';
  end if;

  if blocked is not null then
    insert into people_llm_call (ip_hash, country, route, ok, skipped_reason)
    values (p_ip_hash, nullif(p_country, ''), p_route, false, blocked);
    return jsonb_build_object(
      'allowed', false,
      'blocked_by', blocked,
      'call_id', null,
      'max_tokens_per_call', lim_tokens,
      'remaining', jsonb_build_object(
        'per_ip_daily', greatest(0, lim_daily - n_daily),
        'per_ip_rolling_30d', greatest(0, lim_ip30 - n_ip30),
        'site_rolling_30d', greatest(0, lim_site - n_site)
      )
    );
  end if;

  insert into people_llm_call (ip_hash, country, route, ok, skipped_reason)
  values (p_ip_hash, nullif(p_country, ''), p_route, true, null)
  returning call_id into new_id;

  return jsonb_build_object(
    'allowed', true,
    'blocked_by', null,
    'call_id', new_id,
    'max_tokens_per_call', lim_tokens,
    'remaining', jsonb_build_object(
      'per_ip_daily', greatest(0, lim_daily - n_daily - 1),
      'per_ip_rolling_30d', greatest(0, lim_ip30 - n_ip30 - 1),
      'site_rolling_30d', greatest(0, lim_site - n_site - 1)
    )
  );
exception when others then
  return jsonb_build_object(
    'allowed', false,
    'blocked_by', 'ledger_write_failed',
    'call_id', null
  );
end;
$$;

create or replace function people_v2.people_complete_llm_call(
  p_call_id bigint,
  p_trace_id uuid default null,
  p_model text default null,
  p_tokens_in integer default null,
  p_tokens_out integer default null,
  p_ok boolean default true,
  p_latency_ms integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
begin
  if p_call_id is null then
    return;
  end if;
  update people_llm_call
     set trace_id = coalesce(p_trace_id, trace_id),
         model = coalesce(p_model, model),
         tokens_in = p_tokens_in,
         tokens_out = p_tokens_out,
         ok = p_ok,
         latency_ms = p_latency_ms
   where call_id = p_call_id
     and skipped_reason is null;
end;
$$;

create or replace function people_v2.people_write_agent_trace(
  p_trace_id uuid,
  p_identity_id text,
  p_question text,
  p_tier text,
  p_snapshot_id text default null,
  p_latency_ms integer default null,
  p_llm_calls integer default 0,
  p_critic_ok boolean default null,
  p_llm_skipped text default null,
  p_answer_summary jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
begin
  insert into people_agent_trace (
    trace_id, identity_id, question, tier, snapshot_id,
    latency_ms, llm_calls, critic_ok, llm_skipped, answer_summary
  ) values (
    p_trace_id, p_identity_id, left(coalesce(p_question, ''), 400), p_tier, p_snapshot_id,
    p_latency_ms, coalesce(p_llm_calls, 0), p_critic_ok, p_llm_skipped, p_answer_summary
  )
  on conflict (trace_id) do update set
    latency_ms = excluded.latency_ms,
    llm_calls = excluded.llm_calls,
    critic_ok = excluded.critic_ok,
    llm_skipped = excluded.llm_skipped,
    answer_summary = excluded.answer_summary;
end;
$$;

create or replace function people_v2.people_write_agent_tool_call(
  p_trace_id uuid,
  p_seq integer,
  p_tool_name text,
  p_args jsonb default '{}'::jsonb,
  p_result_summary jsonb default null,
  p_latency_ms integer default null,
  p_rpc text default null,
  p_ok boolean default true,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
begin
  insert into people_agent_tool_call (
    trace_id, seq, tool_name, args, result_summary, latency_ms, rpc, ok, error
  ) values (
    p_trace_id, p_seq, p_tool_name, coalesce(p_args, '{}'::jsonb), p_result_summary,
    p_latency_ms, p_rpc, coalesce(p_ok, true), p_error
  )
  on conflict (trace_id, seq) do update set
    result_summary = excluded.result_summary,
    latency_ms = excluded.latency_ms,
    ok = excluded.ok,
    error = excluded.error;
end;
$$;

create or replace function people_v2.people_log_catalog_access(
  p_identity_id text,
  p_rpc text,
  p_metric_id text default null,
  p_filters jsonb default '{}'::jsonb,
  p_rows integer default 0,
  p_purpose text default 'agent',
  p_trace_id text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  insert into people_access_log
    (identity_id, role, session_id, trace_id, rpc, metric_id, filters, rows_returned, cells_suppressed, purpose_tag)
  values
    (ident.identity_id, ident.role, null, p_trace_id, p_rpc, p_metric_id, p_filters, p_rows, 0, coalesce(p_purpose, 'agent'));
end;
$$;

create or replace function people_v2.people_list_entities(p_identity_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  payload jsonb;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  select coalesce(jsonb_agg(row_to_json(t) order by t.entity_id), '[]'::jsonb) into payload
  from (
    select coalesce(e.entity_id, a.entity_id) as entity_id,
           e.layer, e.grain, coalesce(e.sensitivity, 'internal') as sensitivity, e.notes
    from (
      select distinct entity_id from people_meta_attribute
      union
      select entity_id from people_meta_entity
    ) ids
    left join people_meta_entity e on e.entity_id = ids.entity_id
    left join lateral (
      select entity_id from people_meta_attribute where entity_id = ids.entity_id limit 1
    ) a on true
    where people_v2.people_sensitivity_rank(coalesce(e.sensitivity, 'internal'))
          <= people_v2.people_sensitivity_rank(ident.sensitivity_max)
  ) t;
  return jsonb_build_object('entities', payload, 'identity_id', ident.identity_id);
end;
$$;

create or replace function people_v2.people_describe_entity(p_identity_id text, p_entity_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  payload jsonb;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  if p_entity_id is null or p_entity_id !~ '^[a-z][a-z0-9_]{1,80}$' then
    raise exception 'invalid entity_id' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.attribute_id), '[]'::jsonb) into payload
  from (
    select attribute_id, provenance, sensitivity, pii_class, nullable, business_definition
    from people_meta_attribute
    where entity_id = p_entity_id
      and people_v2.people_sensitivity_rank(coalesce(sensitivity, 'internal'))
          <= people_v2.people_sensitivity_rank(ident.sensitivity_max)
      and not (ident.role = 'external_viewer' and coalesce(pii_class, 'none') <> 'none')
  ) t;
  return jsonb_build_object(
    'entity_id', p_entity_id,
    'identity_id', ident.identity_id,
    'attributes', payload
  );
end;
$$;

create or replace function people_v2.people_get_join_paths(p_identity_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  allowed jsonb;
  denied jsonb;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  select coalesce(jsonb_agg(row_to_json(t) order by t.path_id), '[]'::jsonb) into allowed
  from (
    select path_id, from_entity, to_entity, via, rule_id, notes
    from people_meta_join_path
    where allowed is true
  ) t;
  select coalesce(jsonb_agg(row_to_json(t) order by t.path_id), '[]'::jsonb) into denied
  from (
    select path_id, from_entity, to_entity, via, rule_id,
           coalesce(notes, 'Join is not allowed. This edge cannot be executed.') as rejection_reason
    from people_meta_join_path
    where allowed is not true
  ) t;
  return jsonb_build_object(
    'identity_id', ident.identity_id,
    'allowed_edges', allowed,
    'denied_edges', denied,
    'note', 'Denied edges are shown for governance demonstration. No executable SQL is returned.'
  );
end;
$$;

create or replace function people_v2.people_get_skill_coverage_for(
  p_identity_id text,
  p_job_family text default 'Engineering'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  ident people_v2.people_policy_demo_identity;
  as_of date;
  job_fam text;
  rows jsonb;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  job_fam := coalesce(nullif(p_job_family, ''), 'Engineering');
  as_of := people_v2.people_latest_month();
  select coalesce(jsonb_agg(row_to_json(t) order by t.coverage_ratio), '[]'::jsonb) into rows
  from (
    select month_end, org_id, job_family, coverage_ratio
    from people_mart_skill_coverage_monthly
    where month_end = as_of
      and (job_fam is null or job_family = job_fam)
    order by coverage_ratio
    limit 12
  ) t;
  return jsonb_build_object(
    'identity_id', ident.identity_id,
    'job_family', job_fam,
    'as_of', as_of,
    'rows', rows,
    'grain', 'job_family',
    'note', 'Aggregate coverage only. No worker lists.'
  );
end;
$$;

create or replace view people_v2.people_llm_usage_daily as
select
  (date_trunc('day', timezone('utc', ts)))::date as day,
  count(*) filter (where skipped_reason is null) as calls,
  count(distinct ip_hash) filter (where skipped_reason is null) as unique_ips,
  coalesce(sum(tokens_in) filter (where skipped_reason is null), 0)::bigint as tokens_in,
  coalesce(sum(tokens_out) filter (where skipped_reason is null), 0)::bigint as tokens_out,
  count(*) filter (where skipped_reason is not null) as skipped
from people_v2.people_llm_call
group by 1;

create or replace view people_v2.people_llm_usage_30d as
select
  count(*) filter (where skipped_reason is null) as site_calls_30d,
  greatest(
    0,
    coalesce((select limit_value from people_v2.people_llm_budget where budget_key = 'site_rolling_30d'), 50)
      - count(*) filter (where skipped_reason is null)
  ) as remaining_30d,
  (
    select coalesce(jsonb_agg(jsonb_build_object('country', c.country, 'calls', c.n) order by c.n desc), '[]'::jsonb)
    from (
      select coalesce(nullif(country, ''), 'unknown') as country, count(*) as n
      from people_v2.people_llm_call
      where skipped_reason is null
        and ts >= now() - interval '30 days'
      group by 1
      order by 2 desc
      limit 8
    ) c
  ) as top_countries
from people_v2.people_llm_call
where ts >= now() - interval '30 days';

grant select on people_v2.people_llm_usage_daily, people_v2.people_llm_usage_30d to people_publisher, people_definer;
revoke all on people_v2.people_llm_usage_daily, people_v2.people_llm_usage_30d from people_app;

grant execute on function people_v2.people_try_consume_llm(text, text, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_complete_llm_call(bigint, uuid, text, integer, integer, boolean, integer)
  to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_write_agent_trace(uuid, text, text, text, text, integer, integer, boolean, text, jsonb)
  to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_write_agent_tool_call(uuid, integer, text, jsonb, jsonb, integer, text, boolean, text)
  to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_log_catalog_access(text, text, text, jsonb, integer, text, text)
  to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_list_entities(text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_describe_entity(text, text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_join_paths(text) to people_app, people_publisher, people_definer;
grant execute on function people_v2.people_get_skill_coverage_for(text, text) to people_app, people_publisher, people_definer;
