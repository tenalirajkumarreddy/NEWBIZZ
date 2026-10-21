-- =====================================================================
-- tests/_bootstrap.sql — the minimum Supabase platform surface the migration
-- chain needs, for replaying it on a plain Postgres (CI, or a local cluster).
--
-- This is NOT a Supabase replacement. It creates the api roles, the auth and
-- storage schemas (users / buckets / objects plus the helpers the RLS policies
-- call), and stubs pg_cron / pg_net so the migration bodies parse.
--
-- Every statement is idempotent, so replay.sh can drop and rebuild in place.
-- =====================================================================

-- ---------------------------------------------------------------- roles
-- Supabase ships these. 0032 grants to supabase_auth_admin, 0091 to
-- supabase_storage_admin, so the roles have to exist before the chain runs.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
    create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then
    create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_storage_admin') then
    create role supabase_storage_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then
    create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname='dashboard_user') then
    create role dashboard_user nologin; end if;
end $$;

-- Mirror Supabase's default privileges: tables and functions come up fully
-- granted to the api roles, and RLS is the only gate. Without this a
-- "permission denied" would masquerade as tenant isolation.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text default 'authenticated',
  role text default 'authenticated',
  email text,
  encrypted_password text,
  phone text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- GoTrue reads the JWT from the JSON claims GUC; these are the three helpers
-- the chain's policies and RPCs call.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_setting('role'));
$$;

-- ---------------------------------------------------------------- storage
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key, name text, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Supabase Storage ships this path helper; 0128's policies call it.
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $fn$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end $fn$;

-- ------------------------------------------------------- pg_cron / pg_net
-- Platform extensions. The migrations that create schedules are stripped by
-- replay.sh; these stubs only exist so the bodies parse and compare.
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key, jobname text unique, schedule text, command text,
  nodename text, nodeport int, database text, username text, active boolean default true
);
create schema if not exists net;

create or replace function cron.schedule(name text, schedule text, command text)
returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(name text) returns boolean language sql as $$ select true $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 1::bigint $$;
