-- Remove unprefixed People leftovers created before the people_ rule.
-- Does not touch QuantReview tables such as panorama_daily.

drop view if exists public.mart_workforce_overview;
drop view if exists public.mart_retention;
drop view if exists public.mart_internal_mobility;
drop view if exists public.mart_compensation_equity;
drop view if exists public.mart_learning_adoption;
drop view if exists public.mart_skill_supply_demand;
drop view if exists public.mart_recruiting;
drop view if exists public.mart_external_talent_market;
drop view if exists public.dim_company;
drop view if exists public.dim_occupation;
drop view if exists public.dim_skill;
drop view if exists public.external_learning_content;
drop view if exists public.metric_definition;
drop view if exists public.source_freshness;
drop view if exists public.data_quality_incident;

drop schema if exists serving cascade;
drop schema if exists governance cascade;

drop table if exists public.workspaces cascade;
drop table if exists public.datasets cascade;
drop table if exists public.field_mappings cascade;
drop table if exists public.dataset_relationships cascade;
drop table if exists public.metric_definitions cascade;
drop table if exists public.analysis_questions cascade;
drop table if exists public.insights cascade;
drop table if exists public.executive_stories cascade;
drop table if exists public.ai_usage cascade;

drop function if exists public.consume_ai_quota();
drop function if exists public.cleanup_anonymous_workbench_data(interval);
drop function if exists public.knowledge_payload_is_safe(jsonb);
drop function if exists public.set_workbench_updated_at();

do $$
begin
  if to_regclass('cron.job') is not null
     and exists (
       select 1 from cron.job
       where jobname = 'cleanup-anonymous-workbench-data-daily'
     )
  then
    perform cron.unschedule('cleanup-anonymous-workbench-data-daily');
  end if;
end
$$;
