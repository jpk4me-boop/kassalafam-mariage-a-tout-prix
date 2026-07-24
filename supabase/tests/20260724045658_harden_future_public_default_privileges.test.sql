-- =============================================================================
-- pgTAP — H2 : default privileges fail-closed des futurs objets relationnels.
--
-- Vérifie, après 20260724045658_harden_future_public_default_privileges :
--   A. default ACL exactes pour les futures tables/séquences de public ;
--   B. default privileges des fonctions inchangés ;
--   C. grants H1 des tables sensibles existantes inchangés ;
--   D. comportement réel d'une future table et d'une future séquence ;
--   E. service_role conserve l'accès complet ;
--   F. transaction unique + ROLLBACK : aucun objet de test conservé.
--
-- À exécuter uniquement sur une base jetable reconstruite depuis les migrations.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

-- Exécute une instruction sous un rôle API et renvoie son SQLSTATE
-- (chaîne vide en cas de succès).
create function public._h2_try_as(p_role name, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_state := '';
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return v_state;
end;
$$;

select plan(33);

-- ===========================================================================
-- A. Default ACL des futures tables et séquences créées par postgres.
-- ===========================================================================

select is(
  (
    select count(*)::int
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and a.grantee in (
        0,
        'anon'::regrole::oid,
        'authenticated'::regrole::oid
      )
  ),
  0,
  'A1 — aucune default ACL de table pour PUBLIC, anon ou authenticated'
);

select is(
  (
    select count(*)::int
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'S'
      and a.grantee in (
        0,
        'anon'::regrole::oid,
        'authenticated'::regrole::oid
      )
  ),
  0,
  'A2 — aucune default ACL de séquence pour PUBLIC, anon ou authenticated'
);

select is(
  (
    select array_agg(distinct a.privilege_type order by a.privilege_type)
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and a.grantee = 'service_role'::regrole::oid
  ),
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from aclexplode(acldefault('r', 'postgres'::regrole::oid)) a
    where a.grantee = 'postgres'::regrole::oid
  ),
  'A3 — service_role reçoit tous les privilèges des futures tables'
);

select is(
  (
    select array_agg(distinct a.privilege_type order by a.privilege_type)
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'S'
      and a.grantee = 'service_role'::regrole::oid
  ),
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from aclexplode(acldefault('S', 'postgres'::regrole::oid)) a
    where a.grantee = 'postgres'::regrole::oid
  ),
  'A4 — service_role reçoit tous les privilèges des futures séquences'
);

-- ===========================================================================
-- B. Default privileges des fonctions volontairement inchangés.
-- ===========================================================================

select ok(
  exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'f'
      and a.grantee = 'anon'::regrole::oid
      and a.privilege_type = 'EXECUTE'
  ),
  'B1 — default EXECUTE des fonctions pour anon est inchangé'
);

select ok(
  exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'f'
      and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'EXECUTE'
  ),
  'B2 — default EXECUTE des fonctions pour authenticated est inchangé'
);

select ok(
  exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'f'
      and a.grantee = 'service_role'::regrole::oid
      and a.privilege_type = 'EXECUTE'
  ),
  'B3 — default EXECUTE des fonctions pour service_role est inchangé'
);

-- ===========================================================================
-- C. Matrice H1 des cinq tables existantes inchangée.
-- ===========================================================================

select is(
  (
    select coalesce(
      array_agg(a.privilege_type order by a.privilege_type),
      array[]::text[]
    )
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.profiles'::regclass
      and a.grantee = 'authenticated'::regrole::oid
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'C1 — profiles conserve SELECT, INSERT et UPDATE pour authenticated'
);

select is(
  (
    select coalesce(
      array_agg(a.privilege_type order by a.privilege_type),
      array[]::text[]
    )
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.photos'::regclass
      and a.grantee = 'authenticated'::regrole::oid
  ),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[],
  'C2 — photos conserve SELECT, INSERT, UPDATE et DELETE'
);

select is(
  (
    select coalesce(
      array_agg(a.privilege_type order by a.privilege_type),
      array[]::text[]
    )
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.matches'::regclass
      and a.grantee = 'authenticated'::regrole::oid
  ),
  array['SELECT']::text[],
  'C3 — matches conserve SELECT seul'
);

select is(
  (
    select coalesce(
      array_agg(a.privilege_type order by a.privilege_type),
      array[]::text[]
    )
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.messages'::regclass
      and a.grantee = 'authenticated'::regrole::oid
  ),
  array[]::text[],
  'C4 — messages reste sans privilège direct authenticated'
);

select is(
  (
    select coalesce(
      array_agg(a.privilege_type order by a.privilege_type),
      array[]::text[]
    )
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.member_notifications'::regclass
      and a.grantee = 'authenticated'::regrole::oid
  ),
  array['SELECT']::text[],
  'C5 — member_notifications conserve SELECT seul'
);

select is(
  (
    select count(*)::int
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.profiles'::regclass,
      'public.photos'::regclass,
      'public.matches'::regclass,
      'public.messages'::regclass,
      'public.member_notifications'::regclass
    )
      and a.grantee = 'anon'::regrole::oid
  ),
  0,
  'C6 — anon reste sans privilège sur les cinq tables sensibles'
);

select is(
  (
    select count(*)::int
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.profiles'::regclass,
      'public.photos'::regclass,
      'public.matches'::regclass,
      'public.messages'::regclass,
      'public.member_notifications'::regclass
    )
      and a.grantee = 0
  ),
  0,
  'C7 — PUBLIC reste sans privilège sur les cinq tables sensibles'
);

-- ===========================================================================
-- D. Objets futurs : héritage réel des default privileges.
-- ===========================================================================

create table public._h2_future_table (
  id bigint primary key,
  note text
);

create sequence public._h2_future_sequence;

select has_table(
  'public',
  '_h2_future_table',
  'D1 — la table de contrôle est créée dans la transaction'
);

select has_sequence(
  'public',
  '_h2_future_sequence',
  'D2 — la séquence de contrôle est créée dans la transaction'
);

select is(
  (
    select pg_get_userbyid(c.relowner)
    from pg_class c
    where c.oid = 'public._h2_future_table'::regclass
  ),
  'postgres',
  'D3 — la future table est détenue par postgres'
);

select is(
  (
    select pg_get_userbyid(c.relowner)
    from pg_class c
    where c.oid = 'public._h2_future_sequence'::regclass
  ),
  'postgres',
  'D4 — la future séquence est détenue par postgres'
);

select is(
  (
    select count(*)::int
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public._h2_future_table'::regclass
      and a.grantee in (
        0,
        'anon'::regrole::oid,
        'authenticated'::regrole::oid
      )
  ),
  0,
  'D5 — la future table n’accorde rien à PUBLIC, anon ou authenticated'
);

select is(
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public._h2_future_table'::regclass
      and a.grantee = 'service_role'::regrole::oid
  ),
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from aclexplode(acldefault('r', 'postgres'::regrole::oid)) a
    where a.grantee = 'postgres'::regrole::oid
  ),
  'D6 — service_role reçoit tous les privilèges de la future table'
);

select is(
  (
    select count(*)::int
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('S', c.relowner))
    ) a
    where c.oid = 'public._h2_future_sequence'::regclass
      and a.grantee in (
        0,
        'anon'::regrole::oid,
        'authenticated'::regrole::oid
      )
  ),
  0,
  'D7 — la future séquence n’accorde rien à PUBLIC, anon ou authenticated'
);

select is(
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('S', c.relowner))
    ) a
    where c.oid = 'public._h2_future_sequence'::regclass
      and a.grantee = 'service_role'::regrole::oid
  ),
  (
    select array_agg(a.privilege_type order by a.privilege_type)
    from aclexplode(acldefault('S', 'postgres'::regrole::oid)) a
    where a.grantee = 'postgres'::regrole::oid
  ),
  'D8 — service_role reçoit tous les privilèges de la future séquence'
);

-- ===========================================================================
-- E. Tentatives réelles sous les rôles API.
-- ===========================================================================

select is(
  public._h2_try_as('anon', 'select 1 from public._h2_future_table'),
  '42501',
  'E1 — anon ne peut pas lire la future table'
);

select is(
  public._h2_try_as(
    'authenticated',
    'select 1 from public._h2_future_table'
  ),
  '42501',
  'E2 — authenticated ne peut pas lire la future table sans GRANT explicite'
);

select is(
  public._h2_try_as(
    'authenticated',
    $$insert into public._h2_future_table (id, note)
      values (1, 'interdit')$$
  ),
  '42501',
  'E3 — authenticated ne peut pas écrire sans GRANT explicite'
);

select is(
  public._h2_try_as(
    'service_role',
    $$insert into public._h2_future_table (id, note)
      values (1, 'autorisé')$$
  ),
  '',
  'E4 — service_role peut écrire dans la future table'
);

select is(
  public._h2_try_as(
    'service_role',
    'select 1 from public._h2_future_table'
  ),
  '',
  'E5 — service_role peut lire la future table'
);

select is(
  public._h2_try_as(
    'anon',
    $$select nextval('public._h2_future_sequence')$$
  ),
  '42501',
  'E6 — anon ne peut pas utiliser la future séquence'
);

select is(
  public._h2_try_as(
    'authenticated',
    $$select nextval('public._h2_future_sequence')$$
  ),
  '42501',
  'E7 — authenticated ne peut pas utiliser la future séquence'
);

select is(
  public._h2_try_as(
    'service_role',
    $$select nextval('public._h2_future_sequence')$$
  ),
  '',
  'E8 — service_role peut utiliser la future séquence'
);

-- ===========================================================================
-- F. Le périmètre FUNCTION reste volontairement inchangé.
-- ===========================================================================

select ok(
  has_function_privilege(
    'anon',
    'public._h2_try_as(name, text)',
    'EXECUTE'
  ),
  'F1 — une future fonction conserve le default EXECUTE pour anon'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public._h2_try_as(name, text)',
    'EXECUTE'
  ),
  'F2 — une future fonction conserve le default EXECUTE pour authenticated'
);

select ok(
  has_function_privilege(
    'service_role',
    'public._h2_try_as(name, text)',
    'EXECUTE'
  ),
  'F3 — une future fonction conserve le default EXECUTE pour service_role'
);

select * from finish();
rollback;
