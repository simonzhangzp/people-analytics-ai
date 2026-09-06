-- P1 R6: LLM quota counts only ok=true; attempts cap; eval tables.
-- Apply only to PeopleAnalyticsAI.net (zapmigfrtnwnkmezjefx).
-- Do not run against QuantReview production or staging.

insert into people_v2.people_llm_budget (budget_key, limit_value, "window", enabled, note)
values (
  'per_ip_daily_attempts',
  10,
  'utc_day',
  true,
  'UTC calendar day LLM attempts for /api/people/ask, including failures. Does not count budget-skip rows.'
)
on conflict (budget_key) do update
  set limit_value = excluded.limit_value,
      note = excluded.note,
      updated_at = now();

update people_v2.people_llm_budget
set note = 'UTC calendar day successful LLM completions (ok=true) for /api/people/ask. Failures do not consume this quota.',
    updated_at = now()
where budget_key = 'per_ip_daily';

update people_v2.people_llm_budget
set note = 'Per hashed IP, 30-day rolling window of ok=true completions for /api/people/ask.',
    updated_at = now()
where budget_key = 'per_ip_rolling_30d';

update people_v2.people_llm_budget
set note = 'Site-wide hard cap of ok=true completions for /api/people/ask only. /lab retired.',
    updated_at = now()
where budget_key = 'site_rolling_30d';

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
  lim_attempts int := 10;
  lim_tokens int := 1024;
  n_daily int := 0;
  n_ip30 int := 0;
  n_site int := 0;
  n_attempts int := 0;
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
  select limit_value into lim_attempts from people_llm_budget
    where budget_key = 'per_ip_daily_attempts' and enabled is true;
  select limit_value into lim_tokens from people_llm_budget
    where budget_key = 'max_tokens_per_call' and enabled is true;

  lim_daily := coalesce(lim_daily, 3);
  lim_ip30 := coalesce(lim_ip30, 10);
  lim_site := coalesce(lim_site, 50);
  lim_attempts := coalesce(lim_attempts, 10);
  lim_tokens := coalesce(lim_tokens, 1024);
  utc_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';

  select count(*) into n_daily from people_llm_call
    where ip_hash = p_ip_hash
      and ok is true
      and ts >= utc_day_start;
  select count(*) into n_ip30 from people_llm_call
    where ip_hash = p_ip_hash
      and ok is true
      and ts >= now() - interval '30 days';
  select count(*) into n_site from people_llm_call
    where ok is true
      and ts >= now() - interval '30 days';
  select count(*) into n_attempts from people_llm_call
    where ip_hash = p_ip_hash
      and skipped_reason is null
      and ts >= utc_day_start;

  if n_attempts >= lim_attempts then
    blocked := 'per_ip_daily_attempts';
  elsif n_daily >= lim_daily then
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
        'site_rolling_30d', greatest(0, lim_site - n_site),
        'per_ip_daily_attempts', greatest(0, lim_attempts - n_attempts)
      )
    );
  end if;

  insert into people_llm_call (ip_hash, country, route, ok, skipped_reason)
  values (p_ip_hash, nullif(p_country, ''), p_route, false, null)
  returning call_id into new_id;

  return jsonb_build_object(
    'allowed', true,
    'blocked_by', null,
    'call_id', new_id,
    'max_tokens_per_call', lim_tokens,
    'remaining', jsonb_build_object(
      'per_ip_daily', greatest(0, lim_daily - n_daily),
      'per_ip_rolling_30d', greatest(0, lim_ip30 - n_ip30),
      'site_rolling_30d', greatest(0, lim_site - n_site),
      'per_ip_daily_attempts', greatest(0, lim_attempts - n_attempts - 1)
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

create table if not exists people_v2.people_eval_run (
  run_id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  git_tag text,
  dpl text,
  status text not null default 'running',
  scorecard jsonb,
  note text
);

create table if not exists people_v2.people_eval_result (
  run_id uuid not null references people_v2.people_eval_run (run_id) on delete cascade,
  case_id text not null,
  family text not null,
  passed boolean not null,
  latency_ms integer,
  failures text[] not null default '{}',
  answer_summary jsonb,
  primary key (run_id, case_id)
);

alter table people_v2.people_eval_run owner to people_publisher;
alter table people_v2.people_eval_result owner to people_publisher;

grant all on people_v2.people_eval_run, people_v2.people_eval_result to people_publisher, people_definer;
revoke all on people_v2.people_eval_run, people_v2.people_eval_result from public, people_app;

create or replace function people_v2.people_latest_eval_scorecard()
returns jsonb
language plpgsql
stable
security definer
set search_path = people_v2
as $$
declare
  row people_eval_run%rowtype;
begin
  select * into row
  from people_eval_run
  where status in ('pass', 'fail')
  order by finished_at desc nulls last, started_at desc
  limit 1;
  if not found then
    return jsonb_build_object('present', false);
  end if;
  return jsonb_build_object(
    'present', true,
    'run_id', row.run_id,
    'finished_at', row.finished_at,
    'git_tag', row.git_tag,
    'dpl', row.dpl,
    'status', row.status,
    'scorecard', coalesce(row.scorecard, '{}'::jsonb)
  );
end;
$$;

revoke all on function people_v2.people_latest_eval_scorecard() from public;
grant execute on function people_v2.people_latest_eval_scorecard() to people_app, people_publisher, people_definer;

create or replace view people_v2.people_llm_usage_daily as
select
  (date_trunc('day', timezone('utc', ts)))::date as day,
  count(*) filter (where ok is true) as calls,
  count(distinct ip_hash) filter (where ok is true) as unique_ips,
  coalesce(sum(tokens_in) filter (where ok is true), 0)::bigint as tokens_in,
  coalesce(sum(tokens_out) filter (where ok is true), 0)::bigint as tokens_out,
  count(*) filter (where skipped_reason is not null) as skipped,
  count(*) filter (where skipped_reason is null and coalesce(ok, false) is false) as failed_attempts
from people_v2.people_llm_call
group by 1;

create or replace view people_v2.people_llm_usage_30d as
select
  count(*) filter (where ok is true) as site_calls_30d,
  greatest(
    0,
    coalesce((select limit_value from people_v2.people_llm_budget where budget_key = 'site_rolling_30d'), 50)
      - count(*) filter (where ok is true)
  ) as remaining_30d,
  (
    select coalesce(jsonb_agg(jsonb_build_object('country', c.country, 'calls', c.n) order by c.n desc), '[]'::jsonb)
    from (
      select coalesce(nullif(country, ''), 'unknown') as country, count(*) as n
      from people_v2.people_llm_call
      where ok is true
        and ts >= now() - interval '30 days'
      group by 1
      order by 2 desc
      limit 8
    ) c
  ) as top_countries
from people_v2.people_llm_call
where ts >= now() - interval '30 days';

-- Historical consume-on-insert placeholders never recorded tokens. Count them as unsuccessful.
update people_v2.people_llm_call
   set ok = false
 where skipped_reason is null
   and coalesce(ok, true) is true
   and tokens_in is null
   and tokens_out is null;
