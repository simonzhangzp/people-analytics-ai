-- People v2 schema bootstrap. Does not create silver/gold tables.
-- Dedicated People project only (zapmigfrtnwnkmezjefx). Does not touch
-- QuantReview production or quantreview-staging.
-- Do not specify SUPERUSER/NOSUPERUSER or BYPASSRLS/NOBYPASSRLS: those
-- clauses require a superuser, and the postgres role is not one.
-- New roles default to NOSUPERUSER and NOBYPASSRLS.
-- people_app stays NOLOGIN until step 7. people_publisher is LOGIN for Hetzner publish.
-- Data API must not expose people_v2: revoke from anon / authenticated / service_role.

create schema if not exists people_v2;

create extension if not exists ltree;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'people_app') then
    create role people_app nologin nocreatedb nocreaterole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'people_definer') then
    create role people_definer nologin nocreatedb nocreaterole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'people_publisher') then
    create role people_publisher login nocreatedb nocreaterole;
  end if;
end
$$;

revoke all on schema people_v2 from public;
grant usage on schema people_v2 to people_app, people_definer, people_publisher;
grant create on schema people_v2 to people_definer, people_publisher;
revoke create on schema people_v2 from people_app;

revoke create on schema public from people_app;
revoke create on schema public from people_publisher;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema people_v2 from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema people_v2 from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on schema people_v2 from service_role';
  end if;
end
$$;

comment on schema people_v2 is
  'People Analytics v2 serving schema. Not exposed on Data API. Silver/gold objects are added after GATE 2 publish.';
