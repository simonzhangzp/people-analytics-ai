-- P1 R3: org_scope independent of sensitivity; deny records carry as_of;
-- company-level confidential metrics are org_scope for leaders.

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
  job_fam text;
  sens_deny boolean := false;
  scope_deny boolean := false;
  metric_yaml_min integer;
  identity_floor integer;
begin
  ident := people_v2.people_assert_identity(p_identity_id);
  as_of := coalesce(p_as_of, people_v2.people_latest_month());
  job_fam := nullif(p_job_family, '');
  select m.sensitivity, coalesce(m.min_cell, 5)
    into metric_sens, metric_yaml_min
    from people_v2.people_metric m
   where m.metric_id = p_metric_id;
  identity_floor := case ident.role
    when 'external_viewer' then 50
    when 'leader' then 20
    when 'hrbp' then 10
    else 5
  end;

  if people_v2.people_sensitivity_rank(coalesce(metric_sens, 'internal'))
       > people_v2.people_sensitivity_rank(ident.sensitivity_max) then
    sens_deny := true;
  end if;

  if ident.role = 'leader' then
    leader_family := case ident.identity_id
      when 'demo-leader-engineering' then 'Engineering'
      else null
    end;
    if leader_family is not null then
      if job_fam is null then
        if coalesce(metric_sens, 'internal') = 'confidential' then
          scope_deny := true;
        end if;
      elsif job_fam is distinct from leader_family then
        scope_deny := true;
      end if;
    end if;
  end if;

  if sens_deny then
    denied := true;
    deny_reason := 'sensitivity';
  end if;
  if scope_deny then
    denied := true;
    if deny_reason is null then
      deny_reason := 'org_scope';
    end if;
  end if;

  if denied then
    payload := jsonb_build_object(
      'metric_id', p_metric_id,
      'value', null,
      'denied', true,
      'reason', deny_reason,
      'identity_id', ident.identity_id,
      'as_of', as_of,
      'job_family', job_fam,
      'metric_min_cell', metric_yaml_min,
      'identity_min_cell', identity_floor
    );
  else
    payload := people_v2.people_get_metric(p_metric_id, p_as_of, p_grain, p_job_family);
    as_of := coalesce((payload->>'as_of')::date, as_of);
    select count(*)::int into n_workers
    from people_snap_worker_month s
    where s.month_end = as_of
      and s.is_certified
      and (job_fam is null or s.job_family = job_fam);
    payload := payload || jsonb_build_object(
      'identity_id', ident.identity_id,
      'denied', false,
      'n', n_workers,
      'as_of', as_of,
      'metric_min_cell', metric_yaml_min,
      'identity_min_cell', identity_floor
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

update people_v2.people_metric
set denominator = 'certified workers with a current assignment and grade band as-of'
where metric_id = 'compa_ratio_median'
  and denominator is null;

update people_v2.people_metric
set denominator = 'accepted + rejected offers in window'
where metric_id in ('offer_acceptance_rate', 'offer_acceptance')
  and denominator is null;

update people_v2.people_metric
set denominator = 'requisitions opened in the same window'
where metric_id = 'applications_per_opening'
  and denominator is null;
