-- Les fonctions SQL ne sont plus exécutables par les rôles publics.
--
-- POURQUOI
--   Une fonction SECURITY DEFINER s'exécute avec les droits de son
--   propriétaire : elle traverse RLS. Treize d'entre elles (valider_depense,
--   payer_depense, confirmer_commande, creer_commande_sur_mesure…) étaient
--   exécutables par anon et authenticated, c'est-à-dire par quiconque possède
--   la clé publique du site. La garde de permission de l'application ne
--   protégeait rien : on pouvait l'enjamber en appelant /rest/v1/rpc.
--
-- LA RÈGLE
--   Une fonction n'est exécutable que par service_role : c'est l'application,
--   côté serveur, qui l'appelle après sa propre garde. Les 38 appels .rpc()
--   du dépôt passent tous par supabaseAdmin (clé de service) : un test relit
--   le dépôt et le garantit.
--
-- L'EXCEPTION, ÉCRITE ICI
--   Six fonctions d'aide sont citées dans les politiques RLS. Une politique
--   s'évalue avec les droits de celui qui interroge la table : sans EXECUTE,
--   la requête d'un membre du personnel connecté échouerait (42501) au lieu
--   de renvoyer ses lignes. Elles gardent donc authenticated — et elles
--   seules. Aucune n'écrit, et chacune ne lit que la ligne de l'appelant :
--     is_admin(), is_personnel(), peut_boutique(), peut_depenses(),
--     peut_encaissements() : select exists (select 1 from profiles
--       where id = auth.uid() and …) — le profil de l'appelant, rien d'autre ;
--     mon_employe_id() : select id from employes_rh where profile_id = auth.uid().
--   Elles ne renvoient qu'un booléen (ou l'identifiant de l'appelant) sur
--   l'appelant lui-même : appelées directement, elles n'apprennent à personne
--   ce qu'il ne sait pas déjà de son propre compte. anon est retiré : sans
--   session, auth.uid() est nul et la réponse serait toujours « faux ».
--
-- PAR DÉFAUT
--   PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction nouvellement
--   créée, et Supabase y ajoute anon, authenticated et service_role par un
--   privilège par défaut sur le schéma public. Les deux sont retirés ici :
--   une fonction créée demain naît fermée. Une clause « in schema » ne peut
--   pas retirer le droit accordé globalement à PUBLIC — il faut les deux
--   formes, et elles y sont toutes les deux.
--
-- CE QUI NE CHANGE PAS
--   Les triggers : leur fonction s'exécute sans contrôle d'EXECUTE une fois
--   le trigger posé, et PostgREST refuse d'appeler une fonction de trigger.
--   Elles sont fermées elles aussi, par principe, sans effet sur le service.

begin;

-- ── 1. Toutes les fonctions du schéma public ──────────────────────────────
-- Le tour complet, sans liste à tenir à jour : ce qui existe est fermé, et
-- service_role reçoit ce dont l'application a besoin.
do $$
declare
  f record;
  v_nb int := 0;
begin
  for f in
    select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
     order by 1
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
    v_nb := v_nb + 1;
  end loop;
  raise notice 'Fonctions fermées : %', v_nb;
end $$;

-- ── 2. Les six fonctions d'aide des politiques RLS ────────────────────────
-- Lecture seule, sur l'appelant seul. La justification est en tête de fichier.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_personnel() to authenticated;
grant execute on function public.mon_employe_id() to authenticated;
grant execute on function public.peut_boutique() to authenticated;
grant execute on function public.peut_depenses() to authenticated;
grant execute on function public.peut_encaissements() to authenticated;

-- ── 3. Les fonctions de demain ────────────────────────────────────────────
-- Le droit implicite de PUBLIC (global), puis celui que Supabase pose sur le
-- schéma public pour anon et authenticated.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

commit;