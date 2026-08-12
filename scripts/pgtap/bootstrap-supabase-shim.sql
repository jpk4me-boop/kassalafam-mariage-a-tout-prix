-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Banc d'essai pgTAP — amorçage d'un PostgreSQL NU en environnement Supabase.
--
-- Objet : permettre de rejouer les migrations et les suites pgTAP du dépôt sur
--         un PostgreSQL ordinaire (VPS, CI, poste de travail), SANS Docker et
--         SANS la stack Supabase complète.
--
-- Ce script reconstitue le strict minimum dont dépendent les migrations :
--   · les rôles (anon, authenticated, service_role, authenticator…) ;
--   · les schémas auth, storage, extensions, graphql_public ;
--   · auth.users et les fonctions auth.uid() / jwt() / role() / email() ;
--   · storage.buckets, storage.objects et les helpers foldername/filename.
--
-- ⚠️ LIMITE À CONNAÎTRE — ce n'est PAS la vraie stack Supabase. GoTrue, le
--    serveur de stockage, PostgREST et leurs policies natives sont absents.
--    Une suite qui compare un INVENTAIRE de policies ou de triggers peut donc
--    échouer ici sans qu'il y ait la moindre régression applicative. Les
--    suites qui testent un COMPORTEMENT (RPC, gardes, RLS métier) sont, elles,
--    fidèles. En cas de doute, la vraie stack tranche.
--
-- ⚠️ NE JAMAIS EXÉCUTER CE SCRIPT SUR LA BASE DE PRODUCTION. Il crée des rôles
--    et des schémas de substitution. Il est destiné à une base jetable.
--
-- Usage : voir scripts/pgtap/run-pgtap.sh
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Rôles — objets de niveau CLUSTER, donc créés seulement s'ils manquent.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'authenticator',
                           'supabase_auth_admin', 'supabase_storage_admin']
  loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to current_user;

-- ---------------------------------------------------------------------------
-- Schémas et extensions.
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists graphql_public;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto     with schema extensions;
create extension if not exists pg_trgm      with schema extensions;
create extension if not exists pgtap        with schema extensions;

grant usage on schema public, extensions, auth, storage
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth — table des comptes et fonctions de session.
-- Les colonnes reprennent celles réellement utilisées par les migrations et
-- les suites ; le reste du modèle GoTrue n'est pas nécessaire.
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  id                  uuid primary key,
  email               text,
  phone               text,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  confirmed_at        timestamptz,
  email_confirmed_at  timestamptz,
  last_sign_in_at     timestamptz
);

-- L'identité de session est portée par request.jwt.claims, exactement comme
-- chez Supabase : les suites la posent via set_config(..., true).
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb);
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select auth.jwt() ->> 'role';
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select auth.jwt() ->> 'email';
$$;

-- ---------------------------------------------------------------------------
-- storage — buckets, objets et helpers de chemin.
-- ---------------------------------------------------------------------------
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create table if not exists storage.objects (
  id               uuid primary key default extensions.gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  owner_id         text
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

create or replace function storage.extension(name text) returns text
language plpgsql immutable as $$
declare _parts text[]; _fn text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _fn;
  return reverse(split_part(reverse(_fn), '.', 1));
end
$$;
