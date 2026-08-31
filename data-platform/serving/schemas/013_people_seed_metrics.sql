insert into public.people_metric_definition (
  metric_id,
  metric_name,
  domain,
  business_definition,
  grain,
  status,
  version,
  data_sources
)
values
  (
    'headcount',
    'Headcount',
    'workforce',
    'Count of workers in the certified population as of the snapshot month. Aggregated snapshots use SUM(headcount); person-level files use COUNT DISTINCT of the employee identifier.',
    'org_id × job_family × location_id × month',
    'certified',
    1,
    array['synthetic_internal']
  ),
  (
    'voluntary_attrition',
    'Voluntary Attrition Rate',
    'retention',
    'Voluntary resignations divided by beginning headcount. Retirement is excluded unless a saved org definition says otherwise. Employees only.',
    'org_id × job_family × location_id × month',
    'draft',
    1,
    array['synthetic_internal']
  )
on conflict (metric_id) do nothing;
