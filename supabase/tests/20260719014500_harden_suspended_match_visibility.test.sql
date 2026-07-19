-- =============================================================================
-- pgTAP — réconciliation de la visibilité des matches avec compte suspendu.
-- Transaction unique + ROLLBACK : aucune fixture conservée.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._smv_scalar(p_sub uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  begin
    execute p_sql into v_result;
    perform set_config('test.err', '', true);
    perform set_config('test.state', '', true);
  exception when others then
    v_result := null;
    perform set_config('test.err', sqlerrm, true);
    perform set_config('test.state', sqlstate, true);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-7a00-000000000001', 'smv-admin@ex.test'),
  ('00000000-0000-0000-7a00-00000000000a', 'smv-active@ex.test'),
  ('00000000-0000-0000-7b00-00000000000b', 'smv-suspended@ex.test');

insert into public.profiles (
  id, first_name, gender, birth_date, verification_status, account_status,
  suspended_at, suspended_by, suspension_reason
) values
  (
    '00000000-0000-0000-7a00-00000000000a', 'Actif', 'homme', '1990-01-01',
    'approved', 'active', null, null, null
  ),
  (
    '00000000-0000-0000-7b00-00000000000b', 'Suspendue', 'femme', '1992-02-02',
    'approved', 'suspended', now(),
    '00000000-0000-0000-7a00-000000000001', 'Suspension de test valide.'
  );

insert into public.matches (id, user_a, user_b, status) values (
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-7a00-00000000000a',
  '00000000-0000-0000-7b00-00000000000b',
  'accepted'
);

select plan(8);

select ok(
  not (select p.prosecdef
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'current_account_is_not_suspended'
         and p.pronargs = 0),
  'T1 — helper de statut en SECURITY INVOKER'
);

select function_privs_are(
  'public', 'current_account_is_not_suspended', array[]::text[], 'anon',
  array[]::text[], 'T2 — anon sans EXECUTE sur le helper'
);

select ok(
  (select qual ilike '%current_account_is_not_suspended%'
   from pg_policies
   where schemaname = 'public'
     and tablename = 'matches'
     and policyname = 'matches_select_participants'),
  'T3 — policy matches garde le statut de l’appelant'
);

select ok(
  (select qual ilike '%is_match_participant%'
   from pg_policies
   where schemaname = 'public'
     and tablename = 'matches'
     and policyname = 'matches_select_participants'),
  'T4 — policy matches vérifie les deux participants'
);

select is(
  public._smv_scalar(
    '00000000-0000-0000-7b00-00000000000b',
    'select count(*)::text from public.matches'
  ),
  '0', 'T5 — participant suspendu ne lit pas le match'
);

select is(
  public._smv_scalar(
    '00000000-0000-0000-7a00-00000000000a',
    'select count(*)::text from public.matches'
  ),
  '0', 'T6 — participant actif ne lit pas la relation suspendue'
);

select is(
  (select count(*)::int from public.matches
   where id = '70000000-0000-0000-0000-000000000001'),
  1, 'T7 — la relation est conservée physiquement pendant la suspension'
);

update public.profiles
set account_status = 'active',
    suspended_at = null,
    suspended_by = null,
    suspension_reason = null
where id = '00000000-0000-0000-7b00-00000000000b';

select is(
  public._smv_scalar(
    '00000000-0000-0000-7a00-00000000000a',
    'select count(*)::text from public.matches'
  ),
  '1', 'T8 — relation restaurée après réactivation'
);

select * from finish();
rollback;
