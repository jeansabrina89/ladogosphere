-- Un employé désactivé perd ses sessions ouvertes.
--
-- Passer `profiles.actif` à faux ferme les gardes de l'application (garde.ts
-- le lit à chaque appel), mais laissait vivre les sessions : le jeton de
-- rafraîchissement continuait de renouveler l'accès. Supprimer les sessions
-- supprime leurs jetons de rafraîchissement (clé étrangère en cascade) : la
-- personne est déconnectée à l'expiration de son jeton d'accès, et d'ici là
-- chaque action lui est déjà refusée.
--
-- Rend le nombre de sessions fermées.

create or replace function public.revoquer_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nombre integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$function$;

-- Appelée par le serveur seul, derrière la garde admin de l'écran Équipe.
revoke execute on function public.revoquer_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoquer_sessions(uuid) to service_role;