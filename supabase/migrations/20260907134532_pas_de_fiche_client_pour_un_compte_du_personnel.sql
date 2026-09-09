-- Correctif de recette I5 — un compte du personnel créait une fiche `clients`
-- vide (18 pendant la recette). Le déclencheur ne connaît pas encore le rôle au
-- moment du signup : il ne crée donc plus AUCUNE fiche.
--
-- Qui crée la fiche désormais :
--   - un client        → creerOuLierFicheClient (inscription, ou la page
--                        « compléter mon profil » pour un compte ancien) ;
--   - un membre du personnel qui a des chiens à la pension
--                      → creerFicheInterne, sur son geste explicite.
--
-- Le rattachement d'une fiche DÉJÀ créée par la pension (même e-mail, encore
-- libre) reste ici : c'est lui qui relie un client attendu à son compte.
create or replace function public.lier_client_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.clients
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  insert into public.profiles (id, email, role, actif)
  values (new.id, new.email, 'client', true)
  on conflict (id) do nothing;

  return new;
end;
$function$;