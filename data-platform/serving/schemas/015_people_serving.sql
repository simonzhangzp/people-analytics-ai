-- Serving marts, certified metric registry, and read-only RPCs.
-- Does not touch QuantReview objects.

alter table public.people_metric_definition
  add column if not exists formula text;
alter table public.people_metric_definition
  add column if not exists source_tables text[] not null default '{}';
alter table public.people_metric_definition
  add column if not exists downstream_marts text[] not null default '{}';
alter table public.people_metric_definition
  add column if not exists quality_status text not null default 'healthy';
alter table public.people_metric_definition
  add column if not exists owner text;

alter table public.people_mart_retention
  add column if not exists regrettable_exits numeric;
alter table public.people_mart_retention
  add column if not exists regrettable_attrition_rate numeric;

alter table public.people_mart_internal_mobility
  add column if not exists headcount numeric;

alter table public.people_mart_learning_adoption
  add column if not exists participation_rate numeric;

alter table public.people_mart_recruiting
  add column if not exists time_in_stage_days numeric;
alter table public.people_mart_recruiting
  add column if not exists quality_of_hire_index numeric;

alter table public.people_data_quality_incident
  add column if not exists expected_records bigint;
alter table public.people_data_quality_incident
  add column if not exists actual_records bigint;

create table if not exists public.people_mart_skills (
  as_of_month date not null,
  job_family text not null,
  skill_id text not null,
  skill_name text not null,
  workers_with_skill numeric not null,
  workers_in_family numeric not null,
  internal_coverage_rate numeric not null,
  gap_rate numeric not null,
  is_critical boolean not null default false,
  provenance text not null default 'derived',
  quality_status text not null default 'healthy',
  primary key (as_of_month, job_family, skill_id)
);

create table if not exists public.people_mart_manager_effectiveness (
  as_of_month date not null,
  org_id text not null,
  job_family text not null,
  manager_count numeric not null,
  span_of_control numeric,
  manager_turnover_rate numeric,
  engagement_score numeric,
  provenance text not null default 'synthetic_internal',
  quality_status text not null default 'healthy',
  primary key (as_of_month, org_id, job_family)
);

create table if not exists public.people_mart_attrition_segment (
  as_of_month date not null,
  job_family text not null,
  location_id text not null,
  job_level text not null,
  tenure_band text not null,
  voluntary_exits numeric not null,
  beginning_headcount numeric not null,
  voluntary_attrition_rate numeric not null,
  median_base_usd numeric,
  quality_status text not null default 'healthy',
  provenance text not null default 'synthetic_internal',
  primary key (as_of_month, job_family, location_id, job_level, tenure_band)
);

create or replace view public.people_mart_compensation as
select
  as_of_month,
  job_family,
  location_id,
  median_base_usd,
  mean_compa_ratio,
  bls_median_wage,
  market_position_index,
  provenance,
  metric_id,
  quality_status
from public.people_mart_compensation_equity;

create or replace view public.people_mart_learning as
select
  as_of_month,
  org_id,
  job_family,
  learning_hours_per_employee,
  completion_rate,
  participation_rate,
  provenance,
  metric_id,
  quality_status
from public.people_mart_learning_adoption;

create index if not exists people_mart_workforce_overview_month_family_idx
  on public.people_mart_workforce_overview (as_of_month, job_family);
create index if not exists people_mart_retention_month_family_idx
  on public.people_mart_retention (as_of_month, job_family);
create index if not exists people_mart_internal_mobility_month_family_idx
  on public.people_mart_internal_mobility (as_of_month, job_family);
create index if not exists people_mart_attrition_segment_month_family_idx
  on public.people_mart_attrition_segment (as_of_month, job_family);
create index if not exists people_mart_skills_month_family_idx
  on public.people_mart_skills (as_of_month, job_family, is_critical);
create index if not exists people_metric_definition_status_idx
  on public.people_metric_definition (status, domain);

insert into public.people_dataset_lineage (dataset_name, upstream_source, grain, serving_table)
values
  ('people_mart_compensation', 'people_compensation', 'job_family × location × month', 'people_mart_compensation'),
  ('people_mart_learning', 'people_lms', 'org × job_family × month', 'people_mart_learning'),
  ('people_mart_skills', 'people_hris', 'job_family × skill × month', 'people_mart_skills'),
  ('people_mart_manager_effectiveness', 'people_hris', 'org × job_family × month', 'people_mart_manager_effectiveness'),
  ('people_mart_attrition_segment', 'people_hris', 'family × location × level × tenure × month', 'people_mart_attrition_segment')
on conflict (dataset_name) do nothing;

insert into public.people_metric_definition (
  metric_id, metric_name, domain, business_definition, formula_sql, formula,
  grain, numerator_definition, denominator_definition, population_rules,
  exclusions, time_logic, dimensions, owner, status, version, effective_date,
  data_sources, source_tables, downstream_marts, validation_status, quality_status, health_status
)
values
(
  'headcount', 'Headcount', 'workforce',
  'Count of workers in the certified population as of the snapshot month.',
  'sum(headcount) from people_mart_workforce_overview where as_of_month = :as_of',
  'SUM(headcount) on people_mart_workforce_overview for the snapshot month',
  'org × job_family × location × month',
  'Active workers with hire_date <= month_end and (termination_date is null or termination_date > month_end)',
  '1 (count)',
  'GlobalTech employees in the certified HRIS snapshot',
  'Terminated workers; incomplete APAC extracts are not treated as a workforce change',
  'Month-end snapshot',
  array['org_id','job_family','location_id','as_of_month'],
  'People Analytics', 'certified', 2, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_workforce_overview'],
  'tested', 'healthy', 'healthy'
),
(
  'average_headcount', 'Average Headcount', 'workforce',
  'Mean of month-end headcount over the trailing 12 certified months.',
  'avg(monthly_sum_headcount) from people_mart_workforce_overview over last 12 months',
  'AVG of monthly SUM(headcount) for the last 12 snapshot months',
  'org × job_family × location × trailing 12 months',
  'Same as Headcount, averaged',
  '12 months (or available months)',
  'Certified snapshots only',
  'Months marked unhealthy are included in the series but the metric quality becomes unhealthy',
  'Trailing 12 month-end snapshots',
  array['org_id','job_family','location_id'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_workforce_overview'],
  'tested', 'healthy', 'healthy'
),
(
  'hires', 'Hires', 'workforce',
  'Workers with hire_date in the snapshot month.',
  'sum(hires) from people_mart_workforce_overview where as_of_month = :as_of',
  'SUM(hires) on people_mart_workforce_overview for the snapshot month',
  'org × job_family × location × month',
  'Hire events in (month_start, month_end]',
  '1 (count)',
  'Employees',
  'Rehires counted as hires; contractors excluded',
  'Calendar month of hire_date',
  array['org_id','job_family','location_id','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_workforce_overview'],
  'tested', 'healthy', 'healthy'
),
(
  'voluntary_attrition', 'Voluntary Attrition Rate', 'retention',
  'Voluntary resignations divided by beginning headcount. Retirement excluded.',
  'sum(voluntary_exits)/nullif(sum(beginning_headcount),0) from people_mart_retention',
  'SUM(voluntary_exits) / SUM(beginning_headcount) on people_mart_retention',
  'org × job_family × location × month',
  'Voluntary exits in the month',
  'Headcount at month start (beginning_headcount)',
  'Employees',
  'Retirement and involuntary exits',
  'Calendar month',
  array['org_id','job_family','location_id','as_of_month'],
  'People Analytics', 'certified', 2, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_retention'],
  'tested', 'healthy', 'healthy'
),
(
  'regrettable_attrition', 'Regrettable Attrition Rate', 'retention',
  'Voluntary exits of senior IC or manager populations divided by beginning headcount.',
  'sum(regrettable_exits)/nullif(sum(beginning_headcount),0) from people_mart_retention',
  'SUM(regrettable_exits) / SUM(beginning_headcount) on people_mart_retention',
  'org × job_family × location × month',
  'Voluntary exits in IC4+ or manager levels',
  'Beginning headcount',
  'Employees',
  'Junior IC voluntary exits; involuntary exits',
  'Calendar month',
  array['org_id','job_family','location_id','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_retention'],
  'tested', 'healthy', 'healthy'
),
(
  'promotion_rate', 'Promotion Rate', 'mobility',
  'Promotion events in the month divided by month-end headcount.',
  'sum(promotions)/nullif(sum(headcount_like),0) from people_mart_internal_mobility',
  'SUM(promotions) / population on people_mart_internal_mobility',
  'org × job_family × month',
  'Promotion movement events',
  'Month-end headcount in the same grain',
  'Employees',
  'Laterals are not promotions',
  'Calendar month of event_date',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_internal_mobility'],
  'tested', 'healthy', 'healthy'
),
(
  'internal_mobility_rate', 'Internal Mobility Rate', 'mobility',
  'Promotions plus lateral moves divided by month-end headcount.',
  'sum(promotions + lateral_moves)/nullif(population,0) from people_mart_internal_mobility',
  'SUM(promotions + lateral_moves) / population on people_mart_internal_mobility',
  'org × job_family × month',
  'Promotion and lateral events',
  'Month-end headcount',
  'Employees',
  'Hires and exits',
  'Calendar month',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_internal_mobility'],
  'tested', 'healthy', 'healthy'
),
(
  'time_to_fill', 'Time to Fill', 'recruiting',
  'Average days from requisition open to accepted offer in the recruiting mart.',
  'avg(time_to_fill_days) from people_mart_recruiting',
  'AVG(time_to_fill_days) on people_mart_recruiting',
  'job_family × location × week',
  'Elapsed days to fill',
  'Filled requisitions in the period',
  'ATS requisitions',
  'Cancelled requisitions',
  'Week ending as_of_week',
  array['job_family','location_id','as_of_week'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_ats'], array['people_mart_recruiting'],
  'tested', 'healthy', 'healthy'
),
(
  'time_in_stage', 'Time in Stage', 'recruiting',
  'Average days candidates spend in an ATS stage before advancing.',
  'avg(time_in_stage_days) from people_mart_recruiting',
  'AVG(time_in_stage_days) on people_mart_recruiting',
  'job_family × location × week',
  'Days in stage',
  'Stage movements in the period',
  'ATS candidates',
  'Terminal rejected-without-stage rows',
  'Week ending as_of_week',
  array['job_family','location_id','as_of_week'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_ats'], array['people_mart_recruiting'],
  'tested', 'healthy', 'healthy'
),
(
  'offer_acceptance_rate', 'Offer Acceptance Rate', 'recruiting',
  'Accepted offers divided by offers extended.',
  'avg(offer_acceptance_rate) from people_mart_recruiting',
  'AVG(offer_acceptance_rate) on people_mart_recruiting',
  'job_family × location × week',
  'Accepted offers',
  'Offers extended',
  'ATS offers',
  'Expired offers still counted in denominator',
  'Week ending as_of_week',
  array['job_family','location_id','as_of_week'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_ats'], array['people_mart_recruiting'],
  'tested', 'healthy', 'healthy'
),
(
  'quality_of_hire', 'Quality of Hire', 'recruiting',
  'Share of hires still active 12 months after hire_date. Proxy pending performance-at-hire.',
  'avg(quality_of_hire_index) from people_mart_recruiting',
  'AVG(quality_of_hire_index) on people_mart_recruiting',
  'job_family × location × week',
  'Hires still employed at hire_date + 12 months',
  'Hires with 12 months elapsed',
  'Employees hired via ATS',
  'Hires with less than 12 months tenure',
  'As-of week vs hire_date + 12 months',
  array['job_family','location_id'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_ats','people_hris'], array['people_mart_recruiting'],
  'tested', 'healthy', 'healthy'
),
(
  'compa_ratio', 'Compa-Ratio', 'compensation',
  'Average of mean_compa_ratio in the compensation mart (base / grade midpoint).',
  'avg(mean_compa_ratio) from people_mart_compensation',
  'AVG(mean_compa_ratio) on people_mart_compensation',
  'job_family × location × month',
  'Base salary',
  'Job-level midpoint used in gold',
  'Employees with a current compensation record',
  'Zero or missing salary',
  'Month-end snapshot',
  array['job_family','location_id','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_compensation'], array['people_mart_compensation'],
  'tested', 'healthy', 'healthy'
),
(
  'span_of_control', 'Span of Control', 'organization',
  'Average direct reports per people-manager.',
  'avg(span_of_control) from people_mart_manager_effectiveness',
  'AVG(span_of_control) on people_mart_manager_effectiveness',
  'org × job_family × month',
  'Active workers with a manager',
  'Distinct people-managers',
  'Employees',
  'Individual contributors without reports',
  'Month-end snapshot',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_manager_effectiveness'],
  'tested', 'healthy', 'healthy'
),
(
  'engagement_score', 'Engagement Score', 'engagement',
  'Average engagement survey score (0-100) for the snapshot month.',
  'avg(engagement_score) from people_mart_manager_effectiveness',
  'AVG(engagement_score) on people_mart_manager_effectiveness',
  'org × job_family × month',
  'Sum of survey scores',
  'Survey respondents',
  'Employees invited to the census survey',
  'Free-text comments (not stored)',
  'Survey cycle date rolled to month',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_engagement'], array['people_mart_manager_effectiveness'],
  'tested', 'healthy', 'healthy'
),
(
  'learning_participation', 'Learning Participation', 'learning',
  'Share of employees with at least one LMS enrollment in the month.',
  'avg(participation_rate) from people_mart_learning',
  'AVG(participation_rate) on people_mart_learning',
  'org × job_family × month',
  'Distinct enrolled workers',
  'Month-end headcount',
  'Employees',
  'Catalog browsers who never enroll',
  'Calendar month of enrolled_on',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_lms'], array['people_mart_learning'],
  'tested', 'healthy', 'healthy'
),
(
  'learning_completion_rate', 'Learning Completion Rate', 'learning',
  'Completions divided by month-end headcount.',
  'avg(completion_rate) from people_mart_learning',
  'AVG(completion_rate) on people_mart_learning',
  'org × job_family × month',
  'Learning completions',
  'Month-end headcount',
  'Employees',
  'Incomplete enrollments',
  'Calendar month of completed_on',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_lms'], array['people_mart_learning'],
  'tested', 'healthy', 'healthy'
),
(
  'learning_hours_per_employee', 'Learning Hours per Employee', 'learning',
  'Completed learning hours divided by month-end headcount.',
  'avg(learning_hours_per_employee) from people_mart_learning',
  'AVG(learning_hours_per_employee) on people_mart_learning',
  'org × job_family × month',
  'Sum of completion hours',
  'Month-end headcount',
  'Employees',
  'Hours on incomplete enrollments',
  'Calendar month',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_lms'], array['people_mart_learning'],
  'tested', 'healthy', 'healthy'
),
(
  'skill_coverage', 'Skill Coverage', 'skills',
  'Share of the job-family population holding a mapped skill.',
  'avg(internal_coverage_rate) from people_mart_skills',
  'AVG(internal_coverage_rate) on people_mart_skills',
  'job_family × skill × month',
  'Workers with the skill',
  'Workers in the job family',
  'Employees with skill records',
  'Unmapped skills',
  'Month-end snapshot',
  array['job_family','skill_id','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal','live_public'], array['people_hris','people_onet'], array['people_mart_skills'],
  'tested', 'healthy', 'healthy'
),
(
  'critical_skill_gap', 'Critical Skill Gap', 'skills',
  'One minus coverage for skills flagged critical.',
  'avg(gap_rate) from people_mart_skills where is_critical',
  'AVG(gap_rate) on people_mart_skills where is_critical = true',
  'job_family × skill × month',
  'Workers without the critical skill',
  'Workers in the job family',
  'Critical skill list: python, sql, cloud, workforce analytics',
  'Non-critical skills',
  'Month-end snapshot',
  array['job_family','skill_id','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal','live_public'], array['people_hris','people_onet'], array['people_mart_skills'],
  'tested', 'healthy', 'healthy'
),
(
  'manager_turnover_rate', 'Manager Turnover Rate', 'organization',
  'People-manager exits divided by beginning manager headcount.',
  'avg(manager_turnover_rate) from people_mart_manager_effectiveness',
  'AVG(manager_turnover_rate) on people_mart_manager_effectiveness',
  'org × job_family × month',
  'Managers who exited in the month',
  'Beginning manager headcount',
  'Workers who manage at least one employee',
  'IC exits',
  'Calendar month',
  array['org_id','job_family','as_of_month'],
  'People Analytics', 'certified', 1, date '2026-08-01',
  array['synthetic_internal'], array['people_hris'], array['people_mart_manager_effectiveness'],
  'tested', 'healthy', 'healthy'
)
on conflict (metric_id) do update
set
  metric_name = excluded.metric_name,
  domain = excluded.domain,
  business_definition = excluded.business_definition,
  formula_sql = excluded.formula_sql,
  formula = excluded.formula,
  grain = excluded.grain,
  numerator_definition = excluded.numerator_definition,
  denominator_definition = excluded.denominator_definition,
  population_rules = excluded.population_rules,
  exclusions = excluded.exclusions,
  time_logic = excluded.time_logic,
  dimensions = excluded.dimensions,
  owner = excluded.owner,
  status = excluded.status,
  version = excluded.version,
  effective_date = excluded.effective_date,
  data_sources = excluded.data_sources,
  source_tables = excluded.source_tables,
  downstream_marts = excluded.downstream_marts,
  validation_status = excluded.validation_status,
  updated_at = now();
