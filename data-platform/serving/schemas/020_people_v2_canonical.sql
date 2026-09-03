-- people_v2 silver/gold tables generated from canonical_model.yml + gold_model.yml.
-- Do not reverse-engineer from parquet. Dedicated People project only.
-- Schema/extension come from 019_people_v2_bootstrap.sql.

create table if not exists people_v2.people_xw_identity (
  person_id text,
  worker_id text,
  source_system text,
  source_object text,
  source_id text,
  valid_from date,
  valid_to date,
  match_method text
);

create table if not exists people_v2.people_xw_org (
  org_id text,
  frappe_department text,
  gh_department_id bigint,
  valid_from date,
  valid_to date
);

create table if not exists people_v2.people_xw_location (
  location_id text,
  frappe_branch text,
  gh_office_id bigint,
  city text,
  country text,
  region text
);

create table if not exists people_v2.people_xw_job (
  job_id text,
  frappe_designation text,
  onet_soc_code text,
  job_family text
);

create table if not exists people_v2.people_xw_skill (
  skill_id text,
  frappe_skill text,
  onet_element_id text
);

create table if not exists people_v2.people_dim_org (
  org_id text,
  org_name text,
  parent_org_id text,
  company text,
  is_group boolean,
  org_path ltree,
  depth bigint,
  bg text,
  valid_from date,
  valid_to date,
  is_current boolean
);

create table if not exists people_v2.people_dim_job (
  job_id text,
  job_name text,
  onet_soc_code text,
  job_family text,
  valid_from date,
  valid_to date,
  is_current boolean
);

create table if not exists people_v2.people_dim_grade (
  grade_id text,
  grade_name text,
  level_rank bigint,
  default_salary_structure text,
  valid_from date,
  valid_to date,
  is_current boolean
);

create table if not exists people_v2.people_dim_location (
  location_id text,
  branch_name text,
  city text,
  country text,
  region text,
  valid_from date,
  valid_to date,
  is_current boolean
);

create table if not exists people_v2.people_dim_date (
  date text,
  month_end date,
  is_month_end boolean
);

create table if not exists people_v2.people_dim_appraisal_cycle (
  cycle_id text,
  cycle_name text,
  start_date date,
  end_date date,
  status text
);

create table if not exists people_v2.people_dim_stage (
  stage_id text,
  gh_job_id bigint,
  stage_name text,
  priority text,
  canonical_stage text
);

create table if not exists people_v2.people_dim_source (
  id text,
  name text,
  type text
);

create table if not exists people_v2.people_dim_rejection_reason (
  id text,
  name text,
  type text
);

create table if not exists people_v2.people_dim_skill (
  skill_id text,
  skill_name text,
  onet_element_id text,
  element_type text
);

create table if not exists people_v2.people_dim_learning_resource (
  resource_id text,
  source text,
  title text,
  url text,
  level text,
  duration_minutes double precision,
  roles text[],
  products text[]
);

create table if not exists people_v2.people_dim_survey_wave (
  wave_id text,
  instrument_version text,
  start_date date,
  end_date date,
  target_population text,
  response_rate double precision
);

create table if not exists people_v2.people_dim_survey_item (
  item_id text,
  dimension text,
  reverse text,
  prompt text,
  instrument_version text
);

create table if not exists people_v2.people_dim_person (
  person_id text,
  first_seen_at timestamptz,
  first_seen_source text
);

create table if not exists people_v2.people_dim_person_restricted (
  person_id text,
  full_name text,
  gender text,
  date_of_birth text
);

create table if not exists people_v2.people_dim_worker (
  worker_id text,
  person_id text,
  frappe_employee text,
  hire_date date,
  termination_date date,
  termination_reason_raw text,
  termination_category text,
  employment_type text,
  is_rehire boolean,
  hired_via_application_id text
);

create table if not exists people_v2.people_evt_worker (
  event_id text,
  worker_id text,
  person_id text,
  event_type text,
  event_date date,
  recorded_at timestamptz,
  source_system text,
  source_object text,
  source_id text,
  extract_id text
);

create table if not exists people_v2.people_evt_worker_change (
  event_id text,
  property text,
  old_value text,
  new_value text,
  old_canonical_id text,
  new_canonical_id text
);

create table if not exists people_v2.people_hist_worker_attr (
  worker_id text,
  valid_from date,
  valid_to date,
  org_id text,
  job_id text,
  grade_id text,
  location_id text,
  manager_worker_id text,
  employment_type text,
  status text,
  source_event_id text
);

create table if not exists people_v2.people_fact_comp_assignment_restricted (
  comp_assignment_id text,
  worker_id text,
  from_date date,
  to_date date,
  salary_structure text,
  base bigint,
  variable bigint,
  currency text,
  source_ssa text
);

create table if not exists people_v2.people_ref_comp_band (
  grade_id text,
  country text,
  currency text,
  band_min bigint,
  band_mid bigint,
  band_max bigint,
  valid_from date,
  valid_to date
);

create table if not exists people_v2.people_fact_appraisal (
  appraisal_id text,
  worker_id text,
  cycle_id text,
  final_score text,
  total_score text,
  self_score text,
  status text,
  submitted_at timestamptz
);

create table if not exists people_v2.people_fact_training_participation (
  worker_id text,
  training_event_id text,
  resource_id text,
  attendance text,
  status text,
  hours double precision,
  grade text,
  event_start text
);

create table if not exists people_v2.people_fact_worker_skill (
  worker_id text,
  skill_id text,
  proficiency text,
  evaluation_date date,
  source_skill_map text
);

create table if not exists people_v2.people_ref_job_skill_target (
  job_id text,
  skill_id text,
  target_proficiency text,
  onet_importance text
);

create table if not exists people_v2.people_dim_requisition (
  requisition_id text,
  gh_job_id bigint,
  gh_opening_id bigint,
  job_id text,
  org_id text,
  location_id text,
  hiring_manager_person_id text,
  recruiter_person_id text,
  opened_at timestamptz,
  closed_at timestamptz,
  status text,
  close_reason text,
  hired_application_id text
);

create table if not exists people_v2.people_dim_candidate (
  candidate_id text,
  gh_candidate_id bigint,
  person_id text,
  created_at timestamptz,
  first_source_id text
);

create table if not exists people_v2.people_fact_application (
  application_id text,
  candidate_id text,
  requisition_id text,
  applied_at timestamptz,
  status text,
  rejected_at timestamptz,
  hired_at timestamptz,
  source_id text,
  referrer_person_id text,
  rejection_reason_id text,
  rejection_type text,
  current_stage_id text
);

create table if not exists people_v2.people_evt_application_stage (
  application_id text,
  stage_id text,
  entered_at timestamptz,
  exited_at timestamptz,
  is_current boolean
);

create table if not exists people_v2.people_fact_interview (
  interview_id text,
  application_id text,
  stage_id text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  interviewer_person_ids text[]
);

create table if not exists people_v2.people_fact_scorecard (
  scorecard_id text,
  application_id text,
  interview_id text,
  submitted_by_person_id text,
  submitted_at timestamptz,
  overall_recommendation text
);

create table if not exists people_v2.people_fact_offer (
  offer_id text,
  version text,
  application_id text,
  requisition_id text,
  created_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  starts_at timestamptz,
  status text
);

create table if not exists people_v2.people_dim_recruiter (
  person_id text,
  specialization text,
  supported_region text,
  supported_job_family text,
  valid_from date,
  valid_to date
);

create table if not exists people_v2.people_fact_survey_score_restricted (
  worker_id text,
  wave_id text,
  dimension text,
  score_mean double precision,
  items_answered text
);

create table if not exists people_v2.people_fact_candidate_demographic_restricted (
  application_id text,
  question_id text,
  answer_option_id text,
  free_form_text text,
  submitted_at timestamptz
);

create table if not exists people_v2.people_fact_candidate_eeoc_restricted (
  application_id text,
  race text,
  gender text,
  veteran_status text,
  disability_status text,
  submitted_at timestamptz
);

create table if not exists people_v2.people_ref_city (
  city text,
  country text,
  region text
);

create table if not exists people_v2.people_ref_separation_reason_map (
  raw_reason text,
  termination_category text
);

create table if not exists people_v2.people_snap_worker_month (
  worker_id text,
  person_id text,
  month_end date,
  month_start date,
  org_id text,
  org_path ltree,
  job_id text,
  job_family text,
  grade_id text,
  location_id text,
  region text,
  manager_worker_id text,
  employment_type text,
  status text,
  is_certified boolean,
  hire_date date,
  tenure_band text,
  hired_in_month text,
  terminated_in_month text,
  termination_category text,
  via_t1 text,
  is_rehire boolean
);

create table if not exists people_v2.people_snap_requisition_month (
  month_end date,
  requisition_id text,
  job_family text,
  hiring_manager_id text,
  is_open boolean,
  days_open text,
  applications_active text,
  offers_outstanding text
);

create table if not exists people_v2.people_snap_recruiter_month (
  month_end date,
  recruiter_user_id text,
  person_id text,
  open_requisitions text,
  active_applications text,
  interviews_scheduled text,
  offers_sent text,
  hires bigint,
  avg_req_load double precision,
  candidate_load text
);

create table if not exists people_v2.people_mart_workforce_monthly (
  month_end date,
  region text,
  tenure_band text,
  job_family text,
  headcount bigint,
  hires bigint,
  terms_vol text,
  terms_invol text
);

create table if not exists people_v2.people_mart_workforce_monthly_2d (
  month_end date,
  location text,
  job_family text,
  headcount bigint,
  hires bigint,
  terms_vol text
);

create table if not exists people_v2.people_mart_mobility_monthly (
  month_start date,
  promotions text,
  transfers text,
  internal_mobility text
);

create table if not exists people_v2.people_mart_recruiting_monthly (
  month_start date,
  offers_accepted text,
  offers_resolved text,
  hires bigint
);

create table if not exists people_v2.people_mart_stage_aging_monthly (
  month_start date,
  canonical_stage text,
  aging_p50_days double precision
);

create table if not exists people_v2.people_mart_recruiter_load_monthly (
  month_end date,
  recruiter_user_id text,
  person_id text,
  open_requisitions text,
  active_applications text,
  interviews_scheduled text,
  offers_sent text,
  hires bigint,
  avg_req_load double precision,
  candidate_load text
);

create table if not exists people_v2.people_mart_comp_monthly (
  month_end date,
  job_family text,
  region text,
  grade_id text,
  n bigint,
  compa_p25 double precision,
  compa_p50 double precision,
  compa_p75 double precision
);

create table if not exists people_v2.people_mart_learning_monthly (
  month_start date,
  participants text,
  training_hours double precision,
  completion text
);

create table if not exists people_v2.people_mart_skill_coverage_monthly (
  month_end date,
  job_family text,
  coverage_ratio double precision
);

create table if not exists people_v2.people_mart_engagement_wave (
  wave_id text,
  dimension text,
  n bigint,
  mean double precision,
  favorable_pct double precision
);

create table if not exists people_v2.people_mart_source_health_daily (
  extract_date date,
  source_system text,
  source_object text,
  control_total bigint,
  rows_received bigint,
  freshness_hours double precision,
  tests_failed text
);

create table if not exists people_v2.people_mart_applicant_flow (
  job_family text,
  race text,
  gender text,
  n bigint
);

create table if not exists people_v2.people_mart_funnel_monthly (
  month_start date,
  source_name text,
  applications bigint,
  hired text
);

-- indexes
create index if not exists people_xw_identity_person_id_idx on people_v2.people_xw_identity (person_id);
create index if not exists people_xw_identity_worker_id_idx on people_v2.people_xw_identity (worker_id);
create index if not exists people_xw_org_org_id_idx on people_v2.people_xw_org (org_id);
create index if not exists people_xw_location_location_id_idx on people_v2.people_xw_location (location_id);
create index if not exists people_xw_job_job_id_idx on people_v2.people_xw_job (job_id);
create index if not exists people_xw_skill_skill_id_idx on people_v2.people_xw_skill (skill_id);
create index if not exists people_dim_org_org_id_idx on people_v2.people_dim_org (org_id);
create index if not exists people_dim_org_org_path_idx on people_v2.people_dim_org using gist (org_path);
create index if not exists people_dim_job_job_id_idx on people_v2.people_dim_job (job_id);
create index if not exists people_dim_grade_grade_id_idx on people_v2.people_dim_grade (grade_id);
create index if not exists people_dim_location_location_id_idx on people_v2.people_dim_location (location_id);
create index if not exists people_dim_date_date_idx on people_v2.people_dim_date (date);
create index if not exists people_dim_date_month_end_idx on people_v2.people_dim_date (month_end);
create index if not exists people_dim_appraisal_cycle_cycle_id_idx on people_v2.people_dim_appraisal_cycle (cycle_id);
create index if not exists people_dim_stage_stage_id_idx on people_v2.people_dim_stage (stage_id);
create index if not exists people_dim_source_id_idx on people_v2.people_dim_source (id);
create index if not exists people_dim_rejection_reason_id_idx on people_v2.people_dim_rejection_reason (id);
create index if not exists people_dim_skill_skill_id_idx on people_v2.people_dim_skill (skill_id);
create index if not exists people_dim_learning_resource_resource_id_idx on people_v2.people_dim_learning_resource (resource_id);
create index if not exists people_dim_survey_wave_wave_id_idx on people_v2.people_dim_survey_wave (wave_id);
create index if not exists people_dim_survey_item_item_id_idx on people_v2.people_dim_survey_item (item_id);
create index if not exists people_dim_person_person_id_idx on people_v2.people_dim_person (person_id);
create index if not exists people_dim_person_restricted_person_id_idx on people_v2.people_dim_person_restricted (person_id);
create index if not exists people_dim_worker_worker_id_idx on people_v2.people_dim_worker (worker_id);
create index if not exists people_dim_worker_worker_id_idx on people_v2.people_dim_worker (worker_id);
create index if not exists people_evt_worker_event_id_idx on people_v2.people_evt_worker (event_id);
create index if not exists people_evt_worker_worker_id_idx on people_v2.people_evt_worker (worker_id);
create index if not exists people_evt_worker_change_event_id_idx on people_v2.people_evt_worker_change (event_id);
create index if not exists people_hist_worker_attr_worker_id_idx on people_v2.people_hist_worker_attr (worker_id);
create index if not exists people_hist_worker_attr_worker_id_idx on people_v2.people_hist_worker_attr (worker_id);
create index if not exists people_fact_comp_assignment_restricted_comp_assignment_id_idx on people_v2.people_fact_comp_assignment_restricted (comp_assignment_id);
create index if not exists people_fact_comp_assignment_restricted_worker_id_idx on people_v2.people_fact_comp_assignment_restricted (worker_id);
create index if not exists people_ref_comp_band_grade_id_idx on people_v2.people_ref_comp_band (grade_id);
create index if not exists people_fact_appraisal_appraisal_id_idx on people_v2.people_fact_appraisal (appraisal_id);
create index if not exists people_fact_appraisal_worker_id_idx on people_v2.people_fact_appraisal (worker_id);
create index if not exists people_fact_training_participation_training_event_id_idx on people_v2.people_fact_training_participation (training_event_id);
create index if not exists people_fact_training_participation_worker_id_idx on people_v2.people_fact_training_participation (worker_id);
create index if not exists people_fact_worker_skill_skill_id_idx on people_v2.people_fact_worker_skill (skill_id);
create index if not exists people_fact_worker_skill_worker_id_idx on people_v2.people_fact_worker_skill (worker_id);
create index if not exists people_ref_job_skill_target_skill_id_idx on people_v2.people_ref_job_skill_target (skill_id);
create index if not exists people_dim_requisition_requisition_id_idx on people_v2.people_dim_requisition (requisition_id);
create index if not exists people_dim_candidate_candidate_id_idx on people_v2.people_dim_candidate (candidate_id);
create index if not exists people_fact_application_application_id_idx on people_v2.people_fact_application (application_id);
create index if not exists people_fact_application_application_id_idx on people_v2.people_fact_application (application_id);
create index if not exists people_evt_application_stage_application_id_idx on people_v2.people_evt_application_stage (application_id);
create index if not exists people_evt_application_stage_application_id_idx on people_v2.people_evt_application_stage (application_id);
create index if not exists people_fact_interview_interview_id_idx on people_v2.people_fact_interview (interview_id);
create index if not exists people_fact_interview_application_id_idx on people_v2.people_fact_interview (application_id);
create index if not exists people_fact_scorecard_scorecard_id_idx on people_v2.people_fact_scorecard (scorecard_id);
create index if not exists people_fact_scorecard_application_id_idx on people_v2.people_fact_scorecard (application_id);
create index if not exists people_fact_offer_offer_id_idx on people_v2.people_fact_offer (offer_id);
create index if not exists people_fact_offer_application_id_idx on people_v2.people_fact_offer (application_id);
create index if not exists people_dim_recruiter_person_id_idx on people_v2.people_dim_recruiter (person_id);
create index if not exists people_fact_survey_score_restricted_worker_id_idx on people_v2.people_fact_survey_score_restricted (worker_id);
create index if not exists people_fact_survey_score_restricted_worker_id_idx on people_v2.people_fact_survey_score_restricted (worker_id);
create index if not exists people_fact_candidate_demographic_restricted_application_id_idx on people_v2.people_fact_candidate_demographic_restricted (application_id);
create index if not exists people_fact_candidate_demographic_restricted_application_id_idx on people_v2.people_fact_candidate_demographic_restricted (application_id);
create index if not exists people_fact_candidate_eeoc_restricted_application_id_idx on people_v2.people_fact_candidate_eeoc_restricted (application_id);
create index if not exists people_fact_candidate_eeoc_restricted_application_id_idx on people_v2.people_fact_candidate_eeoc_restricted (application_id);
create index if not exists people_ref_city_city_idx on people_v2.people_ref_city (city);
create index if not exists people_ref_separation_reason_map_raw_reason_idx on people_v2.people_ref_separation_reason_map (raw_reason);
create index if not exists people_snap_worker_month_worker_id_idx on people_v2.people_snap_worker_month (worker_id);
create index if not exists people_snap_worker_month_month_end_idx on people_v2.people_snap_worker_month (month_end);
create index if not exists people_snap_worker_month_worker_id_idx on people_v2.people_snap_worker_month (worker_id);
create index if not exists people_snap_worker_month_org_path_idx on people_v2.people_snap_worker_month using gist (org_path);
create index if not exists people_snap_requisition_month_requisition_id_idx on people_v2.people_snap_requisition_month (requisition_id);
create index if not exists people_snap_requisition_month_month_end_idx on people_v2.people_snap_requisition_month (month_end);
create index if not exists people_snap_recruiter_month_recruiter_user_id_idx on people_v2.people_snap_recruiter_month (recruiter_user_id);
create index if not exists people_snap_recruiter_month_month_end_idx on people_v2.people_snap_recruiter_month (month_end);
create index if not exists people_mart_workforce_monthly_month_end_idx on people_v2.people_mart_workforce_monthly (month_end);
create index if not exists people_mart_workforce_monthly_month_end_idx on people_v2.people_mart_workforce_monthly (month_end);
create index if not exists people_mart_workforce_monthly_2d_month_end_idx on people_v2.people_mart_workforce_monthly_2d (month_end);
create index if not exists people_mart_workforce_monthly_2d_month_end_idx on people_v2.people_mart_workforce_monthly_2d (month_end);
create index if not exists people_mart_mobility_monthly_month_start_idx on people_v2.people_mart_mobility_monthly (month_start);
create index if not exists people_mart_recruiting_monthly_month_start_idx on people_v2.people_mart_recruiting_monthly (month_start);
create index if not exists people_mart_stage_aging_monthly_month_start_idx on people_v2.people_mart_stage_aging_monthly (month_start);
create index if not exists people_mart_recruiter_load_monthly_month_end_idx on people_v2.people_mart_recruiter_load_monthly (month_end);
create index if not exists people_mart_recruiter_load_monthly_month_end_idx on people_v2.people_mart_recruiter_load_monthly (month_end);
create index if not exists people_mart_comp_monthly_month_end_idx on people_v2.people_mart_comp_monthly (month_end);
create index if not exists people_mart_comp_monthly_month_end_idx on people_v2.people_mart_comp_monthly (month_end);
create index if not exists people_mart_learning_monthly_month_start_idx on people_v2.people_mart_learning_monthly (month_start);
create index if not exists people_mart_skill_coverage_monthly_month_end_idx on people_v2.people_mart_skill_coverage_monthly (month_end);
create index if not exists people_mart_skill_coverage_monthly_month_end_idx on people_v2.people_mart_skill_coverage_monthly (month_end);
create index if not exists people_mart_engagement_wave_wave_id_idx on people_v2.people_mart_engagement_wave (wave_id);
create index if not exists people_mart_source_health_daily_extract_date_idx on people_v2.people_mart_source_health_daily (extract_date);
create index if not exists people_mart_applicant_flow_job_family_idx on people_v2.people_mart_applicant_flow (job_family);
create index if not exists people_mart_funnel_monthly_month_start_idx on people_v2.people_mart_funnel_monthly (month_start);

create or replace view people_v2.people_evt_promotion as
  select event_id as promotion_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'promotion';
create or replace view people_v2.people_evt_transfer as
  select event_id as transfer_id, worker_id, event_date from people_v2.people_evt_worker where event_type = 'transfer';
create or replace view people_v2.people_evt_manager_change as
  select worker_id, event_date from people_v2.people_evt_worker where event_type = 'manager_change';

