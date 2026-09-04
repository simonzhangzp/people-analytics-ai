-- people_v2 governance objects. No demo identity / people_app LOGIN (step 7).

create table if not exists people_v2.people_meta_entity (
  entity_id text primary key,
  layer text,
  grain text,
  sensitivity text,
  notes text
);

create table if not exists people_v2.people_meta_attribute (
  entity_id text not null,
  attribute_id text not null,
  provenance text,
  sensitivity text,
  pii_class text,
  nullable boolean,
  business_definition text,
  primary key (entity_id, attribute_id)
);

create table if not exists people_v2.people_meta_join_path (
  path_id text primary key,
  from_entity text,
  to_entity text,
  via text,
  allowed boolean,
  rule_id text,
  notes text
);

create table if not exists people_v2.people_contract (
  contract_id text primary key,
  source_system text,
  source_object text,
  odcs_file text
);

create table if not exists people_v2.people_metric (
  metric_id text primary key,
  grain_table text,
  numerator text,
  denominator text,
  min_cell integer,
  sensitivity text,
  status text,
  yaml_path text
);

create table if not exists people_v2.people_metric_version (
  metric_id text not null,
  version integer not null,
  effective_from date,
  yaml_sha text,
  primary key (metric_id, version)
);

create table if not exists people_v2.people_metric_health (
  metric_id text primary key,
  status text,
  reason text,
  as_of timestamptz default now()
);

create table if not exists people_v2.people_business_rule (
  rule_id text primary key,
  domain text,
  kind text,
  statement text,
  params jsonb
);

create table if not exists people_v2.people_lineage (
  lineage_id text primary key,
  from_object text,
  to_object text,
  via text,
  note text
);

create table if not exists people_v2.people_quality_test (
  test_name text primary key,
  test_group text,
  blocking boolean default true
);

create table if not exists people_v2.people_quality_result (
  test_name text not null,
  run_id text not null,
  status text,
  observed_value text,
  expected_value text,
  details text,
  primary key (test_name, run_id)
);

create table if not exists people_v2.people_serving_run (
  run_id text primary key,
  started_at timestamptz,
  finished_at timestamptz,
  certified boolean,
  notes text
);

create table if not exists people_v2.people_serving_pointer (
  pointer_id text primary key,
  as_of date,
  extract_id text,
  moved boolean,
  notes text
);

create table if not exists people_v2.people_quality_incident (
  incident_id text primary key,
  extract_date date,
  source_object text,
  status text,
  isolated boolean,
  details jsonb
);

create table if not exists people_v2.people_replay_metric_value (
  replay_id text primary key,
  extract_date date,
  metric_id text,
  value_bad numeric,
  value_expected numeric
);
