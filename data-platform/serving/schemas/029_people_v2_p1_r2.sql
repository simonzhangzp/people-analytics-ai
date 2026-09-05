-- P1 R2: leader org-scope deny for metrics; confidential Engineering compa-ratio;
-- return certified n on identity-aware metric reads.

update people_v2.people_metric
set sensitivity = 'confidential'
where metric_id = 'compa_ratio_median';

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
  deny_reason text;
  n_workers integer;
  as_of date;
  leader_family text;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  select m.sensitivity into metric_sens from people_v2.people_metric m where m.metric_id = p_metric_id;
  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    denied := true;
    deny_reason := 'sensitivity';
  end if;

  if not denied and ident.role = 'leader' then
    leader_family := case ident.identity_id
      when 'demo-leader-engineering' then 'Engineering'
      else null
    end;
    if leader_family is not null
       and nullif(p_job_family, '') is not null
       and p_job_family is distinct from leader_family then
      denied := true;
      deny_reason := 'org_scope';
    end if;
  end if;

  if denied then
    payload := jsonb_build_object(
      'metric_id', p_metric_id,
      'value', null,
      'denied', true,
      'reason', deny_reason,
      'identity_id', ident.identity_id
    );
  else
    payload := people_v2.people_get_metric(p_metric_id, p_as_of, p_grain, p_job_family);
    as_of := coalesce((payload->>'as_of')::date, people_v2.people_latest_month());
    select count(*)::int into n_workers
    from people_snap_worker_month s
    where s.month_end = as_of
      and s.is_certified
      and (p_job_family is null or p_job_family = '' or s.job_family = p_job_family);
    payload := payload || jsonb_build_object(
      'identity_id', ident.identity_id,
      'denied', false,
      'n', n_workers
    );
  end if;

  insert into people_v2.people_access_log
    (identity_id, role, rpc, metric_id, filters, rows_returned, cells_suppressed, purpose_tag)
  values
    (ident.identity_id, ident.role, 'people_get_metric_for', p_metric_id,
     jsonb_build_object('grain', p_grain, 'job_family', p_job_family, 'reason', deny_reason),
     case when denied then 0 else 1 end, 0, 'demo');
  return payload;
end;
$$;

grant execute on function people_v2.people_get_metric_for(text, text, date, text, text)
  to people_app, people_publisher, people_definer;
