-- Public read for synthetic warehouse marts. Workbench tables stay owner-scoped.

do $$
declare
  r record;
  policy_name text;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and (
        tablename like 'people_mart_%'
        or tablename like 'people_dim_%'
        or tablename in (
          'people_metric_definition',
          'people_source_freshness',
          'people_data_quality_incident',
          'people_external_learning_content'
        )
      )
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    policy_name := r.tablename || '_public_read';
    execute format('drop policy if exists %I on public.%I', policy_name, r.tablename);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      policy_name,
      r.tablename
    );
    execute format('grant select on public.%I to anon, authenticated, service_role', r.tablename);
    execute format('grant all on public.%I to service_role', r.tablename);
  end loop;
end
$$;

grant select, insert, update, delete on public.people_api_usage to service_role;
alter table public.people_api_usage enable row level security;
drop policy if exists people_api_usage_service_all on public.people_api_usage;
-- service_role bypasses RLS; no anon read of API cost internals.

notify pgrst, 'reload schema';
