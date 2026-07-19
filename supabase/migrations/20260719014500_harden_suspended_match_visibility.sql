-- =============================================================================
-- L3F-C3B/C3D — réconciliation finale de la visibilité des relations suspendues.
--
-- Cette migration additive complète 20260719003000 :
--   * le helper de statut courant devient SECURITY INVOKER ;
--   * la RLS de matches masque une relation dès qu'un des deux participants est
--     suspendu, y compris au participant encore actif ;
--   * aucune donnée métier n'est modifiée ou supprimée.
-- =============================================================================

-- Le helper n'a besoin d'aucune élévation : profiles_select_own permet au membre
-- de lire son propre statut dans les policies, et les RPC SECURITY DEFINER qui
-- l'appellent conservent leur propre contexte privilégié.
alter function public.current_account_is_not_suspended() security invoker;

revoke all on function public.current_account_is_not_suspended() from public;
revoke all on function public.current_account_is_not_suspended() from anon;
grant execute on function public.current_account_is_not_suspended() to authenticated;
grant execute on function public.current_account_is_not_suspended() to service_role;

-- is_match_participant est autoritatif : il vérifie l'appartenance au match et
-- l'état actif des DEUX profils. Il est SECURITY DEFINER et relit matches sans
-- être bloqué par la policy qu'il sert à évaluer.
drop policy if exists matches_select_participants on public.matches;
create policy matches_select_participants
on public.matches
for select
to authenticated
using (
  ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
  and (select public.current_account_is_not_suspended())
  and public.is_match_participant(id)
);
